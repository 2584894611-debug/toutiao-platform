'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Users,
  Eye,
  Wallet,
  FileText,
  TrendingUp,
  Flame,
  ArrowUpRight,
  RefreshCw,
  Loader2,
  CheckCircle2,
  KeyRound,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  BarChart,
  Bar,
  Legend,
  ComposedChart,
} from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { CategoryBadge } from '@/components/common/category-badge';
import { formatMoney, formatNumber } from '@/lib/utils';
import { DEMO_VS_REAL } from '@/lib/sync-data';

export default function DashboardPage() {
  const {
    accounts,
    articles,
    dailyMetrics,
    dataMode,
    setDataMode,
    syncRecords,
  } = useStore();
  const [range, setRange] = useState<'7' | '30'>('7');
  const [syncing, setSyncing] = useState(false);

  /** 演示/真实模式下的缩放比率 */
  const ratio = useMemo(() => {
    if (dataMode === 'demo') return { reads: 1, followers: 1, income: 1 };
    return {
      reads: DEMO_VS_REAL.real.totalReads / DEMO_VS_REAL.demo.totalReads,
      followers:
        DEMO_VS_REAL.real.totalFollowers / DEMO_VS_REAL.demo.totalFollowers,
      income: DEMO_VS_REAL.real.totalIncome / DEMO_VS_REAL.demo.totalIncome,
    };
  }, [dataMode]);

  const totals = useMemo(() => {
    const totalFollowers = Math.round(
      accounts.reduce((s, a) => s + a.totalFollowers, 0) * ratio.followers,
    );
    const totalReads = Math.round(
      accounts.reduce((s, a) => s + a.totalReads, 0) * ratio.reads,
    );
    const totalIncome = Math.round(
      accounts.reduce((s, a) => s + a.totalIncome, 0) * ratio.income,
    );
    const todayPublished = accounts.reduce(
      (s, a) => s + a.todayPublished,
      0,
    );
    const todayNewFollowers = dailyMetrics.length
      ? Math.round(
          dailyMetrics[dailyMetrics.length - 1].followers * ratio.followers,
        )
      : 0;
    const launched = accounts.filter(
      (a) => a.launchStatus === 'launched',
    ).length;
    const pending = accounts.filter(
      (a) => a.launchStatus === 'pending',
    ).length;
    return {
      totalFollowers,
      totalReads,
      totalIncome,
      todayPublished,
      todayNewFollowers,
      total: accounts.length,
      launched,
      pending,
    };
  }, [accounts, dailyMetrics, ratio]);

  const chartData = useMemo(() => {
    const days = range === '7' ? 7 : 30;
    return dailyMetrics.slice(-days).map((m) => ({
      date: m.date.slice(5),
      阅读: Math.round(m.reads * ratio.reads),
      涨粉: Math.round(m.followers * ratio.followers),
      收益: Math.round(m.income * ratio.income),
      发文: m.publishCount,
    }));
  }, [dailyMetrics, range, ratio]);

  const topArticles = useMemo(() => {
    return [...articles]
      .filter((a) => a.status === 'published')
      .sort((a, b) => b.reads - a.reads)
      .slice(0, 6);
  }, [articles]);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const accountRank = useMemo(() => {
    return [...accounts]
      .sort((a, b) => b.totalReads - a.totalReads)
      .slice(0, 5);
  }, [accounts]);

  /** 同步状态汇总 */
  const syncSummary = useMemo(() => {
    const success = syncRecords.filter((s) => s.status === 'success').length;
    const failed = syncRecords.filter((s) => s.status === 'failed').length;
    const idle = syncRecords.filter((s) => s.status === 'idle').length;
    const lastSync = syncRecords
      .map((s) => s.lastSyncAt)
      .filter((t) => t !== '-')
      .sort()
      .pop();
    const nextSync = syncRecords
      .map((s) => s.nextSyncAt)
      .filter((t) => t !== '-')
      .sort()[0];
    return { success, failed, idle, lastSync, nextSync };
  }, [syncRecords]);

  const handleQuickSync = async () => {
    setSyncing(true);
    await new Promise((r) => setTimeout(r, 1800));
    setSyncing(false);
    toast.success('数据同步任务已触发');
  };

  /** 估算单篇收益（阅读量 × 0.0028 元/阅读） */
  const articleIncome = (reads: number) =>
    Math.round(reads * 0.0028 * 100) / 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">数据看板</h1>
          <p className="text-sm text-muted-foreground mt-1">
            矩阵整体表现一览 · 截止 {new Date().toLocaleDateString('zh-CN')}
          </p>
        </div>
        <Tabs
          value={range}
          onValueChange={(v) => setRange(v as '7' | '30')}
        >
          <TabsList>
            <TabsTrigger value="7">近 7 天</TabsTrigger>
            <TabsTrigger value="30">近 30 天</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <CookieBindBanner accounts={accounts} />

      {/* 数据模式切换条 */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">数据源</div>
            <div className="flex items-center gap-2 text-sm">
              <span
                className={
                  dataMode === 'demo'
                    ? 'text-primary font-medium'
                    : 'text-muted-foreground'
                }
              >
                演示数据
              </span>
              <Switch
                checked={dataMode === 'real'}
                onCheckedChange={(v) => setDataMode(v ? 'real' : 'demo')}
              />
              <span
                className={
                  dataMode === 'real'
                    ? 'text-primary font-medium'
                    : 'text-muted-foreground'
                }
              >
                真实数据
              </span>
            </div>
          </div>
          {dataMode === 'real' && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                成功 {syncSummary.success}
              </span>
              <span className="flex items-center gap-1 text-red-400">
                ● 失败 {syncSummary.failed}
              </span>
              <span>最后同步 {syncSummary.lastSync ?? '—'}</span>
              <span>下次同步 {syncSummary.nextSync ?? '—'}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleQuickSync}
                disabled={syncing}
              >
                {syncing ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-1" />
                )}
                立即同步
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 账号矩阵概况 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">总账号数</div>
              <div className="text-3xl font-bold mt-1 tabular-nums">
                {totals.total}
              </div>
            </div>
            <Users className="w-8 h-8 text-muted-foreground/60" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">已上线</div>
              <div className="text-3xl font-bold mt-1 tabular-nums text-emerald-400">
                {totals.launched}
              </div>
            </div>
            <CheckCircle2 className="w-8 h-8 text-emerald-400/60" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">待注册</div>
              <div className="text-3xl font-bold mt-1 tabular-nums text-amber-400">
                {totals.pending}
              </div>
            </div>
            <FileText className="w-8 h-8 text-amber-400/60" />
          </CardContent>
        </Card>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard
          icon={Users}
          label="矩阵总粉丝"
          value={formatNumber(totals.totalFollowers)}
          delta="+3.2%"
        />
        <KpiCard
          icon={Eye}
          label="累计阅读量"
          value={formatNumber(totals.totalReads)}
          delta="+5.8%"
        />
        <KpiCard
          icon={Wallet}
          label="累计收益"
          value={formatMoney(totals.totalIncome)}
          delta="+12.4%"
        />
        <KpiCard
          icon={FileText}
          label="今日发文"
          value={`${totals.todayPublished} 篇`}
          delta="目标 35"
          deltaPlain
        />
        <KpiCard
          icon={TrendingUp}
          label="今日新增粉丝"
          value={formatNumber(totals.todayNewFollowers)}
          delta="+8.1%"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">阅读量 & 收益趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gReads" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="oklch(0.68 0.19 35)"
                      stopOpacity={0.45}
                    />
                    <stop
                      offset="100%"
                      stopColor="oklch(0.68 0.19 35)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.32 0.01 60)"
                />
                <XAxis dataKey="date" stroke="oklch(0.65 0.02 60)" />
                <YAxis
                  yAxisId="left"
                  stroke="oklch(0.65 0.02 60)"
                  tickFormatter={(v) => formatNumber(Number(v))}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="oklch(0.78 0.17 65)"
                  tickFormatter={(v) => `¥${formatNumber(Number(v))}`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'oklch(0.23 0.01 60)',
                    border: '1px solid oklch(0.32 0.01 60)',
                    borderRadius: 8,
                  }}
                />
                <Legend
                  wrapperStyle={{
                    fontSize: 11,
                    color: 'oklch(0.65 0.02 60)',
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="阅读"
                  stroke="oklch(0.68 0.19 35)"
                  strokeWidth={2}
                  fill="url(#gReads)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="收益"
                  stroke="oklch(0.78 0.17 65)"
                  strokeWidth={2}
                  dot={{ fill: 'oklch(0.78 0.17 65)', r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">每日发文 & 涨粉</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 8, left: -10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.32 0.01 60)"
                />
                <XAxis dataKey="date" stroke="oklch(0.65 0.02 60)" />
                <YAxis stroke="oklch(0.65 0.02 60)" />
                <Tooltip
                  contentStyle={{
                    background: 'oklch(0.23 0.01 60)',
                    border: '1px solid oklch(0.32 0.01 60)',
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="发文" fill="oklch(0.68 0.19 35)" />
                <Bar dataKey="涨粉" fill="oklch(0.78 0.17 65)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Articles */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="w-4 h-4 text-primary" /> 爆款文章榜
              <span className="text-xs text-muted-foreground ml-2 font-normal">
                按收益降序
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {[...topArticles]
              .sort(
                (a, b) => articleIncome(b.reads) - articleIncome(a.reads),
              )
              .map((art, idx) => {
                const owner = art.accountId
                  ? accountMap.get(art.accountId)
                  : undefined;
                const income = articleIncome(art.reads);
                return (
                  <div
                    key={art.id}
                    className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                  >
                    <div
                      className={`w-6 h-6 rounded text-xs flex items-center justify-center font-semibold ${
                        idx < 3
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {art.title}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        {owner && (
                          <>
                            <span className="inline-flex items-center gap-1">
                              <span
                                className={`size-1.5 rounded-full ${
                                  owner.dataSource === 'real'
                                    ? 'bg-emerald-400'
                                    : 'bg-muted-foreground/60'
                                }`}
                                title={
                                  owner.dataSource === 'real'
                                    ? '真实同步数据'
                                    : '演示数据'
                                }
                              />
                              {owner.name}
                            </span>
                            {owner.dataSource !== 'real' && (
                              <span className="text-[10px] rounded-sm border border-border bg-muted/40 px-1 leading-4 text-muted-foreground">
                                演示
                              </span>
                            )}
                            <span className="text-border">·</span>
                          </>
                        )}
                        <span>{art.publishedAt}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        {formatNumber(art.reads)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        阅读
                      </div>
                    </div>
                    <div className="text-right min-w-[64px]">
                      <div className="text-sm font-semibold text-primary tabular-nums">
                        ¥{income.toLocaleString('zh-CN')}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        收益
                      </div>
                    </div>
                  </div>
                );
              })}
            {topArticles.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">
                暂无已发布文章
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Rank */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">账号阅读排行</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={accountRank.map((a) => ({
                  name: a.name,
                  阅读: Math.round(a.totalReads * ratio.reads),
                }))}
                margin={{ top: 10, right: 12, left: -10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="oklch(0.32 0.01 60)"
                />
                <XAxis
                  dataKey="name"
                  stroke="oklch(0.65 0.02 60)"
                  tick={{ fontSize: 10 }}
                  interval={0}
                />
                <YAxis
                  stroke="oklch(0.65 0.02 60)"
                  tickFormatter={(v) => formatNumber(Number(v))}
                />
                <Tooltip
                  contentStyle={{
                    background: 'oklch(0.23 0.01 60)',
                    border: '1px solid oklch(0.32 0.01 60)',
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => formatNumber(v)}
                />
                <Line
                  type="monotone"
                  dataKey="阅读"
                  stroke="oklch(0.78 0.17 65)"
                  strokeWidth={2}
                  dot={{ fill: 'oklch(0.78 0.17 65)', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1.5">
              {accountRank.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 text-xs"
                >
                  <Avatar className="w-5 h-5">
                    <AvatarFallback className="text-[10px] bg-primary/15 text-primary">
                      {a.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate">{a.name}</span>
                  <CategoryBadge category={a.category} />
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(Math.round(a.totalReads * ratio.reads))}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  delta,
  deltaPlain,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  delta: string;
  deltaPlain?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <div className="w-7 h-7 rounded bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 text-2xl font-bold tabular-nums">{value}</div>
        <div
          className={`mt-1 text-xs flex items-center gap-1 ${
            deltaPlain ? 'text-muted-foreground' : 'text-emerald-400'
          }`}
        >
          {!deltaPlain && <ArrowUpRight className="w-3 h-3" />}
          {delta}
        </div>
      </CardContent>
    </Card>
  );
}

function CookieBindBanner({
  accounts,
}: {
  accounts: { cookieStatus?: string; cookie?: string }[];
}) {
  const verified = accounts.filter((a) => a.cookieStatus === 'verified').length;
  const expired = accounts.filter((a) => a.cookieStatus === 'expired').length;
  const total = accounts.length;
  // 全部已验证：隐藏
  if (verified === total && total > 0) return null;

  const unbound = total - verified;
  const severe = verified === 0 || expired > 0;

  return (
    <div
      className={`flex items-start sm:items-center justify-between gap-3 rounded-md border px-4 py-3 flex-wrap ${
        severe
          ? 'border-orange-500/50 bg-orange-500/10'
          : 'border-primary/40 bg-primary/[0.08]'
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`mt-0.5 flex size-7 flex-none items-center justify-center rounded-full ${
            severe ? 'bg-orange-500/20' : 'bg-primary/15'
          }`}
        >
          {severe ? (
            <AlertTriangle className="size-4 text-orange-300" />
          ) : (
            <KeyRound className="size-4 text-primary" />
          )}
        </div>
        <div className="min-w-0">
          <div
            className={`text-sm font-medium ${
              severe ? 'text-orange-200' : 'text-primary'
            }`}
          >
            {expired > 0
              ? `检测到 ${expired} 个账号的 Cookie 已失效，需要重新绑定`
              : verified === 0
                ? '请先在【账号管理】中绑定 Cookie 以启用真实数据同步'
                : `已绑定 ${verified}/${total}，还有 ${unbound} 个账号未绑定 Cookie`}
          </div>
          <div className="text-[12px] text-muted-foreground mt-0.5">
            未绑定的账号将显示演示数据；绑定 Cookie 后可在「数据同步」中拉取真实粉丝、阅读量与收益。
          </div>
        </div>
      </div>
      <Button
        size="sm"
        asChild
        className={severe ? '' : 'bg-primary hover:bg-primary/90'}
      >
        <Link href="/accounts">
          去绑定
          <ChevronRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}
