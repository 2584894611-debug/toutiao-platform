/**
 * 头条号文章自动发布器（基于 Playwright）
 *
 * ── 现实约束 ──────────────────────────────────────────────────────────
 *  1. 需要本地 Chromium 二进制：
 *     PLAYWRIGHT_BROWSERS_PATH=/workspace/projects/.playwright-browsers
 *     首次需运行 `npx playwright install chromium`（~177 MB）。
 *  2. 每次发布会启动新的 chromium 实例，冷启动 ~3s + 页面加载 ~5-15s。
 *  3. headless 模式内存峰值 ~300 MB，慎用于资源受限的 serverless 环境。
 *  4. 头条页面 DOM 可能随版本变化；选择器策略走「多候选 + 重试」，定位
 *     失败时会截图到 /tmp/publish_error_<ts>.png 并把 selector 错误透出。
 *
 * ── 调用流程 ──────────────────────────────────────────────────────────
 *  publishArticle({ cookie, title, contentHtml, coverImages, ... })
 *    → launch chromium (headless)
 *    → newContext(viewport=1440x900, UA=Chrome 120)
 *    → addCookies(parseCookieString(cookie))
 *    → goto graphic/publish?source=add
 *    → 等编辑器就绪 → fill title → injectHtml content
 *    → upload covers（若有）
 *    → click 「发布」 → 等成功提示 / 跳转
 *    → 提取 pgc_id / publishUrl → 返回
 */

import { promises as fsp } from 'node:fs';
import type {
  Browser,
  BrowserContext,
  Cookie,
  Page,
} from 'playwright-core';

const TOUTIAO_DOMAIN = '.toutiao.com';
const TOUTIAO_HOST = 'mp.toutiao.com';
const PUBLISH_URL =
  'https://mp.toutiao.com/profile_v4/graphic/publish?source=add';
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Cookie 字符串 → Playwright Cookie[] */
export function parseCookieString(raw: string): Cookie[] {
  const cookies: Cookie[] = [];
  for (const kv of raw.split(';').map((s) => s.trim()).filter(Boolean)) {
    const eqIdx = kv.indexOf('=');
    if (eqIdx === -1) continue;
    const name = kv.slice(0, eqIdx).trim();
    const value = kv.slice(eqIdx + 1).trim();
    if (!name) continue;
    cookies.push({
      name,
      value,
      domain: TOUTIAO_DOMAIN,
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    });
  }
  return cookies;
}

export interface PublishOptions {
  cookie: string;
  title: string;
  /** 文章正文 HTML（Markdown 转好的）。会注入到头条富文本编辑器 */
  contentHtml: string;
  /** 封面图 URL 列表（http/https 或 dataURL；dataURL 会先转 Blob 走头条上传） */
  coverImages?: string[];
  coverMode?: 'single' | 'triple' | 'none';
  location?: string;
  adEnabled?: boolean;
  isFirstPublish?: boolean;
  declarations?: string[];
  /** 总体超时，默认 60s */
  timeoutMs?: number;
  /** headless，默认 true */
  headless?: boolean;
}

export interface PublishResult {
  success: boolean;
  /** 是否通过二次验证（headers/list/v2 中检测到新文章） */
  verified?: boolean;
  /** 二次验证提示，如"列表中未匹配到标题，可能审核延迟" */
  warning?: string;
  toutiaoId?: string;
  publishUrl?: string;
  /** 失败原因（结构化） */
  errorKind?:
    | 'auth_expired'
    | 'editor_not_found'
    | 'submit_failed'
    | 'timeout'
    | 'launch_failed'
    | 'browser_missing'
    | 'unknown';
  message: string;
  /** 错误截图绝对路径 */
  screenshotPath?: string;
  /** 每个步骤的截图路径（调试用，定位卡在哪一步） */
  stepScreenshots?: Array<{ step: string; path: string }>;
}

/**
 * 解析 chromium 可执行文件路径（serverless 友好）。
 * 优先级：
 *   1. env PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH（运维显式指定，最高优先级）
 *   2. env CHROMIUM_PATH（兼容旧变量名）
 *   3. 系统标准位置：/usr/bin/chromium 或 /usr/bin/chromium-browser 或 /usr/bin/google-chrome
 *   4. @sparticuz/chromium-min（运行时拉精简包到 /tmp，~30MB，serverless 标准方案）
 */
