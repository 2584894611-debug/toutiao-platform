import { NextRequest, NextResponse } from 'next/server';
import {
  ToutiaoApiError,
  toNumber,
  toutiaoGet,
  tsToIso,
} from '@/lib/server/toutiao-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface FetchArticlesBody {
  cookie?: string;
  /** 1-based 页码（前端友好）；底层会换算为 0-based page_num */
  page?: number;
  size?: number;
}

interface NormalizedArticle {
  id: string;
  title: string;
  abstract: string;
  cover?: string;
  type: 'weitoutiao' | 'article' | 'video' | 'unknown';
  createTime: string;
  readCount: number;
  commentCount: number;
  diggCount: number;
  status?: string;
}

interface FetchArticlesResponse {
  success: boolean;
  page?: number;
  size?: number;
  articles?: NormalizedArticle[];
  message: string;
}

interface RawArticleAttr {
  title?: string;
  abstract?: string;
  create_time?: number | string;
  article_type?: string;
  cover_image?: string;
  gid?: string | number;
  item_id?: string | number;
  status?: string;
}

interface RawContentItem {
  article_attr?: RawArticleAttr;
  article_type?: string;
  stat?: {
    read_count?: number | string;
    comment_count?: number | string;
    digg_count?: number | string;
  };
  read_count?: number | string;
  comment_count?: number | string;
  digg_count?: number | string;
  /** 兜底字段：极少数旧接口直接用扁平结构 */
  title?: string;
  abstract?: string;
}

interface ContentListEnvelope {
  // contents 在 envelope **根级别**
  contents?: RawContentItem[];
  has_more?: boolean;
  total?: number | string;
}

function mapType(t?: string): NormalizedArticle['type'] {
  if (!t) return 'unknown';
  if (t === 'weitoutiao' || t.includes('微头条')) return 'weitoutiao';
  if (t.includes('video') || t.includes('视频')) return 'video';
  if (t.includes('article') || t.includes('文章')) return 'article';
  return 'unknown';
}

/**
 * GET /mp/agw/creator_center/list/v2?page_num=N&page_size=M
 *
 * 注意：
 * - 是 **GET**（早期用 POST 的代码返回空）
 * - contents 在 envelope **根级别**，不是 data.contents
 * - article_attr.create_time 是 Unix 秒级时间戳
 */
export async function POST(
  req: NextRequest,
): Promise<NextResponse<FetchArticlesResponse>> {
  let body: FetchArticlesBody;
  try {
    body = (await req.json()) as FetchArticlesBody;
  } catch {
    return NextResponse.json(
      { success: false, message: '请求体格式错误，必须是 JSON' },
      { status: 400 },
    );
  }

  const cookie = (body.cookie ?? '').trim();
  if (!cookie) {
    return NextResponse.json(
      { success: false, message: '缺少 cookie 字段' },
      { status: 400 },
    );
  }

  const page = Math.max(1, toNumber(body.page, 1));
  const size = Math.min(50, Math.max(1, toNumber(body.size, 10)));
  const pageNum = page - 1; // 上游 0-based

  try {
    const envelope = await toutiaoGet<unknown>(
      `/mp/agw/creator_center/list/v2?page_num=${pageNum}&page_size=${size}`,
      cookie,
    );
    const raw = (envelope as unknown as ContentListEnvelope).contents ?? [];

    const articles: NormalizedArticle[] = raw.map((item, idx) => {
      const attr = item.article_attr ?? {};
      const idCandidate =
        attr.item_id ?? attr.gid ?? `${pageNum}-${idx}-${Date.now()}`;
      return {
        id: String(idCandidate),
        title: attr.title || item.title || '无标题',
        abstract: attr.abstract || item.abstract || '',
        cover: attr.cover_image,
        type: mapType(item.article_type ?? attr.article_type),
        createTime: tsToIso(attr.create_time),
        readCount: toNumber(item.stat?.read_count ?? item.read_count),
        commentCount: toNumber(item.stat?.comment_count ?? item.comment_count),
        diggCount: toNumber(item.stat?.digg_count ?? item.digg_count),
        status: attr.status,
      };
    });

    return NextResponse.json({
      success: true,
      page,
      size,
      articles,
      message: articles.length
        ? `已获取 ${articles.length} 篇内容`
        : '该页暂无内容',
    });
  } catch (err) {
    if (err instanceof ToutiaoApiError) {
      return NextResponse.json({
        success: false,
        message:
          err.kind === 'auth'
            ? 'Cookie 已过期，请重新获取'
            : err.kind === 'network'
              ? `网络异常：${err.message}`
              : `拉取失败：${err.message}`,
      });
    }
    return NextResponse.json({
      success: false,
      message: `拉取失败：${err instanceof Error ? err.message : '未知错误'}`,
    });
  }
}
