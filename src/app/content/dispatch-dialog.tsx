'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useStore } from '@/lib/store';
import type { Article } from '@/lib/types';
import { CategoryBadge } from '@/components/common/category-badge';
import { StatusDot } from '@/components/common/status-dot';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: Article | null;
}

export function DispatchDialog({ open, onOpenChange, article }: Props) {
  const { accounts, upsertArticle, appendLog } = useStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduledAt, setScheduledAt] = useState('');
  const [diffRewrite, setDiffRewrite] = useState(true);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setScheduledAt('');
      setDiffRewrite(true);
    }
  }, [open]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDispatch = () => {
    if (!article) return;
    if (selected.size === 0) {
      toast.error('请至少选择一个账号');
      return;
    }
    const targets = accounts.filter((a) => selected.has(a.id));
    targets.forEach((acc, idx) => {
      const newId = `${article.id}-dispatch-${acc.id}-${Date.now()}-${idx}`;
      upsertArticle({
        ...article,
        id: newId,
        accountId: acc.id,
        title: diffRewrite
          ? `${article.title}（${acc.category}号视角）`
          : article.title,
        status: 'queued',
        scheduledAt: scheduledAt || undefined,
        reads: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        failReason: undefined,
        publishedAt: undefined,
      });
    });
    appendLog({
      action: '一键分发',
      target: `${article.title} → ${targets.length} 个账号`,
      operator: 'admin',
      status: 'success',
      detail: diffRewrite ? '差异化改写已应用' : '未启用差异化',
    });
    toast.success(`已分发到 ${targets.length} 个账号的发布队列`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>一键分发</DialogTitle>
          <DialogDescription>
            将「{article?.title}」分发到多个矩阵账号
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>选择目标账号</Label>
            <div className="border border-border rounded-md max-h-72 overflow-y-auto divide-y divide-border">
              {accounts.map((acc) => {
                const checked = selected.has(acc.id);
                const color =
                  acc.loginStatus === 'online'
                    ? 'green'
                    : acc.loginStatus === 'expired'
                      ? 'yellow'
                      : 'red';
                return (
                  <label
                    key={acc.id}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(acc.id)}
                    />
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="text-sm truncate">{acc.name}</span>
                      <CategoryBadge category={acc.category} />
                    </div>
                    <StatusDot color={color} />
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {acc.todayPublished}/{acc.todayLimit}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="text-xs text-muted-foreground">
              已选 {selected.size} / {accounts.length}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-time">发布时间（可选）</Label>
              <Input
                id="d-time"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>差异化改写</Label>
              <div className="flex items-center gap-2 h-9 px-3 rounded border border-border">
                <Switch
                  checked={diffRewrite}
                  onCheckedChange={setDiffRewrite}
                />
                <span className="text-xs text-muted-foreground">
                  {diffRewrite ? '按账号分类自动改写标题' : '保持原标题'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleDispatch}>立即分发</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
