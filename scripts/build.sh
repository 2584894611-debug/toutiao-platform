#!/bin/bash
# build.sh — 容错版构建脚本
#
# Chromium 下载策略（实测可行）：
#   直接 curl 从 cdn.npmmirror.com 下载 Chrome for Testing zip + 手动解压。
#   原因：playwright 1.61 走 /builds/cft/{ver}/linux64/chrome-linux64.zip，
#         npmmirror 上的镜像路径是 /binaries/chrome-for-testing/{ver}/linux64/，
#         路径不匹配，PLAYWRIGHT_DOWNLOAD_HOST 用不上。沙箱实测：
#         cdn.npmmirror.com 185MB chrome-linux64.zip 6.4s @ 29MB/s 下完。
#   官方 cdn.playwright.dev 作为兜底（生产容器可能反而比 npmmirror 通）。
#
# 容错原则：set -u（不要 -e），chromium 下载失败仅 WARN 不阻断 build；
#          pnpm install / next build / tsup 是硬步骤，失败 exit 1。

set -u

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
cd "${COZE_WORKSPACE_PATH}"

START_TS=$(date +%s)
echo "[build] workspace: ${COZE_WORKSPACE_PATH}"
echo "[build] node: $(node -v 2>/dev/null) | pnpm: $(pnpm -v 2>/dev/null)"

run_with_timeout() {
    local seconds="$1"
    shift

    if command -v timeout >/dev/null 2>&1; then
        timeout "${seconds}" "$@"
    else
        "$@"
    fi
}

file_size_bytes() {
    local file="$1"

    stat -c %s "${file}" 2>/dev/null \
        || stat -f %z "${file}" 2>/dev/null \
        || wc -c < "${file}"
}

# ─────────────────────────────────────────────────────────────
# step 1/4: pnpm install（先 frozen，失败回落 loose；两次都失败 = 硬错误）
# ─────────────────────────────────────────────────────────────
export COZE_PNPM_REGISTRY_MIRROR="https://registry.npmmirror.com"
echo "[build] step 1/4: pnpm install ..."
STEP_TS=$(date +%s)
if ! run_with_timeout 300 pnpm install --prefer-frozen-lockfile --prefer-offline --reporter=append-only; then
    echo "[build] WARN: frozen-lockfile install failed, retrying without frozen..."
    if ! run_with_timeout 300 pnpm install --reporter=append-only; then
        echo "[build] FATAL: pnpm install failed twice"
        exit 1
    fi
fi
echo "[build] pnpm install done in $(( $(date +%s) - STEP_TS ))s"

# ─────────────────────────────────────────────────────────────
# step 2/4: 直接 curl 下载 Chrome for Testing（chromium + headless_shell）
#   - 镜像: cdn.npmmirror.com/binaries/chrome-for-testing/{ver}/linux64/
#   - 兜底: cdn.playwright.dev/builds/cft/{ver}/linux64/
#   - 版本号从 playwright-core/browsers.json 动态读取
#   - 失败仅 WARN，runtime 由 publisher 的 ensureChromiumLibs() / sparticuz 兜底
# ─────────────────────────────────────────────────────────────
echo "[build] step 2/4: download Chromium via direct curl ..."
STEP_TS=$(date +%s)

export PLAYWRIGHT_BROWSERS_PATH="${COZE_WORKSPACE_PATH}/.playwright-browsers"
mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}"

if [ "${SKIP_CHROMIUM_PRELOAD:-0}" = "1" ]; then
    echo "[build]   SKIP_CHROMIUM_PRELOAD=1, skip Linux Chromium preload."
    echo "[build] step 2/4 done in $(( $(date +%s) - STEP_TS ))s"
elif [ "$(uname -s)" != "Linux" ]; then
    echo "[build]   non-Linux host detected, skip Linux Chromium preload."
    echo "[build] step 2/4 done in $(( $(date +%s) - STEP_TS ))s"
else