async function resolveChromiumPath(): Promise<{
  executablePath: string;
  extraArgs: string[];
  source: 'env' | 'system' | 'playwright_local' | 'sparticuz';
}> {
  // 1. env 显式指定
  const envPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    process.env.CHROMIUM_PATH;
  if (envPath) {
    try {
      const fs = await import('node:fs');
      if (fs.existsSync(envPath)) {
        return { executablePath: envPath, extraArgs: [], source: 'env' };
      }
    } catch {
      // 忽略
    }
  }

  // 2. 系统 PATH 标准位置
  const systemCandidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  try {
    const fs = await import('node:fs');
    for (const candidate of systemCandidates) {
      if (fs.existsSync(candidate)) {
        return { executablePath: candidate, extraArgs: [], source: 'system' };
      }
    }
  } catch {
    // 忽略
  }

  // 2.5 playwright 已下载浏览器目录（覆盖完整 chromium-* 与 headless_shell 版本）
  //
  // 平台容器实际只有 chromium_headless_shell-1228（无完整版 chromium-*），所以这一步
  // 必须能找到 headless_shell。命中后 executablePath 同目录就带齐了 chrome 必需的
  // *.so 文件，launchBrowser 后续的 wrapper 脚本会把这个目录加到 LD_LIBRARY_PATH。
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const browsersRoots = [
      process.env.PLAYWRIGHT_BROWSERS_PATH,
      '/opt/bytefaas/.playwright-browsers',
      path.resolve(process.cwd(), '.playwright-browsers'),
      process.env.HOME ? path.join(process.env.HOME, '.cache/ms-playwright') : '',
    ].filter((p): p is string => Boolean(p));

    // 同一个 root 下既可能有 chromium-1228（完整版）也可能有 chromium_headless_shell-1228；
    // 优先完整版，其次 headless shell；版本号高的优先。
    const rankDir = (name: string): number => {
      if (/^chromium-\d+/.test(name)) return 0; // 完整版最优
      if (/^chromium_headless_shell-\d+/.test(name)) return 1; // headless shell 次之
      return 99;
    };
    const exeRelCandidates = [
      'chrome-linux/chrome', // 完整版
      'chrome-linux/headless_shell', // playwright headless shell（实际文件名）
      'chrome-linux/chrome-headless-shell', // 备用命名
      'chrome-linux/chrome_headless_shell', // 兜底
      'chrome-headless-shell-linux64/headless_shell', // Chrome for Testing 原始目录名
      'chrome-headless-shell-linux64/chrome-headless-shell',
      'chrome-headless-shell-linux64/chrome_headless_shell',
      'chrome-linux64/chrome', // Chrome for Testing 原始完整版目录名
    ];

    for (const root of browsersRoots) {
      if (!fs.existsSync(root)) continue;
      let subs: string[] = [];
      try {
        subs = fs.readdirSync(root);
      } catch {
        continue;
      }
      subs.sort((a, b) => {
        const ra = rankDir(a);
        const rb = rankDir(b);
        if (ra !== rb) return ra - rb;
        return b.localeCompare(a); // 同类按名字倒序，高版本优先
      });
      for (const sub of subs) {
        if (rankDir(sub) === 99) continue;
        for (const rel of exeRelCandidates) {
          const full = path.join(root, sub, rel);
          if (fs.existsSync(full)) {
            console.info(
              '[publisher] resolveChromiumPath: found playwright_local',
              full,
            );
            return {
              executablePath: full,
              extraArgs: [],
              source: 'playwright_local',
            };
          }
        }
      }
    }
  } catch {
    // 忽略
  }

  // 3. @sparticuz/chromium-min（serverless 标准方案）
  const sparticuz = await import('@sparticuz/chromium-min');
  const chromiumMin = sparticuz.default;
  // 远程包地址（v149，与 @sparticuz/chromium-min ^149.0.0 版本匹配）
  const remotePack =
    process.env.SPARTICUZ_CHROMIUM_PACK ||
    'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';
  const executablePath = await chromiumMin.executablePath(remotePack);
  return {
    executablePath,
    extraArgs: chromiumMin.args,
    source: 'sparticuz',
  };
}

