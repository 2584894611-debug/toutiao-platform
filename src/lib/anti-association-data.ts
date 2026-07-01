import type {
  BehaviorRecord,
  DetectionHistory,
  FingerprintRecord,
  IdentityRecord,
  NetworkRecord,
  RiskAlert,
} from './types';

/**
 * 注：为让"检测"有意义，下列 Mock 数据故意埋了以下隐蔽关联：
 * - 身份信息层：acc-001 / acc-007 银行卡 BIN 相同（同行同分支）；acc-002 / acc-005 手机号同号段（虚商 170/171）
 * - 浏览器环境层：acc-002 / acc-006 UA + 分辨率 + 时区 + Canvas 完全一致（指纹雷同）
 * - 网络环境层：acc-001 / acc-007 都是武汉（业务合理，但 C 段需拆分）；acc-006 为机房 IP；acc-008 DNS 与 WebRTC 泄漏
 * - 操作习惯层：acc-001 / acc-007 都偏 08:00 发文（业务合理但需差异化）；acc-004 / acc-005 字数 / 配图风格高度接近
 */

export const IDENTITY_DATA: IdentityRecord[] = [
  {
    accountId: 'acc-001',
    realNameVerified: true,
    idCardTail: '1024',
    phoneMask: '138****1024',
    bankCardTail: '8821',
    bankCardBin: '622848', // 农行 BIN
    email: 'hao.tech@163.com',
    registerAt: '2023-03-12',
  },
  {
    accountId: 'acc-002',
    realNameVerified: false,
    idCardTail: '2048',
    phoneMask: '170****2048', // ⚠️ 虚商 170 号段，与 acc-005 同
    bankCardTail: '----',
    bankCardBin: '------',
    email: 'robot.frontline@126.com',
    registerAt: '待注册',
  },
  {
    accountId: 'acc-003',
    realNameVerified: false,
    idCardTail: '4096',
    phoneMask: '137****4096',
    bankCardTail: '7710',
    bankCardBin: '622588',
    email: 'retire.life@qq.com',
    registerAt: '待注册',
  },
  {
    accountId: 'acc-004',
    realNameVerified: false,
    idCardTail: '8192',
    phoneMask: '136****8192',
    bankCardTail: '3392',
    bankCardBin: '621700',
    email: 'rishi.yishan@gmail.com',
    registerAt: '待注册',
  },
  {
    accountId: 'acc-005',
    realNameVerified: false,
    idCardTail: '1638',
    phoneMask: '171****1638', // ⚠️ 虚商 171 号段，与 acc-002 同号段族
    bankCardTail: '5510',
    bankCardBin: '622908',
    email: 'parent.health@163.com',
    registerAt: '待注册',
  },
  {
    accountId: 'acc-006',
    realNameVerified: false,
    idCardTail: '3276',
    phoneMask: '134****3276',
    bankCardTail: '----',
    bankCardBin: '------',
    email: 'slash.fuye@163.com',
    registerAt: '待注册',
  },
  {
    accountId: 'acc-007',
    realNameVerified: true,
    idCardTail: '6553',
    phoneMask: '133****6553',
    bankCardTail: '9920',
    bankCardBin: '622848', // ⚠️ 与 acc-001 同 BIN（同行）
    email: 'wuhan.eat@126.com',
    registerAt: '2023-04-30',
  },
  {
    accountId: 'acc-008',
    realNameVerified: false,
    idCardTail: '1310',
    phoneMask: '132****1310',
    bankCardTail: '7340',
    bankCardBin: '622202',
    email: 'village.startup@163.com',
    registerAt: '待注册',
  },
  {
    accountId: 'acc-009',
    realNameVerified: false,
    idCardTail: '2621',
    phoneMask: '131****2621',
    bankCardTail: '1180',
    bankCardBin: '622700',
    email: 'family.story@qq.com',
    registerAt: '待注册',
  },
];

