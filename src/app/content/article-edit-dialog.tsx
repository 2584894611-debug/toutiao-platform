'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ImageIcon,
  ImagesIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  UploadIcon,
  XIcon,
  PlusIcon,
  MapPinIcon,
  CircleDollarSignIcon,
  RocketIcon,
  FolderIcon,
  Share2Icon,
  ShieldCheckIcon,
  HelpCircleIcon,
  ArrowUpIcon,
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  QuoteIcon,
  CodeIcon,
  LinkIcon,
  LibraryIcon,
  ClockIcon,
  Trash2Icon,
} from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useStore } from '@/lib/store';
import type { Article, ArticleStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

/* ---------- helpers ---------- */

const LOGIN_STATUS_LABEL = {
  online: '已登录',
  offline: '未登录',
  expired: '已过期',
} as const;

const COLLECTIONS = [
  { id: 'col-tech', name: '科技前沿' },
  { id: 'col-ai', name: 'AI 观察' },
  { id: 'col-digital', name: '数码测评' },
  { id: 'col-robot', name: '机器人产业' },
  { id: 'col-life', name: '生活随笔' },
  { id: 'col-food', name: '美食养生' },
];

const LOCATION_OPTIONS = [
  '北京', '上海', '广州', '深圳', '武汉', '成都', '杭州', '南京', '长沙', '其他',
];

const DECLARATIONS = [
  { key: 'net_source', label: '取材网络' },
  { key: 'cite_internal', label: '引用站内' },
  { key: 'personal_view', label: '个人观点，仅供参考' },
  { key: 'ai_generated', label: '引用AI', tip: '部分内容由AI辅助生成或改写' },
  { key: 'fiction', label: '虚构演绎，故事经历', tip: '内容为虚构演绎，非真实事件' },
  { key: 'investment', label: '投资观点，仅供参考' },
  { key: 'health', label: '健康医疗分享，仅供参考' },
];

/**
 * 安全图片 src 白名单：http(s) / 同源相对路径 / data:image dataURL。
 * 其它情况返回空字符串，react-markdown 会渲染成不带 src 的 img，不会执行任何 javascript: 协议。
 */
function safeImgSrc(src: string | undefined): string {
  if (!src) return '';
  if (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('/') ||
    src.startsWith('data:image/')
  ) {
    return src;
  }
  return '';
}

/** 正文 / 预览统一渲染：react-markdown + remark-gfm，img 不被 sanitize，支持 dataURL */
function MarkdownView({ md }: { md: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      // 关闭默认 url transform：放行 data:image / http(s) / 同源路径
      urlTransform={(url) => url}
      components={{
        h1: (props) => <h1 className="text-base font-semibold mt-2 mb-1" {...props} />,
        h2: (props) => <h2 className="text-base font-semibold mt-2 mb-1" {...props} />,
        h3: (props) => <h3 className="text-sm font-semibold mt-2 mb-1" {...props} />,
        p: (props) => <p className="my-1" {...props} />,
        ul: (props) => <ul className="list-disc ml-5 my-1" {...props} />,
        ol: (props) => <ol className="list-decimal ml-5 my-1" {...props} />,
        blockquote: (props) => (
          <blockquote
            className="border-l-2 border-[var(--primary)] pl-3 text-zinc-400 my-1"
            {...props}
          />
        ),
        code: (props) => (
          <code
            className="px-1 py-0.5 rounded bg-zinc-800 text-orange-400 text-xs"
            {...props}
          />
        ),
        a: ({ href, children, ...rest }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-orange-400 underline"
            {...rest}
          >
            {children}
          </a>
        ),
        // 图片：dataURL / URL 都正常显示，img 不被过滤
        img: ({ src, alt }) => {
          const safe = safeImgSrc(typeof src === 'string' ? src : undefined);
          if (!safe) return null;
          // eslint-disable-next-line @next/next/no-img-element
          return (
            <img
              src={safe}
              alt={alt ?? ''}
              loading="lazy"
              className="rounded-md border border-zinc-700 max-w-full my-2"
            />
          );
        },
      }}
    >
      {md}
    </ReactMarkdown>
  );
}

/** 合法图片地址：HTTP(S) / 同源相对路径 / data:image dataURL */
function isValidImageUrl(u: unknown): u is string {
  if (typeof u !== 'string' || u.length === 0) return false;
  return (
    u.startsWith('http://') ||
    u.startsWith('https://') ||
    u.startsWith('/') ||
    u.startsWith('data:image/')
  );
}

/** File → 完整 dataURL（带 data:image/xxx;base64, 前缀），FileReader 兜底用 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === 'string' && r.startsWith('data:image/')) {
        resolve(r);
      } else {
        reject(new Error('FileReader 未返回有效 dataURL'));
      }
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

/** 把多张图片地址转成 Markdown 片段，并保证语法严格 */
function buildImageMarkdown(urls: string[]): string {
  return urls
    .filter(isValidImageUrl)
    .map((u) => `![图片](${u})`)
    .join('\n');
}

const EMPTY_ARTICLE: Omit<Article, 'id'> = {
  title: '',
  content: '',
  summary: '',
  accountId: '',
  status: 'draft',
  scheduledAt: undefined,
  publishedAt: undefined,
  reads: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  coverMode: 'single',
  coverImages: [],
  location: '',
  adEnabled: true,
  isFirstPublish: false,
  collections: [],
  crossPostWeitoutiao: true,
  declarations: [],
};

/* ---------- main component ---------- */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  article?: Article | null;
}

