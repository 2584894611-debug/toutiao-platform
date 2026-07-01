/**
 * 轻量 Markdown → HTML 转换器（服务端 / 客户端通用）。
 * 仅支持头条号常用语法：标题 / 段落 / 加粗 / 斜体 / 删除线 / 行内代码 / 引用 /
 * 列表 / 链接 / 图片 / 分割线 / 代码块。
 * 不依赖第三方依赖，避免运行时膨胀。
 */

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** 单行内联转换：加粗 / 斜体 / 删除线 / 行内代码 / 链接 / 图片。 */
function renderInline(raw: string): string {
  let s = escapeHtml(raw);
  // 图片优先于链接：![alt](src)
  s = s.replace(
    /!\[([^\]]*)\]\(([^\s)]+)\)/g,
    (_m, alt: string, src: string) =>
      `<img src="${src}" alt="${alt}" style="max-width:100%;" />`,
  );
  // 链接 [text](href)
  s = s.replace(
    /\[([^\]]+)\]\(([^\s)]+)\)/g,
    (_m, text: string, href: string) =>
      `<a href="${href}" target="_blank" rel="noopener">${text}</a>`,
  );
  // 加粗 **x**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体 *x*
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  // 删除线 ~~x~~
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  // 行内代码 `x`
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

export function markdownToHtml(md: string): string {
  if (!md) return '';
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length) {
      out.push(`<p>${renderInline(paraBuf.join(' '))}</p>`);
      paraBuf = [];
    }
  };
  const flushList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;

    // 代码块围栏
    if (/^```/.test(line)) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        flushPara();
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // 空行：段落 / 列表分隔
    if (/^\s*$/.test(line)) {
      flushPara();
      flushList();
      continue;
    }

    // 分割线
    if (/^\s*---+\s*$/.test(line)) {
      flushPara();
      flushList();
      out.push('<hr />');
      continue;
    }

    // 标题 #~######
    const h = /^(#{1,6})\s+(.+)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      continue;
    }

    // 引用
    const bq = /^\s*>\s?(.*)$/.exec(line);
    if (bq) {
      flushPara();
      flushList();
      out.push(`<blockquote>${renderInline(bq[1])}</blockquote>`);
      continue;
    }

    // 无序列表
    const ul = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (ul) {
      flushPara();
      if (listType !== 'ul') {
        flushList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${renderInline(ul[1])}</li>`);
      continue;
    }

    // 有序列表
    const ol = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      flushPara();
      if (listType !== 'ol') {
        flushList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${renderInline(ol[1])}</li>`);
      continue;
    }

    // 普通段落（连续行合并）
    if (listType) flushList();
    paraBuf.push(line.trim());
  }

  if (inCode) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  }
  flushPara();
  flushList();

  return out.join('\n');
}
