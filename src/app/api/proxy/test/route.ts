import { NextRequest, NextResponse } from 'next/server';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ProxyTestBody {
  proxyHost?: string;
  proxyPort?: number | string;
  proxyUser?: string;
  proxyPass?: string;
  proxyType?: 'http' | 'https' | 'socks5';
}

interface ProxyTestResponse {
  success: boolean;
  ip?: string;
  latency?: number;
  message: string;
}

interface HttpbinIpResponse {
  origin?: string;
}

const TIMEOUT_MS = 7_000;

export async function POST(
  req: NextRequest,
): Promise<NextResponse<ProxyTestResponse>> {
  let body: ProxyTestBody;
  try {
    body = (await req.json()) as ProxyTestBody;
  } catch {
    return NextResponse.json(
      { success: false, message: '请求体格式错误，必须是 JSON' },
      { status: 400 },
    );
  }

  const host = (body.proxyHost ?? '').trim();
  const port = Number(body.proxyPort);
  const type = (body.proxyType ?? 'http').toLowerCase();

  if (!host) {
    return NextResponse.json({
      success: false,
      message: '请填写代理地址',
    });
  }
  if (!port || port < 1 || port > 65535) {
    return NextResponse.json({
      success: false,
      message: '代理端口非法（应在 1-65535 之间）',
    });
  }

  if (type === 'socks5') {
    return NextResponse.json({
      success: false,
      message:
        'SOCKS5 代理需要额外驱动，当前服务端仅支持 HTTP/HTTPS 代理测试；可在本地完成连通性测试后再绑定。',
    });
  }

  const scheme = type === 'https' ? 'https' : 'http';
  const auth =
    body.proxyUser && body.proxyPass
      ? `${encodeURIComponent(body.proxyUser)}:${encodeURIComponent(body.proxyPass)}@`
      : '';
  const proxyUri = `${scheme}://${auth}${host}:${port}`;

  let agent: ProxyAgent;
  try {
    agent = new ProxyAgent({ uri: proxyUri, requestTls: { rejectUnauthorized: false } });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: `代理配置非法：${err instanceof Error ? err.message : '未知错误'}`,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const start = Date.now();
  try {
    const r = await undiciFetch('https://httpbin.org/ip', {
      method: 'GET',
      dispatcher: agent,
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
    const latency = Date.now() - start;
    if (!r.ok) {
      return NextResponse.json({
        success: false,
        latency,
        message: `代理返回 HTTP ${r.status}，疑似无效或被封禁`,
      });
    }
    const payload = (await r.json()) as HttpbinIpResponse;
    const ip = (payload.origin ?? '').split(',')[0]?.trim();
    if (!ip) {
      return NextResponse.json({
        success: false,
        latency,
        message: '代理响应未携带出口 IP，疑似异常',
      });
    }
    return NextResponse.json({
      success: true,
      ip,
      latency,
      message: '代理连通正常',
    });
  } catch (err) {
    const latency = Date.now() - start;
    const aborted = err instanceof Error && err.name === 'AbortError';
    const msg = aborted
      ? `连接超时（${TIMEOUT_MS / 1000}s）`
      : err instanceof Error
        ? err.message
        : '未知错误';
    return NextResponse.json({
      success: false,
      latency,
      message: `测试失败：${msg}`,
    });
  } finally {
    clearTimeout(timer);
    void agent.close().catch(() => {});
  }
}
