/**
 * Chromium 健康诊断接口（防 hang 强化版）
 *
 * 设计要点：
 *  - 整体硬超时 55s（maxDuration=60）
 *  - 每个 await 都用 withTimeout 包裹，不允许任何步骤无限挂起
 *  - 如果系统路径已有 chromium，**完全跳过** sparticuz 流程
 *  - sparticuz 步骤独立 15s 超时
 *  - 读 /tmp/chromium_install_status.txt 获取后台安装进度
 *  - 检查 dpkg -l 查 chromium 安装记录、/tmp 缓存目录
 *  - 任何异常都被 catch 成 200 + ok:false，绝不让 curl 收到空响应
 */

import { NextResponse } from 'next/server';
import type { Browser } from 'playwright-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

type ChromiumSource = 'env' | 'playwright' | 'system' | 'sparticuz';

/** 给任意 Promise 加硬超时（reject 自带 step 字段） */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        Object.assign(new Error(`${label} timeout (${ms}ms)`), {
          step: label,
          code: 'timeout',
        }),
      );
    }, ms);
  });
  return Promise.race([p, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

/** 同步收集环境快照（不做任何阻塞 IO） */
async function snapshotEnvironment(): Promise<Record<string, unknown>> {
  const snap: Record<string, unknown> = {};
  const fs = await import('node:fs');

  // 1. 文件存在性扫描
  const systemCandidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/local/bin/chromium',
    '/usr/local/bin/chromium-browser',
    '/usr/local/bin/google-chrome',
    '/snap/bin/chromium',
    '/opt/chromium/chrome',
    '/opt/google/chrome/chrome',
    '/opt/google/chrome/google-chrome',
  ];
  const systemFound: string[] = [];
  for (const c of systemCandidates) {
    try {
      if (fs.existsSync(c)) systemFound.push(c);
    } catch {
      // ignore
    }
  }
  snap.systemCandidates = systemCandidates;
  snap.systemFound = systemFound;

  // 2. which 兜底
  const whichFound: string[] = [];
  try {
    const { execSync } = await import('node:child_process');
    for (const name of [
      'chromium',
      'chromium-browser',
      'google-chrome',
      'google-chrome-stable',
    ]) {
      try {
        const out = execSync(`command -v ${name}`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 2000,
        })
          .toString()
          .trim();
        if (out) whichFound.push(out);
      } catch {
        // not found
      }
    }
  } catch {
    // ignore
  }
  snap.whichFound = whichFound;

  // 3. apt-get 是否可用
  let aptAvailable = false;
  try {
    const { execSync } = await import('node:child_process');
    execSync('command -v apt-get', { stdio: 'ignore', timeout: 1000 });
    aptAvailable = true;
  } catch {
    aptAvailable = false;
  }
  snap.aptAvailable = aptAvailable;

  // 3.5 PLAYWRIGHT_BROWSERS_PATH 扫描（关键：build 阶段装到这里）
  const path = await import('node:path');
  const browsersPathCandidates = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(process.cwd(), '.playwright-browsers'),
    process.env.HOME ? path.join(process.env.HOME, '.cache/ms-playwright') : '',
    '/root/.cache/ms-playwright',
  ].filter((p): p is string => !!p);
  snap.browsersPathCandidates = browsersPathCandidates;

  const playwrightExecutables: string[] = [];
  const playwrightTopDirs: Record<string, string[]> = {};
  const findChromium = (
    dir: string,
    depth: number,
    out: string[],
  ): void => {
    if (depth > 6 || out.length >= 5) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) {
        if (
          e.name === 'chrome' ||
          e.name === 'chromium' ||
          e.name === 'headless_shell' ||
          e.name === 'chrome-headless-shell' ||
          e.name === 'chrome_headless_shell'
        ) {
          const full = path.join(dir, e.name);
          try {
            fs.accessSync(full, fs.constants.X_OK);
            out.push(full);
          } catch {
            // 不可执行，跳过
          }
        }
      }
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        findChromium(path.join(dir, e.name), depth + 1, out);
        if (out.length >= 5) return;
      }
    }
  };
  for (const root of browsersPathCandidates) {
    try {
      if (!fs.existsSync(root)) continue;
      const topEntries = fs.readdirSync(root).slice(0, 20);
      playwrightTopDirs[root] = topEntries;
      findChromium(root, 0, playwrightExecutables);
    } catch (err) {
      playwrightTopDirs[root] = [
        'ERR: ' + (err instanceof Error ? err.message : String(err)),
      ];
    }
  }
  snap.playwrightTopDirs = playwrightTopDirs;
  // 文件名按 headless_shell > chrome > chromium 优先级排序，
  // resolveChromiumPathFast 会取第一个，正好挑出依赖更少的 shell
  playwrightExecutables.sort((a, b) => {
    const score = (p: string) =>
      p.endsWith('/headless_shell') ? 0 : p.endsWith('/chrome') ? 1 : 2;
    return score(a) - score(b);
  });
  snap.playwrightExecutables = playwrightExecutables;

  // 4. dpkg -l | grep chromium（看包是否已被 dpkg 记录）
  let dpkgChromium = '';
  try {
    const { execSync } = await import('node:child_process');
    dpkgChromium = execSync('dpkg -l 2>/dev/null | grep -i chromium || true', {
      encoding: 'utf8',
      timeout: 3000,
    })
      .toString()
      .trim();
  } catch {
    dpkgChromium = '';
  }
  snap.dpkgChromium = dpkgChromium || null;

  // 5. /tmp/chromium_install_status.txt（后台安装状态）
  let installStatus: string | null = null;
  try {
    if (fs.existsSync('/tmp/chromium_install_status.txt')) {
      installStatus = fs
        .readFileSync('/tmp/chromium_install_status.txt', 'utf8')
        .trim();
    }
  } catch (e) {
    installStatus = 'READ_ERR: ' + (e instanceof Error ? e.message : String(e));
  }
  snap.installStatus = installStatus;

  // 6. /tmp 下 sparticuz 缓存
  const sparticuzCache: string[] = [];
  try {
    const entries = fs.readdirSync('/tmp');
    for (const e of entries) {
      if (/chromium/i.test(e)) sparticuzCache.push('/tmp/' + e);
    }
  } catch {
    // ignore
  }
  snap.sparticuzCache = sparticuzCache;

  // 7. .chromium-libs/ 状态（build 阶段 apt-get download 解包出来的系统库）
  try {
    const wsRoot = process.env.COZE_WORKSPACE_PATH || process.cwd();
    const libsDir = path.resolve(wsRoot, '.chromium-libs');
    const altLibsDir = path.resolve(process.cwd(), '.chromium-libs');
    const dir = fs.existsSync(libsDir)
      ? libsDir
      : fs.existsSync(altLibsDir)
      ? altLibsDir
      : null;
    if (dir) {
      const entries = fs.readdirSync(dir);
      const allSo = entries.filter((e) => /\.so($|\.)/.test(e));
      const presence: Record<string, boolean> = {};
      for (const key of [
        'libnspr4.so',
        'libnss3.so',
        'libatk-1.0.so.0',
        'libcups.so.2',
        'libgbm.so.1',
        'libasound.so.2',
        'libxkbcommon.so.0',
        'libdrm.so.2',
      ]) {
        presence[key] = entries.some((e) => e.startsWith(key));
      }
      snap.chromiumLibsDir = dir;
      snap.chromiumLibsCount = allSo.length;
      snap.chromiumLibsCritical = presence;
      snap.chromiumLibsSample = allSo.slice(0, 20);
    } else {
      snap.chromiumLibsDir = null;
      snap.chromiumLibsCount = 0;
    }
  } catch (e) {
    snap.chromiumLibsErr = e instanceof Error ? e.message : String(e);
  }

  // 8. uid
  try {
    snap.uid = process.getuid?.() ?? null;
    snap.gid = process.getgid?.() ?? null;
  } catch {
    // ignore
  }

  return snap;
}