/**
 * 在非 root 容器里恢复 chromium 所需的系统共享库（libnspr4 / libnss3 / libatk... 等）。
 *
 * 工作方式：
 *   1. apt-get 用 -o 选项把状态/缓存/列表目录全部重定向到 /tmp/apt-user 下（绕开
 *      非 root 写不进 /var/lib/apt/lists/partial 的硬性限制）
 *   2. cp /var/lib/dpkg/status 到 /tmp/apt-user/state/status（apt 必需）
 *   3. apt-get update 拉源
 *   4. apt-get download 一批 chromium 必需的运行时库（含 t64 后缀的 Debian trixie 新包名）
 *   5. dpkg-deb -x 解到临时目录，再用 find + cp 把 .so 平铺到 /tmp/.chromium-libs/
 *   6. LD_LIBRARY_PATH 由 launchBrowser 后续拼接，包含 /tmp/.chromium-libs/
 *
 * 模块级 Promise 缓存：每个 node 进程生命周期只跑一次。任何步骤失败都仅 warn，
 * 让 chromium.launch 自己用 sparticuz pack 自带的 .so 兜底。
 *
 * 注意：本函数在请求处理路径里同步阻塞，首次发布会增加 20~50s 冷启动耗时，
 * 后续同进程发布命中缓存毫秒返回。
 */
let chromiumLibsPromise: Promise<boolean> | null = null;
export async function ensureChromiumLibsOnce(): Promise<boolean> {
  if (chromiumLibsPromise) return chromiumLibsPromise;
  chromiumLibsPromise = (async (): Promise<boolean> => {
    const fs = await import('node:fs');
    const { execSync } = await import('node:child_process');

    const LIBS_DIR = '/tmp/.chromium-libs';
    const APT_DIR = '/tmp/apt-user';
    const DL_DIR = `${APT_DIR}/archives`;
    const EXTRACT_DIR = `${APT_DIR}/extract`;

    // 已存在且 .so 文件够多 → 跳过（同进程后续调用直接复用此 Promise，
    // 不同进程之间靠 /tmp 在容器实例内的持久性 + 这层目录探测共同生效）
    try {
      const files = fs
        .readdirSync(LIBS_DIR)
        .filter((f) => f.includes('.so'));
      if (files.length >= 10) {
        console.info(
          '[publisher] /tmp/.chromium-libs already populated:',
          files.length,
          '.so files, skip apt bootstrap',
        );
        return true;
      }
    } catch {
      // 目录不存在，继续走 apt 流程
    }

    try {
      fs.mkdirSync(`${APT_DIR}/lists/partial`, { recursive: true });
      fs.mkdirSync(`${APT_DIR}/cache/archives/partial`, { recursive: true });
      fs.mkdirSync(`${APT_DIR}/state`, { recursive: true });
      fs.mkdirSync(LIBS_DIR, { recursive: true });
      fs.mkdirSync(DL_DIR, { recursive: true });
      fs.mkdirSync(EXTRACT_DIR, { recursive: true });

      // apt 必须能读到 dpkg status 才肯 download
      try {
        fs.copyFileSync('/var/lib/dpkg/status', `${APT_DIR}/state/status`);
      } catch {
        // 没有就空文件兜底（apt-get download 部分版本能接受空 status）
        try {
          fs.writeFileSync(`${APT_DIR}/state/status`, '');
        } catch {
          /* noop */
        }
      }

      const APT_OPTS = [
        `-o Dir::State=${APT_DIR}/state/`,
        `-o Dir::State::Lists=${APT_DIR}/lists/`,
        `-o Dir::State::status=${APT_DIR}/state/status`,
        `-o Dir::Cache=${APT_DIR}/cache/`,
        `-o Dir::Cache::archives=${APT_DIR}/cache/archives/`,
        `-o Dir::Etc::sourcelist=/etc/apt/sources.list`,
        `-o Dir::Etc::sourceparts=/etc/apt/sources.list.d/`,
        `-o Acquire::Retries=2`,
      ].join(' ');

      // apt-get update（30s 超时，失败也继续：列表可能已经在 /tmp 缓存里）
      console.info('[publisher] apt-get update ...');
      try {
        execSync(`timeout 30 apt-get ${APT_OPTS} update 2>&1`, {
          stdio: 'pipe',
          timeout: 35_000,
          shell: '/bin/bash',
        });
      } catch (e) {
        console.warn(
          '[publisher] apt-get update non-zero (continuing):',
          e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
        );
      }

      // chromium 必需的运行时库（Debian 13 trixie，含 t64 后缀新包名）
      const PKGS = [
        'libnspr4',
        'libnss3',
        'libatk1.0-0t64',
        'libatk-bridge2.0-0t64',
        'libcups2t64',
        'libdrm2',
        'libdbus-1-3',
        'libxkbcommon0',
        'libxcomposite1',
        'libxdamage1',
        'libxfixes3',
        'libxrandr2',
        'libgbm1',
        'libpango-1.0-0',
        'libcairo2',
        'libasound2t64',
        'libatspi2.0-0t64',
        'libxshmfence1',
      ];

      // 批量 download —— apt-get download 是包级原子，整体失败时退到单包 + t64 兜底
      console.info('[publisher] apt-get download', PKGS.length, 'pkgs ...');
      try {
        execSync(
          `cd ${DL_DIR} && timeout 60 apt-get ${APT_OPTS} download ${PKGS.join(' ')} 2>&1`,
          { stdio: 'pipe', timeout: 90_000, shell: '/bin/bash' },
        );
      } catch (e) {
        console.warn(
          '[publisher] batch download non-zero, falling back to per-package:',
          e instanceof Error ? e.message.slice(0, 200) : '',
        );
        for (const p of PKGS) {
          // 同时尝试 p / 去 t64 / 加 t64 三种命名兜底 trixie 包名过渡
          const variants = Array.from(
            new Set([p, p.replace(/t64$/, ''), `${p.replace(/t64$/, '')}t64`]),
          );
          for (const v of variants) {
            try {
              execSync(
                `cd ${DL_DIR} && timeout 15 apt-get ${APT_OPTS} download ${v} 2>&1`,
                { stdio: 'pipe', timeout: 20_000, shell: '/bin/bash' },
              );
              break;
            } catch {
              // 试下一个变体
            }
          }
        }
      }

      // dpkg-deb -x 解所有 .deb 到 EXTRACT_DIR，然后 find + cp 把 .so 平铺到 LIBS_DIR
      try {
        execSync(
          `cd ${DL_DIR} && for f in *.deb; do [ -f "$f" ] && dpkg-deb -x "$f" ${EXTRACT_DIR} 2>/dev/null || true; done && find ${EXTRACT_DIR} -name '*.so*' -type f -exec cp -a {} ${LIBS_DIR}/ \\; 2>/dev/null || true`,
          { stdio: 'pipe', timeout: 60_000, shell: '/bin/bash' },
        );
      } catch (e) {
        console.warn(
          '[publisher] dpkg-deb extract failed:',
          e instanceof Error ? e.message.slice(0, 200) : '',
        );
      }

      const finalFiles = fs
        .readdirSync(LIBS_DIR)
        .filter((f) => f.includes('.so'));
      console.info(
        '[publisher] /tmp/.chromium-libs populated with',
        finalFiles.length,
        '.so files',
      );
      return finalFiles.length > 0;
    } catch (e) {
      console.warn(
        '[publisher] ensureChromiumLibs fatal (fallback to bundled libs only):',
        e instanceof Error ? e.message : String(e),
      );
      return false;
    }
  })();
  return chromiumLibsPromise;
}

