'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ShieldAlert, ScanSearch, Loader2 } from 'lucide-react';
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
import { IDENTITY_DATA } from '@/lib/anti-association-data';
import type { IdentityRecord } from '@/lib/types';

interface Collision {
  type: '手机号同号段' | '银行卡同 BIN' | '身份证后四位重复';
  keys: string;
  accounts: string[];
}

function detectCollisions(records: IdentityRecord[]): {
  collisions: Collision[];
  riskyIds: Set<string>;
} {
  const phonePrefixMap = new Map<string, string[]>();
  const binMap = new Map<string, string[]>();
  const idMap = new Map<string, string[]>();

  records.forEach((r) => {
    const prefix = r.phoneMask.slice(0, 3);
    if (prefix === '170' || prefix === '171') {
      const arr = phonePrefixMap.get(prefix) ?? [];
      arr.push(r.accountId);
      phonePrefixMap.set(prefix, arr);
    }
    if (r.bankCardBin && r.bankCardBin !== '------') {
      const arr = binMap.get(r.bankCardBin) ?? [];
      arr.push(r.accountId);
      binMap.set(r.bankCardBin, arr);
    }
    if (r.idCardTail && r.idCardTail !== '----') {
      const arr = idMap.get(r.idCardTail) ?? [];
      arr.push(r.accountId);
      idMap.set(r.idCardTail, arr);
    }
  });

  const collisions: Collision[] = [];
  phonePrefixMap.forEach((arr, prefix) => {
    if (arr.length > 1) {
      collisions.push({
        type: '手机号同号段',
        keys: `${prefix}xxxx`,
        accounts: arr,
      });
    }
  });
  binMap.forEach((arr, bin) => {
    if (arr.length > 1) {
      collisions.push({ type: '银行卡同 BIN', keys: bin, accounts: arr });
    }
  });
  idMap.forEach((arr, tail) => {
    if (arr.length > 1) {
      collisions.push({
        type: '身份证后四位重复',
        keys: tail,
        accounts: arr,
      });
    }
  });

  const riskyIds = new Set<string>(
    collisions.flatMap((c) => c.accounts),
  );
  return { collisions, riskyIds };
}

export function AccountLayer() {
  const { accounts } = useStore();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const accMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );

  const { collisions, riskyIds } = useMemo(
    () => detectCollisions(IDENTITY_DATA),
    [],
  );

  const handleScan = async () => {
    setScanning(true);
    await new Promise((r) => setTimeout(r, 1800));
    setScanning(false);
    setScanned(true);
    toast.success(
      collisions.length > 0
        ? `检测到 ${collisions.length} 处账号层关联风险`
        : '未发现账号层关联风险',
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">账号层实名信息</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                共 {IDENTITY_DATA.length} 条 · 扫描身份证 / 手机号 / 银行卡 BIN
                关联
              </p>
            </div>
            <Button onClick={handleScan} disabled={scanning}>
              {scanning ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <ScanSearch className="w-4 h-4 mr-1" />
              )}
              {scanning ? '检测中…' : '一键检测关联'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>账号</TableHead>
                  <TableHead>实名</TableHead>
                  <TableHead>身份证</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>银行卡</TableHead>
                  <TableHead>注册邮箱</TableHead>
                  <TableHead>注册时间</TableHead>
                  <TableHead>风险</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {IDENTITY_DATA.map((r) => {
                  const acc = accMap.get(r.accountId);
                  const risky = scanned && riskyIds.has(r.accountId);
                  return (
                    <TableRow
                      key={r.accountId}
                      className={risky ? 'bg-red-500/5' : undefined}
                    >
                      <TableCell className="font-medium">
                        {acc?.name ?? r.accountId}
                      </TableCell>
                      <TableCell>
                        {r.realNameVerified ? (
                          <span className="text-emerald-400 text-xs">
                            已认证
                          </span>
                        ) : (
                          <span className="text-amber-400 text-xs">
                            未认证
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        ****{r.idCardTail}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.phoneMask}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.bankCardBin}··{r.bankCardTail}
                      </TableCell>
                      <TableCell className="text-xs">{r.email}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.registerAt}
                      </TableCell>
                      <TableCell>
                        {risky ? (
                          <span className="text-xs text-red-400 font-medium">
                            ● 命中关联
                          </span>
                        ) : scanned ? (
                          <span className="text-xs text-emerald-400">
                            ● 独立
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            待检测
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {scanned && (
        <Card className="border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" /> 风险提示（
              {collisions.length}）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {collisions.length === 0 && (
              <div className="text-sm text-muted-foreground">
                本次扫描未发现账号层关联风险
              </div>
            )}
            {collisions.map((c, idx) => (
              <div
                key={idx}
                className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2"
              >
                <div className="text-sm font-medium text-red-300">
                  {c.type} · {c.keys}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  涉及账号：
                  {c.accounts
                    .map((id) => accMap.get(id)?.name ?? id)
                    .join('、')}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
