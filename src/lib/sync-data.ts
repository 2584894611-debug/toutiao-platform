import type { SyncConfig, SyncLog, SyncRecord } from './types';

export const INITIAL_SYNC_CONFIG: SyncConfig = {
  freq: '12h',
  syncTime: '03:00',
  items: {
    income: true,
    reads: true,
    followers: true,
    articles: true,
    comments: false,
  },
};

// 9 个正式账号：仅 HAO科技、武汉吃喝玩乐已上线并有凭证，可正常同步；其他 7 个待注册
export const INITIAL_SYNC_RECORDS: SyncRecord[] = [
  {
    accountId: 'acc-001',
    lastSyncAt: '2025-01-15 03:02:18',
    nextSyncAt: '2025-01-15 15:00:00',
    status: 'success',
    costMs: 4280,
    cookieFilled: true,
  },
  {
    accountId: 'acc-002',
    lastSyncAt: '-',
    nextSyncAt: '-',
    status: 'idle',
    cookieFilled: false,
  },
  {
    accountId: 'acc-003',
    lastSyncAt: '-',
    nextSyncAt: '-',
    status: 'idle',
    cookieFilled: false,
  },
  {
    accountId: 'acc-004',
    lastSyncAt: '-',
    nextSyncAt: '-',
    status: 'idle',
    cookieFilled: false,
  },
  {
    accountId: 'acc-005',
    lastSyncAt: '-',
    nextSyncAt: '-',
    status: 'idle',
    cookieFilled: false,
  },
  {
    accountId: 'acc-006',
    lastSyncAt: '-',
    nextSyncAt: '-',
    status: 'idle',
    cookieFilled: false,
  },
  {
    accountId: 'acc-007',
    lastSyncAt: '2025-01-15 03:04:20',
    nextSyncAt: '2025-01-15 15:00:00',
    status: 'success',
    costMs: 6210,
    cookieFilled: true,
  },
  {
    accountId: 'acc-008',
    lastSyncAt: '-',
    nextSyncAt: '-',
    status: 'idle',
    cookieFilled: false,
  },
  {
    accountId: 'acc-009',
    lastSyncAt: '-',
    nextSyncAt: '-',
    status: 'idle',
    cookieFilled: false,
  },
];

export const INITIAL_SYNC_LOGS: SyncLog[] = [
  {
    id: 'sync-log-001',
    time: '2025-01-15 03:04:20',
    accountId: 'acc-007',
    result: 'success',
    costMs: 6210,
  },
  {
    id: 'sync-log-002',
    time: '2025-01-15 03:02:18',
    accountId: 'acc-001',
    result: 'success',
    costMs: 4280,
  },
  {
    id: 'sync-log-003',
    time: '2025-01-14 15:01:48',
    accountId: 'acc-007',
    result: 'success',
    costMs: 5890,
  },
  {
    id: 'sync-log-004',
    time: '2025-01-14 15:00:55',
    accountId: 'acc-001',
    result: 'success',
    costMs: 4012,
  },
  {
    id: 'sync-log-005',
    time: '2025-01-14 03:02:12',
    accountId: 'acc-007',
    result: 'failed',
    costMs: 820,
    message: '代理超时（30s）',
  },
  {
    id: 'sync-log-006',
    time: '2025-01-13 03:02:08',
    accountId: 'acc-001',
    result: 'success',
    costMs: 4310,
  },
];

/** 演示 vs 真实 数据对比示例 */
export const DEMO_VS_REAL = {
  demo: {
    totalReads: 24_528_000,
    totalFollowers: 168_400,
    totalIncome: 62_460,
    publishToday: 6,
  },
  real: {
    totalReads: 21_868_750,
    totalFollowers: 163_000,
    totalIncome: 58_665,
    publishToday: 5,
  },
};