const COMMON_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const FINGERPRINT_DATA: FingerprintRecord[] = [
  {
    accountId: 'acc-001',
    envId: 'env-A01',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/121.0.0.0',
    resolution: '1920×1080',
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    canvasHash: 'a8f3c901',
    webglHash: 'b1c87d22',
    fontsCount: 42,
    pluginsCount: 5,
    status: 'isolated',
  },
  {
    accountId: 'acc-002',
    envId: 'env-A02',
    userAgent: COMMON_UA, // ⚠️ 与 acc-006 完全一致
    resolution: '1920×1080', // ⚠️ 同
    timezone: 'Asia/Shanghai', // ⚠️ 同
    language: 'zh-CN',
    canvasHash: 'fefefe01', // ⚠️ 同
    webglHash: 'aabbccdd',
    fontsCount: 36,
    pluginsCount: 4,
    status: 'conflict',
  },
  {
    accountId: 'acc-003',
    envId: 'env-A03',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) Safari/17.0',
    resolution: '2560×1440',
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    canvasHash: '3e22f1aa',
    webglHash: '99c104de',
    fontsCount: 38,
    pluginsCount: 3,
    status: 'isolated',
  },
  {
    accountId: 'acc-004',
    envId: 'env-A04',
    userAgent: 'Mozilla/5.0 (Linux; Android 13) Mobile Safari/537.36',
    resolution: '1080×2400',
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    canvasHash: '7110bb45',
    webglHash: 'aa28f0c1',
    fontsCount: 24,
    pluginsCount: 0,
    status: 'isolated',
  },
  {
    accountId: 'acc-005',
    envId: 'env-A05',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/120.0.0.0',
    resolution: '1920×1080',
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    canvasHash: 'd0e98215',
    webglHash: 'ee21fa83',
    fontsCount: 45,
    pluginsCount: 4,
    status: 'isolated',
  },
  {
    accountId: 'acc-006',
    envId: 'env-A06',
    userAgent: COMMON_UA, // ⚠️ 与 acc-002 完全一致
    resolution: '1920×1080', // ⚠️
    timezone: 'Asia/Shanghai', // ⚠️
    language: 'zh-CN',
    canvasHash: 'fefefe01', // ⚠️
    webglHash: 'aabbccdd',
    fontsCount: 36,
    pluginsCount: 4,
    status: 'conflict',
  },
  {
    accountId: 'acc-007',
    envId: 'env-A07',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X)',
    resolution: '1170×2532',
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    canvasHash: '2901cd77',
    webglHash: '14a3b9ec',
    fontsCount: 22,
    pluginsCount: 0,
    status: 'isolated',
  },
  {
    accountId: 'acc-008',
    envId: 'env-A08',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/120.0',
    resolution: '1366×768',
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    canvasHash: 'b5d7ef02',
    webglHash: 'c9e4a128',
    fontsCount: 44,
    pluginsCount: 3,
    status: 'isolated',
  },
  {
    accountId: 'acc-009',
    envId: 'env-A09',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) Safari/17.1',
    resolution: '2880×1800',
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    canvasHash: '5571c33b',
    webglHash: 'b6f29e44',
    fontsCount: 51,
    pluginsCount: 2,
    status: 'isolated',
  },
];

