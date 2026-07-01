import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface UploadResponse {
  success: boolean;
  url?: string;
  filename?: string;
  size?: number;
  type?: string;
  /** true = 走 base64 内嵌方案，前端可直接写到 Markdown 中 */
  dataUrl?: boolean;
  message: string;
}

const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function extOf(type: string): string {
  switch (type) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
}

function genFilename(type: string): string {
  const ts = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  return `${ts}-${rand}.${extOf(type)}`;
}

function toDataUrl(buf: Buffer, type: string): string {
  return `data:${type};base64,${buf.toString('base64')}`;
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse<UploadResponse>> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, message: '请求体必须是 multipart/form-data' },
      { status: 400 },
    );
  }

  const file = form.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { success: false, message: '未在表单中找到 file 字段' },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      {
        success: false,
        message: `不支持的文件类型 ${file.type || '未知'}，仅支持 PNG / JPG / GIF / WebP / SVG`,
      },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        success: false,
        message: `图片过大（${(file.size / 1024 / 1024).toFixed(2)}MB），上限 5MB`,
      },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const filename = genFilename(file.type);

  // 生产环境磁盘只读，直接走 dataURL 兜底，避免无意义的 mkdir 报错
  const isProd = process.env.COZE_PROJECT_ENV === 'PROD';
  if (isProd) {
    console.log(`[upload] PROD 模式直接 dataURL：${filename} (${file.size}B, ${file.type})`);
    return NextResponse.json({
      success: true,
      url: toDataUrl(buf, file.type),
      filename,
      size: file.size,
      type: file.type,
      dataUrl: true,
      message: 'PROD 环境直接 dataURL',
    });
  }

  // 开发环境优先写入 public/uploads，失败则回落到 base64 内嵌
  try {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buf);
    console.log(`[upload] 写盘成功：/uploads/${filename} (${file.size}B)`);
    return NextResponse.json({
      success: true,
      url: `/uploads/${filename}`,
      filename,
      size: file.size,
      type: file.type,
      dataUrl: false,
      message: '上传成功',
    });
  } catch (err) {
    // 只读目录场景：回落到 base64 内嵌
    const message =
      err instanceof Error ? err.message : '未知错误';
    console.warn(`[upload] 写盘失败，回落 dataURL：${message}`);
    return NextResponse.json({
      success: true,
      url: toDataUrl(buf, file.type),
      filename,
      size: file.size,
      type: file.type,
      dataUrl: true,
      message: `磁盘写入失败（${message}），已回落到 base64 内嵌`,
    });
  }
}
