/**
 * 头条号后台请求公共封装：
 * - 设置常见浏览器 UA / Origin / Referer
 * - 携带传入的 Cookie
 * - 统一 15s 超时
 *
 * 注意：本文件**仅可被 Server Component / Route Handler 引用**，
 * 不可在客户端组件 import（包含 Node.js 专有 API）。
 *
 * 头条号后台常见响应外壳：
 *   { code: 0, message: 'success', data: {...} }       // 成功
 *   { code: 100004, message: '未登录' }                 // Cookie 失效
 *   { code: 其他, message: '...' }                     // 业务错误
 *
 * 注意不同接口的数据层级不同（详见 ToutiaoEnvelope 文档）。
 */

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const DEFAULT_TIMEOUT_MS = 15_000;

export const TOUTIAO_BASE = 'https://mp.toutiao.com';
export const DEFAULT_REFERER = `${TOUTIAO_BASE}/profile_v4/index`;

/** 头条 code === 100004 表示未登录 / Cookie 失效。 */
export const TOUTIAO_AUTH_FAIL_CODE = 100004;

export interface ToutiaoEnvelope<T = unknown> {
  code?: number;
  message?: string;
  data?: T;
  /** 部分接口（list/v2、fans/overview）会把数据直接放在根级别，所以此处仍允许任意根字段。 */
  [k: string]: unknown;
}

export interface ToutiaoRequestOptions {
  cookie: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** 透传 fetch 的 method / body 等参数 */
  init?: RequestInit;
}

/**
 * 带超时的 fetch 包装，自动叠加头条号站点常用请求头。
 */
export async function toutiaoFetch(
  url: string,
  { cookie, timeoutMs = DEFAULT_TIMEOUT_MS, headers, init }: ToutiaoRequestOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      method: init?.method ?? 'GET',
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: DEFAULT_REFERER,
        Origin: TOUTIAO_BASE,
        Cookie: cookie,
        ...(headers ?? {}),
      },
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 将上游响应安全解析为 JSON；解析失败返回 null。
 */