export const NETWORK_DATA: NetworkRecord[] = [
  {
    accountId: 'acc-001',
    proxyType: 'HTTPS',
    exitIp: '111.62.34.18',
    region: '湖北 武汉 · 电信',
    ipType: 'residential',
    dns: '114.114.114.114',
    dnsLeaked: false,
    webrtcLeaked: false,
    ipHistory: ['111.62.34.18', '111.62.34.16', '111.62.34.12'],
    lastTestedAt: '2025-01-15 15:00',
  },
  {
    accountId: 'acc-002',
    proxyType: 'HTTPS',
    exitIp: '116.31.121.84',
    region: '广东 深圳 · 联通',
    ipType: 'residential',
    dns: '114.114.114.114',
    dnsLeaked: false,
    webrtcLeaked: false,
    ipHistory: ['116.31.121.84', '116.31.121.80'],
    lastTestedAt: '2025-01-15 15:00',
  },
  {
    accountId: 'acc-003',
    proxyType: 'HTTPS',
    exitIp: '123.116.45.27',
    region: '北京 · 联通',
    ipType: 'residential',
    dns: '223.5.5.5',
    dnsLeaked: false,
    webrtcLeaked: false,
    ipHistory: ['123.116.45.27', '123.116.45.25'],
    lastTestedAt: '2025-01-15 15:00',
  },
  {
    accountId: 'acc-004',
    proxyType: 'HTTPS',
    exitIp: '125.65.108.40',
    region: '四川 成都 · 电信',
    ipType: 'residential',
    dns: '223.5.5.5',
    dnsLeaked: false,
    webrtcLeaked: false,
    ipHistory: ['125.65.108.40', '125.65.108.39'],
    lastTestedAt: '2025-01-15 15:00',
  },
  {
    accountId: 'acc-005',
    proxyType: 'HTTPS',
    exitIp: '183.131.207.65',
    region: '浙江 杭州 · 移动',
    ipType: 'residential',
    dns: '223.5.5.5',
    dnsLeaked: false,
    webrtcLeaked: false,
    ipHistory: ['183.131.207.65', '183.131.207.62'],
    lastTestedAt: '2025-01-15 15:00',
  },
  {
    accountId: 'acc-006',
    proxyType: 'HTTPS',
    exitIp: '113.108.234.71',
    region: '广东 广州 · 电信',
    ipType: 'datacenter', // ⚠️ 检测识别为机房特征：建议切换为住宅 IP
    dns: '8.8.8.8',
    dnsLeaked: false,
    webrtcLeaked: false,
    ipHistory: ['113.108.234.71', '113.108.234.68', '113.108.234.50'],
    lastTestedAt: '2025-01-15 15:00',
  },
  {
    accountId: 'acc-007',
    proxyType: 'HTTPS',
    exitIp: '218.106.96.20',
    region: '湖北 武汉 · 联通',
    ipType: 'residential',
    dns: '114.114.114.114',
    dnsLeaked: false,
    webrtcLeaked: false,
    ipHistory: ['218.106.96.20', '218.106.96.18'],
    lastTestedAt: '2025-01-15 15:00',
  },
  {
    accountId: 'acc-008',
    proxyType: 'HTTPS',
    exitIp: '119.39.108.16',
    region: '湖南 长沙 · 电信',
    ipType: 'residential',
    dns: '202.96.128.86', // ⚠️ 本地 DNS 泄漏
    dnsLeaked: true,
    webrtcLeaked: true,
    ipHistory: ['119.39.108.16', '119.39.108.12'],
    lastTestedAt: '2025-01-15 15:00',
  },
  {
    accountId: 'acc-009',
    proxyType: 'HTTPS',
    exitIp: '112.122.180.34',
    region: '江苏 南京 · 联通',
    ipType: 'residential',
    dns: '114.114.114.114',
    dnsLeaked: false,
    webrtcLeaked: false,
    ipHistory: ['112.122.180.34', '112.122.180.30'],
    lastTestedAt: '2025-01-15 15:00',
  },
];

function buildHourMatrix(
  peakDay: number,
  peakHour: number,
  intensity = 1,
): number[][] {
  // 7×24 矩阵，越靠近 (peakDay, peakHour) 越高
  const m: number[][] = [];
  for (let d = 0; d < 7; d++) {
    const row: number[] = [];
    for (let h = 0; h < 24; h++) {
      const dh = Math.min(Math.abs(d - peakDay), 7 - Math.abs(d - peakDay));
      const hh = Math.abs(h - peakHour);
      const dist = Math.sqrt(dh * dh + hh * hh * 0.4);
      const val = Math.max(0, 1 - dist / 8) * intensity;
      row.push(Math.min(1, val));
    }
    m.push(row);
  }
  return m;
}

