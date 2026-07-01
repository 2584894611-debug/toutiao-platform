'use client';

import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';

/**
 * 客户端定时发布调度器。
 *
 * 每 30 秒扫描 store 中所有 status='queued' 且 scheduledAt <= now 的文章，
 * 自动调用 /api/articles/publish 真实发布。
 *
 * **架构限制**：本项目的 articles store 完全位于浏览器 localStorage，
 * 服务端无持久化。因此：
 * 1) 只在用户打开页面时才会触发定时发布；
 * 2) 关闭浏览器即停止；
 * 3) 重新打开会从 localStorage 恢复，未过期的 queued 任务会继续等待。
 *
 * 若需要真正的后台调度，需要把 articles 迁移到服务端数据库 + cron。
 */
export function PublishScheduler() {
  const { articles, accounts, patchArticle, appendLog, hydrated } = useStore();
  const inflightRef = useRef<Set<string>>(new Set());
  // 把最新的 articles/accounts 同步到 ref，避免 setInterval 闭包陈旧
  const dataRef = useRef({ articles, accounts });
  dataRef.current = { articles, accounts };

  useEffect(() => {
    if (!hydrated) return undefined;

    const tick = async () => {
      const { articles: arts, accounts: accs } = dataRef.current;
      const now = Date.now();
      const due = arts.filter(
        (a) =>
          a.status === 'queued' &&
          a.scheduledAt &&
          new Date(a.scheduledAt).getTime() <= now &&
          !inflightRef.current.has(a.id),
      );
      for (const a of due) {
        const account = a.accountId
          ? accs.find((x) => x.id === a.accountId)
          : undefined;
        if (!account || !account.cookie?.trim()) {
          patchArticle(a.id, {
            status: 'failed',
            failReason: account
              ? '账号未绑定 Cookie'
              : '未指定发布账号',
          });
          continue;
        }
        inflightRef.current.add(a.id);
        patchArticle(a.id, { status: 'publishing' });
        try {
          const r = await fetch('/api/articles/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              articleId: a.id,
              accountId: account.id,
              cookie: account.cookie,
              title: a.title,
              contentMarkdown: a.content,
              coverMode: a.coverMode,
              coverImages: a.coverImages,
              location: a.location,
              adEnabled: a.adEnabled,
              isFirstPublish: a.isFirstPublish,
              collections: a.collections,
              crossPostWeitoutiao: a.crossPostWeitoutiao,
              declarations: a.declarations,
            }),
          });
          const data = (await r.json()) as {
            ok: boolean;
            message: string;
            publishUrl?: string;
            status?: 'published' | 'submitted';
            verified?: boolean;
          };
          if (data.ok) {
            const finalStatus =
              data.status === 'submitted' ? 'submitted' : 'published';
            patchArticle(a.id, {
              status: finalStatus,
              publishedAt:
                finalStatus === 'published'
                  ? new Date().toISOString()
                  : undefined,
              publishUrl: data.publishUrl,
              failReason: undefined,
            });
            appendLog({
              action:
                finalStatus === 'published'
                  ? '定时发布成功'
                  : '定时发布已提交',
              target: a.title,
              operator: 'scheduler',
              status: 'success',
              detail: data.message,
            });
          } else {
            patchArticle(a.id, {
              status: 'failed',
              failReason: data.message,
            });
            appendLog({
              action: '定时发布失败',
              target: a.title,
              operator: 'scheduler',
              status: 'failed',
              detail: data.message,
            });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : '网络异常';
          patchArticle(a.id, { status: 'failed', failReason: msg });
          appendLog({
            action: '定时发布异常',
            target: a.title,
            operator: 'scheduler',
            status: 'failed',
            detail: msg,
          });
        } finally {
          inflightRef.current.delete(a.id);
        }
      }
    };

    // 启动后立即跑一次，再每 30s 跑一次
    void tick();
    const id = setInterval(() => {
      void tick();
    }, 30_000);
    return () => clearInterval(id);
  }, [hydrated, patchArticle, appendLog]);

  return null;
}
