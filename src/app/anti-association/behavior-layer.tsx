'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Activity, Loader2, Sparkles } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import { useStore } from '@/lib/store';
import { BEHAVIOR_DATA } from '@/lib/anti-association-data';
import type { BehaviorRecord, RiskLevel } from '@/lib/types';

function riskLabel(r: RiskLevel) {
  if (r === 'low') return { text: '低', className: 'text-emerald-400' };
  if (r === 'medium') return { text: '中', className: 'text-amber-400' };
  return { text: '高', className: 'text-red-400' };
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 从 BehaviorRecord 派生 6 维雷达数据（0-100） */
function deriveRadar(b: BehaviorRecord): {
  timing: number;
  length: number;
  image: number;
  freq: number;
  interaction: number;
  formatting: number;
} {
  // 发文时间一致性：取 publishHour 起始小时
  const hour = parseInt(b.publishHour.split(':')[0] ?? '12', 10);
  const timing = Math.min(100, Math.max(0, 100 - Math.abs(hour - 12) * 5));
  // 字数偏好：基于 avgWords 归一到 0-100（500-3000）
  const length = Math.min(
    100,
    Math.max(0, ((b.avgWords - 500) / 2500) * 100),
  );
  // 配图风格
  const imageScore: Record<BehaviorRecord['imageStyle'], number> = {
    纯文字: 20,
    单图: 45,
    多图: 75,
    视频: 95,
  };
  const image = imageScore[b.imageStyle];
  // 频率
  const freq = Math.min(100, b.freqPerDay * 20);
  // 互动：从 emojiHabit / interactionHabit 简单解析
  const m = /(\d+)%/.exec(b.interactionHabit);
  const interaction = m ? Math.min(100, parseInt(m[1], 10) * 2) : 30;
  // 排版（基于 emojiHabit 字数 + imageStyle）
  const formatting = Math.min(
    100,
    b.emojiHabit.length * 6 + (b.imageStyle === '多图' ? 30 : 10),
  );
  return { timing, length, image, freq, interaction, formatting };
}

export function BehaviorLayer() {
  const { accounts } = useStore();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [leftId, setLeftId] = useState<string>(
    BEHAVIOR_DATA[0]?.accountId ?? '',
  );
  const [rightId, setRightId] = useState<string>(
    BEHAVIOR_DATA[1]?.accountId ?? '',
  );

  const accMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const behaviorMap = useMemo(
    () => new Map(BEHAVIOR_DATA.map((b) => [b.accountId, b])),
    [],
  );

  const handleScan = async () => {
    setScanning(true);
    await new Promise((r) => setTimeout(r, 2400));
    setScanning(false);
    setScanned(true);
    const high = BEHAVIOR_DATA.filter((b) => b.riskLevel === 'high').length;
    toast.success(`分析完成，高风险账号 ${high} 个`);
  };

  /** 时间热力图：合并所有账号 hourMatrix（7×24） */
  const heatmap = useMemo(() => {
    const matrix: number[][] = Array.from({ length: 7 }, () =>
      Array(24).fill(0),
    );
    BEHAVIOR_DATA.forEach((b) => {
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          matrix[d][h] += b.hourMatrix[d]?.[h] ?? 0;
        }
      }
    });
    return matrix;
  }, []);

  const heatMax = useMemo(
    () => Math.max(0.001, ...heatmap.flat()),
    [heatmap],
  );

  const radarData = useMemo(() => {
    const l = behaviorMap.get(leftId);
    const r = behaviorMap.get(rightId);
    if (!l || !r) return [];
    const lr = deriveRadar(l);
    const rr = deriveRadar(r);
    return [
      { dim: '发文时间', A: lr.timing, B: rr.timing },
      { dim: '字数偏好', A: lr.length, B: rr.length },
      { dim: '配图风格', A: lr.image, B: rr.image },
      { dim: '发文频率', A: lr.freq, B: rr.freq },
      { dim: '互动响应', A: lr.interaction, B: rr.interaction },
      { dim: '排版习惯', A: lr.formatting, B: rr.formatting },
    ];
  }, [behaviorMap, leftId, rightId]);

  const overlap = useMemo(() => {
    if (radarData.length === 0) return 0;
    const total = radarData.reduce(
      (acc, d) => acc + Math.abs(d.A - d.B),
      0,
    );
    return Math.max(0, 100 - Math.round(total / radarData.length));
  }, [radarData]);

  const heatColor = (v: number) => {
    const ratio = v / heatMax;
    if (ratio === 0) return 'bg-card/40';
    if (ratio < 0.25) return 'bg-emerald-500/20';
    if (ratio < 0.5) return 'bg-emerald-500/40';
    if (ratio < 0.75) return 'bg-amber-500/60';
    return 'bg-red-500/70';
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">行为指纹</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                发文时段、字数、配图、频率、互动、排版多维度行为特征
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleScan} disabled={scanning}>
                {scanning ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Activity className="w-4 h-4 mr-1" />
                )}
                {scanning ? '分析中…' : '行为模式分析'}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  toast.success(
                    '已生成差异化建议：错峰发文、调整开头句式、混用配图风格',
                  )
                }
              >
                <Sparkles className="w-4 h-4 mr-1" /> 差异化建议
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>账号</TableHead>
                  <TableHead>常用时段</TableHead>
                  <TableHead>平均字数</TableHead>
                  <TableHead>表情/标点</TableHead>
                  <TableHead>配图风格</TableHead>
                  <TableHead>频率</TableHead>
                  <TableHead>互动</TableHead>
                  <TableHead>登录时段</TableHead>
                  <TableHead>风险</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BEHAVIOR_DATA.map((r) => {
                  const acc = accMap.get(r.accountId);
                  const rk = riskLabel(r.riskLevel);
                  return (
                    <TableRow
                      key={r.accountId}
                      className={
                        scanned && r.riskLevel === 'high'
                          ? 'bg-red-500/5'
                          : undefined
                      }
                    >
                      <TableCell className="font-medium">
                        {acc?.name ?? r.accountId}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.publishHour}
                      </TableCell>
                      <TableCell className="text-xs">{r.avgWords}</TableCell>
                      <TableCell className="text-xs">{r.emojiHabit}</TableCell>
                      <TableCell className="text-xs">
                        {r.publishHour === '—' ? '—' : r.imageStyle}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.freqPerDay.toFixed(1)} 篇/天
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.interactionHabit}
                      </TableCell>
                      <TableCell className="text-xs">{r.loginHour}</TableCell>
                      <TableCell>
                        <span className={`text-xs ${rk.className}`}>
                          ● {rk.text}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">发文时间热力图</CardTitle>
            <p className="text-xs text-muted-foreground">
              小时 × 星期 维度的整体发文密度
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <div className="inline-block">
                <div className="flex">
                  <div className="w-12" />
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div
                      key={h}
                      className="w-5 text-[9px] text-muted-foreground text-center"
                    >
                      {h}
                    </div>
                  ))}
                </div>
                {heatmap.map((row, w) => (
                  <div key={w} className="flex items-center">
                    <div className="w-12 text-[11px] text-muted-foreground">
                      {WEEKDAYS[w]}
                    </div>
                    {row.map((v, h) => (
                      <div
                        key={h}
                        className={`w-5 h-5 m-[1px] rounded-sm ${heatColor(
                          v,
                        )}`}
                        title={`${WEEKDAYS[w]} ${h}:00 密度 ${v.toFixed(2)}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">行为雷达对比</CardTitle>
              <div className="flex gap-2 items-center">
                <Select value={leftId} onValueChange={setLeftId}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BEHAVIOR_DATA.map((b) => (
                      <SelectItem key={b.accountId} value={b.accountId}>
                        {accMap.get(b.accountId)?.name ?? b.accountId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">vs</span>
                <Select value={rightId} onValueChange={setRightId}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BEHAVIOR_DATA.map((b) => (
                      <SelectItem key={b.accountId} value={b.accountId}>
                        {accMap.get(b.accountId)?.name ?? b.accountId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="oklch(0.32 0.01 60)" />
                  <PolarAngleAxis
                    dataKey="dim"
                    tick={{ fill: 'oklch(0.65 0.02 60)', fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: 'oklch(0.45 0.02 60)', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'oklch(0.23 0.01 60)',
                      border: '1px solid oklch(0.32 0.01 60)',
                      fontSize: 12,
                    }}
                  />
                  <Radar
                    name={accMap.get(leftId)?.name ?? 'A'}
                    dataKey="A"
                    stroke="oklch(0.68 0.19 35)"
                    fill="oklch(0.68 0.19 35)"
                    fillOpacity={0.3}
                  />
                  <Radar
                    name={accMap.get(rightId)?.name ?? 'B'}
                    dataKey="B"
                    stroke="oklch(0.78 0.17 65)"
                    fill="oklch(0.78 0.17 65)"
                    fillOpacity={0.3}
                  />
                  <Legend
                    wrapperStyle={{
                      fontSize: 11,
                      color: 'oklch(0.65 0.02 60)',
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-xs">
              <span className="text-muted-foreground">指纹重合度：</span>
              <span
                className={
                  overlap >= 80
                    ? 'text-red-400 font-medium'
                    : overlap >= 60
                      ? 'text-amber-400 font-medium'
                      : 'text-emerald-400 font-medium'
                }
              >
                {overlap}%
              </span>
              {overlap >= 80 && (
                <span className="ml-2 text-red-400">
                  · 风险较高，建议立即差异化改写
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
