import { NextRequest, NextResponse } from 'next/server';
import {
  ToutiaoApiError,
  toNumber,
  toutiaoGet,
} from '@/lib/server/toutiao-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface FetchStatsBody {
  cookie?: string;
}

interface AggregatedStats {
  followers: number;
  totalReads: number;
  totalIncome: number;
  todayReads: number;
  todayIncome: number;
  todayFollowers: number;
  totalArticles: number;
  /** 累计粉丝净增长（来自 fans/overview.new_growth_count） */
  fansGrowth?: number;
  /** 活跃粉丝数（来自 fans/overview.active_count） */
  activeFans?: number;
  /** 昨日数据是否已就绪 */
  yesterdayReady?: boolean;
}

interface FetchStatsResponse {
  success: boolean;
  data?: AggregatedStats;
  partial?: boolean;
  errors?: string[];
  message: string;
}

interface ProfileStatData {
  fans_data?: { total?: number | string; toutiao_stat?: number | string };
  total_income?: number | string;
  total_read_play_count?: number | string;
  yesterday_income?: number | string;
  yesterday_read_count?: number | string;
  yesterday_fans?: number | string;
  thread_count?: number | string;
  is_yesterday_income_ready?: boolean;
}

interface IncomeProfileStatData {
  total_income?: number | string;
  yesterday_income?: number | string;
}

interface FansOverviewEnvelope {
  // fans/overview 字段在 envelope 根级别！
  fans_overview_data?: {
    active_count?: number | string;
    cluster_fans?: number | string;
    new_growth_count?: number | string;
    total_subscriber_count?: number | string;
  };
}

/**
 * 并行三个接口：
 * 1. /mp/agw/statistic/profile/profile_stat        → 总览（核心）
 * 2. /pgc/mp/income/profile_stat                   → 收益（兜底/校准）
 * 3. /mp/agw/statistic/fans/overview               → 粉丝详情
 *
 * 任一失败不影响其它接口，仅当主接口 profile_stat 失败且其它接口也无数据时整体失败。
 */
export async function POST(req: NextRequest): Promise<NextResponse<FetchStatsResponse>> {
  let body: FetchStatsBody;
  try {
    body = (await req.json()) as FetchStatsBody;
  } catch {
    return NextResponse.json(
      { success: false, message: '请求体格式错误，必须是 JSON' },
      { status: 400 },
    );
  }

  const cookie = (body.cookie ?? '').trim();
  if (!cookie) {
    return NextResponse.json(
      { success: false, message: '缺少 cookie 字段' },
      { status: 400 },
    );
  }

  const errors: string[] = [];
  let authFailed = false;

  const safeCall = async <T,>(label: string, path: string) => {
    try {
      return await toutiaoGet<T>(path, cookie);
    } catch (err) {
      if (err instanceof ToutiaoApiError) {
        if (err.kind === 'auth') authFailed = true;
        errors.push(`${label}: ${err.message}`);
      } else {
        errors.push(`${label}: ${err instanceof Error ? err.message : '未知错误'}`);
      }
      return null;
    }
  };

  const [profile, income, fans] = await Promise.all([
    safeCall<ProfileStatData>(
      'profile_stat',
      '/mp/agw/statistic/profile/profile_stat',
    ),
    safeCall<IncomeProfileStatData>(
      'income_profile_stat',
      '/pgc/mp/income/profile_stat',
    ),
    safeCall<unknown>('fans_overview', '/mp/agw/statistic/fans/overview'),
  ]);

  if (authFailed) {
    return NextResponse.json({
      success: false,
      message: 'Cookie 已过期，请重新获取',
      errors,
    });
  }

  const allFailed = !profile && !income && !fans;
  if (allFailed) {
    return NextResponse.json({
      success: false,
      message: '上游接口未返回有效数据，可能是接口变更或网络不可达',
      errors,
    });
  }

  const ps = profile?.data ?? {};
  const inc = income?.data ?? {};
  // fans_overview_data 在 envelope **根级别**
  const fanOv = (fans as FansOverviewEnvelope | null)?.fans_overview_data ?? {};

  const aggregated: AggregatedStats = {
    followers: toNumber(ps.fans_data?.total ?? fanOv.total_subscriber_count),
    totalReads: toNumber(ps.total_read_play_count),
    totalIncome: toNumber(inc.total_income ?? ps.total_income),
    todayReads: toNumber(ps.yesterday_read_count),
    todayIncome: toNumber(inc.yesterday_income ?? ps.yesterday_income),
    todayFollowers: toNumber(ps.yesterday_fans ?? fanOv.new_growth_count),
    totalArticles: toNumber(ps.thread_count),
    fansGrowth: toNumber(fanOv.new_growth_count),
    activeFans: toNumber(fanOv.active_count),
    yesterdayReady: Boolean(ps.is_yesterday_income_ready ?? true),
  };

  return NextResponse.json({
    success: true,
    data: aggregated,
    partial: errors.length > 0,
    errors: errors.length ? errors : undefined,
    message: errors.length ? '部分接口未返回，已合并可用数据' : '已成功获取数据',
  });
}