export async function safeJson<T = unknown>(response: Response): Promise<T | null> {
  try {
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export type ToutiaoErrorKind =
  | 'auth'
  | 'network'
  | 'business'
  | 'parse'
  | 'server';

export class ToutiaoApiError extends Error {
  kind: ToutiaoErrorKind;
  status?: number;
  code?: number;
  constructor(
    message: string,
    kind: ToutiaoErrorKind,
    extra?: { status?: number; code?: number },
  ) {
    super(message);
    this.name = 'ToutiaoApiError';
    this.kind = kind;
    this.status = extra?.status;
    this.code = extra?.code;
  }
}

/**
 * 判定 envelope 是否表示「未登录 / Cookie 失效」。
 * - code === 100004 是头条创作者后台标准失效码
 * - HTTP 401/403、302/301 重定向到登录页、HTML 而非 JSON 也视为失效
 */
export function isAuthFailure(
  status: number,
  payload: ToutiaoEnvelope | null,
  contentType: string | null,
): boolean {
  // 5xx 是服务器错误，不算鉴权失败
  if (status >= 500) return false;
  // 401/403 是明确的未授权
  if (status === 401 || status === 403) return true;
  // 200 + text/html 才认定是登录页（其它状态码的 HTML 可能是 CDN/网关错误页）
  if (
    status === 200 &&
    contentType &&
    contentType.includes('text/html')
  ) {
    return true;
  }
  // 头条 envelope 中明确返回登录失效 code
  if (payload?.code === TOUTIAO_AUTH_FAIL_CODE) return true;
  if (
    typeof payload?.message === 'string' &&
    /未登录|请先登录|please login|not.?login|登录已失效/i.test(payload.message)
  ) {
    return true;
  }
  return false;
}

/**
 * 统一 GET 调用：
 * - 自动加 Referer / UA / Cookie
 * - 处理 HTTP 状态码 / envelope code 两层校验
 * - 失败时抛 `ToutiaoApiError`，调用方可 catch 后映射友好文案
 *
 * @param path 可以是 "/mp/agw/..." 或完整 URL
 */
export async function toutiaoGet<T = unknown>(
  path: string,
  cookie: string,
  options: Omit<ToutiaoRequestOptions, 'cookie' | 'init'> = {},
): Promise<ToutiaoEnvelope<T>> {
  const url = path.startsWith('http') ? path : `${TOUTIAO_BASE}${path}`;
  let response: Response;
  try {
    response = await toutiaoFetch(url, { cookie, ...options });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ToutiaoApiError('请求超时（15s）', 'network');
    }
    throw new ToutiaoApiError(
      err instanceof Error ? err.message : '上游网络异常',
      'network',
    );
  }

  const contentType = response.headers.get('content-type');
  const payload = await safeJson<ToutiaoEnvelope<T>>(response);

  if (isAuthFailure(response.status, payload, contentType)) {
    throw new ToutiaoApiError(
      'Cookie 已过期，请重新获取',
      'auth',
      { status: response.status, code: payload?.code },
    );
  }

  if (!response.ok) {
    // 5xx 是服务器侧问题，不是 Cookie 失效，前端要据此区分提示
    const kind = response.status >= 500 ? 'server' : 'business';
    throw new ToutiaoApiError(
      `上游 HTTP ${response.status}`,
      kind,
      { status: response.status },
    );
  }

  if (!payload) {
    throw new ToutiaoApiError(
      `上游响应非 JSON（HTTP ${response.status}）`,
      'parse',
      { status: response.status },
    );
  }

  if (typeof payload.code === 'number' && payload.code !== 0) {
    throw new ToutiaoApiError(
      payload.message || `业务错误（code=${payload.code}）`,
      'business',
      { status: response.status, code: payload.code },
    );
  }

  return payload;
}

/** 数字字段安全取数，兼容字符串形态。 */
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** 把 Unix 秒级时间戳转 ISO 字符串（毫秒级也兼容）。 */
export function tsToIso(value: unknown): string {
  const n = toNumber(value, NaN);
  if (!Number.isFinite(n) || n <= 0) return '';
  const ms = n < 1e12 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// 同步真实账号数据（验证 Cookie 成功后调用）
// ─────────────────────────────────────────────────────────────────────────────

/** 同步到本地账号的真实数据契约。 */
export interface SyncedAccountData {
  name?: string;
  totalReads?: number;
  totalFollowers?: number;
  totalLikes?: number;
  totalArticles?: number;
  todayPublished?: number;
  todayLimit?: number;
  /** ISO 字符串，最近一次发文时间。 */
  lastPublishAt?: string;
  /** @deprecated 使用 lastPublishAt。保留供旧调用方读取。 */
  lastPublishTime?: string;
  articles?: SyncedArticleBrief[];
}

export interface SyncedArticleBrief {
  id: string;
  title: string;
  /** ISO 字符串，发文时间。 */
  createTime: string;
  /** @deprecated 与 createTime 等价。 */
  publishTime: string;
  cover?: string;
  readCount: number;
  commentCount?: number;
}

/** 取对象上多个可能 key 的第一个数值（兼容字符串）。 */
function pickNumber(obj: unknown, keys: string[]): number | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const record = obj as Record<string, unknown>;
  for (const k of keys) {
    if (record[k] !== undefined && record[k] !== null && record[k] !== '') {
      const n = toNumber(record[k], NaN);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

/** 取对象上多个可能 key 的第一个非空字符串。 */
function pickString(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const record = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = record[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

/** 多接口扁平合并查找：传入若干 envelope，逐层尝试取数。 */
function digNumber(envelopes: Array<ToutiaoEnvelope | null>, keys: string[]): number | undefined {
  for (const env of envelopes) {
    if (!env) continue;
    const fromData = pickNumber(env.data, keys);
    if (fromData !== undefined) return fromData;
    const fromRoot = pickNumber(env, keys);
    if (fromRoot !== undefined) return fromRoot;
    // 常见嵌套：fans_data / overview / stats
    const nested = ['fans_data', 'overview', 'stats', 'fans_overview_data', 'summary'];
    for (const n of nested) {
      const subData = (env.data as Record<string, unknown> | undefined)?.[n];
      const subRoot = (env as Record<string, unknown>)[n];
      const found = pickNumber(subData, keys) ?? pickNumber(subRoot, keys);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function digString(envelopes: Array<ToutiaoEnvelope | null>, keys: string[]): string | undefined {
  for (const env of envelopes) {
    if (!env) continue;
    const fromData = pickString(env.data, keys);
    if (fromData !== undefined) return fromData;
    const fromRoot = pickString(env, keys);
    if (fromRoot !== undefined) return fromRoot;
    const nested = ['media', 'user', 'creator', 'author_info'];
    for (const n of nested) {
      const subData = (env.data as Record<string, unknown> | undefined)?.[n];
      const subRoot = (env as Record<string, unknown>)[n];
      const found = pickString(subData, keys) ?? pickString(subRoot, keys);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** 并发请求多个候选 URL，每个独立 try/catch，单个失败不影响整体。 */
async function safeGet(
  cookie: string,
  paths: string[],
): Promise<Array<ToutiaoEnvelope | null>> {
  const results = await Promise.allSettled(
    paths.map((p) => toutiaoGet<unknown>(p, cookie, { timeoutMs: 12_000 })),
  );
  const envs: Array<ToutiaoEnvelope | null> = [];
  let authFailCount = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      envs.push(r.value);
    } else {
      if (r.reason instanceof ToutiaoApiError && r.reason.kind === 'auth') {
        authFailCount += 1;
      }
      envs.push(null);
    }
  }
  // 全军覆没且全部都是鉴权失败 → 抛 auth，让上层告诉用户重新登录
  if (envs.every((e) => e === null) && authFailCount === paths.length) {
    throw new ToutiaoApiError('Cookie 已过期，请重新获取', 'auth');
  }
  return envs;
}

/**
 * 同步账号真实数据。所有接口独立 try/catch，能拉多少拉多少。
 * 全部接口都鉴权失败时抛 ToutiaoApiError(kind='auth')，调用方据此判定 Cookie 失效。
 */
export async function syncAccountData(cookie: string): Promise<SyncedAccountData> {
  const overviewEnvelopes = await safeGet(cookie, [
    // 概览类（多版本尝试）
    '/mp/agw/statistic/profile/profile_stat',
    '/profile_v3/index/summary',
    '/profile_v2/index/data_overview',
    '/mp/agw/statistic/overview',
    '/mp/agw/statistic/article/overview',
  ]);

  const userInfoEnvelopes = await safeGet(cookie, [
    '/mp/agw/creator_center/user_info',
    '/mp/agw/user/info',
    '/mp/agw/media/user_login_status_api',
  ]);

  const fansEnvelopes = await safeGet(cookie, [
    '/mp/agw/statistic/fans/overview',
    '/mp/agw/fans/overview',
  ]);

  // 文章列表（GET）
  let articleListEnv: ToutiaoEnvelope | null = null;
  try {
    articleListEnv = await toutiaoGet<unknown>(
      '/mp/agw/creator_center/list/v2?page_num=0&page_size=10',
      cookie,
      { timeoutMs: 12_000 },
    );
  } catch (err) {
    if (err instanceof ToutiaoApiError && err.kind === 'auth') {
      // 概览全部成功但文章列表鉴权失败：以概览结果为准，文章列表降级为空
      articleListEnv = null;
    } else {
      articleListEnv = null;
    }
  }
  // 备用文章列表路径
  if (!articleListEnv) {
    try {
      articleListEnv = await toutiaoGet<unknown>(
        '/mp/agw/article/list?count=10&status=published&page=0',
        cookie,
        { timeoutMs: 12_000 },
      );
    } catch {
      articleListEnv = null;
    }
  }

  const allEnvs = [...overviewEnvelopes, ...userInfoEnvelopes, ...fansEnvelopes];

  // ── 字段提取（容错） ──────────────────────────────────────────────
  const totalReads = digNumber(allEnvs, [
    'total_read_play_count',
    'total_read',
    'total_read_count',
    'read_count',
    'read_num',
    'all_read_count',
    'impression_count',
    'read_pv',
  ]);

  const totalFollowers = digNumber(allEnvs, [
    'total_subscriber_count',
    'total_fans_count',
    'fans_count',
    'follower_count',
    'fans_num',
    'followers',
    'total_fans',
    'total',
  ]);

  const totalArticles = digNumber(allEnvs, [
    'thread_count',
    'article_count',
    'publish_count',
    'total_count',
    'total_publish',
    'content_count',
  ]);

  const totalLikes = digNumber(allEnvs, [
    'digg_count',
    'like_count',
    'praise_count',
    'total_likes',
    'likes',
  ]);

  const todayPublished = digNumber(allEnvs, [
    'today_publish_count',
    'today_count',
    'today_publish',
    'today_articles',
  ]);

  const todayLimit = digNumber(allEnvs, [
    'publish_limit',
    'today_limit',
    'daily_limit',
    'max_publish',
  ]);

  const name = digString(allEnvs, ['name', 'screen_name', 'user_name', 'author_name', 'media_name']);

  // ── 解析文章列表 ────────────────────────────────────────────────
  const articles: SyncedArticleBrief[] = [];
  if (articleListEnv) {
    const contentsRoot =
      (articleListEnv.contents as unknown[] | undefined) ??
      ((articleListEnv.data as Record<string, unknown> | undefined)?.contents as unknown[] | undefined) ??
      ((articleListEnv.data as Record<string, unknown> | undefined)?.article_list as unknown[] | undefined) ??
      ((articleListEnv.data as Record<string, unknown> | undefined)?.list as unknown[] | undefined) ??
      [];
    for (const raw of contentsRoot.slice(0, 10)) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const attr = (item.article_attr as Record<string, unknown> | undefined) ?? item;
      const stats = (item.stats as Record<string, unknown> | undefined) ?? {};
      const id =
        pickString(attr, ['gid', 'item_id', 'id', 'group_id']) ??
        pickString(item, ['id']) ??
        `art-${Math.random().toString(36).slice(2, 10)}`;
      const title = pickString(attr, ['title', 'content']) ?? '';
      const ts =
        pickNumber(attr, ['create_time', 'publish_time', 'ctime', 'publish_at']) ??
        pickNumber(item, ['create_time', 'publish_time']);
      const publishTime = ts ? tsToIso(ts) : '';
      const readCount =
        pickNumber(stats, ['read_count', 'read_num', 'pv']) ??
        pickNumber(item, ['read_count']) ??
        0;
      const commentCount =
        pickNumber(stats, ['comment_count']) ??
        pickNumber(item, ['comment_count']) ??
        0;
      if (title) {
        articles.push({
          id,
          title,
          createTime: publishTime,
          publishTime,
          readCount,
          commentCount,
        });
      }
    }
  }

  // 最近发文时间：优先取文章列表第一条
  const lastPublishTime = articles[0]?.publishTime || undefined;

  // 今日发文数：如果接口没给，从文章列表算
  let derivedTodayPublished = todayPublished;
  if (derivedTodayPublished === undefined && articles.length > 0) {
    const todayStr = new Date().toISOString().slice(0, 10);
    derivedTodayPublished = articles.filter((a) =>
      a.publishTime?.startsWith(todayStr),
    ).length;
  }

  return {
    name,
    totalReads,
    totalFollowers,
    totalArticles,
    todayPublished: derivedTodayPublished,
    todayLimit,
    lastPublishTime,
    articles: articles.length ? articles : undefined,
  };
}
