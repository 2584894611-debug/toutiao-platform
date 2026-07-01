import { NextRequest, NextResponse } from 'next/server';
import { marked } from 'marked';
import {
  ToutiaoApiError,
  toutiaoFetch,
  safeJson,
  isAuthFailure,
  TOUTIAO_BASE,
  type ToutiaoEnvelope,
} from '@/lib/server/toutiao-client';
import { markdownToHtml } from '@/lib/markdown-to-html';
import { publishArticle, type PublishResult } from '@/lib/server/toutiao-publisher';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Playwright 启动 + 头条页面加载可能耗时 30s+
export const maxDuration = 90;

interface PublishBody {
  articleId: string;
  accountId?: string;
  cookie?: string;
  title: string;
  contentMarkdown?: string;
  contentHtml?: string;
  coverMode?: 'single' | 'triple' | 'none';
  coverImages?: string[];
  location?: string;
  adEnabled?: boolean;
  isFirstPublish?: boolean;
  collections?: string[];
  crossPostWeitoutiao?: boolean;
  declarations?: string[];
  /** 跳过 Playwright 自动发布，只走草稿保存 */
  draftOnly?: boolean;
}

interface PublishResponse {
  ok: boolean;
  articleId: string;
  publishUrl?: string;
  toutiaoId?: string;
  /**
   * 文章在头条上的最终状态：
   * - 'published' 已发布并已在列表二次验证通过
   * - 'submitted' 发布请求已提交但未在列表二次验证（可能审核中）
   */
  status?: 'published' | 'submitted';
  /** 是否通过二次验证（在头条文章列表中检测到本次发布） */
  verified?: boolean;
  /** 二次验证失败时的提示文案 */
  warning?: string;
  /** 'playwright' | 'draft_save' */
  mode?: 'playwright' | 'draft_save';
  errorKind?: string;
  message: string;
  upstream?: unknown;
  screenshotPath?: string;
  stepScreenshots?: Array<{ step: string; path: string }>;
}

function fail(
  articleId: string,
  message: string,
  errorKind: PublishResponse['errorKind'],
  extras: Partial<PublishResponse> = {},
  status = 200,
): NextResponse<PublishResponse> {
  return NextResponse.json(
    { ok: false, articleId, message, errorKind, ...extras },
    { status },
  );
}

/** marked 优先（兼容性最好），失败时回落 markdownToHtml 自实现 */
function toHtml(md: string): string {
  if (!md.trim()) return '';
  try {
    const result = marked.parse(md, { async: false }) as string;
    return result;
  } catch {
    return markdownToHtml(md);
  }
}

/**
 * POST /api/articles/publish
 *
 * 双通道发布：
 *  1. Playwright 自动化（默认）—— headless chromium 模拟浏览器登录 → 发布页 → 点击发布
 *  2. 头条 article/v1/save 草稿保存接口（兜底 / draftOnly=true）
 *
 * Playwright 通道在缺少 chromium 二进制时返回 errorKind='browser_missing'，
 * 自动降级走草稿保存路径，前端 toast 提示「已保存为草稿，请去头条后台手动发布」。
 */
