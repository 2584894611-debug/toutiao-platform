import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import { Toaster } from '@/components/ui/sonner';
import { AppShell } from '@/components/layout/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '头条矩阵号统一管理后台',
    template: '%s | 头条矩阵号管理后台',
  },
  description:
    '一站式管理多个今日头条账号：账号、IP代理、内容发布、数据看板统一调度。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        {isDev && <Inspector />}
        <AppShell>{children}</AppShell>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
