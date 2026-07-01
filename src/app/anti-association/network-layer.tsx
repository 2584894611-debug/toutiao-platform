'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Globe2, Loader2, MapPin } from 'lucide-react';
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
import { NETWORK_DATA } from '@/lib/anti-association-data';
import type { IpType } from '@/lib/types';

function ipTypeLabel(t: IpType) {
  if (t === 'residential')
    return { text: '住宅 IP', className: 'text-emerald-400' };
  if (t === 'mobile')
    return { text: '移动 IP', className: 'text-amber-400' };
  return { text: '机房 IP', className: 'text-red-400' };
}

export function NetworkLayer() {
  const { accounts } = useStore();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const accMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  /** 出口 IP 重复检测（排除 "-"） */
  const ipDuplicateMap = useMemo(() => {
    const m = new Map<string, string[]>();
    NETWORK_DATA.forEach((r) => {
      if (r.exitIp === '-') return;
      const arr = m.get(r.exitIp) ?? [];
      arr.push(r.accountId);
      m.set(r.exitIp, arr);
    });
    return m;
  }, []);

  /** C 段（前 3 段相同）关联检测 */
  const cSegmentMap = useMemo(() => {
    const m = new Map<string, string[]>();
    NETWORK_DATA.forEach((r) => {
      if (r.exitIp === '-') return;
      const seg = r.exitIp.split('.').slice(0, 3).join('.');
      const arr = m.get(seg) ?? [];
      arr.push(r.accountId);
      m.set(seg, arr);
    });
    return m;
  }, []);

  /** 同城市检测（基于 region 第一段） */
  const cityMap = useMemo(() => {
    const m = new Map<string, string[]>();
    NETWORK_DATA.forEach((r) => {
      if (r.region === '-') return;
      const city = r.region.split('·')[0].trim();
      const arr = m.get(city) ?? [];
      arr.push(r.accountId);
      m.set(city, arr);
    });
    return m;
  }, []);

  const ipDupAccounts = useMemo(() => {
    const s = new Set<string>();
    ipDuplicateMap.forEach((arr) => {
      if (arr.length > 1) arr.forEach((id) => s.add(id));
    });
    return s;
  }, [ipDuplicateMap]);

  const cDupAccounts = useMemo(() => {
    const s = new Set<string>();
    cSegmentMap.forEach((arr) => {
      if (arr.length > 1) arr.forEach((id) => s.add(id));
    });
    return s;
  }, [cSegmentMap]);

  const handleScan = async () => {
    setScanning(true);
    await new Promise((r) => setTimeout(r, 2200));
    setScanning(false);
    setScanned(true);
    const issues =
      ipDupAccounts.size +
      NETWORK_DATA.filter(
        (r) => r.ipType === 'datacenter' || r.dnsLeaked || r.webrtcLeaked,
      ).length;
    toast.success(`检测完成，共 ${issues} 项网络风险点`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">出口 IP / DNS / WebRTC</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                检测出口 IP 类型、DNS 泄漏、WebRTC 泄漏 与 C 段关联
              </p>
            </div>
            <Button onClick={handleScan} disabled={scanning}>
              {scanning ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Globe2 className="w-4 h-4 mr-1" />
              )}
              {scanning ? '检测中…' : '全量 IP 检测'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>账号</TableHead>
                  <TableHead>代理类型</TableHead>
                  <TableHead>出口 IP</TableHead>
                  <TableHead>归属地</TableHead>
                  <TableHead>IP 类型</TableHead>
                  <TableHead>DNS</TableHead>
                  <TableHead>WebRTC</TableHead>
                  <TableHead>历史切换</TableHead>
                  <TableHead>最近检测</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {NETWORK_DATA.map((r) => {
                  const acc = accMap.get(r.accountId);
                  const t = ipTypeLabel(r.ipType);
                  const ipDup = scanned && ipDupAccounts.has(r.accountId);
                  return (
                    <TableRow
                      key={r.accountId}
                      className={ipDup ? 'bg-red-500/5' : undefined}
                    >
                      <TableCell className="font-medium">
                        {acc?.name ?? r.accountId}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.proxyType}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.exitIp}
                        {ipDup && (
                          <span className="ml-1 text-red-400">●</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{r.region}</TableCell>
                      <TableCell>
                        <span className={`text-xs ${t.className}`}>
                          ● {t.text}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.dnsLeaked ? (
                          <span className="text-xs text-red-400">
                            泄漏 · {r.dns}
                          </span>
                        ) : r.dns === '-' ? (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-400">
                            正常
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.webrtcLeaked ? (
                          <span className="text-xs text-red-400">泄漏</span>
                        ) : (
                          <span className="text-xs text-emerald-400">
                            屏蔽
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.ipHistory.slice(0, 3).join(' / ') || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.lastTestedAt}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">IP 重合 & C 段关联</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...ipDuplicateMap.entries()]
              .filter(([, v]) => v.length > 1)
              .map(([ip, arr]) => (
                <div
                  key={ip}
                  className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2"
                >
                  <div className="text-sm font-medium text-red-300">
                    出口 IP 重合：{ip}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    涉及账号：
                    {arr.map((id) => accMap.get(id)?.name ?? id).join('、')}
                  </div>
                </div>
              ))}
            {[...cSegmentMap.entries()]
              .filter(([, v]) => v.length > 1)
              .map(([seg, arr]) => (
                <div
                  key={seg}
                  className="rounded border border-amber-500/20 bg-amber-500/5 px-3 py-2"
                >
                  <div className="text-sm font-medium text-amber-300">
                    C 段关联：{seg}.0/24
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    涉及账号：
                    {arr.map((id) => accMap.get(id)?.name ?? id).join('、')}
                  </div>
                </div>
              ))}
            {ipDupAccounts.size === 0 && cDupAccounts.size === 0 && (
              <div className="text-sm text-muted-foreground">
                未发现 IP 重合或 C 段关联
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">IP 地理分布</CardTitle>
            <p className="text-xs text-muted-foreground">
              10 个账号出口城市概览（简化地图）
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border bg-card/50 p-3">
              <div className="aspect-[5/3] relative bg-[radial-gradient(circle_at_50%_50%,oklch(0.25_0.01_60),oklch(0.18_0.01_60))] rounded overflow-hidden">
                {NETWORK_DATA.filter((r) => r.region !== '-').map((r, i) => {
                  const city = r.region.split('·')[0].trim();
                  const dup = (cityMap.get(city)?.length ?? 1) > 1;
                  // 用 hash 简单铺位置
                  let hash = 0;
                  for (let c = 0; c < city.length; c++) {
                    hash = (hash * 31 + city.charCodeAt(c)) % 1000;
                  }
                  const x = 10 + ((hash + i * 7) % 80);
                  const y = 12 + ((hash * 13 + i * 5) % 72);
                  return (
                    <div
                      key={r.accountId}
                      className="absolute flex flex-col items-center"
                      style={{ left: `${x}%`, top: `${y}%` }}
                    >
                      <MapPin
                        className={`w-4 h-4 ${
                          dup ? 'text-red-400' : 'text-primary'
                        }`}
                      />
                      <div
                        className={`text-[10px] mt-0.5 px-1 rounded ${
                          dup
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-background/60 text-muted-foreground'
                        }`}
                      >
                        {city}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              红色定位表示同一城市存在多个账号，存在地理位置关联风险
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
