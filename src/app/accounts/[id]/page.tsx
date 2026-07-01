'use client';

import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Eye, ThumbsUp, MessageCircle, Share2 } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CategoryBadge } from '@/components/common/category-badge';
import { StatusDot } from '@/components/common/status-dot';
import { useStore } from '@/lib/store';
import { formatMoney, formatNumber } from '@/lib/utils';

const STATUS_LABEL: Record<
  string,
  { label: string; color: 'green' | 'yellow' | 'red' | 'gray' }
> = {
  online: { label: '已登录', color: 'green' },
  expired: { label: 'Cookie 过期', color: 'yellow' },
  offline: { label: '未登录', color: 'red' },
};

const ART_STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  queued: '待发布',
  publishing: '发布中',
  published: '已发布',
  failed: '失败',
};

export default function AccountDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { accounts, articles } = useStore();

  const acc = accounts.find((a) => a.id === params.id);
  const myArticles = useMemo(
    () => articles.filter((a) => a.accountId === params.id),
    [articles, params.id],
  );

  // 模拟该账号近 14 天数据
  const trend = useMemo(() => {
    const list: { date: string; 阅读: number; 涨粉: number; 收益: number }[] = [];
    const base = new Date(2025, 0, 15);
    const seedBase =
      acc?.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0) ?? 100;
    for (let i = 13; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      const seed = seedBase + i + 1;
      const r = ((Math.sin(seed) * 10000) % 1 + 1) / 2;
      const r2 = ((Math.cos(seed) * 10000) % 1 + 1) / 2;
      list.push({
        date: d.toISOString().slice(5, 10),
        阅读: Math.floor(20_000 + r * 60_000),
        涨粉: Math.floor(50 + r2 * 300),
        收益: Math.floor(120 + r * 800),
      });
    }
    return list;
  }, [acc]);

  if (!acc) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        未找到该账号
        <div className="mt-4">
          <Button onClick={() => router.push('/accounts')}>返回</Button>
        </div>
      </div>
    );
  }

  const status = STATUS_LABEL[acc.loginStatus];

  return (
    <div className="space-y-5">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/accounts')}
        className="-ml-2"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> 返回账号列表
      </Button>

      <Card>
        <CardContent className="p-5 flex items-center gap-4 flex-wrap">
          <Avatar className="w-16 h-16">
            <AvatarFallback className="text-xl bg-primary/15 text-primary">
              {acc.avatar}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{acc.name}</h2>
              <CategoryBadge category={acc.category} />
              <StatusDot color={status.color} label={status.label} />
            </div>
            <div className="text-xs text-muted-foreground mt-1.5">
              {acc.phone} · {acc.remark || '暂无备注'}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-right">
            <Stat label="累计阅读" value={formatNumber(acc.totalReads)} />
            <Stat label="粉丝" value={formatNumber(acc.totalFollowers)} />
            <Stat label="点赞" value={formatNumber(acc.totalLikes)} />
            <Stat label="累计收益" value={formatMoney(acc.totalIncome)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">近 14 天数据趋势</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.01 60)" />
              <XAxis dataKey="date" stroke="oklch(0.65 0.02 60)" />
              <YAxis stroke="oklch(0.65 0.02 60)" tickFormatter={(v) => formatNumber(Number(v))} />
              <Tooltip
                contentStyle={{
                  background: 'oklch(0.23 0.01 60)',
                  border: '1px solid oklch(0.32 0.01 60)',
                  borderRadius: 8,
                }}
                formatter={(v: number) => formatNumber(v)}
              />
              <Line type="monotone" dataKey="阅读" stroke="oklch(0.68 0.19 35)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="涨粉" stroke="oklch(0.78 0.17 65)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="收益" stroke="oklch(0.72 0.17 155)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">历史文章 ({myArticles.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">标题</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">
                  <Eye className="w-3.5 h-3.5 inline" /> 阅读
                </TableHead>
                <TableHead className="text-right">
                  <ThumbsUp className="w-3.5 h-3.5 inline" /> 赞
                </TableHead>
                <TableHead className="text-right">
                  <MessageCircle className="w-3.5 h-3.5 inline" /> 评
                </TableHead>
                <TableHead className="text-right">
                  <Share2 className="w-3.5 h-3.5 inline" /> 转
                </TableHead>
                <TableHead>发布时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myArticles.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium truncate max-w-0">
                    {a.title}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {ART_STATUS_LABEL[a.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(a.reads)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(a.likes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(a.comments)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(a.shares)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.publishedAt ?? a.scheduledAt ?? '-'}
                  </TableCell>
                </TableRow>
              ))}
              {myArticles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    暂无文章
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
