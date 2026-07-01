'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS: Array<{ title: string; desc: string }> = [
  {
    title: '步骤 1 · 打开独立浏览器环境',
    desc:
      '推荐使用指纹浏览器为该账号开启专属环境，避免与其它账号共享 Cookie，从源头隔离风险。',
  },
  {
    title: '步骤 2 · 登录头条号后台',
    desc:
      '访问 https://mp.toutiao.com，使用绑定该账号的手机号或扫码完成登录，确保进入「创作者中心」首页。',
  },
  {
    title: '步骤 3 · 打开开发者工具',
    desc:
      '在该页面按 F12（macOS：Option+Command+I），切换到 Network（网络）面板，再 Ctrl+R 刷新一次页面。',
  },
  {
    title: '步骤 4 · 复制完整 Cookie',
    desc:
      '在请求列表中点击任意一条 mp.toutiao.com 的请求 → 在 Request Headers 中找到 Cookie 字段 → 右键 → Copy value，复制完整字符串（通常超过 200 字符）。',
  },
  {
    title: '步骤 5 · 粘贴到管理后台',
    desc:
      '回到本系统的「账号编辑」弹窗，将复制到的 Cookie 粘贴到 Cookie 文本框，点击「验证 Cookie」按钮，系统将在服务端发起一次校验。',
  },
];

export function CookieGuideDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>如何获取头条号 Cookie</DialogTitle>
          <DialogDescription>
            按下面 5 个步骤操作，全程约 2 分钟。Cookie 通常可用数天至数周，失效后重新执行即可。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <ol className="space-y-3">
            {STEPS.map((s, idx) => (
              <li
                key={s.title}
                className="rounded-lg border border-border bg-card/40 p-3"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-semibold text-primary tabular-nums">
                    0{idx + 1}
                  </span>
                  <span className="text-sm font-medium">{s.title}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {s.desc}
                </p>
              </li>
            ))}
          </ol>

          <Alert className="mt-4 border-amber-500/30 bg-amber-500/10 text-amber-100">
            <AlertTitle className="text-xs font-semibold">安全提示</AlertTitle>
            <AlertDescription className="text-xs leading-relaxed">
              Cookie 等同账号的临时密码，请妥善保管。本系统仅在浏览器本地 localStorage 中存储，并在每次同步时通过服务端代理发送至头条号接口，不会做任何持久化存储或泄露。
            </AlertDescription>
          </Alert>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            我已了解
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
