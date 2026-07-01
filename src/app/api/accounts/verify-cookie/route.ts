import { NextRequest, NextResponse } from 'next/server';
import {
  ToutiaoApiError,
  toNumber,
  toutiaoGet,
  syncAccountData,
  type SyncedAccountData,
} from '@/lib/server/toutiao-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface VerifyBody {
  cookie?: string;
}

/** 返回给前端的 Account 增量补丁（仅包含本次同步到的字段）。 */
interface AccountPatch {
  name?: string;
  avatar?: string;
  loginStatus?: 'online' | 'expired';
  cookieStatus?: 'verified' | 'expired';
  cookieVerifiedAt?: string;
  dataSource?: 'real';
  lastSyncAt?: string;
  totalReads?: number;
  totalFollowers?: number;
  totalArticles?: number;
  todayPublished?: number;
  todayLimit?: number;
  lastPublishAt?: string;
}

interface VerifyResponse {
  // 新协议
  ok: boolean;
  account?: AccountPatch;
  syncedFields?: string[];
  error?: string;
  // 向后兼容：保留旧字段供尚未升级的调用方使用
  valid: boolean;
  message: string;
  accountInfo?: {
    name?: string;
    avatar?: string;
    id?: string;
    mediaId?: string;
    daysOnPlatform?: number;
  };
  stats?: {
    fans?: number;
    totalReads?: number;
    totalIncome?: number;
  };
}

interface LoginStatusData {
  is_login?: boolean;
  media?: { media_id?: number | string; name?: string };
  user?: { user_id?: number | string; user_id_str?: string };
}

interface UserInfoEnvelope {
  name?: string;
  avatar_url?: string;
  total_fans_count?: number | string;
  media_id?: number | string;
  user_id?: number | string;
  user_id_str?: string;
  welcome_msg?: string;
}

/** 从 welcome_msg「在头条创作的第 895 天」抽取数字。 */
function extractDays(welcome?: string): number | undefined {
  if (!welcome) return undefined;
  const m = welcome.match(/第\s*(\d+)\s*天/);
  return m ? Number(m[1]) : undefined;
}

function fail(
  message: string,
  expired = false,
): NextResponse<VerifyResponse> {
  return NextResponse.json({
    ok: false,
    error: message,
    valid: false,
    message,
    account: expired
      ? {
          loginStatus: 'expired',
          cookieStatus: 'expired',
        }
      : undefined,
  });
}

/**
 * POST /api/accounts/verify-cookie
 * 1. 校验 Cookie 有效性（user_login_status_api）
 * 2. 同步真实账号数据（syncAccountData）
 * 3. 返回完整账号补丁 + syncedFields，让前端直接 patchAccount
 */
