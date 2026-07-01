'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Network,
  PlayCircle,
  Upload,
  Download,
  Trash2,
  Edit,
  Activity,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { StatusDot, type StatusColor } from '@/components/common/status-dot';
import { useStore } from '@/lib/store';
import type { Proxy, ProxyHealth } from '@/lib/types';
import { ProxyEditDialog } from './proxy-edit-dialog';

const HEALTH_MAP: Record<ProxyHealth, { color: StatusColor; label: string }> = {
  green: { color: 'green', label: '连通正常' },
  yellow: { color: 'yellow', label: '延迟较高' },
  red: { color: 'red', label: '故障/断连' },
};

export default function ProxiesPage() {
  const {
    proxies,
    accounts,
    testProxy,
    testAllProxies,
    deleteProxy,
    bindProxyToAccount,
    appendLog,
  } = useStore();
  const [editing, setEditing] = useState<Proxy | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Proxy | null>(null);

  const healthSummary = {
    green: proxies.filter((p) => p.health === 'green').length,
    yellow: proxies.filter((p) => p.health === 'yellow').length,
    red: proxies.filter((p) => p.health === 'red').length,
  };

  const handleTestAll = () => {
    testAllProxies();
    appendLog({
      action: '批量测试代理',
      target: `共 ${proxies.length} 个代理`,
      operator: 'admin',
      status: 'success',
    });
    toast.success('已重新检测全部代理');
  };

  const handleTest = (p: Proxy) => {
    testProxy(p.id);
    toast.success(`已测试代理「${p.name}」`);
  };

  const handleDelete = (p: Proxy) => {
    deleteProxy(p.id);
    appendLog({
      action: '删除代理',
      target: p.name,
      operator: 'admin',
      status: 'success',
    });
    toast.success(`已删除代理「${p.name}」`);
    setPendingDelete(null);
  };

  const handleExport = () => {
    const json = JSON.stringify(proxies, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proxies-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('代理配置已导出');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" /> IP 代理隔离
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            为每个账号配置独立出口 IP，避免账号关联风险
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" /> 导出
          </Button>
          <Button variant="outline" disabled>
            <Upload className="w-4 h-4 mr-1" /> 导入
          </Button>
          <Button variant="outline" onClick={handleTestAll}>
            <Activity className="w-4 h-4 mr-1" /> 一键测试
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> 新增代理
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard
          color="green"
          label="健康"
          count={healthSummary.green}
        />
        <SummaryCard
          color="yellow"
          label="警告"
          count={healthSummary.yellow}
        />
        <SummaryCard color="red" label="故障" count={healthSummary.red} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">代理池 ({proxies.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>地址</TableHead>
                <TableHead>绑定城市</TableHead>
                <TableHead>真实出口 IP</TableHead>
                <TableHead>延迟</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>绑定账号</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proxies.map((p) => {
                const health = HEALTH_MAP[p.health];
                const boundAcc = accounts.find(
                  (a) => a.id === p.boundAccountId,
                );
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted">
                        {p.type}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.host}:{p.port}
                    </TableCell>
                    <TableCell>{p.bindCity}</TableCell>
                    <TableCell className="text-xs">
                      {p.realExitIp ? (
                        <div>
                          <div className="font-mono">{p.realExitIp}</div>
                          <div className="text-muted-foreground">
                            {p.exitRegion}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-xs">
                      {p.latencyMs ? `${p.latencyMs}ms` : '-'}
                    </TableCell>
                    <TableCell>
                      <StatusDot color={health.color} label={health.label} />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={p.boundAccountId ?? '__none__'}
                        onValueChange={(v) => {
                          bindProxyToAccount(
                            p.id,
                            v === '__none__' ? undefined : v,
                          );
                          toast.success(
                            v === '__none__'
                              ? '已解绑'
                              : `已绑定到「${
                                  accounts.find((a) => a.id === v)?.name
                                }」`,
                          );
                        }}
                      >
                        <SelectTrigger className="w-36 h-7 text-xs">
                          <SelectValue placeholder="未绑定" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">未绑定</SelectItem>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {boundAcc && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {boundAcc.category}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleTest(p)}
                          aria-label="测试"
                        >
                          <PlayCircle className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditing(p)}
                          aria-label="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-300"
                          onClick={() => setPendingDelete(p)}
                          aria-label="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {proxies.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-muted-foreground py-8"
                  >
                    暂无代理配置
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ProxyEditDialog
        open={creating}
        onOpenChange={setCreating}
        proxy={null}
      />
      <ProxyEditDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        proxy={editing}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除代理</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除代理「{pendingDelete?.name}」吗？关联账号将被解绑。
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

function SummaryCard({
  color,
  label,
  count,
}: {
  color: StatusColor;
  label: string;
  count: number;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{count}</div>
        </div>
        <StatusDot color={color} />
      </CardContent>
    </Card>
  );
}
