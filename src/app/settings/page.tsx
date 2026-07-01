'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Shield,
  Clock,
  ScrollText,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useStore } from '@/lib/store';

export default function SettingsPage() {
  const { accounts, upsertAccount, logs, resetAll } = useStore();
  const [windowStart, setWindowStart] = useState('08:00');
  const [windowEnd, setWindowEnd] = useState('22:00');

  const handleLimitChange = (id: string, val: number) => {
    const acc = accounts.find((a) => a.id === id);
    if (!acc) return;
    upsertAccount({ ...acc, todayLimit: val });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">系统设置</h1>
        <p className="text-sm text-muted-foreground mt-1">
          防关联配置 · 发文频率 · 操作日志
        </p>
      </div>

      <Tabs defaultValue="anti">
        <TabsList>
          <TabsTrigger value="anti">
            <Shield className="w-4 h-4 mr-1" /> 防关联
          </TabsTrigger>
          <TabsTrigger value="freq">
            <Clock className="w-4 h-4 mr-1" /> 发文频率
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText className="w-4 h-4 mr-1" /> 操作日志
          </TabsTrigger>
          <TabsTrigger value="danger">
            <AlertTriangle className="w-4 h-4 mr-1" /> 系统维护
          </TabsTrigger>
        </TabsList>

        {/* 防关联 */}
        <TabsContent value="anti" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">指纹浏览器配置指引</CardTitle>
              <CardDescription>
                建议为每个账号配置独立的浏览器指纹环境，配合 IP 代理共同实现防关联。
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-3 text-muted-foreground">
              <Step
                num="1"
                title="独立浏览器环境"
                desc="推荐使用 AdsPower、紫鸟、比特浏览器等指纹浏览器，为每个头条号建立单独 Profile。"
              />
              <Step
                num="2"
                title="IP 与 Profile 一一绑定"
                desc="在「IP 代理」模块为每个 Profile 绑定固定出口 IP，避免共享出口被风控。"
              />
              <Step
                num="3"
                title="Cookie 隔离与续期"
                desc="每个账号的 Cookie 在本系统中独立保存，过期时会在通知中心提醒。"
              />
              <Step
                num="4"
                title="操作节奏控制"
                desc="同一台机器不要在短时间内频繁切换账号，建议至少间隔 5 分钟。"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">设备指纹建议参数</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>维度</TableHead>
                    <TableHead>建议</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>User-Agent</TableCell>
                    <TableCell className="text-muted-foreground">
                      每账号独立 UA，避免重复
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>时区 / 语言</TableCell>
                    <TableCell className="text-muted-foreground">
                      与代理出口归属地保持一致
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Canvas / WebGL</TableCell>
                    <TableCell className="text-muted-foreground">
                      指纹浏览器默认开启随机化
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>分辨率</TableCell>
                    <TableCell className="text-muted-foreground">
                      使用主流分辨率，避免极端值
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 发文频率 */}
        <TabsContent value="freq" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">全局发文时间段</CardTitle>
              <CardDescription>
                调度器仅在以下时间段内执行自动发布
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">从</span>
                <Input
                  type="time"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                  className="w-28"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">到</span>
                <Input
                  type="time"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                  className="w-28"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => toast.success('全局时间段已保存')}
              >
                保存
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">单账号每日发文上限</CardTitle>
              <CardDescription>
                单击数字直接修改，建议每个账号不超过 5 篇/日
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>账号</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>今日已发</TableHead>
                    <TableHead className="w-32">上限</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.category}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {a.todayPublished}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={a.todayLimit}
                          onChange={(e) =>
                            handleLimitChange(
                              a.id,
                              Number(e.target.value) || 0,
                            )
                          }
                          className="h-7 w-20"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 操作日志 */}
        <TabsContent value="logs" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                操作日志（最近 {logs.length} 条）
              </CardTitle>
              <CardDescription>
                所有发布、登录、代理切换、配置变更操作均会记录在此
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead>对象</TableHead>
                    <TableHead>操作人</TableHead>
                    <TableHead>结果</TableHead>
                    <TableHead>备注</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {l.time}
                      </TableCell>
                      <TableCell>{l.action}</TableCell>
                      <TableCell className="text-xs">{l.target}</TableCell>
                      <TableCell className="text-xs">{l.operator}</TableCell>
                      <TableCell>
                        <span
                          className={
                            l.status === 'success'
                              ? 'text-emerald-400 text-xs'
                              : 'text-red-400 text-xs'
                          }
                        >
                          {l.status === 'success' ? '成功' : '失败'}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.detail ?? '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-8"
                      >
                        暂无日志
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Danger Zone */}
        <TabsContent value="danger" className="mt-4 space-y-4">
          <Card className="border-red-500/30">
            <CardHeader>
              <CardTitle className="text-base text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> 重置所有本地数据
              </CardTitle>
              <CardDescription>
                清空 localStorage 中保存的账号、文章、代理、日志等数据，重新加载初始演示数据。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <RefreshCw className="w-4 h-4 mr-1" /> 重置数据
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认重置？</AlertDialogTitle>
                    <AlertDialogDescription>
                      所有本地修改将被清空，初始演示数据会重新加载。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        resetAll();
                        toast.success('数据已重置');
                      }}
                    >
                      确认重置
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Step({
  num,
  title,
  desc,
}: {
  num: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">
        {num}
      </div>
      <div className="flex-1">
        <div className="text-sm text-foreground">{title}</div>
        <div className="text-xs mt-0.5">{desc}</div>
      </div>
    </div>
  );
}