/** 动态加载 playwright-core 并按上述优先级拉起 chromium */
async function launchBrowser(headless: boolean): Promise<Browser> {
  const { chromium } = await import('playwright-core');

  const baseArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-gpu',
  ];

  let resolved: Awaited<ReturnType<typeof resolveChromiumPath>>;
  try {
    resolved = await resolveChromiumPath();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw Object.assign(
      new Error(
        '无法定位 chromium 可执行文件：' +
          msg +
          '。请通过环境变量 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH 指定路径，' +
          '或确认 @sparticuz/chromium-min 远程包可访问。',
      ),
      { code: 'browser_missing' },
    );
  }

  console.info(
    '[publisher] chromium executable:',
    resolved.executablePath,
    '(source:',
    resolved.source + ')',
  );

  // 在 chromium.launch 之前，确保 /tmp/.chromium-libs 已被补齐（apt-get download
  // + dpkg-deb -x 平铺 .so）。模块级缓存：每个 node 进程生命周期内只跑一次。
  // 失败仅 warn 不抛出，回退到 sparticuz pack 自带 .so + chrome 捆绑库。
  await ensureChromiumLibsOnce().catch((e) => {
    console.warn(
      '[publisher] ensureChromiumLibsOnce failed (ignored, will rely on bundled libs):',
      e instanceof Error ? e.message : e,
    );
  });

  // 在 chromium.launch 之前注入 LD_LIBRARY_PATH，让动态链接器能找到 libnspr4.so 等系统库。
  // 路径优先级（前面的优先生效）：
  //   1. /tmp/.chromium-libs       — 历史 ensureChromiumLibs 或运维侧补的 .so 集中目录
  //   2. /tmp/chromium-libs        — sparticuz 解包出的精简 .so 兜底目录
  //   3. dirname(executablePath)   — chrome 自带捆绑库目录（libGLESv2.so / libvk_swiftshader.so 等）
  //   4. /tmp                      — sparticuz 解压根（部分版本把 .so 直接平铺到 /tmp）
  // 同时下面把 LD_LIBRARY_PATH 透传给 chromium 子进程（chromium.launch 的 env 字段）。
  try {
    const pathMod = await import('node:path');
    const fsMod = await import('node:fs');
    const chromeDir = pathMod.dirname(resolved.executablePath);
    const candidates = [
      '/tmp/.chromium-libs',
      '/tmp/chromium-libs',
      chromeDir,
      '/tmp',
    ];
    const dirsToAdd: string[] = [];
    for (const d of candidates) {
      try {
        if (fsMod.existsSync(d) && !dirsToAdd.includes(d)) dirsToAdd.push(d);
      } catch {
        // 忽略单个路径检测失败
      }
    }
    const prevParts = (process.env.LD_LIBRARY_PATH || '')
      .split(':')
      .filter(Boolean);
    const newParts = dirsToAdd.filter((d) => !prevParts.includes(d));
    if (newParts.length > 0) {
      process.env.LD_LIBRARY_PATH = [...newParts, ...prevParts].join(':');
      console.info('[publisher] LD_LIBRARY_PATH+=', newParts.join(':'));
    } else {
      console.info(
        '[publisher] LD_LIBRARY_PATH unchanged=',
        process.env.LD_LIBRARY_PATH || '(empty)',
      );
    }
  } catch (e) {
    console.warn(
      '[publisher] set LD_LIBRARY_PATH failed (ignored):',
      e instanceof Error ? e.message : e,
    );
  }

  try {
    // wrapper 脚本方案: 在 chrome 启动前先 export LD_LIBRARY_PATH, 再 exec chrome.
    // 这样无论 playwright 内部如何处理子进程 env, 真实 chrome 进程一定能拿到
    // /tmp/.chromium-libs 路径下的 libnspr4.so 等共享库.
    const libDir = '/tmp/.chromium-libs';
    const chromeLibDir = resolved.executablePath.replace(/\/chrome$/, '');
    const wrapperPath = '/tmp/chromium-wrapper.sh';
    const { writeFileSync, chmodSync } = await import('node:fs');
    writeFileSync(
      wrapperPath,
      `#!/bin/bash
export LD_LIBRARY_PATH="${libDir}:${chromeLibDir}\${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec ${resolved.executablePath} "$@"
`,
    );
    chmodSync(wrapperPath, 0o755);
    console.info('[publisher] wrapper script created at', wrapperPath, 'libDir=', libDir, 'chromeLibDir=', chromeLibDir);
    try {
      const _fs = await import('node:fs');
      console.info('[publisher] ls /tmp/.chromium-libs:', _fs.readdirSync('/tmp/.chromium-libs').join(','));
    } catch (e) {
      console.info('[publisher] ls /tmp/.chromium-libs FAILED:', e instanceof Error ? e.message : String(e));
    }
    return await chromium.launch({
      executablePath: wrapperPath,
      headless,
      args: [...baseArgs, ...resolved.extraArgs],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // ── 收集诊断信息 ─────────────────────────────────────────────────
    // 启动失败时直接把 LD_LIBRARY_PATH / /tmp/.chromium-libs 内容 / ldd 缺失
    // 列表打到 error message, 下次失败可在 publish API 错误响应里直接看根因.
    let diag = '';
    try {
      const fsMod = await import('node:fs');
      const { execSync } = await import('node:child_process');
      const ldPath = process.env.LD_LIBRARY_PATH || '(empty)';
      let libsLs = '(missing)';
      try {
        const files = fsMod
          .readdirSync('/tmp/.chromium-libs')
          .filter((f) => f.includes('.so'));
        libsLs = files.length + ' .so files (sample: ' + files.slice(0, 5).join(', ') + ')';
      } catch {
        /* dir missing */
      }
      let lddMissing = '(ldd skipped)';
      try {
        const out = execSync(
          `LD_LIBRARY_PATH="${process.env.LD_LIBRARY_PATH || ''}" ldd "${resolved.executablePath}" 2>&1 | grep "not found" | awk '{print $1}' | sort -u | tr '\\n' ' '`,
          { stdio: 'pipe', timeout: 10_000, shell: '/bin/bash', encoding: 'utf8' },
        );
        lddMissing = out.trim() || '(none)';
      } catch (lddErr) {
        lddMissing = '(ldd error: ' + (lddErr instanceof Error ? lddErr.message.slice(0, 80) : '') + ')';
      }
      diag =
        ' | LD_LIBRARY_PATH=' +
        ldPath +
        ' | /tmp/.chromium-libs=' +
        libsLs +
        ' | ldd missing=' +
        lddMissing;
    } catch {
      /* 诊断收集本身失败也不阻塞 throw */
    }

    if (
      msg.includes("Executable doesn't exist") ||
      msg.includes('ENOENT') ||
      msg.includes('Failed to launch') ||
      msg.includes('No such file') ||
      msg.includes('error while loading shared libraries') ||
      msg.includes('libnspr4') ||
      msg.includes('cannot open shared object')
    ) {
      throw Object.assign(
        new Error(
          'Chromium 启动失败：' +
            msg +
            '。executablePath=' +
            resolved.executablePath +
            '（来源：' +
            resolved.source +
            '）' +
            diag,
        ),
        { code: 'browser_missing' },
      );
    }
    // 即便非 "browser_missing" 类错误, 也把诊断附上
    throw Object.assign(new Error(msg + diag), {
      code: (err as { code?: string })?.code,
    });
  }
}

async function saveScreenshot(page: Page, prefix = 'publish_error'): Promise<string | undefined> {
  try {
    const ts = Date.now();
    const path = `/tmp/${prefix}_${ts}.png`;
    await page.screenshot({ path, fullPage: false });
    return path;
  } catch {
    return undefined;
  }
}

/** 等待元素可见且可交互。轮询多个候选 selector，命中即返回 */
async function waitForAny(
  page: Page,
  selectors: string[],
  timeoutMs: number,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el) {
        const visible = await el.isVisible().catch(() => false);
        if (visible) return sel;
      }
    }
    await page.waitForTimeout(300);
  }
  return null;
}