interface ResolveResult {
  executablePath: string;
  extraArgs: string[];
  source: ChromiumSource;
  resolveMs: number;
}

/**
 * 解析 chromium 可执行路径。
 * 强约定：如果 system/which 命中，**完全跳过** sparticuz，避免任何下载尝试。
 */
async function resolveChromiumPathFast(
  snap: Record<string, unknown>,
  detail: Record<string, unknown>,
): Promise<ResolveResult> {
  const t0 = Date.now();

  // 1. env
  const envPath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    process.env.CHROMIUM_PATH;
  detail.envPath = envPath ?? null;
  if (envPath) {
    const fs = await import('node:fs');
    const exists = fs.existsSync(envPath);
    detail.envPathExists = exists;
    if (exists) {
      return {
        executablePath: envPath,
        extraArgs: [],
        source: 'env',
        resolveMs: Date.now() - t0,
      };
    }
  }

  // 2. 走 snapshot 中已扫到的结果，优先 PLAYWRIGHT_BROWSERS_PATH 内置
  const playwrightExecutables =
    (snap.playwrightExecutables as string[]) || [];
  if (playwrightExecutables.length > 0) {
    console.info(
      '[health/chromium] playwright hit, skip sparticuz:',
      playwrightExecutables[0],
    );
    return {
      executablePath: playwrightExecutables[0],
      extraArgs: ['--no-sandbox'],
      source: 'playwright',
      resolveMs: Date.now() - t0,
    };
  }

  const systemFound = (snap.systemFound as string[]) || [];
  if (systemFound.length > 0) {
    console.info(
      '[health/chromium] system hit, skip sparticuz:',
      systemFound[0],
    );
    return {
      executablePath: systemFound[0],
      extraArgs: [],
      source: 'system',
      resolveMs: Date.now() - t0,
    };
  }

  // 2.5 which 兜底（snapshot 已采集）
  const whichFound = (snap.whichFound as string[]) || [];
  if (whichFound.length > 0) {
    console.info(
      '[health/chromium] which hit, skip sparticuz:',
      whichFound[0],
    );
    return {
      executablePath: whichFound[0],
      extraArgs: [],
      source: 'system',
      resolveMs: Date.now() - t0,
    };
  }

  // 3. sparticuz（独立 15s 硬超时）
  console.info('[health/chromium] no system chromium, trying sparticuz...');
  const sparticuzStart = Date.now();
  let sparticuz: typeof import('@sparticuz/chromium-min');
  try {
    sparticuz = await withTimeout(
      import('@sparticuz/chromium-min'),
      5_000,
      'sparticuz_import',
    );
  } catch (err) {
    detail.sparticuzImportErr =
      err instanceof Error ? err.message : String(err);
    throw Object.assign(
      new Error('sparticuz import failed: ' + detail.sparticuzImportErr),
      { step: 'sparticuz_import' },
    );
  }
  const chromiumMin = sparticuz.default;
  const remotePack =
    process.env.SPARTICUZ_CHROMIUM_PACK ||
    'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar';
  detail.sparticuzPack = remotePack;
  console.info('[health/chromium] sparticuz download start pack=' + remotePack);

  let executablePath: string;
  try {
    executablePath = await withTimeout(
      chromiumMin.executablePath(remotePack),
      15_000,
      'sparticuz_download',
    );
  } catch (err) {
    detail.sparticuzDownloadErr =
      err instanceof Error ? err.message : String(err);
    detail.sparticuzDownloadMs = Date.now() - sparticuzStart;
    console.error(
      '[health/chromium] sparticuz failed (' +
        detail.sparticuzDownloadErr +
        ')',
    );
    throw Object.assign(
      new Error(
        'sparticuz executablePath failed: ' + detail.sparticuzDownloadErr,
      ),
      { step: 'sparticuz_download' },
    );
  }
  detail.sparticuzDownloadMs = Date.now() - sparticuzStart;
  console.info(
    '[health/chromium] sparticuz ok path=' +
      executablePath +
      ' ms=' +
      detail.sparticuzDownloadMs,
  );
  return {
    executablePath,
    extraArgs: chromiumMin.args,
    source: 'sparticuz',
    resolveMs: Date.now() - t0,
  };
}

