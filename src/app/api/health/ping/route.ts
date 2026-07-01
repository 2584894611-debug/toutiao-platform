/**
 * 极简连通性检查：只返回 ok + 时间戳，不做任何外部 IO。
 * 用于排查 health/chromium hang 时确认 node 服务本身是否健康。
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET() {
  return NextResponse.json({
    ok: true,
    time: Date.now(),
    iso: new Date().toISOString(),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
  });
}