/** 把 dataURL 转 Buffer，便于 setInputFiles */
function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string; ext: string } | null {
  const m = dataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1];
  const ext = mime.split('/')[1].replace('+xml', '');
  return { buffer: Buffer.from(m[2], 'base64'), mime, ext };
}

/** 下载 http(s) 图片到临时文件，返回路径 */
async function fetchImageToTmp(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const ext = (res.headers.get('content-type') ?? 'image/jpeg').split('/')[1] ?? 'jpg';
    const path = `/tmp/cover_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await fsp.writeFile(path, Buffer.from(ab));
    return path;
  } catch {
    return null;
  }
}

/** 把 dataURL 落盘到 /tmp，返回路径 */
async function dataUrlToTmpFile(dataUrl: string): Promise<string | null> {
  const decoded = dataUrlToBuffer(dataUrl);
  if (!decoded) return null;
  const path = `/tmp/cover_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${decoded.ext}`;
  await fsp.writeFile(path, decoded.buffer);
  return path;
}

async function preparedCoverFiles(images: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const img of images) {
    if (img.startsWith('data:image/')) {
      const p = await dataUrlToTmpFile(img);
      if (p) out.push(p);
    } else if (img.startsWith('http://') || img.startsWith('https://')) {
      const p = await fetchImageToTmp(img);
      if (p) out.push(p);
    } else if (img.startsWith('/')) {
      // 本地 /uploads/xxx 走当前服务自身
      const port = process.env.DEPLOY_RUN_PORT ?? '5000';
      const p = await fetchImageToTmp(`http://127.0.0.1:${port}${img}`);
      if (p) out.push(p);
    }
  }
  return out;
}

