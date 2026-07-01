'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Network,
  ShieldCheck,
  FileText,
  ListChecks,
  RefreshCw,
  Settings,
  Flame,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/lib/store';

const NAV_ITEMS = [
  { href: '/', label: '数据看板', icon: LayoutDashboard },
  { href: '/accounts', label: '账号管理', icon: Users },
  { href: '/proxies', label: 'IP 代理', icon: Network },
  { href: '/anti-association', label: '账号安全检测', icon: ShieldCheck },
  { href: '/content', label: '内容管理', icon: FileText },
  { href: '/queue', label: '发布队列', icon: ListChecks },
  { href: '/sync', label: '数据同步', icon: RefreshCw },
  { href: '/settings', label: '系统设置', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { accounts } = useStore();
  const unbound = accounts.filter(
    (a) => a.cookieStatus !== 'verified',
  ).length;

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 h-14 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary text-primary-foreground">
          <Flame className="w-5 h-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">头条矩阵</span>
          <span className="text-[10px] text-muted-foreground">
            Matrix Console
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          const showBadge = item.href === '/accounts' && unbound > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60',
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-primary" />
              )}
              <Icon className="w-4 h-4" />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span
                  className="ml-auto inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums"
                  title={`${unbound} 个账号待绑定 Cookie`}
                >
                  {unbound}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-sidebar-border text-[11px] text-muted-foreground">
        v1.0 · 私有部署
      </div>
    </aside>
  );
}
