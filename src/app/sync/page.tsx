'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
  ShieldCheck,
  AlertTriangle,
  Cookie,
  Settings as SettingsIcon,
  Activity,
  GitCompare,
  Play,
  KeyRound,
  Search,
  Filter,
} from 'lucide-react';
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
  TabsContent,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CategoryBadge } from '@/components/common/category-badge';
import { useStore } from '@/lib/store';
import { DEMO_VS_REAL } from '@/lib/sync-data';
import { formatMoney, formatNumber } from '@/lib/utils';
import type { SyncConfig, SyncFreq, SyncRecord, SyncStatus } from '@/lib/types';

const FREQ_LABEL: Record<SyncFreq, string> = {
  '6h': '每 6 小时',
  '12h': '每 12 小时',
  '24h': '每天一次',
  manual: '手动同步',
};

type CredStatus = 'empty' | 'pending' | 'valid' | 'invalid';

function getCredStatus(cookie: string, cookieFilled: boolean): CredStatus {
  if (!cookie || cookie.trim().length === 0) return 'empty';
  if (!cookieFilled) return 'pending';
  if (cookie.includes('2025-01-14') || cookie.includes('过期')) return 'invalid';
  return 'valid';
}

function StatusBadge({ status }: { status: SyncStatus }) {
  if (status === 'success') {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/15">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        成功
      </Badge>
    );
  }
  if (status === 'failed') {
    return (
      <Badge className="bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/15">
        <XCircle className="w-3 h-3 mr-1" />
        失败
      </Badge>
    );
  }
  if (status === 'syncing') {
    return (
      <Badge className="bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/15">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        同步中
      </Badge>
    );
  }
  return (
    <Badge className="bg-muted/40 text-muted-foreground border border-border hover:bg-muted/40">
      未同步
    </Badge>
  );
}

function CredBadge({ status }: { status: CredStatus }) {
  const map: Record<CredStatus, { text: string; cls: string }> = {
    empty: {
      text: '未配置',
      cls: 'bg-muted/40 text-muted-foreground border-border',
    },
    pending: {
      text: '待验证',
      cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    },
    valid: {
      text: '有效',
      cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    },
    invalid: {
      text: '失效',
      cls: 'bg-red-500/15 text-red-300 border-red-500/30',
    },
  };
  const { text, cls } = map[status];
  return <Badge className={`${cls} border hover:opacity-100`}>{text}</Badge>;
}

function nowStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function SyncPage() {
  const {
    accounts,
    syncRecords,
    syncLogs,
    syncConfig,
    updateSyncConfig,
    updateSyncRecord,
    appendSyncLog,
    upsertAccount,
    patchAccount,
    dataMode,
    setDataMode,
  } = useStore();

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const recordMap = useMemo(
    () => new Map(syncRecords.map((r) => [r.accountId, r])),
    [syncRecords],
  );

  // 全局自动同步开关（与同步频率挂钩，manual = 关闭）
  const autoSyncOn = syncConfig.freq !== 'manual';
  const [logFilter, setLogFilter] = useState<string>('all');
  const [credSearch, setCredSearch] = useState('');
  const [batchSyncing, setBatchSyncing] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  /**
   * 单账号同步：调用 /api/accounts/fetch-stats 真实抓取，
   * 抓取失败（含 Cookie 未配置 / 失效）会落到 SyncRecord.failReason。
   */
  const syncOne = async (accountId: string) => {
    const acc = accountMap.get(accountId);
    if (!acc) return false;

    updateSyncRecord(accountId, { status: 'syncing' });
    const t0 = Date.now();
    const cookie = (acc.cookie ?? '').trim();

    if (!cookie) {
      const costMs = Date.now() - t0;
      updateSyncRecord(accountId, {
        status: 'failed',
        lastSyncAt: nowStr(),
        costMs,
        failReason: '未配置 Cookie，请先到「凭证配置」录入',
      });
      appendSyncLog({
        time: nowStr(),
        accountId,
        result: 'failed',
        costMs,
        message: '未配置 Cookie',
      });
      return false;
    }

    try {
      const r = await fetch('/api/accounts/fetch-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie }),
      });
      const payload = (await r.json()) as {
        success: boolean;
        data?: {
          followers: number;
          totalReads: number;
          totalIncome: number;
          todayReads: number;
          todayIncome: number;
          todayFollowers: number;
          totalArticles: number;
        };
        message: string;
      };
      const costMs = Date.now() - t0;

      if (payload.success && payload.data) {
        const d = payload.data;
        patchAccount(accountId, {
          totalFollowers: d.followers || acc.totalFollowers,
          totalReads: d.totalReads || acc.totalReads,
          totalIncome: d.totalIncome || acc.totalIncome,
          dataSource: 'real',
          lastSyncAt: nowStr(),
          cookieStatus: 'verified',
        });
        updateSyncRecord(accountId, {
          status: 'success',
          lastSyncAt: nowStr(),
          nextSyncAt: nowStr().replace(/\s.*/, ' 次日'),
          costMs,
          failReason: undefined,
        });
        appendSyncLog({
          time: nowStr(),
          accountId,
          result: 'success',
          costMs,
          message: payload.message,
        });
        return true;
      }

      // 失败 → 标记 Cookie 可能已失效
      patchAccount(accountId, {
        cookieStatus: /登录|失效|过期/i.test(payload.message)
          ? 'expired'
          : acc.cookieStatus,
      });
      updateSyncRecord(accountId, {
        status: 'failed',
        lastSyncAt: nowStr(),
        costMs,
        failReason: payload.message,
      });
      appendSyncLog({
        time: nowStr(),
        accountId,
        result: 'failed',
        costMs,
        message: payload.message,
      });
      return false;
    } catch (err) {
      const costMs = Date.now() - t0;
      const reason =
        err instanceof Error ? err.message : '网络异常或服务端不可用';
      updateSyncRecord(accountId, {
        status: 'failed',
        lastSyncAt: nowStr(),
        costMs,
        failReason: reason,
      });
      appendSyncLog({
        time: nowStr(),
        accountId,
        result: 'failed',
        costMs,
        message: reason,
      });
      return false;
    }
  };

  /** 一键全部同步 */
  const handleSyncAll = async () => {
    setBatchSyncing(true);
    let okCount = 0;
    let failCount = 0;
    for (const a of accounts) {
      const r = recordMap.get(a.id);
      if (r && !r.cookieFilled) continue;
      const ok = await syncOne(a.id);
      if (ok) okCount += 1;
      else failCount += 1;
    }
    setBatchSyncing(false);
    toast.success(`同步完成 · 成功 ${okCount} · 失败 ${failCount}`);
  };

  /** 测试单账号 Cookie 连接（真实调用 verify-cookie） */
  const handleTestCookie = async (accountId: string) => {
    const acc = accountMap.get(accountId);
    if (!acc) return;
    const cookie = (acc.cookie ?? '').trim();
    if (!cookie) {
      toast.error(`${acc.name} 未配置 Cookie`);
      return;
    }
    setTestingId(accountId);
    try {
      const r = await fetch('/api/accounts/verify-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie }),
      });
      const data = (await r.json()) as { valid: boolean; message: string };
      const credOk = data.valid;
      updateSyncRecord(accountId, { cookieFilled: credOk });
      patchAccount(accountId, {
        cookieStatus: credOk ? 'verified' : 'expired',
        cookieVerifiedAt: new Date().toISOString(),
      });
      toast[credOk ? 'success' : 'error'](
        `${acc.name}：${data.message}`,
      );
    } catch (err) {
      toast.error(
        `${acc.name} 测试失败：${err instanceof Error ? err.message : '网络异常'}`,
      );
    } finally {
      setTestingId(null);
    }
  };

  /** 更新账号 cookie */
  const handleSaveCookie = (accountId: string, cookie: string) => {
    const acc = accountMap.get(accountId);
    if (!acc) return;
    upsertAccount({ ...acc, cookie });
    toast.success('凭证已保存，建议点击测试连接验证有效性');
  };

  /** 更新同步配置 */
  const handleConfigChange = (patch: Partial<SyncConfig>) => {
    updateSyncConfig({ ...syncConfig, ...patch });
  };
  const handleItemToggle = (
    key: keyof SyncConfig['items'],
    v: boolean | 'indeterminate',
  ) => {
    updateSyncConfig({
      ...syncConfig,
      items: { ...syncConfig.items, [key]: !!v },
    });
  };

  /** 同步状态汇总 */
  const summary = useMemo(() => {
    const success = syncRecords.filter((s) => s.status === 'success').length;
    const failed = syncRecords.filter((s) => s.status === 'failed').length;
    const syncing = syncRecords.filter((s) => s.status === 'syncing').length;
    const idle = syncRecords.filter((s) => s.status === 'idle').length;
    return { success, failed, syncing, idle };
  }, [syncRecords]);

  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return syncLogs;
    return syncLogs.filter((l) => l.accountId === logFilter);
  }, [syncLogs, logFilter]);

  const filteredCreds = useMemo(() => {
    if (!credSearch.trim()) return accounts;
    return accounts.filter((a) => a.name.includes(credSearch));
  }, [accounts, credSearch]);

  /** 数据对比卡片项 */
  const diffItems = [
    {
      label: '累计阅读',
      demo: DEMO_VS_REAL.demo.totalReads,
      real: DEMO_VS_REAL.real.totalReads,
      format: formatNumber,
    },
    {
      label: '累计粉丝',
      demo: DEMO_VS_REAL.demo.totalFollowers,
      real: DEMO_VS_REAL.real.totalFollowers,
      format: formatNumber,
    },
    {
      label: '累计收益',
      demo: DEMO_VS_REAL.demo.totalIncome,
      real: DEMO_VS_REAL.real.totalIncome,
      format: formatMoney,
    },
    {
      label: '今日发文',
      demo: DEMO_VS_REAL.demo.publishToday,
      real: DEMO_VS_REAL.real.publishToday,
      format: (n: number) => `${n} 篇`,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 顶部说明 */}
      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle>数据同步原理</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
          系统通过 <b>对应账号绑定的代理 IP</b> + 用户在
          <b> 独立浏览器环境</b> 中获取的 Cookie，
          模拟登录态请求头条号后台接口拉取数据。请在指纹浏览器中完成账号登录后，
          复制完整 Cookie 字符串粘贴到下方对应账号中。原型阶段使用 Mock
          数据演示流程，真实抓取逻辑预留接口位置。
        </AlertDescription>
      </Alert>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" /> 数据同步
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            凭证管理 / 任务调度 / 状态监控 / 数据对比
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            数据模式
            <span
              className={
                dataMode === 'demo'
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground'
              }
            >
              演示
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
              同步
            </span>
          </div>
          <Button
            size="sm"
            onClick={handleSyncAll}
            disabled={batchSyncing}
          >
            {batchSyncing ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Play className="w-4 h-4 mr-1" />
            )}
            一键全部同步
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="同步成功"
          value={summary.success}
          total={accounts.length}
          color="emerald"
        />
        <SummaryCard
          label="同步失败"
          value={summary.failed}
          total={accounts.length}
          color="red"
        />
        <SummaryCard
          label="同步中"
          value={summary.syncing}
          total={accounts.length}
          color="sky"
        />
        <SummaryCard
          label="未配置"
          value={summary.idle}
          total={accounts.length}
          color="amber"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="monitor">
        <TabsList>
          <TabsTrigger value="monitor">
            <Activity className="w-3.5 h-3.5 mr-1" /> 状态监控
          </TabsTrigger>
          <TabsTrigger value="cred">
            <Cookie className="w-3.5 h-3.5 mr-1" /> 凭证配置
          </TabsTrigger>
          <TabsTrigger value="task">
            <SettingsIcon className="w-3.5 h-3.5 mr-1" /> 任务配置
          </TabsTrigger>
          <TabsTrigger value="compare">
            <GitCompare className="w-3.5 h-3.5 mr-1" /> 数据对比
          </TabsTrigger>
        </TabsList>

        {/* === 状态监控 === */}
        <TabsContent value="monitor" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">账号同步状态</CardTitle>
              <span className="text-xs text-muted-foreground">
                共 {accounts.length} 个账号
              </span>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>账号</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>凭证</TableHead>
                    <TableHead>最后同步</TableHead>
                    <TableHead>下次同步</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>失败原因</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => {
                    const r: SyncRecord =
                      recordMap.get(a.id) ?? {
                        accountId: a.id,
                        lastSyncAt: '-',
                        nextSyncAt: '-',
                        status: 'idle',
                        cookieFilled: false,
                      };
                    const cred = getCredStatus(a.cookie, r.cookieFilled);
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-7 h-7">
                              <AvatarFallback className="text-[10px]">
                                {a.name.slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{a.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <CategoryBadge category={a.category} />
                        </TableCell>
                        <TableCell>
                          <CredBadge status={cred} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {r.lastSyncAt}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {r.nextSyncAt}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="text-xs text-red-300 max-w-[160px] truncate">
                          {r.failReason ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              r.status === 'syncing' ||
                              cred === 'empty' ||
                              cred === 'invalid'
                            }
                            onClick={() => syncOne(a.id)}
                          >
                            {r.status === 'syncing' ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            立即同步
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 历史日志 */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">同步历史日志</CardTitle>
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <Select value={logFilter} onValueChange={setLogFilter}>
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue placeholder="按账号筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部账号</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {filteredLogs.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  暂无同步记录
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>账号</TableHead>
                      <TableHead>结果</TableHead>
                      <TableHead>耗时</TableHead>
                      <TableHead>数据条数</TableHead>
                      <TableHead>说明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.slice(0, 30).map((log) => {
                      const acc = accountMap.get(log.accountId);
                      // 用 id 哈希做稳定的「条数」展示，避免 render 期间的非纯函数
                      const hash = log.id
                        .split('')
                        .reduce((s, c) => s + c.charCodeAt(0), 0);
                      const records =
                        log.result === 'success' ? 40 + (hash % 80) : 0;
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs tabular-nums text-muted-foreground">
                            {log.time}
                          </TableCell>
                          <TableCell className="text-sm">
                            {acc?.name ?? log.accountId}
                          </TableCell>
                          <TableCell>
                            {log.result === 'success' ? (
                              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 border hover:bg-emerald-500/15">
                                成功
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/15 text-red-300 border-red-500/30 border hover:bg-red-500/15">
                                失败
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {(log.costMs / 1000).toFixed(2)} s
                          </TableCell>
                          <TableCell className="text-xs tabular-nums">
                            {records > 0 ? `${records} 条` : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                            {log.message ??
                              (log.result === 'success' ? '同步完成' : '未知错误')}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === 凭证配置 === */}
        <TabsContent value="cred" className="mt-4 space-y-4">
          <Alert>
            <KeyRound className="h-4 w-4" />
            <AlertTitle>如何获取 Cookie？</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground space-y-1">
              <div>
                1. 在该账号绑定的独立浏览器环境中打开
                <span className="text-foreground"> mp.toutiao.com</span>
                并完成登录
              </div>
              <div>
                2. 打开开发者工具 → Application/Storage → Cookies →
                复制全部键值对
              </div>
              <div>
                3. 粘贴到下方对应账号的输入框中，点击「测试连接」验证
              </div>
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">账号凭证管理</CardTitle>
              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-7 h-8"
                  placeholder="搜索账号名"
                  value={credSearch}
                  onChange={(e) => setCredSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {filteredCreds.map((a) => {
                const r = recordMap.get(a.id);
                const cred = getCredStatus(a.cookie, r?.cookieFilled ?? false);
                return (
                  <CredentialRow
                    key={a.id}
                    accountId={a.id}
                    name={a.name}
                    category={a.category}
                    cookie={a.cookie}
                    cred={cred}
                    testing={testingId === a.id}
                    onSave={(v) => handleSaveCookie(a.id, v)}
                    onTest={() => handleTestCookie(a.id)}
                  />
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* === 任务配置 === */}
        <TabsContent value="task" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" /> 自动同步策略
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 总开关 */}
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/30 border border-border">
                <div>
                  <div className="text-sm font-medium">自动同步总开关</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    关闭后所有账号将不再按计划自动同步，需在状态监控页手动触发
                  </div>
                </div>
                <Switch
                  checked={autoSyncOn}
                  onCheckedChange={(v) =>
                    handleConfigChange({ freq: v ? '12h' : 'manual' })
                  }
                />
              </div>

              {/* 频率 + 时间 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>同步频率</Label>
                  <Select
                    value={syncConfig.freq}
                    onValueChange={(v) =>
                      handleConfigChange({ freq: v as SyncFreq })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6h">{FREQ_LABEL['6h']}</SelectItem>
                      <SelectItem value="12h">
                        {FREQ_LABEL['12h']}
                      </SelectItem>
                      <SelectItem value="24h">
                        {FREQ_LABEL['24h']}
                      </SelectItem>
                      <SelectItem value="manual">
                        {FREQ_LABEL.manual}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    当前策略：{FREQ_LABEL[syncConfig.freq]}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>每日基准同步时间</Label>
                  <Input
                    type="time"
                    value={syncConfig.syncTime}
                    onChange={(e) =>
                      handleConfigChange({ syncTime: e.target.value })
                    }
                    disabled={syncConfig.freq === 'manual'}
                  />
                  <div className="text-xs text-muted-foreground">
                    建议设置在凌晨 02:00 ～ 04:00，避开后台数据更新高峰
                  </div>
                </div>
              </div>

              {/* 同步项 */}
              <div className="space-y-3">
                <Label>同步数据项</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <SyncItemCheck
                    label="昨日 / 累计收益"
                    checked={syncConfig.items.income}
                    onCheckedChange={(v) => handleItemToggle('income', v)}
                  />
                  <SyncItemCheck
                    label="文章阅读量"
                    checked={syncConfig.items.reads}
                    onCheckedChange={(v) => handleItemToggle('reads', v)}
                  />
                  <SyncItemCheck
                    label="粉丝增减"
                    checked={syncConfig.items.followers}
                    onCheckedChange={(v) => handleItemToggle('followers', v)}
                  />
                  <SyncItemCheck
                    label="单篇文章明细"
                    checked={syncConfig.items.articles}
                    onCheckedChange={(v) => handleItemToggle('articles', v)}
                  />
                  <SyncItemCheck
                    label="评论数据"
                    checked={syncConfig.items.comments}
                    onCheckedChange={(v) => handleItemToggle('comments', v)}
                  />
                </div>
              </div>

              <Alert className="border-amber-500/30 bg-amber-500/5">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <AlertDescription className="text-xs">
                  请勿同时勾选过多项以避免触发后台限流，建议每个账号同步间隔
                  ≥ 6 小时。
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === 数据对比 === */}
        <TabsContent value="compare" className="mt-4 space-y-4">
          <Alert className="border-sky-500/30 bg-sky-500/5">
            <Info className="h-4 w-4 text-sky-400" />
            <AlertTitle>演示数据 vs 同步数据</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              下方数据为原型阶段 Mock 模拟，真实部署时将以同步任务拉取到的接口数据为准。
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {diffItems.map((it) => {
              const diff = it.real - it.demo;
              const pct = ((diff / it.demo) * 100).toFixed(1);
              const negative = diff < 0;
              return (
                <Card key={it.label}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground font-normal">
                      {it.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="flex justify-between items-end">
                      <div>
                        <div className="text-[10px] text-muted-foreground">
                          演示
                        </div>
                        <div className="text-base font-semibold tabular-nums">
                          {it.format(it.demo)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground">
                          真实同步
                        </div>
                        <div className="text-base font-semibold tabular-nums text-primary">
                          {it.format(it.real)}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`text-xs rounded px-2 py-1 ${
                        negative
                          ? 'bg-red-500/10 text-red-300'
                          : 'bg-emerald-500/10 text-emerald-300'
                      }`}
                    >
                      偏差 {negative ? '' : '+'}
                      {it.format(Math.abs(diff))} ({pct}%)
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">数据偏差检查</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <DiffAlert
                level="warn"
                title="累计阅读偏差 -5.0%"
                desc="同步数据低于演示数据，可能是部分账号 Cookie 过期导致部分文章未同步"
              />
              <DiffAlert
                level="info"
                title="累计收益偏差 -3.6%"
                desc="处于正常波动范围，建议持续观察 3 天，确认是否为节假日效应"
              />
              <DiffAlert
                level="ok"
                title="累计粉丝偏差 -1.3%"
                desc="差异在正常范围内，无需处理"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: 'emerald' | 'red' | 'sky' | 'amber';
}) {
  const colorMap = {
    emerald: 'text-emerald-300 bg-emerald-500/10',
    red: 'text-red-300 bg-red-500/10',
    sky: 'text-sky-300 bg-sky-500/10',
    amber: 'text-amber-300 bg-amber-500/10',
  };
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {value}
            <span className="text-sm text-muted-foreground font-normal ml-1">
              / {total}
            </span>
          </div>
        </div>
        <div className={`w-10 h-10 rounded-md ${colorMap[color]}`} />
      </CardContent>
    </Card>
  );
}

function SyncItemCheck({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean | 'indeterminate') => void;
}) {
  return (
    <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:border-primary/50 cursor-pointer transition-colors">
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function CredentialRow({
  name,
  category,
  cookie,
  cred,
  testing,
  onSave,
  onTest,
}: {
  accountId: string;
  name: string;
  category: string;
  cookie: string;
  cred: CredStatus;
  testing: boolean;
  onSave: (v: string) => void;
  onTest: () => void;
}) {
  const [value, setValue] = useState(cookie);
  const dirty = value !== cookie;
  const preview =
    cookie && cookie.length > 24
      ? `${cookie.slice(0, 10)} *** ${cookie.slice(-10)}`
      : cookie || '（未填入）';
  return (
    <div className="p-3 rounded-md bg-muted/20 border border-border">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Avatar className="w-7 h-7">
            <AvatarFallback className="text-[10px]">
              {name.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="text-sm font-medium">{name}</div>
          <span className="text-xs text-muted-foreground">{category}</span>
          <CredBadge status={cred} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty}
            onClick={() => onSave(value)}
          >
            保存
          </Button>
          <Button
            size="sm"
            disabled={testing || !value.trim()}
            onClick={onTest}
          >
            {testing ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            )}
            {testing ? '验证中...' : '重新验证'}
          </Button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="text-muted-foreground">凭证预览：</span>
        <code className="font-mono text-foreground/80">{preview}</code>
      </div>
      <Textarea
        className="mt-2 text-xs font-mono"
        rows={2}
        placeholder="粘贴 Cookie 字符串，如：sessionid=xxx; tt_webid=xxx; ..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  );
}

function DiffAlert({
  level,
  title,
  desc,
}: {
  level: 'warn' | 'info' | 'ok';
  title: string;
  desc: string;
}) {
  const map = {
    warn: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
    info: 'border-sky-500/30 bg-sky-500/5 text-sky-300',
    ok: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${map[level]}`}>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
    </div>
  );
}