/**
 * 真正的发布主流程
 */
export async function publishArticle(opts: PublishOptions): Promise<PublishResult> {
  const {
    cookie,
    title,
    contentHtml,
    coverImages = [],
    timeoutMs = 60_000,
    headless = true,
  } = opts;

  if (!cookie?.trim()) {
    return { success: false, errorKind: 'auth_expired', message: 'Cookie 为空' };
  }
  if (!title?.trim()) {
    return { success: false, errorKind: 'submit_failed', message: '标题为空' };
  }

  const cookies = parseCookieString(cookie);
  if (!cookies.length) {
    return { success: false, errorKind: 'auth_expired', message: 'Cookie 解析失败' };
  }

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  const deadline = Date.now() + timeoutMs;
  const stepScreenshots: Array<{ step: string; path: string }> = [];

  try {
    browser = await launchBrowser(headless);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;
    return {
      success: false,
      errorKind: code === 'browser_missing' ? 'browser_missing' : 'launch_failed',
      message: msg,
    };
  }

  try {
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: DEFAULT_UA,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    await context.addCookies(cookies);
    page = await context.newPage();

    // ── Step 1: 进入发布页 ──────────────────────────────────────────
    const shot = async (step: string) => {
      const p = await saveScreenshot(page!, `step_${step}`);
      if (p) stepScreenshots.push({ step, path: p });
    };

    const navRemain = Math.max(5_000, deadline - Date.now());
    await page.goto(PUBLISH_URL, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(navRemain, 30_000),
    });
    // 等 SPA 渲染完成（头条是 React 页面，domcontentloaded 不够）
    await page.waitForTimeout(3_000);
    await shot('1_after_goto');

    // 鉴权检查：URL 若跳到登录页直接判定 Cookie 失效
    const finalUrl = page.url();
    if (finalUrl.includes('/login') || finalUrl.includes('sso.toutiao.com')) {
      const authShot = await saveScreenshot(page, 'publish_auth');
      return {
        success: false,
        errorKind: 'auth_expired',
        message: 'Cookie 已失效，被重定向到登录页',
        screenshotPath: authShot,
        stepScreenshots,
      };
    }

    // ── Step 2: 等编辑器就绪 + 填标题 ────────────────────────────────
    const titleRemain = Math.max(3_000, deadline - Date.now());
    const titleSel = await waitForAny(
      page,
      [
        'textarea[placeholder*="标题"]',
        'input[placeholder*="标题"]',
        'textarea[data-placeholder*="标题"]',
        '[contenteditable="true"][data-placeholder*="标题"]',
      ],
      Math.min(titleRemain, 20_000),
    );
    if (!titleSel) {
      const titleShot = await saveScreenshot(page, 'publish_no_title');
      return {
        success: false,
        errorKind: 'editor_not_found',
        message: '未找到标题输入框，头条页面可能改版',
        screenshotPath: titleShot,
        stepScreenshots,
      };
    }
    await page.click(titleSel);
    await page.fill(titleSel, title.trim()).catch(async () => {
      // 某些 contenteditable 需要走 type
      await page!.locator(titleSel).pressSequentially(title.trim(), { delay: 20 });
    });
    await shot('2_title_filled');

    // ── Step 3: 注入正文 HTML 到富文本编辑器 ─────────────────────────
    const editorSel = await waitForAny(
      page,
      [
        // 头条富文本编辑器的常见容器
        '.ProseMirror[contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
        '.public-DraftEditor-content',
        '.ql-editor',
      ],
      10_000,
    );
    if (!editorSel) {
      const editorShot = await saveScreenshot(page, 'publish_no_editor');
      return {
        success: false,
        errorKind: 'editor_not_found',
        message: '未找到正文富文本编辑器',
        screenshotPath: editorShot,
        stepScreenshots,
      };
    }
    // 用 page.evaluate 直接注入 innerHTML，更稳；同时触发 input 事件让框架更新
    await page.evaluate(
      ({ sel, html }) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return;
        el.focus();
        el.innerHTML = html;
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { sel: editorSel, html: contentHtml },
    );
    await shot('3_content_injected');

    // ── Step 4: 上传封面（best-effort） ──────────────────────────────
    if (coverImages.length) {
      try {
        const files = await preparedCoverFiles(coverImages);
        if (files.length) {
          // 尝试找文件 input；头条使用 type=file 配合 label 触发
          const fileInput = await page.$('input[type="file"][accept*="image"]');
          if (fileInput) {
            await fileInput.setInputFiles(files);
            await page.waitForTimeout(2_000);
          }
        }
      } catch {
        // 封面失败不阻断主流程
      }
    }

    // ── Step 5: 点「发布」 ───────────────────────────────────────────
    // 头条发布按钮通常是「发布」文字
    const publishBtn = await page
      .locator('button:has-text("发布"):not(:has-text("定时")):not(:has-text("预览"))')
      .first();
    const btnVisible = await publishBtn.isVisible().catch(() => false);
    if (!btnVisible) {
      const btnShot = await saveScreenshot(page, 'publish_no_btn');
      return {
        success: false,
        errorKind: 'submit_failed',
        message: '未找到「发布」按钮',
        screenshotPath: btnShot,
        stepScreenshots,
      };
    }
    await shot('4_before_click_publish');
    await publishBtn.click();

    // ── Step 6: 等成功提示 / URL 变化 ────────────────────────────────
    const submitRemain = Math.max(5_000, deadline - Date.now());
    try {
      await page.waitForURL(
        (u) =>
          u.toString().includes('articles-manage') ||
          u.toString().includes('publish_success') ||
          u.toString().includes('pgc_id'),
        { timeout: Math.min(submitRemain, 30_000) },
      );
    } catch {
      // URL 没变就等 toast 文案
      const toastFound = await page
        .locator('text=/发布成功|提交成功|审核中/')
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false);
      if (!toastFound) {
        const failShot = await saveScreenshot(page, 'publish_no_success');
        return {
          success: false,
          errorKind: 'submit_failed',
          message: '点击发布后未获得成功反馈，可能被频控或风控',
          screenshotPath: failShot,
          stepScreenshots,
        };
      }
    }

    // ── Step 7: 提取 pgc_id 和 URL ──────────────────────────────────
    const finalUrl2 = page.url();
    const m = finalUrl2.match(/pgc_id=(\d+)/);
    const toutiaoId = m?.[1];
    const publishUrl = toutiaoId
      ? `https://www.toutiao.com/article/${toutiaoId}/`
      : `https://${TOUTIAO_HOST}/profile_v4/graphic/articles-manage`;

    // ── Step 8: 二次验证 —— 调头条文章列表接口，确认刚发的标题出现在最近 5 条里 ──
    let verified = false;
    let verifyDetail = '';
    try {
      const titleKey = opts.title.slice(0, 12);
      const listEnv = await page.evaluate(async () => {
        const resp = await fetch(
          '/mp/agw/creator_center/list/v2?page_num=0&page_size=5',
          { credentials: 'include' },
        );
        return resp.json().catch(() => null);
      });
      const contents =
        (listEnv as { contents?: unknown[]; data?: { contents?: unknown[] } } | null)
          ?.contents ??
        (listEnv as { data?: { contents?: unknown[] } } | null)?.data?.contents ??
        [];
      const hit = (contents as Array<Record<string, unknown>>).some((c) => {
        const attr = (c.article_attr as Record<string, unknown> | undefined) ?? c;
        const t = String(attr.title ?? '');
        return t.includes(titleKey);
      });
      if (hit) {
        verified = true;
        verifyDetail = '在最近 5 条作品列表中匹配到标题';
        console.log('[publisher] post-publish verify: HIT', titleKey);
      } else {
        verifyDetail = `未在最近 5 条匹配到 "${titleKey}"，可能正在审核中`;
        console.log('[publisher] post-publish verify: MISS', titleKey);
      }
    } catch (verr) {
      verifyDetail = `二次验证异常：${
        verr instanceof Error ? verr.message : String(verr)
      }`;
      console.log('[publisher] post-publish verify FAILED:', verifyDetail);
    }

    return {
      success: true,
      verified,
      warning: verified ? undefined : verifyDetail,
      toutiaoId,
      publishUrl,
      message: verified
        ? '发布成功并验证通过'
        : `发布动作完成（${verifyDetail}）`,
      stepScreenshots,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    let shot2: string | undefined;
    if (page) {
      shot2 = await saveScreenshot(page, 'publish_exception');
      if (shot2) stepScreenshots.push({ step: 'exception', path: shot2 });
    }
    const kind: PublishResult['errorKind'] = msg.includes('Timeout')
      ? 'timeout'
      : 'unknown';
    return { success: false, errorKind: kind, message: msg, screenshotPath: shot2, stepScreenshots };
  } finally {
    try {
      await context?.close();
    } catch {
      /* noop */
    }
    try {
      await browser?.close();
    } catch {
      /* noop */
    }
  }
}