export async function POST(
  req: NextRequest,
): Promise<NextResponse<PublishResponse>> {
  let body: PublishBody;
  try {
    body = (await req.json()) as PublishBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        articleId: '',
        message: '请求体格式错误，必须是 JSON',
        errorKind: 'param_error',
      },
      { status: 400 },
    );
  }

  const articleId = body.articleId ?? '';
  const cookie = (body.cookie ?? '').trim();
  console.log(
    `[publish] start articleId=${articleId} title="${body.title?.slice(0, 30) ?? ''}" cookieLen=${cookie.length} covers=${body.coverImages?.length ?? 0} adEnabled=${body.adEnabled} firstPub=${body.isFirstPublish} draftOnly=${body.draftOnly}`,
  );

  if (!articleId) {
    return fail('', '缺少 articleId', 'param_error', {}, 400);
  }
  if (!cookie) {
    console.warn(`[publish] articleId=${articleId} 未绑定 Cookie`);
    return fail(articleId, '该账号未绑定 Cookie，无法发布', 'auth_expired');
  }
  if (!body.title?.trim()) {
    return fail(articleId, '标题不能为空', 'param_error', {}, 400);
  }

  // ─── Markdown → HTML ───────────────────────────────────────────────
  const html =
    body.contentHtml?.trim() ||
    toHtml(body.contentMarkdown ?? '').trim();
  if (!html) {
    return fail(articleId, '正文不能为空', 'param_error', {}, 400);
  }

  // ─── 封面校验 ───────────────────────────────────────────────────────
  const coverImages = (body.coverImages ?? []).filter(Boolean);
  if (body.coverMode === 'single' && coverImages.length < 1) {
    return fail(articleId, '单图模式需要 1 张封面', 'param_error', {}, 400);
  }
  if (body.coverMode === 'triple' && coverImages.length < 3) {
    return fail(articleId, '三图模式需要 3 张封面', 'param_error', {}, 400);
  }

  // ─── ① Playwright 自动发布通道 ──────────────────────────────────────
  if (!body.draftOnly) {
    let pwResult: PublishResult | undefined;
    try {
      pwResult = await publishArticle({
        cookie,
        title: body.title.trim(),
        contentHtml: html,
        coverImages,
        coverMode: body.coverMode,
        location: body.location,
        adEnabled: body.adEnabled,
        isFirstPublish: body.isFirstPublish,
        declarations: body.declarations,
        timeoutMs: 75_000,
      });
    } catch (err) {
      console.error('[publish] playwright exception:', err);
      pwResult = {
        success: false,
        errorKind: 'unknown',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    if (pwResult.success) {
      const verified = pwResult.verified === true;
      const finalStatus: 'published' | 'submitted' = verified
        ? 'published'
        : 'submitted';
      console.log(
        `[publish] OK via playwright articleId=${articleId} toutiaoId=${pwResult.toutiaoId} publishUrl=${pwResult.publishUrl} verified=${verified} status=${finalStatus}`,
      );
      return NextResponse.json({
        ok: true,
        articleId,
        toutiaoId: pwResult.toutiaoId,
        publishUrl: pwResult.publishUrl,
        mode: 'playwright',
        status: finalStatus,
        verified,
        warning: verified
          ? undefined
          : '发布请求已提交但未在文章列表二次验证到，可能审核中，将在 30 秒后重新查询',
        message: verified ? '发布成功' : '已提交，等待头条确认',
        stepScreenshots: pwResult.stepScreenshots,
      });
    }

    console.warn(
      `[publish] playwright failed articleId=${articleId} kind=${pwResult.errorKind} msg="${pwResult.message}"`,
    );

    // chromium 不可用时降级到草稿保存
    if (pwResult.errorKind === 'browser_missing' || pwResult.errorKind === 'launch_failed') {
      console.log('[publish] fallback to draft_save (chromium unavailable)');
      // 落到下方草稿保存路径
    } else if (pwResult.errorKind === 'auth_expired') {
      return fail(articleId, pwResult.message, 'auth_expired', {
        screenshotPath: pwResult.screenshotPath,
        mode: 'playwright',
        stepScreenshots: pwResult.stepScreenshots,
      });
    } else {
      // 其它失败（editor_not_found / submit_failed / timeout / unknown）：直接返回，让用户看到截图调试
      return fail(articleId, pwResult.message, pwResult.errorKind ?? 'unknown', {
        screenshotPath: pwResult.screenshotPath,
        mode: 'playwright',
        stepScreenshots: pwResult.stepScreenshots,
      });
    }
  }

  // ─── ② 草稿保存兜底 ────────────────────────────────────────────────
  const form: Record<string, string> = {
    title: body.title.trim(),
    content: html,
    article_type: '0',
    article_ad_type: body.adEnabled ? '3' : '0',
    save: '1',
  };
  if (coverImages.length) {
    form.cover_mode = body.coverMode === 'triple' ? '3' : '1';
    form.cover_image = JSON.stringify(coverImages);
  }
  if (body.location) form.location = body.location;
  if (body.isFirstPublish) form.is_first_publish = '1';
  if (body.collections?.length) form.collections = body.collections.join(',');
  if (body.crossPostWeitoutiao) form.cross_post_weitoutiao = '1';
  if (body.declarations?.length) form.declarations = body.declarations.join(',');

  const formBody = new URLSearchParams(form).toString();

  try {
    const res = await toutiaoFetch(`${TOUTIAO_BASE}/mp/agw/article/v1/save`, {
      cookie,
      timeoutMs: 15_000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      init: { method: 'POST', body: formBody },
    });
    const ct = res.headers.get('content-type') ?? '';
    const payload = await safeJson(res);
    if (isAuthFailure(res.status, payload as ToutiaoEnvelope | null, ct)) {
      return fail(articleId, 'Cookie 已失效，请重新绑定', 'auth_expired', {
        upstream: payload,
      });
    }
    if (!res.ok) {
      return fail(articleId, `头条返回 HTTP ${res.status}`, 'upstream_error', {
        upstream: payload,
      });
    }
    const env = payload as
      | {
          code?: number;
          message?: string;
          data?: { pgc_id?: string | number; item_id?: string | number; article_id?: string | number };
        }
      | null;
    if (env && env.code !== undefined && env.code !== 0) {
      const code = env.code;
      const message = env.message ?? `code=${code}`;
      const kind =
        code === 100004 || code === 100005 || code === 401
          ? 'auth_expired'
          : message.includes('signature') ||
              message.includes('sign') ||
              message.includes('msToken') ||
              code === 400
            ? 'sign_required'
            : 'upstream_error';
      return fail(articleId, message, kind, { upstream: payload, mode: 'draft_save' });
    }

    const tid =
      env?.data?.pgc_id ?? env?.data?.item_id ?? env?.data?.article_id ?? undefined;
    const toutiaoId = tid !== undefined ? String(tid) : undefined;
    const publishUrl = toutiaoId
      ? `https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=${toutiaoId}`
      : 'https://mp.toutiao.com/profile_v4/graphic/articles-manage?status=draft';

    console.log(
      `[publish] OK via draft_save articleId=${articleId} toutiaoId=${toutiaoId ?? 'unknown'} publishUrl=${publishUrl}`,
    );
    return NextResponse.json({
      ok: true,
      articleId,
      toutiaoId,
      publishUrl,
      mode: 'draft_save',
      message: '草稿已保存到头条创作者后台，请点击「在头条查看」一键发布',
      upstream: payload,
    });
  } catch (err) {
    if (err instanceof ToutiaoApiError) {
      if (err.kind === 'auth') {
        return fail(articleId, 'Cookie 已失效，请重新绑定', 'auth_expired');
      }
      return fail(
        articleId,
        err.kind === 'network' ? `网络异常：${err.message}` : `草稿保存失败：${err.message}`,
        'upstream_error',
      );
    }
    return fail(articleId, err instanceof Error ? err.message : '未知错误', 'unknown');
  }
}