export function ArticleEditDialog({ open, onOpenChange, article }: Props) {
  const { upsertArticle, patchArticle, accounts, appendLog } = useStore();
  const [form, setForm] = useState<Omit<Article, 'id'>>(EMPTY_ARTICLE);
  const [editMode, setEditMode] = useState<'edit' | 'split' | 'preview'>('split');
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [coverUploading, setCoverUploading] = useState<number | null>(null);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (open) {
      setForm(article ? { ...EMPTY_ARTICLE, ...article } : { ...EMPTY_ARTICLE });
      setEditMode('split');
    }
  }, [open, article]);

  const charCount = useMemo(() => form.content.length, [form.content]);

  /* ---- content helpers ---- */
  const wrapSelection = useCallback(
    (before: string, after: string) => {
      const ta = contentRef.current;
      if (!ta) return;
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      const sel = form.content.slice(s, e);
      const next = form.content.slice(0, s) + before + sel + after + form.content.slice(e);
      setForm({ ...form, content: next });
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = s + before.length;
        ta.selectionEnd = s + before.length + sel.length;
      });
    },
    [form],
  );

  const prefixLine = useCallback(
    (prefix: string) => {
      const ta = contentRef.current;
      if (!ta) return;
      const s = ta.selectionStart;
      const before = form.content.slice(0, s);
      const lineStart = before.lastIndexOf('\n') + 1;
      const next =
        form.content.slice(0, lineStart) + prefix + form.content.slice(lineStart);
      setForm({ ...form, content: next });
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = s + prefix.length;
      });
    },
    [form],
  );

  /* ---- image upload ---- */
  /**
   * 上传单个图片，按 [服务端上传 → FileReader base64 兜底] 顺序尝试。
   * 返回合法 url（http/https/相对路径/dataURL）或 null（已 toast）。
   */
  const uploadOne = useCallback(async (file: File): Promise<string | null> => {
    if (!file.type.startsWith('image/')) {
      toast.error(`图片插入失败：不支持的类型 ${file.type || '未知'}`);
      return null;
    }
    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) {
      toast.error(
        `图片插入失败：图片过大（${(file.size / 1024 / 1024).toFixed(2)}MB），上限 5MB`,
      );
      return null;
    }

    // 1) 优先走服务端 /api/upload
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (res.ok) {
        const json = (await res.json()) as {
          success?: boolean;
          url?: string;
          message?: string;
        };
        if (json?.success && isValidImageUrl(json.url)) {
          return json.url;
        }
      }
    } catch {
      /* 走 base64 兜底 */
    }

    // 2) 客户端 FileReader 兜底（输出完整 dataURL）
    try {
      const dataUrl = await fileToDataUrl(file);
      if (isValidImageUrl(dataUrl)) return dataUrl;
    } catch {
      /* fallthrough */
    }
    toast.error('图片插入失败：服务端上传与本地转换均失败');
    return null;
  }, []);

  const uploadFiles = useCallback(
    async (files: FileList | File[]): Promise<string[]> => {
      setUploading(true);
      const urls: string[] = [];
      try {
        for (const file of Array.from(files)) {
          const u = await uploadOne(file);
          if (u) urls.push(u);
        }
      } finally {
        setUploading(false);
      }
      return urls;
    },
    [uploadOne],
  );

  const insertAtCursor = useCallback((text: string) => {
    const ta = contentRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const end = ta.selectionEnd;
    // 用函数式更新避免闭包过期 + 用 setTimeout 0 在 React 提交 DOM 后再定位光标
    setForm((prev) => ({
      ...prev,
      content: prev.content.slice(0, pos) + text + prev.content.slice(end),
    }));
    setTimeout(() => {
      const cur = contentRef.current;
      if (!cur) return;
      cur.focus();
      const newPos = pos + text.length;
      cur.setSelectionRange(newPos, newPos);
    }, 0);
  }, []);

  const handleInsertImage = useCallback(async () => {
    fileInputRef.current?.click();
  }, []);

  const onImageFilesSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;
      const urls = await uploadFiles(files);
      const md = buildImageMarkdown(urls);
      if (md) {
        insertAtCursor('\n' + md + '\n');
        toast.success(
          urls.length === 1
            ? '图片插入成功'
            : `已插入 ${urls.length} 张图片`,
        );
      }
      e.target.value = '';
    },
    [uploadFiles, insertAtCursor],
  );

  /* ---- cover upload ---- */
  const handleCoverFile = useCallback(
    async (idx: number, e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setCoverUploading(idx);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const json = await res.json();
        if (json.success) {
          const newImages = [...form.coverImages];
          newImages[idx] = json.url;
          setForm({ ...form, coverImages: newImages });
        } else {
          toast.error(`封面上传失败: ${json.message}`);
        }
      } finally {
        setCoverUploading(null);
        e.target.value = '';
      }
    },
    [form],
  );

  const removeCover = useCallback(
    (idx: number) => {
      const newImages = [...form.coverImages];
      newImages.splice(idx, 1);
      setForm({ ...form, coverImages: newImages });
    },
    [form],
  );

  /* ---- paste / drop ---- */
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length) {
        e.preventDefault();
        const urls = await uploadFiles(imageFiles);
        const md = buildImageMarkdown(urls);
        if (md) {
          insertAtCursor('\n' + md + '\n');
          toast.success(
            urls.length === 1
              ? '图片插入成功'
              : `已插入 ${urls.length} 张图片`,
          );
        }
      }
    },
    [uploadFiles, insertAtCursor],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (imageFiles.length) {
        const urls = await uploadFiles(imageFiles);
        const md = buildImageMarkdown(urls);
        if (md) {
          insertAtCursor('\n' + md + '\n');
          toast.success(
            urls.length === 1
              ? '图片插入成功'
              : `已插入 ${urls.length} 张图片`,
          );
        }
      }
    },
    [uploadFiles, insertAtCursor],
  );

  /* ---- keyboard ---- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        wrapSelection('**', '**');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        wrapSelection('*', '*');
      }
    },
    [wrapSelection],
  );

  /* ---- declarations ---- */
  const toggleDeclaration = useCallback(
    (key: string) => {
      const has = form.declarations.includes(key);
      setForm({
        ...form,
        declarations: has
          ? form.declarations.filter((d) => d !== key)
          : [...form.declarations, key],
      });
    },
    [form],
  );

  /* ---- save / publish ---- */
  const validate = useCallback((): string | null => {
    if (!form.title.trim()) return '请填写标题';
    if (!form.content.trim()) return '请填写正文';
    if (form.coverMode === 'single' && form.coverImages.length < 1)
      return '单图封面请至少上传1张封面图';
    if (form.coverMode === 'triple' && form.coverImages.length < 3)
      return '三图封面需要上传3张封面图';
    return null;
  }, [form]);

  const handleSaveDraft = useCallback(() => {
    const id = article?.id ?? `art-${Date.now()}`;
    upsertArticle({ ...form, id, status: 'draft' });
    appendLog({
      action: article ? '保存草稿' : '新建草稿',
      target: form.title || '无标题',
      operator: 'admin',
      status: 'success',
    });
    toast.success('草稿已保存');
    onOpenChange(false);
  }, [article, form, upsertArticle, appendLog, onOpenChange]);

  const handlePublish = useCallback(async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    if (publishing) return;
    const id = article?.id ?? `art-${Date.now()}`;
    const account = form.accountId
      ? accounts.find((a) => a.id === form.accountId)
      : undefined;
    if (!account) {
      toast.error('请选择发布账号');
      return;
    }
    if (!account.cookie?.trim()) {
      toast.error('该账号未绑定 Cookie，请先到「账号管理」绑定');
      return;
    }
    // 1. 立即落 status='publishing'，让队列页和列表实时显示
    setPublishing(true);
    upsertArticle({ ...form, id, status: 'publishing' });
    appendLog({
      action: '调用发布接口',
      target: form.title,
      operator: 'admin',
      status: 'success',
    });
    // 中途进度提示（首次 Playwright 启动可能耗时 10-30s，避免用户误以为没反应）
    const pendingToastId = toast.loading('发布中，正在启动浏览器自动化…（首次冷启动 10-30 秒）', {
      duration: Infinity,
    });
    // 90s 客户端超时（Playwright 内部 60s + 余量），避免无限等待
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 90_000);
    try {
      // 2. 调真实发布接口
      const r = await fetch('/api/articles/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: id,
          accountId: account.id,
          cookie: account.cookie,
          title: form.title,
          contentMarkdown: form.content,
          coverMode: form.coverMode,
          coverImages: form.coverImages,
          location: form.location,
          adEnabled: form.adEnabled,
          isFirstPublish: form.isFirstPublish,
          collections: form.collections,
          crossPostWeitoutiao: form.crossPostWeitoutiao,
          declarations: form.declarations,
        }),
        signal: ac.signal,
      });
      const data = (await r.json()) as {
        ok: boolean;
        message: string;
        publishUrl?: string;
        errorKind?: string;
        status?: 'published' | 'submitted';
        verified?: boolean;
      };
      toast.dismiss(pendingToastId);
      if (data.ok) {
        const finalStatus =
          data.status === 'submitted' ? 'submitted' : 'published';
        patchArticle(id, {
          status: finalStatus,
          publishedAt:
            finalStatus === 'published'
              ? new Date().toISOString()
              : undefined,
          publishUrl: data.publishUrl,
          failReason: undefined,
        });
        appendLog({
          action: finalStatus === 'published' ? '发布成功' : '已提交，等待确认',
          target: form.title,
          operator: 'admin',
          status: 'success',
          detail: data.message,
        });
        if (finalStatus === 'submitted') {
          toast.warning(data.message, {
            description: '后台已自动在 30 秒后复查发布状态',
            duration: 8000,
          });
        } else {
          toast.success(data.message);
        }
        onOpenChange(false);
      } else {
        patchArticle(id, {
          status: 'failed',
          failReason: data.message,
        });
        appendLog({
          action: '发布失败',
          target: form.title,
          operator: 'admin',
          status: 'failed',
          detail: `${data.errorKind ?? ''} ${data.message}`,
        });
        toast.error(data.message);
      }
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      const msg = isAbort
        ? '发布超时（90 秒未返回），请稍后到队列页查看实际状态；常见原因：Playwright 冷启动慢、chromium binary 下载中、网络不通'
        : e instanceof Error
          ? e.message
          : '网络异常';
      toast.dismiss(pendingToastId);
      patchArticle(id, { status: 'failed', failReason: msg });
      appendLog({
        action: isAbort ? '发布超时' : '发布异常',
        target: form.title,
        operator: 'admin',
        status: 'failed',
        detail: msg,
      });
      toast.error(`发布异常：${msg}`);
    } finally {
      clearTimeout(timer);
      setPublishing(false);
    }
  }, [
    article,
    form,
    accounts,
    validate,
    upsertArticle,
    patchArticle,
    appendLog,
    onOpenChange,
    publishing,
  ]);

  const handleSchedule = useCallback(() => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    if (!form.scheduledAt) {
      toast.error('请选择定时发布时间');
      return;
    }
    const id = article?.id ?? `art-${Date.now()}`;
    upsertArticle({ ...form, id, status: 'queued' });
    appendLog({
      action: '定时发布',
      target: form.title,
      operator: 'admin',
      status: 'success',
    });
    toast.success(`已设定于 ${form.scheduledAt} 发布`);
    onOpenChange(false);
  }, [article, form, validate, upsertArticle, appendLog, onOpenChange]);

  /* ---- toolbar ---- */
  const TOOLBAR = [
    { icon: BoldIcon, tip: '粗体 ⌘B', action: () => wrapSelection('**', '**') },
    { icon: ItalicIcon, tip: '斜体 ⌘I', action: () => wrapSelection('*', '*') },
    { icon: StrikethroughIcon, tip: '删除线', action: () => wrapSelection('~~', '~~') },
    { sep: true },
    { icon: Heading1Icon, tip: '标题1', action: () => prefixLine('# ') },
    { icon: Heading2Icon, tip: '标题2', action: () => prefixLine('## ') },
    { icon: Heading3Icon, tip: '标题3', action: () => prefixLine('### ') },
    { sep: true },
    { icon: ListIcon, tip: '列表', action: () => prefixLine('- ') },
    { icon: QuoteIcon, tip: '引用', action: () => prefixLine('> ') },
    { icon: CodeIcon, tip: '行内代码', action: () => wrapSelection('`', '`') },
    { icon: LinkIcon, tip: '链接', action: () => wrapSelection('[', '](url)') },
    { sep: true },
    {
      icon: ImageIcon,
      tip: '插入图片',
      action: handleInsertImage,
      loading: uploading,
    },
    {
      icon: LibraryIcon,
      tip: '素材库',
      action: () => toast.info('素材库即将上线，敬请期待'),
    },
  ];

  /* ============ RENDER ============ */
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[960px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{article ? '编辑文章' : '新建草稿'}</DialogTitle>
            <DialogDescription>
              支持 Markdown 标记；点击工具栏「插入图片」可上传图片并自动写入光标位置
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* ---- 标题 ---- */}
            <div className="space-y-1.5">
              <Label htmlFor="a-title">标题 *</Label>
              <Input
                id="a-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="清晰、有吸引力的标题"
              />
            </div>

            {/* ---- 摘要 ---- */}
            <div className="space-y-1.5">
              <Label htmlFor="a-summary">摘要</Label>
              <Textarea
                id="a-summary"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="一两句话概括内容"
                className="h-16"
              />
            </div>

            {/* ---- 正文工具栏 + 编辑/预览 ---- */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label>正文</Label>
                <div className="flex items-center gap-2">
                  <Tabs
                    value={editMode}
                    onValueChange={(v) => setEditMode(v as typeof editMode)}
                  >
                    <TabsList className="h-7">
                      <TabsTrigger value="edit" className="text-xs px-2">
                        编辑
                      </TabsTrigger>
                      <TabsTrigger value="split" className="text-xs px-2">
                        分栏
                      </TabsTrigger>
                      <TabsTrigger value="preview" className="text-xs px-2">
                        预览
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              {/* toolbar */}
              <div className="flex items-center gap-0.5 flex-wrap rounded-md border border-[var(--border)] bg-[var(--card)] p-1">
                {TOOLBAR.map((t, i) =>
                  'sep' in t && t.sep ? (
                    <div
                      key={`s${i}`}
                      className="w-px h-5 bg-[var(--border)] mx-1"
                    />
                  ) : (
                    <TooltipProvider key={`t${i}`}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={'action' in t ? t.action : undefined}
                            disabled={'loading' in t && t.loading}
                          >
                            {'icon' in t && (() => { const Icon = t.icon as React.FC<{className?:string}>; return <Icon className="h-3.5 w-3.5" />; })()}
                            {'loading' in t && t.loading && (
                              <Loader2Icon className="h-3.5 w-3.5 animate-spin ml-1" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          {'tip' in t ? t.tip : ''}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ),
                )}
              </div>

              {/* editor area */}
              <div className="relative grid grid-cols-1 gap-0 border border-[var(--border)] rounded-md overflow-hidden min-h-[280px]"
                   style={{
                     gridTemplateColumns:
                       editMode === 'split' ? '1fr 1fr' : '1fr',
                   }}>
                {(editMode === 'edit' || editMode === 'split') && (
                  <textarea
                    ref={contentRef}
                    value={form.content}
                    onChange={(e) =>
                      setForm({ ...form, content: e.target.value })
                    }
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="w-full h-[280px] bg-[var(--card)] text-[var(--card-foreground)] p-3 text-sm resize-none focus:outline-none font-mono border-r border-[var(--border)]"
                    placeholder="在此输入正文内容，支持 Markdown 语法…"
                  />
                )}
                {(editMode === 'preview' || editMode === 'split') && (
                  <div className="prose-invert p-3 text-sm overflow-y-auto h-[280px] leading-relaxed">
                    <MarkdownView md={form.content || '*暂无内容*'} />
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-2 bg-[var(--primary)]/15 text-xs text-[var(--primary)] py-1.5 border-b border-[var(--primary)]/30 pointer-events-none">
                    <Loader2Icon className="size-3.5 animate-spin" />
                    图片上传中…
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onImageFilesSelected}
              />
            </div>

            {/* ========== 发布配置区 ========== */}
            <div className="space-y-4 pt-2 border-t border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--primary)]">
                发布配置
              </h3>

              {/* 0. 选择发布账号 */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  发布账号 <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.accountId || '_none'}
                  onValueChange={(v) => setForm({ ...form, accountId: v === '_none' ? '' : v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择要发布到的头条号" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">请选择账号</SelectItem>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} · {acc.category} · {LOGIN_STATUS_LABEL[acc.loginStatus]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.accountId &&
                  accounts.find((a) => a.id === form.accountId)?.loginStatus !== 'online' && (
                  <p className="text-xs text-amber-500">
                    当前账号未登录或 Cookie 已失效，发布前请先到「账号管理」绑定 Cookie。
                  </p>
                )}
              </div>

              {/* 1. 展示封面 */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  展示封面 <span className="text-red-500">*</span>
                </Label>
                <RadioGroup
                  value={form.coverMode}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      coverMode: v as 'single' | 'triple' | 'none',
                      coverImages:
                        v === 'none'
                          ? []
                          : form.coverImages,
                    })
                  }
                  className="flex items-center gap-4"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="single" id="cm-single" />
                    <Label htmlFor="cm-single" className="text-xs cursor-pointer">
                      单图
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="triple" id="cm-triple" />
                    <Label htmlFor="cm-triple" className="text-xs cursor-pointer">
                      三图
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="none" id="cm-none" />
                    <Label htmlFor="cm-none" className="text-xs cursor-pointer">
                      无封面
                    </Label>
                  </div>
                </RadioGroup>

                {form.coverMode !== 'none' && (
                  <>
                    <p className="text-xs text-zinc-500">
                      优质的封面有利于推荐，格式支持 JPEG、PNG
                    </p>
                    <div className="flex gap-3">
                      {Array.from({
                        length: form.coverMode === 'triple' ? 3 : 1,
                      }).map((_, idx) => (
                        <div
                          key={idx}
                          className="relative w-28 h-28 rounded-lg border-2 border-dashed border-zinc-600 overflow-hidden group"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer?.files?.[0];
                            if (file) {
                              const dt = new DataTransfer();
                              dt.items.add(file);
                              coverInputRefs.current[idx]?.click?.();
                            }
                          }}
                        >
                          {form.coverImages[idx] ? (
                            <>
                              <img
                                src={form.coverImages[idx]}
                                alt={`封面${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-white"
                                  onClick={() => removeCover(idx)}
                                >
                                  <Trash2Icon className="h-4 w-4" />
                                </Button>
                              </div>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="w-full h-full flex flex-col items-center justify-center text-zinc-500 hover:text-zinc-300 hover:border-[var(--primary)] transition-colors"
                              onClick={() =>
                                coverInputRefs.current[idx]?.click()
                              }
                              disabled={coverUploading === idx}
                            >
                              {coverUploading === idx ? (
                                <Loader2Icon className="h-6 w-6 animate-spin" />
                              ) : (
                                <>
                                  <PlusIcon className="h-6 w-6" />
                                  <span className="text-xs mt-1">上传</span>
                                </>
                              )}
                            </button>
                          )}
                          <input
                            ref={(el) => {
                              coverInputRefs.current[idx] = el;
                            }}
                            type="file"
                            accept="image/jpeg,image/png"
                            className="hidden"
                            onChange={(e) => handleCoverFile(idx, e)}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* 2. 添加位置 */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <MapPinIcon className="h-3.5 w-3.5" /> 添加位置
                </Label>
                <Select
                  value={form.location || '_none'}
                  onValueChange={(v) =>
                    setForm({ ...form, location: v === '_none' ? '' : v })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="标记城市，让更多同城用户看到" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">不标记</SelectItem>
                    {LOCATION_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 3. 投放广告 */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  <CircleDollarSignIcon className="h-3.5 w-3.5" /> 投放广告{' '}
                  <span className="text-red-500">*</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircleIcon className="h-3.5 w-3.5 text-zinc-500 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[240px] text-xs">
                        发布后将在文章中展示广告，获得创作收益
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <RadioGroup
                  value={form.adEnabled ? 'yes' : 'no'}
                  onValueChange={(v) =>
                    setForm({ ...form, adEnabled: v === 'yes' })
                  }
                  className="flex items-center gap-4"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="yes" id="ad-yes" />
                    <Label htmlFor="ad-yes" className="text-xs cursor-pointer">
                      投放广告赚收益
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="no" id="ad-no" />
                    <Label htmlFor="ad-no" className="text-xs cursor-pointer">
                      不投放广告
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* 4. 声明首发 */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="first-pub"
                    checked={form.isFirstPublish}
                    onCheckedChange={(v) =>
                      setForm({ ...form, isFirstPublish: !!v })
                    }
                  />
                  <Label htmlFor="first-pub" className="text-xs cursor-pointer flex items-center gap-1">
                    <RocketIcon className="h-3.5 w-3.5" /> 头条首发
                  </Label>
                </div>
                {form.isFirstPublish && (
                  <div className="rounded-md bg-amber-900/30 border border-amber-600/40 px-3 py-2 text-xs text-amber-300">
                    符合首发质量标准且72小时内仅在头条发布的内容，可享额外激励分成{' '}
                    <a href="#" className="underline text-amber-200">
                      详细了解→
                    </a>
                  </div>
                )}
              </div>

              {/* 5. 合集 */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  <FolderIcon className="h-3.5 w-3.5" /> 合集
                </Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {form.collections.map((cid) => {
                    const col = COLLECTIONS.find((c) => c.id === cid);
                    return col ? (
                      <Badge
                        key={cid}
                        variant="outline"
                        className="gap-1 text-xs"
                      >
                        {col.name}
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              collections: form.collections.filter(
                                (c) => c !== cid,
                              ),
                            })
                          }
                          className="ml-0.5 hover:text-red-400"
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </Badge>
                    ) : null;
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setCollectionPickerOpen(true)}
                  >
                    <PlusIcon className="h-3 w-3" /> 添加至合集
                  </Button>
                </div>
              </div>

              {/* 6. 同时发布微头条 */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="cross-post"
                  checked={form.crossPostWeitoutiao}
                  onCheckedChange={(v) =>
                    setForm({ ...form, crossPostWeitoutiao: !!v })
                  }
                />
                <Label htmlFor="cross-post" className="text-xs cursor-pointer flex items-center gap-1">
                  <Share2Icon className="h-3.5 w-3.5" /> 发布得更多收益
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircleIcon className="h-3.5 w-3.5 text-zinc-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[240px] text-xs">
                      同时发布到微头条可获得更多曝光和收益
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* 7. 作品声明 */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  <ShieldCheckIcon className="h-3.5 w-3.5" /> 作品声明
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                  {DECLARATIONS.map((d) => (
                    <div key={d.key} className="flex items-center gap-1.5">
                      <Checkbox
                        id={`decl-${d.key}`}
                        checked={form.declarations.includes(d.key)}
                        onCheckedChange={() => toggleDeclaration(d.key)}
                      />
                      <Label
                        htmlFor={`decl-${d.key}`}
                        className="text-xs cursor-pointer flex items-center gap-0.5"
                      >
                        {d.label}
                        {d.tip && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircleIcon className="h-3 w-3 text-zinc-500 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[200px] text-xs">
                                {d.tip}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* 定时发布时间 */}
              <div className="space-y-1.5">
                <Label htmlFor="a-sched" className="flex items-center gap-1">
                  <ClockIcon className="h-3.5 w-3.5" /> 定时发布时间（可选）
                </Label>
                <Input
                  id="a-sched"
                  type="datetime-local"
                  value={form.scheduledAt ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, scheduledAt: e.target.value || undefined })
                  }
                />
              </div>

              {/* 文章状态 */}
              <div className="space-y-1.5">
                <Label>文章状态</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm({ ...form, status: v as ArticleStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="queued">待发布</SelectItem>
                    <SelectItem value="published">已发布</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ---- 底部状态栏 + 按钮 ---- */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
            {/* 左侧信息 */}
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span>✓ 草稿将自动保存</span>
              <span>共 {charCount} 字</span>
              <button
                type="button"
                className="hover:text-zinc-300 transition-colors"
                onClick={() => {
                  contentRef.current?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                回到顶部↑
              </button>
            </div>
            {/* 右侧按钮 */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleSaveDraft}>
                保存草稿
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                <EyeIcon className="h-3.5 w-3.5 mr-1" /> 预览
              </Button>
              <Button variant="outline" size="sm" onClick={handleSchedule}>
                <ClockIcon className="h-3.5 w-3.5 mr-1" /> 定时发布
              </Button>
              <Button size="sm" onClick={handlePublish} disabled={publishing}>
                {publishing ? '发布中…' : '预览并发布'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- 合集选择弹窗 ---- */}
      <Dialog open={collectionPickerOpen} onOpenChange={setCollectionPickerOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>添加至合集</DialogTitle>
            <DialogDescription>选择要加入的合集</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {COLLECTIONS.map((col) => {
              const selected = form.collections.includes(col.id);
              return (
                <button
                  key={col.id}
                  type="button"
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md border transition-colors text-sm',
                    selected
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'border-[var(--border)] hover:border-zinc-500',
                  )}
                  onClick={() => {
                    setForm({
                      ...form,
                      collections: selected
                        ? form.collections.filter((c) => c !== col.id)
                        : [...form.collections, col.id],
                    });
                  }}
                >
                  {col.name}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setCollectionPickerOpen(false)}
            >
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- 预览弹窗 ---- */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.title || '无标题'}</DialogTitle>
            <DialogDescription>
              {form.summary || '暂无摘要'}
            </DialogDescription>
          </DialogHeader>

          {/* 封面预览 */}
          {form.coverImages.length > 0 && (
            <div className="flex gap-2 mb-4">
              {form.coverImages.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`封面${i + 1}`}
                  className="rounded-md border border-zinc-700 max-h-40 object-cover"
                />
              ))}
            </div>
          )}

          {/* 正文预览 */}
          <div className="prose-invert text-sm leading-relaxed">
            <MarkdownView md={form.content || '*暂无内容*'} />
          </div>
          {/* 配置标签 */}
          <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-[var(--border)]">
            {form.adEnabled && (
              <Badge variant="outline" className="text-xs">投放广告</Badge>
            )}
            {form.isFirstPublish && (
              <Badge className="text-xs bg-amber-700/40 text-amber-300 border-amber-600/40">
                头条首发
              </Badge>
            )}
            {form.crossPostWeitoutiao && (
              <Badge variant="outline" className="text-xs">同步微头条</Badge>
            )}
            {form.location && (
              <Badge variant="outline" className="text-xs">
                <MapPinIcon className="h-3 w-3 mr-0.5" />
                {form.location}
              </Badge>
            )}
            {form.declarations.map((d) => {
              const decl = DECLARATIONS.find((dd) => dd.key === d);
              return decl ? (
                <Badge key={d} variant="outline" className="text-xs">
                  {decl.label}
                </Badge>
              ) : null;
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
