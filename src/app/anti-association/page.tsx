'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ShieldCheck,
  ShieldAlert,
  Fingerprint,
  Globe2,
  Activity,
  Users,
  Loader2,
  Download,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { AccountLayer } from './account-layer';
import { FingerprintLayer } from './fingerprint-layer';
import { NetworkLayer } from './network-layer';
import { BehaviorLayer } from './behavior-layer';
import { useStore } from '@/lib/store';
import {
  FINGERPRINT_DATA,
  IDENTITY_DATA,
  NETWORK_DATA,
  BEHAVIOR_DATA,
  INITIAL_RISK_ALERTS,
  INITIAL_DETECTION_HISTORY,
} from '@/lib/anti-association-data';
import type { DetectionHistory, RiskAlert } from '@/lib/types';

type StatusColor = 'green' | 'yellow' | 'red';

const LAYER_DEFS = [
  {
    key: 'account',
    title: '身份信息',
    icon: Users,
    desc: '实名 / 手机 / 收款账户',
  },
  {
    key: 'fingerprint',
    title: '浏览器环境',
    icon: Fingerprint,
    desc: 'UA / Canvas / WebGL / 字体',
  },
  {
    key: 'network',
    title: '网络环境',
    icon: Globe2,
    desc: '出口 IP / DNS / WebRTC',
  },
  {
    key: 'behavior',
    title: '操作习惯',
    icon: Activity,
    desc: '发文 / 排版 / 互动差异化',
  },
] as const;

