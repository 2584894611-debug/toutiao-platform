'use client';

import { Bell, Search, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';

export function Topbar() {
  const { accounts, proxies } = useStore();

  const offlineCount = accounts.filter(
    (a) => a.loginStatus !== 'online',
  ).length;
  const proxyAlarm = proxies.filter((p) => p.health !== 'green').length;
  const notifyCount = offlineCount + proxyAlarm;

  return (
    <header className="h-14 shrink-0 flex items-center gap-4 px-4 md:px-6 border-b border-border bg-card/40 backdrop-blur">
      {/* 搜索 */}
      <div className="flex-1 max-w-xl relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="全局搜索账号 / 文章 / 代理…"
          className="pl-9 h-9 bg-background/60 border-border"
        />
      </div>

      <div className="flex items-center gap-2">
        {/* 通知 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9"
              aria-label="通知"
            >
              <Bell className="w-4 h-4" />
              {notifyCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
                  {notifyCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="px-4 py-3 border-b border-border">
              <div className="text-sm font-medium">系统通知</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                共 {notifyCount} 条待处理
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {offlineCount > 0 && (
                <div className="px-4 py-3 text-sm">
                  <div className="font-medium text-foreground">
                    账号登录异常
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {offlineCount} 个账号处于离线或 Cookie 过期状态
                  </div>
                </div>
              )}
              {proxyAlarm > 0 && (
                <div className="px-4 py-3 text-sm">
                  <div className="font-medium text-foreground">
                    代理健康异常
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {proxyAlarm} 个代理处于警告或故障状态
                  </div>
                </div>
              )}
              {notifyCount === 0 && (
                <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                  暂无新通知
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* 用户 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 gap-2 px-2"
              aria-label="用户菜单"
            >
              <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <span className="hidden sm:inline text-sm">运营总监</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>账户</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>个人资料</DropdownMenuItem>
            <DropdownMenuItem>偏好设置</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>退出登录</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