export async function POST(req: NextRequest): Promise<NextResponse<VerifyResponse>> {
  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        valid: false,
        message: '请求体格式错误，必须是 JSON',
        error: '请求体格式错误，必须是 JSON',
      },
      { status: 400 },
    );
  }

  const cookie = (body.cookie ?? '').trim();
  if (!cookie) {
    return NextResponse.json(
      {
        ok: false,
        valid: false,
        message: '缺少 cookie 字段',
        error: '缺少 cookie 字段',
      },
      { status: 400 },
    );
  }

  // ─── Step 1：Cookie 有效性校验 ───────────────────────────────────────
  let loginStatus: { data?: LoginStatusData } | null = null;
  try {
    loginStatus = await toutiaoGet<LoginStatusData>(
      '/mp/agw/media/user_login_status_api',
      cookie,
    );
  } catch (err) {
    if (err instanceof ToutiaoApiError && err.kind === 'auth') {
      return fail('Cookie 已失效，请重新登录', true);
    }
    if (err instanceof ToutiaoApiError) {
      // network / server / business / parse / timeout 都不是 Cookie 真过期
      // → expired=false，前端保留原状态（不要误标 expired）
      const prefix =
        err.kind === 'network'
          ? '网络异常（可能是超时）'
          : err.kind === 'server'
            ? '头条服务器异常（5xx），请稍后重试'
            : '校验异常';
      return fail(`${prefix}：${err.message}`);
    }
    return fail(
      `校验失败：${err instanceof Error ? err.message : '未知错误'}`,
    );
  }

  if (!loginStatus?.data?.is_login) {
    return fail('Cookie 已失效，请重新登录', true);
  }

  // ─── Step 2：拉账号资料 + 真实数据 ───────────────────────────────────
  // user_info 单独取（响应字段在 envelope 根级）
  let ui: UserInfoEnvelope = {};
  try {
    const userInfoEnv = await toutiaoGet<unknown>(
      '/mp/agw/creator_center/user_info',
      cookie,
    );
    ui = userInfoEnv as unknown as UserInfoEnvelope;
  } catch {
    ui = {};
  }

  let synced: SyncedAccountData = {};
  try {
    synced = await syncAccountData(cookie);
  } catch (err) {
    if (err instanceof ToutiaoApiError && err.kind === 'auth') {
      return fail('Cookie 已失效，请重新登录', true);
    }
    // 其它错误：拿到的字段就用，没拿到的字段不回填
    synced = {};
  }

  // ─── Step 3：组装 patch + syncedFields ──────────────────────────────
  const now = new Date().toISOString();
  const patch: AccountPatch = {
    loginStatus: 'online',
    cookieStatus: 'verified',
    cookieVerifiedAt: now,
    dataSource: 'real',
    lastSyncAt: now,
  };
  const syncedFields: string[] = [];

  const finalName =
    synced.name ||
    (typeof ui.name === 'string' && ui.name ? ui.name : undefined) ||
    loginStatus.data.media?.name;
  if (finalName) {
    patch.name = String(finalName);
    syncedFields.push('name');
    // avatar 用账号名首字（保持现有数据展示风格）
    patch.avatar = String(finalName).slice(0, 1);
  }

  // 优先取 syncAccountData 的结果，其次用 user_info 兜底
  const followers =
    synced.totalFollowers !== undefined
      ? synced.totalFollowers
      : ui.total_fans_count !== undefined
        ? toNumber(ui.total_fans_count, NaN)
        : NaN;
  if (Number.isFinite(followers)) {
    patch.totalFollowers = followers;
    syncedFields.push('totalFollowers');
  }

  if (synced.totalReads !== undefined && Number.isFinite(synced.totalReads)) {
    patch.totalReads = synced.totalReads;
    syncedFields.push('totalReads');
  }

  if (synced.totalArticles !== undefined && Number.isFinite(synced.totalArticles)) {
    patch.totalArticles = synced.totalArticles;
    syncedFields.push('totalArticles');
  }

  if (
    synced.todayPublished !== undefined &&
    Number.isFinite(synced.todayPublished)
  ) {
    patch.todayPublished = synced.todayPublished;
    syncedFields.push('todayPublished');
  }

  if (synced.todayLimit !== undefined && Number.isFinite(synced.todayLimit)) {
    patch.todayLimit = synced.todayLimit;
    syncedFields.push('todayLimit');
  }

  if (synced.lastPublishTime) {
    patch.lastPublishAt = synced.lastPublishTime;
    syncedFields.push('lastPublishAt');
  }

  return NextResponse.json({
    ok: true,
    account: patch,
    syncedFields,
    // 向后兼容字段
    valid: true,
    message: syncedFields.length
      ? '验证成功，数据已同步'
      : '凭证有效',
    accountInfo: {
      name: patch.name,
      avatar: ui.avatar_url,
      id: String(
        ui.user_id_str ?? ui.user_id ?? loginStatus.data.user?.user_id_str ?? '',
      ),
      mediaId: ui.media_id
        ? String(ui.media_id)
        : loginStatus.data.media?.media_id
          ? String(loginStatus.data.media.media_id)
          : undefined,
      daysOnPlatform: extractDays(ui.welcome_msg),
    },
    stats: {
      fans: patch.totalFollowers,
      totalReads: patch.totalReads,
    },
  });
}