export default function AntiAssociationPage() {
  const { accounts } = useStore();
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [history, setHistory] = useState<DetectionHistory[]>(
    INITIAL_DETECTION_HISTORY,
  );
  const [alerts, setAlerts] = useState<RiskAlert[]>(INITIAL_RISK_ALERTS);

  const accMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  /** 各层"已隔离"统计 */
  const layerStats = useMemo(() => {
    const total = accounts.length || 10;

    // 账号层
    const acctIssues = new Set<string>();
    const phoneMap = new Map<string, string[]>();
    const binMap = new Map<string, string[]>();
    IDENTITY_DATA.forEach((r) => {
      const prefix = r.phoneMask.slice(0, 3);
      if (prefix === '170' || prefix === '171') {
        const arr = phoneMap.get(prefix) ?? [];
        arr.push(r.accountId);
        phoneMap.set(prefix, arr);
      }
      if (r.bankCardBin !== '------') {
        const arr = binMap.get(r.bankCardBin) ?? [];
        arr.push(r.accountId);
        binMap.set(r.bankCardBin, arr);
      }
    });
    phoneMap.forEach((arr) => {
      if (arr.length > 1) arr.forEach((id) => acctIssues.add(id));
    });
    binMap.forEach((arr) => {
      if (arr.length > 1) arr.forEach((id) => acctIssues.add(id));
    });

    const fpIssues = FINGERPRINT_DATA.filter(
      (f) => f.status !== 'isolated',
    ).length;
    const netIssues = NETWORK_DATA.filter(
      (n) => n.ipType === 'datacenter' || n.dnsLeaked || n.webrtcLeaked,
    ).length;
    const behaviorIssues = BEHAVIOR_DATA.filter(
      (b) => b.riskLevel !== 'low',
    ).length;

    const statusOf = (issues: number): StatusColor =>
      issues === 0 ? 'green' : issues <= 2 ? 'yellow' : 'red';

    return {
      account: {
        isolated: total - acctIssues.size,
        total,
        status: statusOf(acctIssues.size),
      },
      fingerprint: {
        isolated: total - fpIssues,
        total,
        status: statusOf(fpIssues),
      },
      network: {
        isolated: total - netIssues,
        total,
        status: statusOf(netIssues),
      },
      behavior: {
        isolated: total - behaviorIssues,
        total,
        status: statusOf(behaviorIssues),
      },
    } as const;
  }, [accounts.length]);

  const healthScore = useMemo(() => {
    const stats = Object.values(layerStats);
    const score = stats.reduce(
      (s, c) => s + (c.isolated / Math.max(1, c.total)) * 25,
      0,
    );
    return Math.round(score);
  }, [layerStats]);

  const alertCount = useMemo(() => {
    const high = alerts.filter(
      (a) => a.level === 'high' && !a.resolved,
    ).length;
    const mid = alerts.filter(
      (a) => a.level === 'medium' && !a.resolved,
    ).length;
    const low = alerts.filter(
      (a) => a.level === 'low' && !a.resolved,
    ).length;
    return { high, mid, low };
  }, [alerts]);

  const handleFullScan = async () => {
    setScanning(true);
    setProgress(0);
    const steps = [15, 35, 60, 85, 100];
    for (const p of steps) {
      await new Promise((r) => setTimeout(r, 480));
      setProgress(p);
    }
    setScanning(false);
    setHistory((prev) => [
      {
        id: `det-${Date.now()}`,
        time: new Date().toLocaleString('zh-CN', { hour12: false }),
        score: healthScore,
        high: alertCount.high,
        medium: alertCount.mid,
        low: alertCount.low,
        triggeredBy: 'admin',
      },
      ...prev,
    ]);
    toast.success(`全量体检完成，综合安全评分 ${healthScore}`);
  };

  const handleExport = () => {
    toast.success('账号安全体检报告已生成（模拟 PDF 下载）');
  };

  const handleAckAlert = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, resolved: true } : a)),
    );
    toast.success('问题已标记为已处理');
  };

  const statusColor = (s: StatusColor) =>
    s === 'green'
      ? 'text-emerald-400'
      : s === 'yellow'
        ? 'text-amber-400'
        : 'text-red-400';

  const scoreColor =
    healthScore >= 85
      ? 'text-emerald-400'
      : healthScore >= 70
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            账号安全检测中心
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            4 维度合规体检 · 综合安全评分 · 实时问题追踪 · 一键全量扫描
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleFullScan} disabled={scanning}>
            {scanning ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-1" />
            )}
            {scanning ? '体检中…' : '一键全量体检'}
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" /> 导出体检报告
          </Button>
        </div>
      </div>

      {/* 4 层防御卡片 + 综合健康分 */}
      <div className="grid gap-3 lg:grid-cols-5 md:grid-cols-2">
        {LAYER_DEFS.map((layer) => {
          const stat = layerStats[layer.key];
          const Icon = layer.icon;
          return (
            <Card key={layer.key} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-md bg-primary/10">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{layer.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {layer.desc}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-lg leading-none ${statusColor(stat.status)}`}
                  >
                    ●
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-2xl font-bold tabular-nums">
                    {stat.isolated}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {stat.total} 已合规
                  </span>
                </div>
                <Progress
                  className="mt-2 h-1"
                  value={(stat.isolated / Math.max(1, stat.total)) * 100}
                />
              </CardContent>
            </Card>
          );
        })}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">
              综合安全评分
            </div>
            <div className={`text-4xl font-bold tabular-nums ${scoreColor}`}>
              {healthScore}
            </div>
            <div className="mt-2 flex gap-1 flex-wrap">
              <Badge
                variant="outline"
                className="bg-red-500/10 text-red-300 border-red-500/30 text-[10px]"
              >
                严重 {alertCount.high}
              </Badge>
              <Badge
                variant="outline"
                className="bg-amber-500/10 text-amber-300 border-amber-500/30 text-[10px]"
              >
                警告 {alertCount.mid}
              </Badge>
              <Badge
                variant="outline"
                className="bg-sky-500/10 text-sky-300 border-sky-500/30 text-[10px]"
              >
                提示 {alertCount.low}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {scanning && (
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-muted-foreground">体检进度</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="text-[11px] text-muted-foreground mt-2">
              {progress < 25
                ? '正在核查身份信息合规性…'
                : progress < 50
                  ? '正在比对浏览器环境指纹…'
                  : progress < 75
                    ? '正在检测网络环境 / DNS / WebRTC…'
                    : progress < 100
                      ? '正在分析操作习惯差异化…'
                      : '生成体检报告中…'}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">身份信息</TabsTrigger>
          <TabsTrigger value="fingerprint">浏览器环境</TabsTrigger>
          <TabsTrigger value="network">网络环境</TabsTrigger>
          <TabsTrigger value="behavior">操作习惯</TabsTrigger>
        </TabsList>
        <TabsContent value="account" className="mt-4">
          <AccountLayer />
        </TabsContent>
        <TabsContent value="fingerprint" className="mt-4">
          <FingerprintLayer />
        </TabsContent>
        <TabsContent value="network" className="mt-4">
          <NetworkLayer />
        </TabsContent>
        <TabsContent value="behavior" className="mt-4">
          <BehaviorLayer />
        </TabsContent>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" /> 问题整改清单
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[360px] overflow-y-auto">
            {[...alerts]
              .sort((a, b) => {
                const order = { high: 0, medium: 1, low: 2 };
                return order[a.level] - order[b.level];
              })
              .map((a) => {
                const color =
                  a.level === 'high'
                    ? 'border-red-500/30 bg-red-500/5'
                    : a.level === 'medium'
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-sky-500/30 bg-sky-500/5';
                const sevText =
                  a.level === 'high'
                    ? '严重'
                    : a.level === 'medium'
                      ? '警告'
                      : '提示';
                return (
                  <div
                    key={a.id}
                    className={`rounded border px-3 py-2 ${color} ${
                      a.resolved ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <span
                          className={
                            a.level === 'high'
                              ? 'text-red-300'
                              : a.level === 'medium'
                                ? 'text-amber-300'
                                : 'text-sky-300'
                          }
                        >
                          [{sevText}]
                        </span>
                        {a.title}
                      </div>
                      {!a.resolved ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAckAlert(a.id)}
                        >
                          标记已处理
                        </Button>
                      ) : (
                        <span className="text-xs text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          已处理
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {a.desc}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      涉及账号：
                      {a.involvedAccounts
                        .map((id) => accMap.get(id)?.name ?? id)
                        .join('、') || '—'}
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">体检历史时间线</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[360px] overflow-y-auto">
            <div className="relative pl-4 border-l border-border space-y-3">
              {history.map((h) => (
                <div key={h.id} className="relative">
                  <span className="absolute -left-[21px] top-1 w-2 h-2 rounded-full bg-primary" />
                  <div className="text-xs text-muted-foreground">{h.time}</div>
                  <div className="text-sm">
                    安全评分{' '}
                    <span className="tabular-nums font-medium">{h.score}</span>{' '}
                    · 问题{' '}
                    <span className="tabular-nums">
                      {h.high + h.medium + h.low}
                    </span>{' '}
                    项{' '}
                    <span className="text-muted-foreground text-xs">
                      （严重 {h.high} / 警告 {h.medium} / 提示 {h.low}）
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