interface Summary {
  ok: boolean;
  step: string;
  source?: ChromiumSource;
  executablePath?: string;
  resolveMs?: number;
  launchMs?: number;
  newPageMs?: number;
  gotoMs?: number;
  screenshotMs?: number;
  closeMs?: number;
  totalMs?: number;
  screenshotPath?: string;
  screenshotBytes?: number;
  error?: string;
  installStatus?: string | null;
  detail: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  nodeVersion: string;
  platform: string;
  arch: string;
  env: Record<string, string | undefined>;
}

async function runDiagnostic(summary: Summary): Promise<Summary> {
  const reqStart = Date.now();
  let browser: Browser | null = null;
  const detail = summary.detail;

  try {
    // Step 0: snapshot（不阻塞）
    summary.step = 'snapshot';
    summary.snapshot = await withTimeout(
      snapshotEnvironment(),
      5_000,
      'snapshot',
    );
    summary.installStatus =
      (summary.snapshot.installStatus as string | null) ?? null;

    // Step 1: resolve
    summary.step = 'resolve';
    const resolved = await withTimeout(
      resolveChromiumPathFast(summary.snapshot, detail),
      20_000,
      'resolve',
    );
    summary.source = resolved.source;
    summary.executablePath = resolved.executablePath;
    summary.resolveMs = resolved.resolveMs;

    // Step 1.5: ensure shared libraries — 真实调用 ensureChromiumLibsOnce
    // 该函数有模块级 Promise 缓存, 每个 Node 进程只会真实执行 apt-get 一次,
    // 后续命中缓存毫秒返回. 此端点也充当冷启动预热入口.
    summary.step = 'ensureLibs';
    const summaryAny = summary as unknown as Record<string, unknown>;
    const ensureStart = Date.now();
    try {
      const { ensureChromiumLibsOnce } = await import(
        '@/lib/server/toutiao-publisher'
      );
      const ok = await withTimeout(
        ensureChromiumLibsOnce(),
        90_000,
        'ensureChromiumLibsOnce',
      );
      summaryAny.ensureLibsMs = Date.now() - ensureStart;
      summaryAny.ensureLibsResult = ok
        ? 'ok: /tmp/.chromium-libs populated (or already present)'
        : 'partial: ensureChromiumLibsOnce returned false, will rely on bundled libs';
    } catch (err) {
      summaryAny.ensureLibsMs = Date.now() - ensureStart;
      summaryAny.ensureLibsResult = `error: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }

    // Step 2: launch
    summary.step = 'launch';
    const launchStart = Date.now();
    const { chromium } = await withTimeout(
      import('playwright-core'),
      5_000,
      'playwright_import',
    );
    const baseArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ];
    const launchArgs = Array.from(
      new Set([...baseArgs, ...resolved.extraArgs]),
    );
    // 显式把 LD_LIBRARY_PATH 透传到 chromium 子进程，确保 start.sh 在启动前
    // 补好的 .chromium-libs / chrome-linux 目录被 chromium 子进程加载
    const childEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string') childEnv[k] = v;
    }
    if (process.env.LD_LIBRARY_PATH) {
      childEnv.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH;
    }
    browser = await withTimeout(
      chromium.launch({
        headless: true,
        executablePath: resolved.executablePath,
        args: launchArgs,
        env: childEnv,
        timeout: 20000,
      }),
      25_000,
      'launch',
    );
    summary.launchMs = Date.now() - launchStart;

    // Step 3: newPage
    summary.step = 'newPage';
    const npStart = Date.now();
    const page = await withTimeout(browser.newPage(), 5_000, 'newPage');
    summary.newPageMs = Date.now() - npStart;

    // Step 4: goto
    summary.step = 'goto';
    const gotoStart = Date.now();
    await withTimeout(
      page.goto('about:blank', { timeout: 5_000 }),
      6_000,
      'goto',
    );
    summary.gotoMs = Date.now() - gotoStart;

    // Step 5: screenshot
    summary.step = 'screenshot';
    const shotStart = Date.now();
    const screenshotPath = '/tmp/chromium_test.png';
    await withTimeout(
      page.screenshot({ path: screenshotPath, fullPage: false }),
      8_000,
      'screenshot',
    );
    summary.screenshotMs = Date.now() - shotStart;
    summary.screenshotPath = screenshotPath;
    try {
      const fs = await import('node:fs');
      summary.screenshotBytes = fs.statSync(screenshotPath).size;
    } catch {
      // ignore
    }

    // Step 6: close
    summary.step = 'close';
    const closeStart = Date.now();
    await withTimeout(browser.close(), 5_000, 'close');
    browser = null;
    summary.closeMs = Date.now() - closeStart;

    summary.ok = true;
    summary.step = 'done';
    summary.totalMs = Date.now() - reqStart;
    return summary;
  } catch (err: unknown) {
    summary.ok = false;
    const e = err as { message?: string; step?: string };
    summary.error = e?.message || String(err);
    if (e?.step) summary.step = e.step;
    summary.totalMs = Date.now() - reqStart;
    console.error(
      '[health/chromium] FAILED step=' +
        summary.step +
        ' err=' +
        summary.error,
    );
    if (browser) {
      try {
        await withTimeout(browser.close(), 3_000, 'cleanup_close');
      } catch {
        // ignore
      }
    }
    return summary;
  }
}

export async function GET() {
  const summary: Summary = {
    ok: false,
    step: 'init',
    detail: {},
    snapshot: {},
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    env: {
      COZE_PROJECT_ENV: process.env.COZE_PROJECT_ENV,
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      CHROMIUM_PATH: process.env.CHROMIUM_PATH,
      SPARTICUZ_CHROMIUM_PACK: process.env.SPARTICUZ_CHROMIUM_PACK,
    },
  };

  try {
    // 整体硬超时 55s，绝不让 curl 收到空响应
    const finalSummary = await withTimeout(
      runDiagnostic(summary),
      55_000,
      'overall',
    );
    const finalAny = finalSummary as unknown as Record<string, unknown>;
    try {
      const fsMod = await import('node:fs');
      finalAny.libsListing = fsMod.readdirSync('/tmp/.chromium-libs');
    } catch (e) {
      finalAny.libsListing = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
    return NextResponse.json(finalSummary, { status: 200 });
  } catch (err) {
    summary.ok = false;
    summary.error =
      'overall hard timeout: ' +
      (err instanceof Error ? err.message : String(err));
    summary.step = 'overall_timeout';
    const summaryAny = summary as unknown as Record<string, unknown>;
    try {
      const fsMod = await import('node:fs');
      summaryAny.libsListing = fsMod.readdirSync('/tmp/.chromium-libs');
    } catch (e) {
      summaryAny.libsListing = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
    return NextResponse.json(summary, { status: 200 });
  }
}
