'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  KeyRound,
  Loader2,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CATEGORY_LIST } from '@/lib/mock-data';
import { useStore } from '@/lib/store';
import type { Account, AccountCategory } from '@/lib/types';
import { CookieGuideDialog } from './cookie-guide-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  /** 打开时是否自动聚焦并滚动到 Cookie 区域 */
  focusCookie?: boolean;
}

const EMPTY: Omit<Account, 'id'> = {
  name: '',
  avatar: '新',
  category: '科技',
  loginStatus: 'offline',
  launchStatus: 'pending',
  city: '武汉',
  todayPublished: 0,
  todayLimit: 4,
  lastPublishAt: '-',
  totalReads: 0,
  totalFollowers: 0,
  totalLikes: 0,
  totalIncome: 0,
  cookie: '',
  phone: '',
  remark: '',
  cookieStatus: 'unverified',
};

type CookieStatus = NonNullable<Account['cookieStatus']>;

const COOKIE_BADGE: Record<
  CookieStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  unverified: {
    label: '未配置',
    className: 'border-muted-foreground/40 bg-muted/40 text-muted-foreground',
    icon: <ShieldAlert className="size-3" />,
  },
  verified: {
    label: '已验证',
    className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    icon: <CheckCircle2 className="size-3" />,
  },
  expired: {
    label: '已失效',
    className: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
    icon: <XCircle className="size-3" />,
  },
};

