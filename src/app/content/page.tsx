'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Search, Send, Edit, Trash2, Share2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useStore } from '@/lib/store';
import type { Article, ArticleStatus } from '@/lib/types';
import { ArticleEditDialog } from './article-edit-dialog';
import { DispatchDialog } from './dispatch-dialog';
import { formatNumber } from '@/lib/utils';

const STATUS_LABEL: Record<ArticleStatus, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-muted text-muted-foreground' },
  queued: { label: '待发布', cls: 'bg-amber-500/15 text-amber-300' },
  publishing: { label: '发布中', cls: 'bg-blue-500/15 text-blue-300' },
  submitted: { label: '已提交，待确认', cls: 'bg-cyan-500/15 text-cyan-300' },
  published: { label: '已发布', cls: 'bg-emerald-500/15 text-emerald-300' },
  failed: { label: '失败', cls: 'bg-red-500/15 text-red-300' },
};

export default function ContentPage() {
  const { articles, accounts, deleteArticle, appendLog } = useStore();
  const [keyword, setKeyword] = useState('');
  const [tab, setTab] = useState<'all' | ArticleStatus>('all');
  const [editing, setEditing] = useState<Article | null>(null);
  const [creating, setCreating] = useState(false);
  const [dispatching, setDispatching] = useState<Article | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Article | null>(null);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if (tab !== 'all' && a.status !== tab) return false;
      if (keyword && !a.title.includes(keyword)) return false;
      return true;
    });
  }, [articles, tab, keyword]);

  const handleDelete = (art: Article) => {
    deleteArticle(art.id);
    appendLog({
      action: '删除文章',
      target: art.title,
      operator: 'admin',
      status: 'success',
    });
    toast.success('文章已删除');
    setPendingDelete(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">内容管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            素材库 · 草稿 · 调度发布
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4 mr-1" /> 新建文章
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索标题"
            className="pl-9"
          />
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'all' | ArticleStatus)}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="draft">草稿</TabsTrigger>
            <TabsTrigger value="queued">待发布</TabsTrigger>
            <TabsTrigger value="published">已发布</TabsTrigger>
            <TabsTrigger value="failed">失败</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Tabs value={tab}>
        <TabsContent value={tab} className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((art) => {
              const owner = art.accountId
                ? accountMap.get(art.accountId)
                : undefined;
              const status = STATUS_LABEL[art.status];
              return (
                <Card key={art.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-medium leading-snug line-clamp-2">
                        {art.title}
                      </CardTitle>
                      <span
                        className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${status.cls}`}
                      >
                        {status.label}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-3 pt-0">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {art.summary}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        {owner ? `归属：${owner.name}` : '未归属账号'}
                      </span>
                      <span className="tabular-nums">
                        {art.status === 'published'
                          ? `${formatNumber(art.reads)} 阅读`
                          : art.publishedAt ??
                            art.scheduledAt ??
                            '-'}
                      </span>
                    </div>
                    {art.failReason && (
                      <div className="text-[11px] text-red-400 bg-red-500/10 rounded px-2 py-1">
                        {art.failReason}
                      </div>
                    )}
                    <div className="flex items-center gap-1 mt-auto pt-2 border-t border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setEditing(art)}
                      >
                        <Edit className="w-3.5 h-3.5 mr-1" /> 编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setDispatching(art)}
                      >
                        <Share2 className="w-3.5 h-3.5 mr-1" /> 分发
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-400 hover:text-red-300 ml-auto"
                        onClick={() => setPendingDelete(art)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
                没有匹配的文章
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ArticleEditDialog
        open={creating}
        onOpenChange={setCreating}
        article={null}
      />
      <ArticleEditDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        article={editing}
      />
      <DispatchDialog
        open={!!dispatching}
        onOpenChange={(o) => !o && setDispatching(null)}
        article={dispatching}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文章</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{pendingDelete?.title}」吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && handleDelete(pendingDelete)}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* placeholder export for Send icon usage (avoid unused) */}
      <span className="hidden">
        <Send />
      </span>
    </div>
  );
}