# 从 playwright-core/browsers.json 动态读取版本号
read_browser_field() {
    local name="$1"
    local field="$2"
    node -e "
const j = require('./node_modules/playwright-core/browsers.json');
const b = j.browsers.find(x => x.name === '${name}');
if (!b) process.exit(1);
process.stdout.write(b['${field}']);
" 2>/dev/null
}

CHROMIUM_REV=$(read_browser_field chromium revision)
CHROMIUM_VER=$(read_browser_field chromium browserVersion)
SHELL_REV=$(read_browser_field chromium-headless-shell revision)
SHELL_VER=$(read_browser_field chromium-headless-shell browserVersion)
echo "[build]   chromium             rev=${CHROMIUM_REV:-?} ver=${CHROMIUM_VER:-?}"
echo "[build]   chromium-headless    rev=${SHELL_REV:-?} ver=${SHELL_VER:-?}"

# 下载 + 解压函数
# $1=label  $2=zip_url  $3=target_dir  $4=expected_zip_root_dir  $5=expected_binary_name
download_and_extract() {
    local label="$1"
    local url="$2"
    local target_dir="$3"
    local zip_root="$4"
    local binary_name="$5"
    local zip_file="/tmp/${label}_$$.zip"

    echo "[build]   [${label}] downloading from: ${url}"
    if ! run_with_timeout 120 curl -fsSL --retry 2 --connect-timeout 15 \
            --max-time 100 "${url}" -o "${zip_file}"; then
        echo "[build]   [${label}] WARN: curl failed"
        rm -f "${zip_file}"
        return 1
    fi

    local sz=$(file_size_bytes "${zip_file}" 2>/dev/null || echo 0)
    echo "[build]   [${label}] downloaded ${sz} bytes"
    # 小于 10MB 大概率是 HTML 错误页（华为云就这样）
    if [ "${sz:-0}" -lt 10000000 ]; then
        echo "[build]   [${label}] WARN: file too small (<10MB), likely an error page"
        rm -f "${zip_file}"
        return 1
    fi

    mkdir -p "${target_dir}"
    echo "[build]   [${label}] extracting to ${target_dir}/"
    if ! run_with_timeout 60 unzip -q -o "${zip_file}" -d "${target_dir}/"; then
        echo "[build]   [${label}] WARN: unzip failed"
        rm -f "${zip_file}"
        return 1
    fi
    rm -f "${zip_file}"

    # 标准化目录名：把 chrome-linux64 / chrome-headless-shell-linux64
    # 都重命名成 chrome-linux（playwright registry 期望的路径）
    if [ -d "${target_dir}/${zip_root}" ] && [ ! -d "${target_dir}/chrome-linux" ]; then
        mv "${target_dir}/${zip_root}" "${target_dir}/chrome-linux"
        echo "[build]   [${label}] renamed ${zip_root} -> chrome-linux"
    fi

    # 确保二进制存在且可执行
    local bin="${target_dir}/chrome-linux/${binary_name}"
    if [ ! -f "${bin}" ]; then
        echo "[build]   [${label}] WARN: binary not found at ${bin}"
        ls -la "${target_dir}/chrome-linux/" 2>/dev/null | head -10
        return 1
    fi
    chmod +x "${bin}" 2>/dev/null || true

    # 创建 INSTALLATION_COMPLETE 标记（playwright 内部约定，避免重复 install）
    touch "${target_dir}/INSTALLATION_COMPLETE" 2>/dev/null || true

    echo "[build]   [${label}] ✓ installed: ${bin}"
    return 0
}

