// 全局类型定义

export type AccountCategory =
  | '科技'
  | '民生'
  | '养生'
  | '副业'
  | '本地'
  | '三农'
  | '情感';

export type LoginStatus = 'online' | 'offline' | 'expired';

export type LaunchStatus = 'launched' | 'pending';

export interface Account {
  id: string;
  name: string;
  avatar: string;
  category: AccountCategory;
  loginStatus: LoginStatus;
  launchStatus: LaunchStatus;
  city: string;
  todayPublished: number;
  todayLimit: number;
  lastPublishAt: string;
  totalReads: number;
  totalFollowers: number;
  totalLikes: number;
  totalIncome: number;
  cookie: string;
  phone: string;
  remark: string;
  proxyId?: string;
  /** 凭证校验状态 */
  cookieStatus?: 'unverified' | 'verified' | 'expired';
  /** 最近一次 Cookie 校验时间（ISO 字符串） */
  cookieVerifiedAt?: string;
  /** 数据来源：mock 演示 / real 真实抓取 */
  dataSource?: 'mock' | 'real';
  /** 最近一次同步真实数据时间 */
  lastSyncAt?: string;
  /** 累计发文数（同步真实数据时回写） */
  totalArticles?: number;
}

export type ArticleStatus =
  | 'draft'
  | 'queued'
  | 'publishing'
  /** 发布请求已提交但 5s 内未在头条列表中检测到，等待审核确认 */
  | 'submitted'
  | 'published'
  | 'failed';

export interface Article {
  id: string;
  title: string;
  summary: string;
  content: string;
  accountId?: string; // 已发布关联的账号
  status: ArticleStatus;
  scheduledAt?: string;
  publishedAt?: string;
  reads: number;
  likes: number;
  comments: number;
  shares: number;
  cover?: string;
  failReason?: string;
  /** 发布成功后的头条文章/草稿 URL。 */
  publishUrl?: string;
  // —— 头条号发布配置（对标官方后台） ——
  coverMode: 'single' | 'triple' | 'none';
  coverImages: string[];
  location?: string;
  adEnabled: boolean;
  isFirstPublish: boolean;
  collections: string[];
  crossPostWeitoutiao: boolean;
  declarations: string[];
}

export type ProxyType = 'HTTP' | 'HTTPS' | 'SOCKS5';
export type ProxyHealth = 'green' | 'yellow' | 'red';

export interface Proxy {
  id: string;
  name: string;
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  bindCity: string;
  realExitIp?: string;
  exitRegion?: string;
  health: ProxyHealth;
  latencyMs?: number;
  lastTestedAt?: string;
  boundAccountId?: string;
}

export interface OperationLog {
  id: string;
  time: string;
  action: string;
  target: string;
  operator: string;
  status: 'success' | 'failed';
  detail?: string;
}

export interface DailyMetric {
  date: string; // YYYY-MM-DD
  reads: number;
  followers: number;
  income: number;
  publishCount: number;
}

// ============== 防关联检测 ==============

export type FingerprintStatus = 'isolated' | 'similar' | 'conflict';
export type IpType = 'residential' | 'datacenter' | 'mobile';
export type RiskLevel = 'high' | 'medium' | 'low';

/** 账号层：实名身份信息 */
export interface IdentityRecord {
  accountId: string;
  realNameVerified: boolean;
  idCardTail: string; // 身份证后4位
  phoneMask: string; // 138****5678
  bankCardTail: string; // 银行卡后4位
  bankCardBin: string; // 银行卡前6位
  email: string;
  registerAt: string;
}

/** 设备指纹层 */
export interface FingerprintRecord {
  accountId: string;
  envId: string;
  userAgent: string;
  resolution: string;
  timezone: string;
  language: string;
  canvasHash: string;
  webglHash: string;
  fontsCount: number;
  pluginsCount: number;
  status: FingerprintStatus;
}

/** 网络IP层（拓展自代理） */
export interface NetworkRecord {
  accountId: string;
  proxyType: string;
  exitIp: string;
  region: string;
  ipType: IpType;
  dns: string;
  dnsLeaked: boolean;
  webrtcLeaked: boolean;
  ipHistory: string[]; // 最近3次
  lastTestedAt: string;
}

/** 行为模式层 */
export interface BehaviorRecord {
  accountId: string;
  publishHour: string; // 常用发文时段，如 "08:00-09:00"
  avgWords: number; // 平均字数
  emojiHabit: string; // 表情/标点习惯
  imageStyle: '纯文字' | '单图' | '多图' | '视频';
  freqPerDay: number;
  interactionHabit: string;
  loginHour: string;
  riskLevel: RiskLevel;
  /** 0~1，发文小时×星期(7天) 矩阵，归一化后的密度 */
  hourMatrix: number[][]; // [day=0..6][hour=0..23]
}

/** 风险告警 */
export interface RiskAlert {
  id: string;
  layer: '账号层' | '设备指纹层' | '网络IP层' | '行为模式层';
  level: RiskLevel;
  title: string;
  desc: string;
  involvedAccounts: string[];
  createdAt: string;
  resolved: boolean;
}

/** 检测历史 */
export interface DetectionHistory {
  id: string;
  time: string;
  score: number;
  high: number;
  medium: number;
  low: number;
  triggeredBy: string;
}

// ============== 数据同步 ==============

export type SyncFreq = '6h' | '12h' | '24h' | 'manual';
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'failed';

export interface SyncRecord {
  accountId: string;
  lastSyncAt: string;
  nextSyncAt: string;
  status: SyncStatus;
  failReason?: string;
  costMs?: number;
  cookieFilled: boolean;
}

export interface SyncLog {
  id: string;
  time: string;
  accountId: string;
  result: 'success' | 'failed';
  costMs: number;
  message?: string;
}

export interface SyncConfig {
  freq: SyncFreq;
  syncTime: string; // 例如 "03:00"
  items: {
    income: boolean;
    reads: boolean;
    followers: boolean;
    articles: boolean;
    comments: boolean;
  };
}