export const BEHAVIOR_DATA: BehaviorRecord[] = [
  {
    accountId: 'acc-001',
    publishHour: '08:00-09:00', // ⚠️ 与 acc-007 同
    avgWords: 1850,
    emojiHabit: '少量「。」/「，」标准句读',
    imageStyle: '多图', // ⚠️ 与 acc-007 同
    freqPerDay: 3,
    interactionHabit: '回复率 28%',
    loginHour: '07:30/19:00',
    riskLevel: 'medium',
    hourMatrix: buildHourMatrix(2, 8, 1),
  },
  {
    accountId: 'acc-002',
    publishHour: '—',
    avgWords: 0,
    emojiHabit: '—',
    imageStyle: '纯文字',
    freqPerDay: 0,
    interactionHabit: '—',
    loginHour: '—',
    riskLevel: 'low',
    hourMatrix: buildHourMatrix(3, 13, 0),
  },
  {
    accountId: 'acc-003',
    publishHour: '—',
    avgWords: 0,
    emojiHabit: '—',
    imageStyle: '纯文字',
    freqPerDay: 0,
    interactionHabit: '—',
    loginHour: '—',
    riskLevel: 'low',
    hourMatrix: buildHourMatrix(5, 22, 0),
  },
  {
    accountId: 'acc-004',
    publishHour: '15:00-16:00（草稿）',
    avgWords: 1280, // ⚠️ 与 acc-005 接近
    emojiHabit: '极少使用表情',
    imageStyle: '多图', // ⚠️ 与 acc-005 同
    freqPerDay: 0,
    interactionHabit: '—',
    loginHour: '15:00',
    riskLevel: 'medium',
    hourMatrix: buildHourMatrix(4, 15, 0.6),
  },
  {
    accountId: 'acc-005',
    publishHour: '11:00-12:00（草稿）',
    avgWords: 1320, // ⚠️ 与 acc-004 接近
    emojiHabit: '常用本地俚语括号注释',
    imageStyle: '多图', // ⚠️ 与 acc-004 同
    freqPerDay: 0,
    interactionHabit: '—',
    loginHour: '10:30',
    riskLevel: 'medium',
    hourMatrix: buildHourMatrix(1, 11, 0.55),
  },
  {
    accountId: 'acc-006',
    publishHour: '—',
    avgWords: 0,
    emojiHabit: '—',
    imageStyle: '纯文字',
    freqPerDay: 0,
    interactionHabit: '—',
    loginHour: '—',
    riskLevel: 'low',
    hourMatrix: buildHourMatrix(6, 9, 0),
  },
  {
    accountId: 'acc-007',
    publishHour: '08:30-09:30', // ⚠️ 与 acc-001 接近
    avgWords: 1280,
    emojiHabit: '常用「…」省略号',
    imageStyle: '多图', // ⚠️ 与 acc-001 同
    freqPerDay: 2,
    interactionHabit: '回复率 38%',
    loginHour: '08:00/18:00',
    riskLevel: 'high',
    hourMatrix: buildHourMatrix(2, 9, 0.95),
  },
  {
    accountId: 'acc-008',
    publishHour: '—',
    avgWords: 0,
    emojiHabit: '—',
    imageStyle: '纯文字',
    freqPerDay: 0,
    interactionHabit: '—',
    loginHour: '—',
    riskLevel: 'low',
    hourMatrix: buildHourMatrix(0, 9, 0),
  },
  {
    accountId: 'acc-009',
    publishHour: '—',
    avgWords: 0,
    emojiHabit: '—',
    imageStyle: '纯文字',
    freqPerDay: 0,
    interactionHabit: '—',
    loginHour: '—',
    riskLevel: 'low',
    hourMatrix: buildHourMatrix(4, 19, 0),
  },
];