# 单浏览器双源 fallback 函数：先 npmmirror，再官方 CDN
install_browser_with_fallback() {
    local label="$1"
    local ver="$2"
    local target_dir="$3"
    local zip_filename="$4"      # chrome-linux64.zip / chrome-headless-shell-linux64.zip
    local zip_root="$5"          # chrome-linux64 / chrome-headless-shell-linux64
    local binary_name="$6"       # chrome / headless_shell

    if [ -z "${ver}" ]; then
        echo "[build]   [${label}] WARN: version is empty, skip"
        return 1
    fi

    # 主路径：cdn.npmmirror.com（国内秒响应，沙箱实测 29MB/s）
    if download_and_extract "${label}" \
        "https://cdn.npmmirror.com/binaries/chrome-for-testing/${ver}/linux64/${zip_filename}" \
        "${target_dir}" "${zip_root}" "${binary_name}"; then
        return 0
    fi

    # 兜底：cdn.playwright.dev（71dd4ee 部署成功过，但沙箱速度很差）
    echo "[build]   [${label}] primary mirror failed, trying official CDN ..."
    if download_and_extract "${label}_fallback" \
        "https://cdn.playwright.dev/builds/cft/${ver}/linux64/${zip_filename}" \
        "${target_dir}" "${zip_root}" "${binary_name}"; then
        return 0
    fi

    echo "[build]   [${label}] all download paths failed"
    return 1
}

# 下载 chromium 主二进制
CHROMIUM_OK=0
if [ -n "${CHROMIUM_REV}" ] && [ -n "${CHROMIUM_VER}" ]; then
    if install_browser_with_fallback "chromium" "${CHROMIUM_VER}" \
        "${PLAYWRIGHT_BROWSERS_PATH}/chromium-${CHROMIUM_REV}" \
        "chrome-linux64.zip" "chrome-linux64" "chrome"; then
        CHROMIUM_OK=1
    fi
else
    echo "[build]   WARN: cannot read chromium version from browsers.json"
fi

# 下载 chromium-headless-shell（更小、依赖更少；publisher 优先用 headless_shell）
SHELL_OK=0
if [ -n "${SHELL_REV}" ] && [ -n "${SHELL_VER}" ]; then
    if install_browser_with_fallback "chromium-headless-shell" "${SHELL_VER}" \
        "${PLAYWRIGHT_BROWSERS_PATH}/chromium_headless_shell-${SHELL_REV}" \
        "chrome-headless-shell-linux64.zip" "chrome-headless-shell-linux64" "headless_shell"; then
        SHELL_OK=1
    fi
fi

if [ "${CHROMIUM_OK}" != "1" ] && [ "${SHELL_OK}" != "1" ]; then
    echo "[build] WARN: both chromium and headless_shell download failed."
    echo "[build] WARN: runtime will fall back to ensureChromiumLibs() + @sparticuz/chromium-min."
fi

# 列出最终产物
echo "[build]   PLAYWRIGHT_BROWSERS_PATH listing:"
ls -la "${PLAYWRIGHT_BROWSERS_PATH}/" 2>/dev/null | head -10 || true
echo "[build]   chromium executables found:"
find "${PLAYWRIGHT_BROWSERS_PATH}" \( -name chrome -o -name headless_shell \) -type f 2>/dev/null | head -5 || true

echo "[build] step 2/4 done in $(( $(date +%s) - STEP_TS ))s"
fi

# ─────────────────────────────────────────────────────────────
# step 3/4: Next.js 构建（硬步骤）
# ─────────────────────────────────────────────────────────────
echo "[build] step 3/4: pnpm next build ..."
STEP_TS=$(date +%s)
if ! run_with_timeout 360 pnpm next build; then
    echo "[build] FATAL: next build failed"
    exit 1
fi
echo "[build] next build done in $(( $(date +%s) - STEP_TS ))s"

# ─────────────────────────────────────────────────────────────
# step 4/4: tsup 打包 server 入口（硬步骤）
# 参数与 71dd4ee 成功版本一致：cjs / node20 / no-splitting / no-minify
# ─────────────────────────────────────────────────────────────
echo "[build] step 4/4: pnpm tsup src/server.ts ..."
STEP_TS=$(date +%s)
if ! run_with_timeout 120 pnpm tsup src/server.ts \
        --format cjs --platform node --target node20 \
        --outDir dist --no-splitting --no-minify; then
    echo "[build] FATAL: tsup failed"
    exit 1
fi
echo "[build] tsup done in $(( $(date +%s) - STEP_TS ))s"

echo "[build] DONE in $(( $(date +%s) - START_TS ))s"
ls -la dist/ 2>/dev/null | head -10
