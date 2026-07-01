'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  MOCK_ACCOUNTS,
  MOCK_ARTICLES,
  MOCK_DAILY_METRICS,
  MOCK_LOGS,
  MOCK_PROXIES,
} from './mock-data';
import {
  INITIAL_DETECTION_HISTORY,
  INITIAL_RISK_ALERTS,
} from './anti-association-data';
import {
  INITIAL_SYNC_CONFIG,
  INITIAL_SYNC_LOGS,
  INITIAL_SYNC_RECORDS,
} from './sync-data';
import type {
  Account,
  Article,
  DailyMetric,
  DetectionHistory,
  OperationLog,
  Proxy,
  RiskAlert,
  SyncConfig,
  SyncLog,
  SyncRecord,
} from './types';

const STORAGE_KEY = 'toutiao-matrix-store-v1';

type DataMode = 'demo' | 'real';

interface StoreState {
  accounts: Account[];
  articles: Article[];
  proxies: Proxy[];
  logs: OperationLog[];
  dailyMetrics: DailyMetric[];
  riskAlerts: RiskAlert[];
  detectionHistory: DetectionHistory[];
  syncRecords: SyncRecord[];
  syncLogs: SyncLog[];
  syncConfig: SyncConfig;
  dataMode: DataMode;
}

interface StoreContextValue extends StoreState {
  // Accounts
  upsertAccount: (acc: Account) => void;
  deleteAccount: (id: string) => void;
  patchAccount: (id: string, patch: Partial<Account>) => void;
  // Articles
  upsertArticle: (art: Article) => void;
  deleteArticle: (id: string) => void;
  patchArticle: (id: string, patch: Partial<Article>) => void;
  retryArticle: (id: string) => void;
  // Proxies
  upsertProxy: (p: Proxy) => void;
  deleteProxy: (id: string) => void;
  testProxy: (id: string) => void;
  testAllProxies: () => void;
  bindProxyToAccount: (proxyId: string, accountId: string | undefined) => void;
  // Logs
  appendLog: (log: Omit<OperationLog, 'id' | 'time'>) => void;
  // Risk
  resolveRiskAlert: (id: string) => void;
  appendDetectionHistory: (h: Omit<DetectionHistory, 'id'>) => void;
  // Sync
  setDataMode: (m: DataMode) => void;
  updateSyncConfig: (c: SyncConfig) => void;
  updateSyncRecord: (accountId: string, patch: Partial<SyncRecord>) => void;
  appendSyncLog: (log: Omit<SyncLog, 'id'>) => void;
  // Reset
  resetAll: () => void;
  hydrated: boolean;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const initialState: StoreState = {
  accounts: MOCK_ACCOUNTS,
  articles: MOCK_ARTICLES,
  proxies: MOCK_PROXIES,
  logs: MOCK_LOGS,
  dailyMetrics: MOCK_DAILY_METRICS,
  riskAlerts: INITIAL_RISK_ALERTS,
  detectionHistory: INITIAL_DETECTION_HISTORY,
  syncRecords: INITIAL_SYNC_RECORDS,
  syncLogs: INITIAL_SYNC_LOGS,
  syncConfig: INITIAL_SYNC_CONFIG,
  dataMode: 'demo',
};

function loadFromStorage(): StoreState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoreState;
    if (Array.isArray(parsed?.accounts)) {
      const summary = parsed.accounts.map((a) => ({
        id: a.id,
        cookieLen: a.cookie?.length ?? 0,
        cookieStatus: a.cookieStatus,
      }));
      console.info('[store.loadFromStorage] accounts cookie snapshot:', summary);
    }
    return parsed;
  } catch (e) {
    console.error('[store.loadFromStorage] JSON.parse failed:', e);
    return null;
  }
}

function persist(state: StoreState) {
  if (typeof window === 'undefined') return;
  try {
    const json = JSON.stringify(state);
    window.localStorage.setItem(STORAGE_KEY, json);
    // 仅在 accounts 有 cookie 时打印长度，方便排查截断
    const withCookie = state.accounts.filter((a) => a.cookie);
    if (withCookie.length > 0) {
      console.debug(
        '[store.persist] payloadBytes=',
        json.length,
        'accountsWithCookie=',
        withCookie.map((a) => ({ id: a.id, len: a.cookie.length })),
      );
    }
  } catch (e) {
    console.error('[store.persist] setItem failed (quota exceeded?):', e);
  }
}

function nowStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  // 客户端挂载后再读 localStorage，避免 hydration mismatch
  useEffect(() => {
    const fromLs = loadFromStorage();
    if (fromLs) {
      setState({ ...initialState, ...fromLs });
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) persist(state);
  }, [state, hydrated]);

  const upsertAccount = useCallback((acc: Account) => {
    setState((s) => {
      const exists = s.accounts.some((a) => a.id === acc.id);
      return {
        ...s,
        accounts: exists
          ? s.accounts.map((a) => (a.id === acc.id ? acc : a))
          : [acc, ...s.accounts],
      };
    });
  }, []);

  const deleteAccount = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      accounts: s.accounts.filter((a) => a.id !== id),
    }));
  }, []);

  const patchAccount = useCallback((id: string, patch: Partial<Account>) => {
    setState((s) => ({
      ...s,
      accounts: s.accounts.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    }));
  }, []);

  const upsertArticle = useCallback((art: Article) => {
    setState((s) => {
      const exists = s.articles.some((a) => a.id === art.id);
      return {
        ...s,
        articles: exists
          ? s.articles.map((a) => (a.id === art.id ? art : a))
          : [art, ...s.articles],
      };
    });
  }, []);

  const deleteArticle = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      articles: s.articles.filter((a) => a.id !== id),
    }));
  }, []);

  const patchArticle = useCallback((id: string, patch: Partial<Article>) => {
    setState((s) => ({
      ...s,
      articles: s.articles.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    }));
  }, []);

  const retryArticle = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      articles: s.articles.map((a) =>
        a.id === id
          ? { ...a, status: 'queued', failReason: undefined }
          : a,
      ),
    }));
  }, []);

  const upsertProxy = useCallback((p: Proxy) => {
    setState((s) => {
      const exists = s.proxies.some((x) => x.id === p.id);
      return {
        ...s,
        proxies: exists
          ? s.proxies.map((x) => (x.id === p.id ? p : x))
          : [p, ...s.proxies],
      };
    });
  }, []);

  const deleteProxy = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      proxies: s.proxies.filter((p) => p.id !== id),
      accounts: s.accounts.map((a) =>
        a.proxyId === id ? { ...a, proxyId: undefined } : a,
      ),
    }));
  }, []);

  const testProxy = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      proxies: s.proxies.map((p) => {
        if (p.id !== id) return p;
        // 用 host 字符串计算稳定的 hash 作为延迟，避免随机不一致
        const hash = p.host
          .split('')
          .reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const latency = (hash % 280) + 30;
        const health: Proxy['health'] =
          latency < 100 ? 'green' : latency < 250 ? 'yellow' : 'red';
        return {
          ...p,
          latencyMs: latency,
          health,
          lastTestedAt: nowStr(),
        };
      }),
    }));
  }, []);

  const testAllProxies = useCallback(() => {
    setState((s) => ({
      ...s,
      proxies: s.proxies.map((p) => {
        const hash = p.host
          .split('')
          .reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const latency = (hash % 280) + 30;
        const health: Proxy['health'] =
          latency < 100 ? 'green' : latency < 250 ? 'yellow' : 'red';
        return {
          ...p,
          latencyMs: latency,
          health,
          lastTestedAt: nowStr(),
        };
      }),
    }));
  }, []);

  const bindProxyToAccount = useCallback(
    (proxyId: string, accountId: string | undefined) => {
      setState((s) => {
        // 解绑该账号原有代理
        let proxies = s.proxies.map((p) =>
          p.boundAccountId === accountId
            ? { ...p, boundAccountId: undefined }
            : p,
        );
        // 绑定新代理
        proxies = proxies.map((p) =>
          p.id === proxyId ? { ...p, boundAccountId: accountId } : p,
        );
        const accounts = s.accounts.map((a) =>
          a.id === accountId ? { ...a, proxyId } : a,
        );
        return { ...s, proxies, accounts };
      });
    },
    [],
  );

  const appendLog = useCallback(
    (log: Omit<OperationLog, 'id' | 'time'>) => {
      setState((s) => ({
        ...s,
        logs: [
          {
            id: `log-${Date.now()}`,
            time: nowStr(),
            ...log,
          },
          ...s.logs,
        ].slice(0, 200),
      }));
    },
    [],
  );

  const resetAll = useCallback(() => {
    setState(initialState);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const resolveRiskAlert = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      riskAlerts: s.riskAlerts.map((r) =>
        r.id === id ? { ...r, resolved: true } : r,
      ),
    }));
  }, []);

  const appendDetectionHistory = useCallback(
    (h: Omit<DetectionHistory, 'id'>) => {
      setState((s) => ({
        ...s,
        detectionHistory: [
          { id: `det-${Date.now()}`, ...h },
          ...s.detectionHistory,
        ].slice(0, 50),
      }));
    },
    [],
  );

  const setDataMode = useCallback((m: DataMode) => {
    setState((s) => ({ ...s, dataMode: m }));
  }, []);

  const updateSyncConfig = useCallback((c: SyncConfig) => {
    setState((s) => ({ ...s, syncConfig: c }));
  }, []);

  const updateSyncRecord = useCallback(
    (accountId: string, patch: Partial<SyncRecord>) => {
      setState((s) => ({
        ...s,
        syncRecords: s.syncRecords.map((r) =>
          r.accountId === accountId ? { ...r, ...patch } : r,
        ),
      }));
    },
    [],
  );

  const appendSyncLog = useCallback((log: Omit<SyncLog, 'id'>) => {
    setState((s) => ({
      ...s,
      syncLogs: [
        { id: `sync-log-${Date.now()}`, ...log },
        ...s.syncLogs,
      ].slice(0, 200),
    }));
  }, []);

  const value = useMemo<StoreContextValue>(
    () => ({
      ...state,
      hydrated,
      upsertAccount,
      deleteAccount,
      patchAccount,
      upsertArticle,
      deleteArticle,
      patchArticle,
      retryArticle,
      upsertProxy,
      deleteProxy,
      testProxy,
      testAllProxies,
      bindProxyToAccount,
      appendLog,
      resolveRiskAlert,
      appendDetectionHistory,
      setDataMode,
      updateSyncConfig,
      updateSyncRecord,
      appendSyncLog,
      resetAll,
    }),
    [
      state,
      hydrated,
      upsertAccount,
      deleteAccount,
      patchAccount,
      upsertArticle,
      deleteArticle,
      patchArticle,
      retryArticle,
      upsertProxy,
      deleteProxy,
      testProxy,
      testAllProxies,
      bindProxyToAccount,
      appendLog,
      resolveRiskAlert,
      appendDetectionHistory,
      setDataMode,
      updateSyncConfig,
      updateSyncRecord,
      appendSyncLog,
      resetAll,
    ],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
