/**
 * GET /api/articles/publish/test?cookie=xxx
 *
 * 诊断接口：测试 Playwright + 头条登录 + 发布页加载三步，不实际发布。
 * 返回结构化的逐步诊断结果，方便排障 chromium 启动 / cookie 失效 / 发布页打不开。
 *
 * 因为账号 Cookie 持久化在客户端 localStorage，所以这里必须接受 cookie 参数。
 * 出于安全考虑，建议通过 query string 而不是放在 URL 路径里。
 */
import { NextRequest, NextResponse } from 'next/server';
import { chromium as pwCore } from 'playwright-core';
import chromium from '@sparticuz/chromium-min';
import { existsSync } from 'node:fs';
import type { Browser, BrowserContext, Cookie, Page } from 'playwright-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar';

function parseCookieString(raw: string): Cookie[] {
  const parts = raw.split(/;\s*/).filter(Boolean);
  const cookies: Cookie[] = [];
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 1) continue;
    const name = p.slice(0, eq).trim();
    const value = p.slice(eq + 1).trim();
    if (!name) continue;
    cookies.push({
      name,
      value,
      domain: '.toutiao.com',
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 86400 * 30,
      httpOnly: false,
      secure: true,
      sameSite: 'Lax',
    });
  }
  return cookies;
}

interface DiagnosticReport {
  ok: boolean;
  steps: {
    chromium: 'ok' | 'failed' | 'skipped';
    chromiumDetail?: string;
    launch: 'ok' | 'failed' | 'skipped';
    launchDetail?: string;
    cookie: 'ok' | 'invalid' | 'skipped';
    cookieDetail?: string;
    nav: 'ok' | 'failed' | 'skipped';
    navDetail?: string;
    auth: 'ok' | 'expired' | 'skipped';
    authDetail?: string;
    page: 'publish_page_loaded' | 'unknown_page' | 'skipped';
    pageUrl?: string;
  };
  message?: string;
}

export async function GET(req: NextRequest): Promise<NextResponse<DiagnosticReport>> {
  const url = new URL(req.url);
  const cookie = (url.searchParams.get('cookie') ?? '').trim();

  const report: DiagnosticReport = {
    ok: false,
    steps: {
      chromium: 'skipped',
      launch: 'skipped',
      cookie: 'skipped',
      nav: 'skipped',
      auth: 'skipped',
      page: 'skipped',
    },
  };

  if (!cookie) {
    report.message = '缺少 cookie 参数：?cookie=...';
    return NextResponse.json(report, { status: 400 });
  }

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;

  try {
    // Step 1: 解析 cookie
    const cookies = parseCookieString(cookie);
    if (cookies.length === 0) {
      report.steps.cookie = 'invalid';
      report.steps.cookieDetail = 'Cookie 解析后为 0 条';
      return NextResponse.json(report, { status: 200 });
    }
    report.steps.cookie = 'ok';
    report.steps.cookieDetail = `${cookies.length} 条 cookie 解析成功`;

    // Step 2: 解析 chromium 可执行文件路径
    let execPath: string;
    const envPath =
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.CHROMIUM_PATH;
    if (envPath && existsSync(envPath)) {
      execPath = envPath;
      report.steps.chromium = 'ok';
      report.steps.chromiumDetail = `使用环境变量指定路径 ${envPath}`;
    } else {
      try {
        execPath = await chromium.executablePath(CHROMIUM_PACK_URL);
        report.steps.chromium = 'ok';
        report.steps.chromiumDetail = `@sparticuz/chromium-min 提供路径 ${execPath}`;
      } catch (e) {
        report.steps.chromium = 'failed';
        report.steps.chromiumDetail = `chromium tar 下载失败：${
          e instanceof Error ? e.message : String(e)
        }（建议通过 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH 指定本地 chromium）`;
        return NextResponse.json(report, { status: 200 });
      }
    }

    // Step 3: 启动浏览器
    try {
      browser = await pwCore.launch({
        executablePath: execPath,
        args: chromium.args,
        headless: true,
      });
      report.steps.launch = 'ok';
      report.steps.launchDetail = `chromium 启动成功 pid=${browser.contexts.length}`;
    } catch (e) {
      report.steps.launch = 'failed';
      report.steps.launchDetail = `launch 失败：${
        e instanceof Error ? e.message : String(e)
      }`;
      return NextResponse.json(report, { status: 200 });
    }

    // Step 4: 注入 cookie 并打开发布页
    context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    await context.addCookies(cookies);
    page = await context.newPage();

    try {
      await page.goto('https://mp.toutiao.com/profile_v4/graphic/publish?source=add', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      report.steps.nav = 'ok';
      report.steps.navDetail = `导航完成，当前 URL: ${page.url()}`;
    } catch (e) {
      report.steps.nav = 'failed';
      report.steps.navDetail = `导航失败：${e instanceof Error ? e.message : String(e)}`;
      return NextResponse.json(report, { status: 200 });
    }

    // Step 5: 鉴权 + 页面判定
    const currentUrl = page.url();
    report.steps.pageUrl = currentUrl;
    if (
      currentUrl.includes('passport.toutiao.com') ||
      currentUrl.includes('login') ||
      currentUrl.includes('sso.bytedance.net')
    ) {
      report.steps.auth = 'expired';
      report.steps.authDetail = `被重定向到登录页 ${currentUrl}`;
      report.steps.page = 'unknown_page';
      return NextResponse.json(report, { status: 200 });
    }

    // 等编辑器容器出现
    const editorVisible = await page
      .locator('[contenteditable="true"], textarea[placeholder*="标题"], input[placeholder*="标题"]')
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    if (editorVisible) {
      report.steps.auth = 'ok';
      report.steps.page = 'publish_page_loaded';
      report.ok = true;
      report.message = '诊断通过：Playwright + Cookie + 发布页全部就绪';
    } else {
      report.steps.auth = 'ok';
      report.steps.page = 'unknown_page';
      report.steps.authDetail = '未发现登录跳转，但发布页编辑器未渲染（可能选择器变了）';
      report.message = '页面已加载但编辑器选择器未匹配，建议检查头条最新 DOM';
    }

    return NextResponse.json(report, { status: 200 });
  } catch (err) {
    report.message = `诊断过程异常：${err instanceof Error ? err.message : String(err)}`;
    return NextResponse.json(report, { status: 500 });
  } finally {
    try {
      await page?.close();
    } catch {}
    try {
      await context?.close();
    } catch {}
    try {
      await browser?.close();
    } catch {}
  }
}
