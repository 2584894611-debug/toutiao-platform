'use client';

import { useMemo } from 'react';
import { toast } from 'sonner';
import {
  Clock,
  PlayCircle,
  CheckCircle2,
  XCircle,
  RotateCw,
  Trash2,
  ExternalLink,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useStore } from '@/lib/store';
import type { Article, ArticleStatus } from '@/lib/types';
import { useState } from 'react';

const STATUS_TABS: {
  key: ArticleStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: 'queued', label: '待发布', icon: Clock },
  { key: 'publishing', label: '发布中', icon: PlayCircle },
  { key: 'published', label: '已发布', icon: CheckCircle2 },
  { key: 'failed', label: '失败', icon: XCircle },
];

export default function QueuePage() {
  const { articles, accounts, retryArticle, deleteArticle, appendLog } =
    useStore();
  const [tab, setTab] = useState<ArticleStatus>('queued');

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const grouped = useMemo(() => {
    const map: Record<ArticleStatus, Article[]> = {
      draft: [],
      queued: [],
      publishing: [],
      submitted: [],
      published: [],
      failed: [],
    };
    articles.forEach((a) => {
      map[a.status].push(a);
    });
    return map;
  }, [articles]);

  const handleRetry = (a: Article) => {
    retryArticle(a.id);
    appendLog({
      action: '重试发布',
      target: a.title,
      operator: 'admin',
      status: 'success',
    });
    toast.success('已加入待发布队列');
  };

  const handleDelete = (a: Article) => {
    deleteArticle(a.id);
    appendLog({
      action: '移除队列项',
      target: a.title,
      operator: 'admin',
      status: 'success',
    });
    toast.success('已移除');
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">发布队列</h1>
        <p className="text-sm text-muted-foreground mt-1">
          四态管理：待发布 · 发布中 · 已发布 · 失败可重试
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATUS_TABS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.key}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">
                    {s.label}
                  </div>
                  <div className="text-2xl font-bold tabular-nums mt-1">
                    {grouped[s.key].length}
                  </div>
                </div>
                <div className="w-9 h-9 rounded bg-primary/10 text-primary flex items-center justify-center">
                  <Icon className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ArticleStatus)}>
        <TabsList>
          {STATUS_TABS.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.label}（{grouped[s.key].length}）
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUS_TABS.map((s) => (
          <TabsContent key={s.key} value={s.key} className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{s.label}列表</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">标题</TableHead>
                      <TableHead>归属账号</TableHead>
                      <TableHead>时间</TableHead>
                      {s.key === 'failed' && <TableHead>失败原因</TableHead>}
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped[s.key].map((a) => {
                      const owner = a.accountId
                        ? accountMap.get(a.accountId)
                        : undefined;
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium truncate max-w-0">
                            {a.title}
                          </TableCell>
                          <TableCell className="text-xs">
                            {owner ? owner.name : '-'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {a.publishedAt ??
                              a.scheduledAt ??
                              '-'}
                          </TableCell>
                          {s.key === 'failed' && (
                            <TableCell className="text-xs text-red-400">
                              {a.failReason ?? '-'}
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {s.key === 'published' && a.publishUrl && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-primary hover:text-primary"
                                  asChild
                                >
                                  <a
                                    href={a.publishUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                                    在头条查看
                                  </a>
                                </Button>
                              )}
                              {s.key === 'failed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handleRetry(a)}
                                >
                                  <RotateCw className="w-3.5 h-3.5 mr-1" />
                                  重试
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-400 hover:text-red-300"
                                onClick={() => handleDelete(a)}
                                aria-label="移除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {grouped[s.key].length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={s.key === 'failed' ? 5 : 4}
                          className="text-center text-muted-foreground py-8"
                        >
                          暂无{s.label}文章
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
