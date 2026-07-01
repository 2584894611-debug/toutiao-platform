'use client';

import { useEffect, useState } from 'react';
import { Loader2, Wifi } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStore } from '@/lib/store';
import type { Proxy, ProxyType } from '@/lib/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proxy: Proxy | null;
}

const EMPTY: Omit<Proxy, 'id'> = {
  name: '',
  type: 'HTTPS',
  host: '',
  port: 8443,
  username: '',
  password: '',
  bindCity: '',
  health: 'green',
};

interface ProxyTestResult {
  success: boolean;
  ip?: string;
  latency?: number;
  region?: string;
  message: string;
}

export function ProxyEditDialog({ open, onOpenChange, proxy }: Props) {
  const { upsertProxy, appendLog } = useStore();
  const [form, setForm] = useState<Omit<Proxy, 'id'>>(EMPTY);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProxyTestResult | null>(null);

  useEffect(() => {
    if (proxy) {
      const { id: _id, ...rest } = proxy;
      void _id;
      setForm(rest);
    } else {
      setForm(EMPTY);
    }
    setTestResult(null);
  }, [proxy, open]);

  const callTestApi = async (): Promise<ProxyTestResult> => {
    const res = await fetch('/api/proxy/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proxyHost: form.host,
        proxyPort: form.port,
        proxyUser: form.username,
        proxyPass: form.password,
        proxyType: form.type === 'SOCKS5' ? 'socks5' : 'http',
      }),
    });
    return (await res.json()) as ProxyTestResult;
  };

  const handleTestOnly = async () => {
    if (!form.host.trim()) {
      toast.error('请先填写代理地址');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await callTestApi();
      setTestResult(result);
      if (result.success) {
        toast.success(`代理连通成功，出口 IP ${result.ip}`);
      } else {
        toast.error(`代理测试失败：${result.message}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '网络异常';
      setTestResult({ success: false, message: msg });
      toast.error(`代理测试异常：${msg}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (alsoTest: boolean) => {
    if (!form.name.trim() || !form.host.trim()) {
      toast.error('请填写代理名称和地址');
      return;
    }
    const id = proxy?.id ?? `proxy-${Date.now()}`;
    let finalProxy: Proxy = { ...form, id };

    if (alsoTest) {
      setTesting(true);
      try {
        const result = await callTestApi();
        setTestResult(result);
        finalProxy = {
          ...finalProxy,
          health: result.success
            ? (result.latency ?? 0) < 100
              ? 'green'
              : (result.latency ?? 0) < 250
                ? 'yellow'
                : 'red'
            : 'red',
          latencyMs: result.latency,
          realExitIp: result.ip ?? finalProxy.realExitIp,
          exitRegion: result.region ?? finalProxy.exitRegion,
          lastTestedAt: new Date()
            .toLocaleString('zh-CN', { hour12: false })
            .replace(/\//g, '-'),
        };
        if (result.success) {
          toast.success(`代理连通成功，出口 IP ${result.ip}`);
        } else {
          toast.error(`代理测试失败：${result.message}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '网络异常';
        setTestResult({ success: false, message: msg });
        toast.error(`代理测试异常：${msg}`);
        finalProxy = { ...finalProxy, health: 'red' };
      } finally {
        setTesting(false);
      }
    }

    upsertProxy(finalProxy);
    appendLog({
      action: proxy ? '编辑代理' : '新增代理',
      target: finalProxy.name,
      operator: 'admin',
      status: 'success',
    });
    toast.success(proxy ? '代理已更新' : '代理已新增');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{proxy ? '编辑代理' : '新增代理'}</DialogTitle>
          <DialogDescription>
            支持 HTTP / HTTPS / SOCKS5 三种代理协议，保存并测试将真实从服务端发起连通性请求
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">代理名称 *</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
                placeholder="例如：北京-电信-01"
              />
            </div>
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm({ ...form, type: v as ProxyType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HTTP">HTTP</SelectItem>
                  <SelectItem value="HTTPS">HTTPS</SelectItem>
                  <SelectItem value="SOCKS5">SOCKS5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="p-host">代理地址 *</Label>
              <Input
                id="p-host"
                value={form.host}
                onChange={(e) =>
                  setForm({ ...form, host: e.target.value })
                }
                placeholder="111.62.34.18"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-port">端口</Label>
              <Input
                id="p-port"
                type="number"
                value={form.port}
                onChange={(e) =>
                  setForm({ ...form, port: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-user">账号（可选）</Label>
              <Input
                id="p-user"
                value={form.username ?? ''}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-pwd">密码（可选）</Label>
              <Input
                id="p-pwd"
                type="password"
                value={form.password ?? ''}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-city">绑定城市</Label>
            <Input
              id="p-city"
              value={form.bindCity}
              onChange={(e) =>
                setForm({ ...form, bindCity: e.target.value })
              }
              placeholder="例如：北京"
            />
          </div>
          {/* 测试结果展示区 */}
          <div className="rounded-md border border-border bg-card/50 p-3 text-xs">
            {testing ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                正在通过代理请求外部探测节点……
              </div>
            ) : testResult ? (
              testResult.success ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Wifi className="size-3.5" />
                    连通成功
                  </div>
                  <div className="text-muted-foreground">
                    出口 IP：
                    <span className="text-foreground">{testResult.ip}</span>
                    {testResult.region ? ` · ${testResult.region}` : ''}
                    {' · 延迟 '}
                    <span className="text-foreground">
                      {testResult.latency} ms
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-rose-400">
                  <div>连通失败</div>
                  <div className="text-muted-foreground">
                    {testResult.message}
                  </div>
                </div>
              )
            ) : (
              <div className="text-muted-foreground">
                点击「测试代理」即时从服务端通过该代理探测出口 IP 与延迟
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={handleTestOnly}
            disabled={testing}
          >
            {testing ? (
              <>
                <Loader2 className="mr-1 size-3.5 animate-spin" />
                测试中
              </>
            ) : (
              '测试代理'
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave(true)}
            disabled={testing}
          >
            保存并测试
          </Button>
          <Button onClick={() => handleSave(false)} disabled={testing}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
