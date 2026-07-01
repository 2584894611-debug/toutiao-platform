'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Fingerprint, Loader2 } from 'lucide-react';
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
import { useStore } from '@/lib/store';
import { FINGERPRINT_DATA } from '@/lib/anti-association-data';
import type { FingerprintRecord, FingerprintStatus } from '@/lib/types';

function similarity(a: FingerprintRecord, b: FingerprintRecord): number {
  if (a.accountId === b.accountId) return 1;
  const compareFields: (keyof FingerprintRecord)[] = [
    'userAgent',
    'resolution',
    'timezone',
    'language',
    'canvasHash',
    'webglHash',
  ];
  let score = 0;
  let total = 0;
  compareFields.forEach((f) => {
    total += 1;
    if (a[f] === b[f]) score += 1;
  });
  total += 2;
  if (Math.abs(a.fontsCount - b.fontsCount) <= 1) score += 1;
  if (Math.abs(a.pluginsCount - b.pluginsCount) <= 1) score += 1;
  return score / total;
}

function statusLabel(status: FingerprintStatus) {
  if (status === 'isolated')
    return { text: '独立', className: 'text-emerald-400' };
  if (status === 'similar')
    return { text: '疑似重复', className: 'text-amber-400' };
  return { text: '冲突', className: 'text-red-400' };
}

export function FingerprintLayer() {
  const { accounts } = useStore();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const accMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const matrix = useMemo(() => {
    return FINGERPRINT_DATA.map((row) =>
      FINGERPRINT_DATA.map((col) => similarity(row, col)),
    );
  }, []);

  const handleScan = async () => {
    setScanning(true);
    await new Promise((r) => setTimeout(r, 2000));
    setScanning(false);
    setScanned(true);
    const conflicts = FINGERPRINT_DATA.filter(
      (f) => f.status === 'conflict',
    ).length;
    toast.success(
      conflicts > 0
        ? `检测到 ${conflicts} 组指纹雷同`
        : '所有指纹环境彼此独立',
    );
  };

  const cellColor = (v: number) => {
    if (v >= 0.85) return 'bg-red-500/70';
    if (v >= 0.6) return 'bg-amber-500/60';
    if (v >= 0.35) return 'bg-emerald-500/30';
    return 'bg-emerald-500/10';
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">设备指纹环境</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Canvas / WebGL / UA / 屏幕 / 时区 多维度指纹比对
              </p>
            </div>
            <Button onClick={handleScan} disabled={scanning}>
              {scanning ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Fingerprint className="w-4 h-4 mr-1" />
              )}
              {scanning ? '碰撞检测中…' : '指纹碰撞检测'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>账号</TableHead>
                  <TableHead>环境 ID</TableHead>
                  <TableHead>UserAgent</TableHead>
                  <TableHead>分辨率</TableHead>
                  <TableHead>时区</TableHead>
                  <TableHead>语言</TableHead>
                  <TableHead>Canvas</TableHead>
                  <TableHead>WebGL</TableHead>
                  <TableHead>字体</TableHead>
                  <TableHead>插件</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {FINGERPRINT_DATA.map((r) => {
                  const acc = accMap.get(r.accountId);
                  const s = statusLabel(r.status);
                  return (
                    <TableRow key={r.accountId}>
                      <TableCell className="font-medium">
                        {acc?.name ?? r.accountId}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.envId}
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">
                        {r.userAgent}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.resolution}
                      </TableCell>
                      <TableCell className="text-xs">{r.timezone}</TableCell>
                      <TableCell className="text-xs">{r.language}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.canvasHash.slice(0, 8)}***
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.webglHash.slice(0, 8)}***
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.fontsCount}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.pluginsCount}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs ${s.className}`}>
                          ● {s.text}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">10×10 指纹相似度热力图</CardTitle>
          <p className="text-xs text-muted-foreground">
            绿 = 独立 ｜ 黄 = 相似 ｜ 红 = 雷同
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="inline-block">
              <div className="flex">
                <div className="w-20" />
                {FINGERPRINT_DATA.map((c) => (
                  <div
                    key={c.accountId}
                    className="w-10 text-[10px] text-muted-foreground text-center truncate"
                  >
                    {accMap.get(c.accountId)?.name.slice(-3) ?? ''}
                  </div>
                ))}
              </div>
              {FINGERPRINT_DATA.map((row, i) => (
                <div key={row.accountId} className="flex items-center">
                  <div className="w-20 text-[11px] text-muted-foreground truncate pr-2">
                    {accMap.get(row.accountId)?.name ?? row.accountId}
                  </div>
                  {matrix[i].map((v, j) => (
                    <div
                      key={j}
                      className={`w-10 h-8 m-[1px] rounded-sm ${cellColor(
                        v,
                      )} flex items-center justify-center text-[10px] text-white/80`}
                      title={`相似度 ${(v * 100).toFixed(0)}%`}
                    >
                      {(v * 100).toFixed(0)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {scanned && (
            <div className="mt-3 text-xs text-muted-foreground">
              热力图中两个方块若颜色为红色（除对角线外），代表两账号指纹高度雷同，建议立即更换浏览器环境。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
