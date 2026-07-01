/**
 * /api/health/debug
 *
 * 诊断 chromium 启动环境：
 *  - LD_* / PLAYWRIGHT_* 环境变量值
 *  - .chromium-libs / .playwright-browsers 目录内容
 *  - apt-get 可用性 + /etc/apt/sources.* 配置
 *  - /etc/os-release
 *  - uid/gid + cwd
 *
 * 任何步骤失败都被 catch，绝不让接口挂起或 500。
 */

import { NextResponse } from 'next/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

type Snapshot = Record<string, unknown>;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    return fallback;
  }
}

function safeMsg<T>(fn: () => T): T | { error: string } {
  try {
    return fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function listDir(dir: string, limit = 10): string[] | { error: string } {
  try {
    if (!fs.existsSync(dir)) return [];
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return [{ error: 'not a directory' } as never];
    return fs.readdirSync(dir).slice(0, limit);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function execShort(cmd: string, timeoutMs = 2000): string | { error: string } {
  try {
    const out = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    return out.toString().trim();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 跑一个命令，无论是否出错都同时返回 stdout / stderr / exitCode / 触发的 error message。
 * 用于 apt-get 这种"想看到失败原因"的诊断场景。
 */
function execVerbose(
  cmd: string,
  timeoutMs = 30000,
): { stdout: string; stderr: string; exitCode: number | null; error: string | null } {
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      shell: '/bin/bash',
    });
    return { stdout: stdout.toString(), stderr: '', exitCode: 0, error: null };
  } catch (e) {
    const err = e as {
      status?: number | null;
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      message?: string;
    };
    const stdout =
      typeof err.stdout === 'string'
        ? err.stdout
        : err.stdout?.toString?.('utf8') ?? '';
    const stderr =
      typeof err.stderr === 'string'
        ? err.stderr
        : err.stderr?.toString?.('utf8') ?? '';
    return {
      stdout,
      stderr,
      exitCode: typeof err.status === 'number' ? err.status : null,
      error: err.message ?? String(e),
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const snap: Snapshot = {
    ok: true,
    now: new Date().toISOString(),
  };

  // 1. cwd / uid / gid
  snap.cwd = safe(() => process.cwd(), '<unknown>');
  snap.uid = safe(() => process.getuid?.() ?? -1, -1);
  snap.gid = safe(() => process.getgid?.() ?? -1, -1);
  snap.pid = process.pid;
  snap.nodeVersion = process.version;
  snap.platform = process.platform;
  snap.arch = process.arch;

  // 2. 环境变量：所有 LD_* / PLAYWRIGHT_* / COZE_* / CHROMIUM_*
  const envFiltered: Record<string, string | undefined> = {};
  for (const k of Object.keys(process.env)) {
    if (
      k.startsWith('LD_') ||
      k.startsWith('PLAYWRIGHT_') ||
      k.startsWith('COZE_') ||
      k.startsWith('CHROMIUM_') ||
      k === 'HOME' ||
      k === 'USER' ||
      k === 'PATH' ||
      k === 'PORT' ||
      k === 'DEPLOY_RUN_PORT' ||
      k === 'PWD' ||
      k === 'TMPDIR'
    ) {
      envFiltered[k] = process.env[k];
    }
  }
  snap.env = envFiltered;
  snap.envLdLibraryPath = process.env.LD_LIBRARY_PATH ?? null;
  snap.envPlaywrightBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH ?? null;
  snap.envChromiumLibsDir = process.env.CHROMIUM_LIBS_DIR ?? null;
  snap.envCozeWorkspacePath = process.env.COZE_WORKSPACE_PATH ?? null;

  // 3. .chromium-libs 目录扫描
  const libDirCandidates = [
    '/opt/bytefaas/.chromium-libs',
    process.env.CHROMIUM_LIBS_DIR ?? '',
    process.env.COZE_WORKSPACE_PATH
      ? path.join(process.env.COZE_WORKSPACE_PATH, '.chromium-libs')
      : '',
    path.join(process.cwd(), '.chromium-libs'),
  ].filter(Boolean);
  const libDirs: Snapshot[] = [];
  for (const d of libDirCandidates) {
    const exists = safe(() => fs.existsSync(d), false);
    let count: number | { error: string } = 0;
    let sample: string[] | { error: string } = [];
    if (exists) {
      count = safeMsg(() => {
        try {
          return fs.readdirSync(d).length;
        } catch (e) {
          throw e;
        }
      });
      sample = listDir(d, 10);
    }
    libDirs.push({ dir: d, exists, count, sample });
  }
  snap.chromiumLibsDirs = libDirs;

  // 4. .playwright-browsers 目录扫描
  const pwCandidates = [
    '/opt/bytefaas/.playwright-browsers',
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? '',
    process.env.COZE_WORKSPACE_PATH
      ? path.join(process.env.COZE_WORKSPACE_PATH, '.playwright-browsers')
      : '',
    path.join(process.cwd(), '.playwright-browsers'),
  ].filter(Boolean);
  const pwDirs: Snapshot[] = [];
  for (const d of pwCandidates) {
    const exists = safe(() => fs.existsSync(d), false);
    const sample = exists ? listDir(d, 10) : [];
    let chromiumSubDir: Snapshot | null = null;
    if (exists) {
      try {
        const entries = fs.readdirSync(d);
        const chromium = entries.find((e) => e.startsWith('chromium-'));
        if (chromium) {
          const sub = path.join(d, chromium);
          chromiumSubDir = {
            name: chromium,
            sample: listDir(sub, 10),
          };
          // 再下钻一层找 chrome-linux*
          try {
            const subEntries = fs.readdirSync(sub);
            for (const e of subEntries) {
              if (e.startsWith('chrome-linux')) {
                const deeper = path.join(sub, e);
                chromiumSubDir = {
                  ...chromiumSubDir,
                  chromeLinuxDir: e,
                  chromeLinuxSample: listDir(deeper, 12),
                };
                // 检查 chrome 可执行
                const chromeBin = path.join(deeper, 'chrome');
                const headlessShell = path.join(deeper, 'headless_shell');
                chromiumSubDir.chromeExists = safe(() => fs.existsSync(chromeBin), false);
                chromiumSubDir.headlessShellExists = safe(
                  () => fs.existsSync(headlessShell),
                  false,
                );
                if ((chromiumSubDir.chromeExists as boolean) === true) {
                  chromiumSubDir.chromeStat = safeMsg(() => {
                    const s = fs.statSync(chromeBin);
                    return { size: s.size, mode: s.mode.toString(8) };
                  });
                }
              }
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }
    pwDirs.push({ dir: d, exists, sample, chromiumSubDir });
  }
  snap.playwrightBrowsersDirs = pwDirs;

  // 5. apt-get 可用性
  snap.aptGet = {
    which: execShort('which apt-get'),
    version: execShort('apt-get --version 2>&1 | head -1'),
  };

  // 6. apt sources 配置
  snap.aptSources = {
    sourcesList_exists: safe(() => fs.existsSync('/etc/apt/sources.list'), false),
    sourcesList_size: safe(() => {
      const s = fs.statSync('/etc/apt/sources.list');
      return s.size;
    }, 0),
    sourcesList_head: safe(
      () =>
        fs
          .readFileSync('/etc/apt/sources.list', 'utf8')
          .split('\n')
          .slice(0, 10),
      [] as string[],
    ),
    sourcesListD_exists: safe(() => fs.existsSync('/etc/apt/sources.list.d'), false),
    sourcesListD_files: safe(() => fs.readdirSync('/etc/apt/sources.list.d'), [] as string[]),
  };

  // 7. /etc/os-release
  snap.osRelease = safe(
    () => fs.readFileSync('/etc/os-release', 'utf8').split('\n').filter(Boolean),
    [] as string[],
  );

  // 8. ldd 缺失库检查（对 .playwright-browsers 下找到的 chrome / headless_shell 跑 ldd）
  const lddResults: Snapshot[] = [];
  for (const d of pwCandidates) {
    try {
      if (!fs.existsSync(d)) continue;
      // 递归找 chrome / headless_shell
      const out = execShort(
        `find "${d}" -maxdepth 5 \\( -name chrome -o -name headless_shell \\) -type f 2>/dev/null | head -3`,
        3000,
      );
      if (typeof out === 'string' && out.length > 0) {
        const bins = out.split('\n').filter(Boolean);
        for (const bin of bins) {
          const lddOut = execShort(`ldd "${bin}" 2>&1 | head -50`, 3000);
          const missing = execShort(`ldd "${bin}" 2>&1 | grep 'not found' | head -20`, 3000);
          lddResults.push({ bin, lddHead: lddOut, missing });
        }
      }
    } catch {
      // ignore
    }
    if (lddResults.length >= 3) break;
  }
  snap.lddChecks = lddResults;

  // 9. 检查 dpkg / dpkg-deb 可用性
  snap.dpkg = {
    which_dpkg: execShort('which dpkg'),
    which_dpkg_deb: execShort('which dpkg-deb'),
  };

  // 10. /tmp 临时目录残留（看 start.sh 是否真的跑过）
  snap.tmpInspect = {
    chromium_libs_debs_glob: execShort(
      'ls -d /tmp/chromium-libs-debs-* 2>/dev/null | head -3',
    ),
    chromium_libs_extract_glob: execShort(
      'ls -d /tmp/chromium-libs-extract-* 2>/dev/null | head -3',
    ),
  };

  // 11. apt-get download 实测：在 /tmp/apt-test 跑真实下载，收集完整 stdout/stderr/exitCode
  snap.aptTest = safeMsg(() =>
    execVerbose(
      'cd /tmp && rm -rf apt-test && mkdir -p apt-test && cd apt-test && apt-get download libnspr4 2>&1; echo "---EXIT:$?---"; ls -la',
      25000,
    ),
  );

  // 12. apt-get update 实测
  snap.aptUpdateTest = safeMsg(() =>
    execVerbose(
      'cd /tmp/apt-test 2>/dev/null || cd /tmp; apt-get update 2>&1 | tail -10; echo "---EXIT:$?---"',
      20000,
    ),
  );

  // 12.5 关键：用 apt -o Dir::State::Lists=/tmp/apt-user/lists 等选项把 apt 状态/缓存
  // 目录指到 /tmp（非 root 永远可写），模拟 ensureChromiumLibs 在生产环境的做法
  snap.aptGetDownloadTest = safeMsg(() => {
    const script = [
      'set +e',
      'rm -rf /tmp/apt-user-test',
      'mkdir -p /tmp/apt-user-test/lists/partial /tmp/apt-user-test/cache/archives/partial /tmp/apt-user-test/state',
      'cp -f /var/lib/dpkg/status /tmp/apt-user-test/state/status 2>&1 || echo "(no /var/lib/dpkg/status)"',
      'AOPTS="-o Dir::State::Lists=/tmp/apt-user-test/lists/ -o Dir::Cache=/tmp/apt-user-test/cache/ -o Dir::State=/tmp/apt-user-test/state/ -o Dir::Etc::SourceList=/etc/apt/sources.list -o Dir::Etc::SourceParts=/etc/apt/sources.list.d/ -o APT::Install-Recommends=false -o Acquire::Retries=2"',
      'echo "=== apt-get $AOPTS update ==="',
      'apt-get $AOPTS update 2>&1 | tail -8',
      'echo "---UPDATE_EXIT:$?---"',
      'cd /tmp/apt-user-test && apt-get $AOPTS download libnspr4 2>&1 | tail -8',
      'echo "---DOWNLOAD_EXIT:$?---"',
      'echo "=== files: ==="',
      'ls -la /tmp/apt-user-test/*.deb 2>&1 || echo "(no .deb)"',
    ].join('; ');
    return execVerbose(script, 35000);
  });

  // 13. deb.deps 文件内容（playwright 官方依赖清单）
  const debDepsCandidatePaths = [
    '/opt/bytefaas/.playwright-browsers/chromium-1228/chrome-linux/deb.deps',
    process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(
          process.env.PLAYWRIGHT_BROWSERS_PATH,
          'chromium-1228/chrome-linux/deb.deps',
        )
      : '',
    process.env.COZE_WORKSPACE_PATH
      ? path.join(
          process.env.COZE_WORKSPACE_PATH,
          '.playwright-browsers/chromium-1228/chrome-linux/deb.deps',
        )
      : '',
  ].filter(Boolean);
  const debDepsResults: Snapshot[] = [];
  for (const p of debDepsCandidatePaths) {
    if (!safe(() => fs.existsSync(p), false)) {
      debDepsResults.push({ path: p, exists: false });
      continue;
    }
    const content = safeMsg(() => fs.readFileSync(p, 'utf8'));
    debDepsResults.push({
      path: p,
      exists: true,
      content: typeof content === 'string' ? content : content,
    });
    break; // 找到一个就够
  }
  snap.debDeps = debDepsResults;

  // 14. ldd 缺失库列表（针对生产 chrome 二进制）
  const chromeBinCandidates = [
    '/opt/bytefaas/.playwright-browsers/chromium-1228/chrome-linux/chrome',
    process.env.PLAYWRIGHT_BROWSERS_PATH
      ? path.join(
          process.env.PLAYWRIGHT_BROWSERS_PATH,
          'chromium-1228/chrome-linux/chrome',
        )
      : '',
    process.env.COZE_WORKSPACE_PATH
      ? path.join(
          process.env.COZE_WORKSPACE_PATH,
          '.playwright-browsers/chromium-1228/chrome-linux/chrome',
        )
      : '',
  ].filter(Boolean);
  let lddChrome: Snapshot = { found: false };
  for (const p of chromeBinCandidates) {
    if (safe(() => fs.existsSync(p), false)) {
      lddChrome = {
        found: true,
        path: p,
        ldd: execShort(`ldd "${p}" 2>&1 | head -50`, 5000),
        missingOnly: execShort(
          `ldd "${p}" 2>&1 | grep 'not found' | head -30`,
          5000,
        ),
      };
      break;
    }
  }
  snap.lddChrome = lddChrome;

  // 15. 启动日志（多路径尝试）
  const logCandidates = [
    '/tmp/start.log',
    '/tmp/chromium-libs.log',
    '/var/log/start.log',
    '/var/log/app.log',
    '/opt/bytefaas/logs/start.log',
    '/opt/bytefaas/logs/app.log',
    process.env.COZE_WORKSPACE_PATH
      ? path.join(process.env.COZE_WORKSPACE_PATH, 'logs/start.log')
      : '',
    process.env.COZE_WORKSPACE_PATH
      ? path.join(process.env.COZE_WORKSPACE_PATH, 'start.log')
      : '',
  ].filter(Boolean);
  const startLogs: Snapshot[] = [];
  for (const p of logCandidates) {
    if (!safe(() => fs.existsSync(p), false)) continue;
    const tail = safeMsg(() => {
      const content = fs.readFileSync(p, 'utf8');
      const lines = content.split('\n');
      return lines.slice(-200).join('\n');
    });
    startLogs.push({
      path: p,
      size: safe(() => fs.statSync(p).size, -1),
      tail: typeof tail === 'string' ? tail : tail,
    });
    if (startLogs.length >= 3) break;
  }
  snap.startLogs = startLogs.length === 0 ? 'no log file' : startLogs;

  // 16. /tmp/.chromium-libs/ 当前 .so 文件清单（ensureChromiumLibs 落地结果）
  const libsDirCandidates = [
    '/tmp/.chromium-libs',
    process.env.CHROMIUM_LIBS_DIR || '',
  ].filter(Boolean);
  const libsListEntries: Array<{
    dir: string;
    exists: boolean;
    count?: number;
    sample?: string[];
  }> = [];
  for (const dir of libsDirCandidates) {
    const exists = safe(() => fs.existsSync(dir), false);
    if (!exists) {
      libsListEntries.push({ dir, exists: false });
      continue;
    }
    const all = safe(
      () =>
        fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((e) => /\.so(\.|$)/.test(e.name))
          .map((e) => e.name),
      [] as string[],
    );
    libsListEntries.push({
      dir,
      exists: true,
      count: all.length,
      sample: all.slice(0, 30),
    });
  }
  snap.libsList = libsListEntries;

  return NextResponse.json(snap, { status: 200 });
}
