'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Edit,
  Filter,
  Link2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { CategoryBadge } from '@/components/common/category-badge';
import { StatusDot } from '@/components/common/status-dot';
import { useStore } from '@/lib/store';
import { CATEGORY_LIST } from '@/lib/mock-data';
import type { Account, AccountCategory, LoginStatus } from '@/lib/types';
import { formatNumber } from '@/lib/utils';
import { AccountEditDialog } from './account-edit-dialog';

const STATUS_LABEL: Record<LoginStatus, { label: string; color: 'green' | 'red' | 'yellow' }> = {
  online: { label: '已登录', color: 'green' },
  expired: { label: 'Cookie 过期', color: 'yellow' },
  offline: { label: '未登录', color: 'red' },
};

export default function AccountsPage() {
  const { accounts, deleteAccount, appendLog, upsertAccount } = useStore();
  const [reverifyingId, setReverifyingId] = useState<string | null>(null);

  // 距今多久（中文）
  function timeAgoCN(iso?: string): string {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (diffSec < 60) return `${diffSec} 秒前`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
    return `${Math.floor(diffSec / 86400)} 天前`;
  }

  // 直接调 verify-cookie 接口，不打开编辑 dialog
  async function quickReverify(acc: Account) {
    if (!acc.cookie?.trim()) {
      toast.error('该账号尚未绑定 Cookie');
      return;
    }
    setReverifyingId(acc.id);
    const pendingId = toast.loading(`正在重新验证「${acc.name}」…`);
    try {
      const r = await fetch('/api/accounts/verify-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie: acc.cookie }),
      });
      const data = (await r.json()) as {
        ok?: boolean;
        valid?: boolean;
        account?: Partial<Account>;
        syncedFields?: string[];
        message?: string;
        error?: string;
      };
      toast.dismiss(pendingId);
      if (data.ok && data.valid) {
        upsertAccount({
          ...acc,
          ...(data.account ?? {}),
          cookie: acc.cookie,
          dataSource: 'real',
          lastSyncAt:
            data.account?.lastSyncAt ?? new Date().toISOString(),
        });
        const fields = data.syncedFields?.length
          ? `（已同步：${data.syncedFields.join('、')}）`
          : '';
        toast.success(`${acc.name} 验证成功${fields}`);
      } else if (data.account?.cookieStatus === 'expired') {
        upsertAccount({
          ...acc,
          cookieStatus: 'expired',
          loginStatus: 'expired',
          cookieVerifiedAt: new Date().toISOString(),
        });
        toast.error(data.error ?? 'Cookie 已失效，请重新粘贴');
      } else {
        // 网络/服务器错误，不动 cookieStatus
        toast.error(data.error ?? data.message ?? '验证失败（网络或服务器异常）');
      }
    } catch (e) {
      toast.dismiss(pendingId);
      toast.error(
        `验证异常：${e instanceof Error ? e.message : '未知错误'}`,
      );
    } finally {
      setReverifyingId(null);
    }
  }
  const [keyword, setKeyword] = useState('');
  const [filterCategory, setFilterCategory] = useState<
    'all' | AccountCategory
  >('all');
  const [editing, setEditing] = useState<Account | null>(null);
  const [focusCookie, setFocusCookie] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);

  const openEditCookie = (acc: Account) => {
    setFocusCookie(true);
    setEditing(acc);
  };
  const openEditNormal = (acc: Account) => {
    setFocusCookie(false);
    setEditing(acc);
  };

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (filterCategory !== 'all' && a.category !== filterCategory)
        return false;
      if (
        keyword &&
        !a.name.toLowerCase().includes(keyword.toLowerCase()) &&
        !a.phone.includes(keyword)
      )
        return false;
      return true;
    });
  }, [accounts, keyword, filterCategory]);

  const handleDelete = (acc: Account) => {
    deleteAccount(acc.id);
    appendLog({
      action: '删除账号',
      target: acc.name,
      operator: 'admin',
      status: 'success',
    });
    toast.success(`已删除账号「${acc.name}」`);
    setPendingDelete(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">账号管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 {accounts.length} 个矩阵账号
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-4 h-4 mr-1" /> 新增账号
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索账号名 / 手机号"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select
            value={filterCategory}
            onValueChange={(v) =>
              setFilterCategory(v as 'all' | AccountCategory)
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              {CATEGORY_LIST.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((acc) => {
          const status = STATUS_LABEL[acc.loginStatus];
          const progress =
            acc.todayLimit > 0
              ? (acc.todayPublished / acc.todayLimit) * 100
              : 0;
          return (
            <Card key={acc.id} className="overflow-hidden group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="w-10 h-10">
                      <AvatarFallback className="bg-primary/15 text-primary">
                        {acc.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <Link
                        href={`/accounts/${acc.id}`}
                        className="text-sm font-medium hover:text-primary truncate block"
                      >
                        {acc.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <CategoryBadge category={acc.category} />
                        <StatusDot
                          color={status.color}
                          label={status.label}
                        />
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="操作"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditNormal(acc)}>
                        <Edit className="w-4 h-4 mr-2" /> 编辑
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-400"
                        onClick={() => setPendingDelete(acc)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> 删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-1">
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      今日发文 {acc.todayPublished}/{acc.todayLimit}
                    </span>
                    <span className="tabular-nums">
                      {progress.toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={progress} className="mt-1.5 h-1.5" />
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">累计阅读</div>
                    <div className="text-sm font-semibold tabular-nums mt-0.5">
                      {formatNumber(acc.totalReads)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">粉丝</div>
                    <div className="text-sm font-semibold tabular-nums mt-0.5">
                      {formatNumber(acc.totalFollowers)}
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-0 pb-3">
                <div className="flex w-full items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">最近发文 {acc.lastPublishAt}</span>
                  {acc.cookieStatus === 'verified' ? (
                    <div className="flex items-center gap-1">
                      <span className="text-emerald-300 truncate">
                        Cookie 已验证 · {timeAgoCN(acc.cookieVerifiedAt) || '刚刚'}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={reverifyingId === acc.id}
                        className="h-6 px-2 text-[11px] text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10"
                        onClick={() => quickReverify(acc)}
                      >
                        <RefreshCw
                          className={`size-3 ${reverifyingId === acc.id ? 'animate-spin' : ''}`}
                        />
                        重新验证
                      </Button>
                    </div>
                  ) : acc.cookieStatus === 'expired' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={reverifyingId === acc.id}
                      className="h-6 px-2 text-[11px] border-rose-500/50 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200"
                      onClick={() => quickReverify(acc)}
                    >
                      <RefreshCw
                        className={`size-3 ${reverifyingId === acc.id ? 'animate-spin' : ''}`}
                      />
                      {reverifyingId === acc.id ? '验证中…' : 'Cookie 已过期，重新验证'}
                    </Button>
                  ) : acc.cookie?.trim() ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={reverifyingId === acc.id}
                      className="h-6 px-2 text-[11px] border-primary/50 text-primary hover:bg-primary/10"
                      onClick={() => quickReverify(acc)}
                    >
                      <RefreshCw
                        className={`size-3 ${reverifyingId === acc.id ? 'animate-spin' : ''}`}
                      />
                      {reverifyingId === acc.id ? '验证中…' : '验证 Cookie'}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px] border-primary/60 bg-primary/10 text-primary hover:bg-primary/20"
                      onClick={() => openEditCookie(acc)}
                    >
                      <Link2 className="size-3" />
                      绑定 Cookie
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
            没有匹配的账号
          </div>
        )}
      </div>

      <AccountEditDialog
        open={creating}
        onOpenChange={setCreating}
        account={null}
        focusCookie={focusCookie}
      />
      <AccountEditDialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setFocusCookie(false);
          }
        }}
        account={editing}
        focusCookie={focusCookie}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除账号</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除账号「{pendingDelete?.name}」吗？该操作不可撤销。
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
    </div>
  );
}