/** 静态预置告警（也可基于检测动态生成） */
export const INITIAL_RISK_ALERTS: RiskAlert[] = [
  {
    id: 'risk-fp-001',
    layer: '设备指纹层',
    level: 'high',
    title: '指纹雷同：UA / 分辨率 / 时区 / Canvas 完全一致',
    desc: '账号「机器人前线」与「斜杠副业指南」处于同一指纹环境，存在明显关联痕迹，建议为其重新生成独立指纹',
    involvedAccounts: ['acc-002', 'acc-006'],
    createdAt: '2025-01-15 15:00',
    resolved: false,
  },
  {
    id: 'risk-net-001',
    layer: '网络IP层',
    level: 'medium',
    title: '同城多号：武汉本地 IP',
    desc: '账号「HAO科技」与「武汉吃喝玩乐」均使用武汉出口 IP，业务上合理（本地号 + 科技号同城），但建议分别绑定不同运营商 / C 段以增强隔离',
    involvedAccounts: ['acc-001', 'acc-007'],
    createdAt: '2025-01-15 15:00',
    resolved: false,
  },
  {
    id: 'risk-net-002',
    layer: '网络IP层',
    level: 'high',
    title: '机房 IP：账号「斜杠副业指南」使用阿里云机房 IP',
    desc: '机房 IP 极易被识别为非真实用户，建议切换为住宅 IP',
    involvedAccounts: ['acc-006'],
    createdAt: '2025-01-15 15:00',
    resolved: false,
  },
  {
    id: 'risk-net-003',
    layer: '网络IP层',
    level: 'medium',
    title: 'DNS / WebRTC 泄漏',
    desc: '账号「乡村创业记」存在本地 DNS 与 WebRTC 真实 IP 泄漏风险，建议关闭 WebRTC、改用代理侧 DNS',
    involvedAccounts: ['acc-008'],
    createdAt: '2025-01-15 15:00',
    resolved: false,
  },
  {
    id: 'risk-acc-001',
    layer: '账号层',
    level: 'medium',
    title: '银行卡同 BIN 段',
    desc: '账号「HAO科技」与「武汉吃喝玩乐」绑定银行卡前 6 位相同（622848），可能为同一持卡人',
    involvedAccounts: ['acc-001', 'acc-007'],
    createdAt: '2025-01-15 15:00',
    resolved: false,
  },
  {
    id: 'risk-acc-002',
    layer: '账号层',
    level: 'low',
    title: '同号段虚拟运营商手机号',
    desc: '账号「机器人前线」与「爸妈健康指南」均使用 170 / 171 虚商号段，建议改用三大运营商实名号码',
    involvedAccounts: ['acc-002', 'acc-005'],
    createdAt: '2025-01-15 15:00',
    resolved: false,
  },
  {
    id: 'risk-beh-001',
    layer: '行为模式层',
    level: 'medium',
    title: '发文节奏接近',
    desc: '账号「HAO科技」与「武汉吃喝玩乐」均集中在 08:00-09:30 发文且配图风格相同，建议在差异化策略中错峰',
    involvedAccounts: ['acc-001', 'acc-007'],
    createdAt: '2025-01-15 15:00',
    resolved: false,
  },
  {
    id: 'risk-beh-002',
    layer: '行为模式层',
    level: 'low',
    title: '草稿字数接近',
    desc: '账号「日食一膳」与「爸妈健康指南」当前草稿平均字数差距 < 3%，正式发布前建议人为差异化',
    involvedAccounts: ['acc-004', 'acc-005'],
    createdAt: '2025-01-15 15:00',
    resolved: false,
  },
];

export const INITIAL_DETECTION_HISTORY: DetectionHistory[] = [
  {
    id: 'det-001',
    time: '2025-01-15 15:00:00',
    score: 72,
    high: 2,
    medium: 4,
    low: 2,
    triggeredBy: 'admin',
  },
  {
    id: 'det-002',
    time: '2025-01-14 10:32:11',
    score: 78,
    high: 1,
    medium: 3,
    low: 2,
    triggeredBy: 'system',
  },
  {
    id: 'det-003',
    time: '2025-01-12 21:08:45',
    score: 84,
    high: 0,
    medium: 3,
    low: 3,
    triggeredBy: 'admin',
  },
  {
    id: 'det-004',
    time: '2025-01-10 09:12:30',
    score: 90,
    high: 0,
    medium: 1,
    low: 4,
    triggeredBy: 'system',
  },
];

/** 城市坐标（简化版用于地理分布展示）。覆盖 9 账号实际所在城市 */
export const CITY_POINTS: {
  city: string;
  x: number; // SVG 坐标 0-1000
  y: number; // SVG 坐标 0-600
}[] = [
  { city: '北京', x: 720, y: 200 },
  { city: '深圳', x: 680, y: 520 },
  { city: '广州', x: 670, y: 510 },
  { city: '杭州', x: 770, y: 380 },
  { city: '成都', x: 480, y: 380 },
  { city: '武汉', x: 660, y: 360 },
  { city: '长沙', x: 620, y: 420 },
  { city: '南京', x: 740, y: 350 },
  { city: '上海', x: 800, y: 360 },
];