export function AccountEditDialog({
  open,
  onOpenChange,
  account,
  focusCookie,
}: Props) {
  const { upsertAccount, appendLog } = useStore();
  const [form, setForm] = useState<Omit<Account, 'id'>>(EMPTY);
  const [verifying, setVerifying] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const cookieRef = useRef<HTMLTextAreaElement | null>(null);
  const cookieCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (account) {
      const { id: _id, ...rest } = account;
      void _id;
      setForm({ cookieStatus: 'unverified', ...rest });
    } else {
      setForm(EMPTY);
    }
  }, [account, open]);

  // 打开时如果指定 focusCookie，自动滚动并聚焦到 Cookie 输入区
  useEffect(() => {
    if (open && focusCookie) {
      const t = setTimeout(() => {
        cookieCardRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
        cookieRef.current?.focus();
      }, 120);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, focusCookie]);

  const handleVerify = async () => {
    const cookie = form.cookie.trim();
    if (!cookie) {
      toast.error('请先粘贴 Cookie');
      return;
    }
    setVerifying(true);
    try {
      const r = await fetch('/api/accounts/verify-cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie }),
      });
      const data = (await r.json()) as {
        ok?: boolean;
        valid: boolean;
        account?: Partial<Account>;
        syncedFields?: string[];
        accountInfo?: { name?: string; avatar?: string };
        message: string;
        error?: string;
      };
      const success = data.ok ?? data.valid;
      if (success) {
        const patch: Partial<Account> = data.account ?? {};
        // 合并到 form 状态：服务端返回的字段优先生效
        setForm((f) => ({
          ...f,
          ...patch,
          name: patch.name || data.accountInfo?.name || f.name,
          avatar: patch.avatar || f.avatar || (patch.name ?? f.name).slice(0, 1),
          cookieStatus: 'verified',
          cookieVerifiedAt: patch.cookieVerifiedAt ?? new Date().toISOString(),
          loginStatus: 'online',
          dataSource: 'real',
        }));
        // 如果是编辑已有账号，立即把真实数据写回 store，让账号卡片实时刷新
        if (account) {
          const merged: Account = {
            ...account,
            ...form,
            ...patch,
            id: account.id,
            name: patch.name || data.accountInfo?.name || account.name,
            avatar:
              patch.avatar ||
              (patch.name || data.accountInfo?.name || account.name).slice(0, 1),
            cookie,
            cookieStatus: 'verified',
            cookieVerifiedAt: patch.cookieVerifiedAt ?? new Date().toISOString(),
            loginStatus: 'online',
            dataSource: 'real',
            lastSyncAt: patch.lastSyncAt ?? new Date().toISOString(),
          };
          upsertAccount(merged);
        }
        const synced = data.syncedFields ?? [];
        toast.success(
          synced.length > 0
            ? `验证成功，数据已同步（${synced.length} 项）`
            : '验证成功',
        );
      } else {
        // 只有服务端明确下发 cookieStatus='expired' 时才标记过期；
        // 网络异常 / 5xx / 超时 等错误**不要**覆盖原状态
        const serverSaysExpired = data.account?.cookieStatus === 'expired';
        if (serverSaysExpired) {
          setForm((f) => ({
            ...f,
            cookieStatus: 'expired',
            cookieVerifiedAt: new Date().toISOString(),
            loginStatus: 'expired',
          }));
        }
        console.warn(
          '[verify-cookie] failed',
          { serverSaysExpired, msg: data.error || data.message },
        );
        toast.error(data.error || data.message || 'Cookie 校验失败');
      }
    } catch (err) {
      toast.error(`校验失败：${err instanceof Error ? err.message : '网络异常'}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('请输入账号名');
      return;
    }
    const id = account?.id ?? `acc-${Date.now()}`;
    const avatar = form.avatar || form.name.slice(0, 1);
    const final: Account = { ...form, avatar, id };
    console.info(
      '[handleSave] saving account, cookie length=',
      final.cookie.length,
      'first10=',
      final.cookie.slice(0, 10),
      'last10=',
      final.cookie.slice(-10),
    );
    upsertAccount(final);
    appendLog({
      action: account ? '编辑账号' : '新增账号',
      target: final.name,
      operator: 'admin',
      status: 'success',
    });
    toast.success(account ? '账号已更新' : '账号已新增');
    onOpenChange(false);
  };

  const cookieStatus: CookieStatus = form.cookieStatus ?? 'unverified';
  const badge = COOKIE_BADGE[cookieStatus];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{account ? '编辑账号' : '新增账号'}</DialogTitle>
            <DialogDescription>
              {account
                ? '修改账号配置后将立即生效；绑定 Cookie 后可同步真实数据'
                : '填写头条号信息以纳入矩阵管理；建议同时绑定 Cookie 以同步真实数据'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* === Cookie 绑定卡（置顶强化） === */}
            <div
              ref={cookieCardRef}
              className="rounded-md border border-primary/40 bg-primary/[0.06] p-3 space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">
                    Cookie 绑定（必填）
                  </span>
                  <Badge
                    variant="outline"
                    className={`gap-1 px-1.5 py-0 text-[10px] ${badge.className}`}
                  >
                    {badge.icon}
                    {badge.label}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => setGuideOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                >
                  <HelpCircle className="size-3" />
                  查看图文教程
                </button>
              </div>

              {/* 警告条 */}
              <div className="flex items-start gap-2 rounded-sm border border-orange-500/30 bg-orange-500/10 px-2.5 py-1.5 text-[11px] text-orange-200">
                <AlertTriangle className="size-3.5 flex-none mt-0.5" />
                <span>
                  绑定 Cookie 后才能同步真实粉丝/阅读/收益数据；未绑定的账号将显示演示数据。
                </span>
              </div>

              {/* 输入 + 验证按钮 */}
              <div className="flex items-start gap-2">
                <Textarea
                  ref={cookieRef}
                  id="cookie"
                  value={form.cookie}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      cookie: e.target.value,
                      cookieStatus: 'unverified',
                    })
                  }
                  onBlur={(e) =>
                    console.info(
                      '[cookie-input] length=',
                      e.target.value.length,
                      'has-semicolons=',
                      (e.target.value.match(/;/g) ?? []).length,
                    )
                  }
                  placeholder="登录 mp.toutiao.com → F12 → Network → 复制完整 Cookie 字符串粘贴至此..."
                  className="h-24 font-mono text-xs flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0"
                  disabled={verifying || !form.cookie.trim()}
                  onClick={handleVerify}
                >
                  {verifying ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      验证中...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-3" />
                      验证 Cookie
                    </>
                  )}
                </Button>
              </div>

              {/* 折叠帮助：默认展开第一步 */}
              <details className="group" open={!form.cookie.trim()}>
                <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground select-none">
                  <span className="inline-flex items-center gap-1">
                    <HelpCircle className="size-3" />
                    快速指引（点击展开 7 步详解）
                  </span>
                </summary>
                <ol className="mt-2 space-y-1 text-[11px] text-muted-foreground list-decimal list-inside leading-relaxed">
                  <li>在 Chrome/Edge 浏览器中访问 mp.toutiao.com 并登录账号</li>
                  <li>按 F12 打开开发者工具，切换到「Network」标签</li>
                  <li>刷新页面，点击第一个请求（profile_v4 或 index）</li>
                  <li>
                    在「Request Headers」中找到 <code className="text-primary">Cookie</code>{' '}
                    字段，复制完整值
                  </li>
                  <li>粘贴到上方输入框，点击「验证 Cookie」</li>
                  <li>验证成功后账号名将自动回填</li>
                  <li>Cookie 仅存于本地浏览器，绝不上传服务端</li>
                </ol>
              </details>

              {form.cookieVerifiedAt && (
                <div className="text-[11px] text-muted-foreground">
                  上次验证：{new Date(form.cookieVerifiedAt).toLocaleString('zh-CN')}
                </div>
              )}
            </div>

            {/* === 基础信息 === */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">账号名 *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：HAO科技"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="avatar">头像字符</Label>
                <Input
                  id="avatar"
                  maxLength={2}
                  value={form.avatar}
                  onChange={(e) => setForm({ ...form, avatar: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>分类</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm({ ...form, category: v as AccountCategory })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_LIST.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">绑定手机号</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="138****1024"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="limit">每日发文上限</Label>
                <Input
                  id="limit"
                  type="number"
                  min={1}
                  max={20}
                  value={form.todayLimit}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      todayLimit: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>登录状态</Label>
                <Select
                  value={form.loginStatus}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      loginStatus: v as Account['loginStatus'],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">已登录</SelectItem>
                    <SelectItem value="expired">Cookie 过期</SelectItem>
                    <SelectItem value="offline">未登录</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="remark">备注</Label>
              <Input
                id="remark"
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CookieGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  );
}
