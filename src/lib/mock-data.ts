import type {
  Account,
  Article,
  Proxy,
  OperationLog,
  DailyMetric,
} from './types';

// 固定种子，避免 Hydration 不一致
// 9 个正式账号：HAO科技 / 武汉吃喝玩乐 为已上线主号，其余 7 个为待注册环境
const ACCOUNT_NAMES: Account[] = [
  {
    id: 'acc-001',
    name: 'HAO科技',
    avatar: 'H',
    category: '科技',
    loginStatus: 'online',
    launchStatus: 'launched',
    city: '武汉',
    todayPublished: 3,
    todayLimit: 5,
    lastPublishAt: '2025-01-15 14:32',
    totalReads: 16_582_440,
    totalFollowers: 124_580,
    totalLikes: 742_310,
    totalIncome: 48_120,
    cookie: 'sessionid=HaO***xY9; expires=2025-12-31',
    phone: '138****1024',
    remark: '矩阵主号，主推 AI、机器人、半导体',
    proxyId: 'proxy-001',
  },
  {
    id: 'acc-002',
    name: '机器人前线',
    avatar: 'R',
    category: '科技',
    loginStatus: 'offline',
    launchStatus: 'pending',
    city: '深圳',
    todayPublished: 0,
    todayLimit: 4,
    lastPublishAt: '—',
    totalReads: 0,
    totalFollowers: 0,
    totalLikes: 0,
    totalIncome: 0,
    cookie: '',
    phone: '139****2048',
    remark: '机器人垂直资讯，待注册',
    proxyId: 'proxy-002',
  },
  {
    id: 'acc-003',
    name: '退休养老那些事儿',
    avatar: '老',
    category: '民生',
    loginStatus: 'offline',
    launchStatus: 'pending',
    city: '北京',
    todayPublished: 0,
    todayLimit: 3,
    lastPublishAt: '—',
    totalReads: 0,
    totalFollowers: 0,
    totalLikes: 0,
    totalIncome: 0,
    cookie: '',
    phone: '137****4096',
    remark: '民生 / 养老方向，待注册',
    proxyId: 'proxy-003',
  },
  {
    id: 'acc-004',
    name: '日食一膳',
    avatar: '膳',
    category: '养生',
    loginStatus: 'offline',
    launchStatus: 'pending',
    city: '成都',
    todayPublished: 0,
    todayLimit: 3,
    lastPublishAt: '—',
    totalReads: 0,
    totalFollowers: 0,
    totalLikes: 0,
    totalIncome: 0,
    cookie: '',
    phone: '136****8192',
    remark: '饮食养生，待注册',
    proxyId: 'proxy-004',
  },
  {
    id: 'acc-005',
    name: '爸妈健康指南',
    avatar: '康',
    category: '养生',
    loginStatus: 'offline',
    launchStatus: 'pending',
    city: '杭州',
    todayPublished: 0,
    todayLimit: 3,
    lastPublishAt: '—',
    totalReads: 0,
    totalFollowers: 0,
    totalLikes: 0,
    totalIncome: 0,
    cookie: '',
    phone: '135****1638',
    remark: '中老年健康，待注册',
    proxyId: 'proxy-005',
  },
  {
    id: 'acc-006',
    name: '斜杠副业指南',
    avatar: '斜',
    category: '副业',
    loginStatus: 'offline',
    launchStatus: 'pending',
    city: '广州',
    todayPublished: 0,
    todayLimit: 4,
    lastPublishAt: '—',
    totalReads: 0,
    totalFollowers: 0,
    totalLikes: 0,
    totalIncome: 0,
    cookie: '',
    phone: '134****3276',
    remark: '职场 / 副业内容，待注册',
    proxyId: 'proxy-006',
  },
  {
    id: 'acc-007',
    name: '武汉吃喝玩乐',
    avatar: '汉',
    category: '本地',
    loginStatus: 'online',
    launchStatus: 'launched',
    city: '武汉',
    todayPublished: 2,
    todayLimit: 4,
    lastPublishAt: '2025-01-15 11:22',
    totalReads: 5_286_310,
    totalFollowers: 38_420,
    totalLikes: 192_840,
    totalIncome: 10_545,
    cookie: 'sessionid=WhU***sP1; expires=2025-12-31',
    phone: '133****6553',
    remark: '武汉本地生活，已上线',
    proxyId: 'proxy-007',
  },
  {
    id: 'acc-008',
    name: '乡村创业记',
    avatar: '农',
    category: '三农',
    loginStatus: 'offline',
    launchStatus: 'pending',
    city: '长沙',
    todayPublished: 0,
    todayLimit: 3,
    lastPublishAt: '—',
    totalReads: 0,
    totalFollowers: 0,
    totalLikes: 0,
    totalIncome: 0,
    cookie: '',
    phone: '132****1310',
    remark: '三农 / 乡村创业，待注册',
    proxyId: 'proxy-008',
  },
  {
    id: 'acc-009',
    name: '家常故事汇',
    avatar: '家',
    category: '情感',
    loginStatus: 'offline',
    launchStatus: 'pending',
    city: '南京',
    todayPublished: 0,
    todayLimit: 4,
    lastPublishAt: '—',
    totalReads: 0,
    totalFollowers: 0,
    totalLikes: 0,
    totalIncome: 0,
    cookie: '',
    phone: '131****2621',
    remark: '家庭情感故事，待注册',
    proxyId: 'proxy-009',
  },
];

const ARTICLE_TITLES: { title: string; summary: string }[] = [
  {
    title: 'DeepSeek V3 发布：开源大模型再次刷新性价比',
    summary: '从架构、训练成本与基准评测三个维度复盘 V3 的实际表现。',
  },
  {
    title: '波士顿动力 Atlas 量产：人形机器人离工厂还有多远',
    summary: '从硬件迭代、运动控制、批量制造三个角度盘点最新进展。',
  },
  {
    title: '退休后存款 50 万够花吗？理财师给出 3 套方案',
    summary: '从居住成本、医疗预备金、通胀对冲三方面拆解养老资金规划。',
  },
  {
    title: '冬日代谢慢？营养师推荐的 7 种厨房常备食材',
    summary: '不靠保健品，靠厨房就能完成的简单调理方案。',
  },
  {
    title: '父母这 5 种「养生习惯」其实最伤身，子女要早提醒',
    summary: '从早餐迷信、过度补钙到盲目泡脚，逐条拆解中老年误区。',
  },
  {
    title: '一个人也能跑通的 5 种副业：稳定且不与主业冲突',
    summary: '从内容、技能、信息差三类机会出发，给出可执行路径。',
  },
  {
    title: '武汉过早地图：本地人偷偷收藏的 12 家老字号',
    summary: '热干面、豆皮、面窝、糊汤粉……过早怎么吃才正宗。',
  },
  {
    title: '90 后回村做电商：一年把柚子卖到 800 万',
    summary: '一个真实创业案例的完整路径与关键数据节点。',
  },
  {
    title: '两个人最舒服的关系，是允许彼此偶尔的沉默',
    summary: '心理学视角下的亲密关系节奏感。',
  },
  {
    title: 'Apple Vision Pro 一年后：真戴用户的 8 条吐槽',
    summary: '从重量到生态短板，真实佩戴 12 个月的反馈合集。',
  },
];

function pseudoRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildArticles(): Article[] {
  const list: Article[] = [];
  const launchedStatuses: Article['status'][] = [
    'published',
    'published',
    'published',
    'published',
    'published',
    'published',
    'queued',
    'publishing',
    'failed',
    'draft',
  ];
  // 待注册账号只有少量草稿 / 待排期内容
  const pendingStatuses: Article['status'][] = [
    'draft',
    'draft',
    'queued',
    'draft',
  ];
  ACCOUNT_NAMES.forEach((acc, accIdx) => {
    const statuses =
      acc.launchStatus === 'launched' ? launchedStatuses : pendingStatuses;
    for (let i = 0; i < statuses.length; i++) {
      const titleSrc = ARTICLE_TITLES[(accIdx + i) % ARTICLE_TITLES.length];
      const seed = accIdx * 100 + i + 1;
      const status = statuses[i];
      // 不同账号阅读量基数差异（主号高，本地号中，其他号 0）
      const baseRead =
        acc.id === 'acc-001'
          ? 420_000
          : acc.id === 'acc-007'
            ? 95_000
            : 0;
      const reads =
        status === 'published'
          ? Math.floor(pseudoRandom(seed) * baseRead) + Math.floor(baseRead * 0.1)
          : 0;
      const likes = Math.floor(reads * (0.02 + pseudoRandom(seed + 1) * 0.03));
      const comments = Math.floor(reads * 0.005);
      const shares = Math.floor(reads * 0.003);
      const dayOffset = Math.floor(pseudoRandom(seed + 2) * 28);
      const baseDate = new Date(2025, 0, 15);
      baseDate.setDate(baseDate.getDate() - dayOffset);
      const publishedAt = baseDate.toISOString().slice(0, 10) + ' 09:30';

      list.push({
        id: `art-${acc.id}-${String(i).padStart(2, '0')}`,
        title: `${titleSrc.title}${i > 0 ? `（${i + 1}）` : ''}`,
        summary: titleSrc.summary,
        content: `# ${titleSrc.title}\n\n${titleSrc.summary}\n\n这里是文章正文示例段落，介绍本期主要观点、关键数据与背景信息。`,
        accountId: status === 'draft' ? undefined : acc.id,
        status,
        scheduledAt:
          status === 'queued' ? '2025-01-16 09:00' : undefined,
        publishedAt: status === 'published' ? publishedAt : undefined,
        reads,
        likes,
        comments,
        shares,
        failReason:
          status === 'failed' ? 'Cookie 已失效，需重新登录后重试' : undefined,
        coverMode: acc.id === 'acc-001' ? 'triple' : 'single',
        coverImages:
          acc.id === 'acc-001'
            ? ['/uploads/cover-placeholder-1.png', '/uploads/cover-placeholder-2.png', '/uploads/cover-placeholder-3.png']
            : ['/uploads/cover-placeholder-1.png'],
        adEnabled: true,
        isFirstPublish: acc.id === 'acc-001',
        collections: [],
        crossPostWeitoutiao: true,
        declarations: [],
      });
    }
  });
  return list;
}

const PROXIES: Proxy[] = [
  {
    id: 'proxy-001',
    name: '武汉-电信-01',
    type: 'HTTPS',
    host: '111.62.34.18',
    port: 8443,
    username: 'matrix01',
    password: '******',
    bindCity: '武汉',
    realExitIp: '111.62.34.18',
    exitRegion: '湖北 武汉 · 电信',
    health: 'green',
    latencyMs: 42,
    lastTestedAt: '2025-01-15 15:00',
    boundAccountId: 'acc-001',
  },
  {
    id: 'proxy-002',
    name: '深圳-联通-02',
    type: 'HTTPS',
    host: '116.31.121.84',
    port: 8443,
    username: 'matrix02',
    password: '******',
    bindCity: '深圳',
    realExitIp: '116.31.121.84',
    exitRegion: '广东 深圳 · 联通',
    health: 'green',
    latencyMs: 51,
    lastTestedAt: '2025-01-15 15:00',
    boundAccountId: 'acc-002',
  },
  {
    id: 'proxy-003',
    name: '北京-联通-03',
    type: 'HTTPS',
    host: '123.116.45.27',
    port: 8443,
    username: 'matrix03',
    password: '******',
    bindCity: '北京',
    realExitIp: '123.116.45.27',
    exitRegion: '北京 · 联通',
    health: 'green',
    latencyMs: 38,
    lastTestedAt: '2025-01-15 15:00',
    boundAccountId: 'acc-003',
  },
  {
    id: 'proxy-004',
    name: '成都-电信-04',
    type: 'HTTPS',
    host: '125.65.108.40',
    port: 8443,
    username: 'matrix04',
    password: '******',
    bindCity: '成都',
    realExitIp: '125.65.108.40',
    exitRegion: '四川 成都 · 电信',
    health: 'green',
    latencyMs: 48,
    lastTestedAt: '2025-01-15 15:00',
    boundAccountId: 'acc-004',
  },
  {
    id: 'proxy-005',
    name: '杭州-移动-05',
    type: 'HTTPS',
    host: '183.131.207.65',
    port: 8443,
    username: 'matrix05',
    password: '******',
    bindCity: '杭州',
    realExitIp: '183.131.207.65',
    exitRegion: '浙江 杭州 · 移动',
    health: 'green',
    latencyMs: 36,
    lastTestedAt: '2025-01-15 15:00',
    boundAccountId: 'acc-005',
  },
  {
    id: 'proxy-006',
    name: '广州-电信-06',
    type: 'HTTPS',
    host: '113.108.234.71',
    port: 8443,
    username: 'matrix06',
    password: '******',
    bindCity: '广州',
    realExitIp: '113.108.234.71',
    exitRegion: '广东 广州 · 电信',
    health: 'green',
    latencyMs: 41,
    lastTestedAt: '2025-01-15 15:00',
    boundAccountId: 'acc-006',
  },
  {
    id: 'proxy-007',
    name: '武汉-联通-07',
    type: 'HTTPS',
    host: '218.106.96.20',
    port: 8443,
    username: 'matrix07',
    password: '******',
    bindCity: '武汉',
    realExitIp: '218.106.96.20',
    exitRegion: '湖北 武汉 · 联通',
    health: 'green',
    latencyMs: 44,
    lastTestedAt: '2025-01-15 15:00',
    boundAccountId: 'acc-007',
  },
  {
    id: 'proxy-008',
    name: '长沙-电信-08',
    type: 'HTTPS',
    host: '119.39.108.16',
    port: 8443,
    username: 'matrix08',
    password: '******',
    bindCity: '长沙',
    realExitIp: '119.39.108.16',
    exitRegion: '湖南 长沙 · 电信',
    health: 'green',
    latencyMs: 56,
    lastTestedAt: '2025-01-15 15:00',
    boundAccountId: 'acc-008',
  },
  {
    id: 'proxy-009',
    name: '南京-联通-09',
    type: 'HTTPS',
    host: '112.122.180.34',
    port: 8443,
    username: 'matrix09',
    password: '******',
    bindCity: '南京',
    realExitIp: '112.122.180.34',
    exitRegion: '江苏 南京 · 联通',
    health: 'green',
    latencyMs: 62,
    lastTestedAt: '2025-01-15 15:00',
    boundAccountId: 'acc-009',
  },
];

const LOGS: OperationLog[] = [
  {
    id: 'log-001',
    time: '2025-01-15 15:50:12',
    action: '发布文章',
    target: 'HAO科技 → DeepSeek V3 发布',
    operator: 'admin',
    status: 'success',
  },
  {
    id: 'log-002',
    time: '2025-01-15 15:00:01',
    action: '代理测试',
    target: '广州-移动-06（斜杠副业指南）',
    operator: 'system',
    status: 'failed',
    detail: '延迟过高（320ms），建议切换备用线路',
  },
  {
    id: 'log-003',
    time: '2025-01-15 14:32:55',
    action: '发布文章',
    target: 'HAO科技 → 波士顿动力 Atlas 量产',
    operator: 'admin',
    status: 'success',
  },
  {
    id: 'log-004',
    time: '2025-01-15 13:05:18',
    action: '账号注册环境就绪',
    target: '退休养老那些事儿',
    operator: 'admin',
    status: 'success',
    detail: 'IP / 指纹 / 代理已配置完毕，等待注册',
  },
  {
    id: 'log-005',
    time: '2025-01-15 11:22:40',
    action: '发布文章',
    target: '武汉吃喝玩乐 → 武汉过早地图',
    operator: 'admin',
    status: 'success',
  },
  {
    id: 'log-006',
    time: '2025-01-15 09:18:22',
    action: '一键分发',
    target: 'HAO科技 / 武汉吃喝玩乐',
    operator: 'admin',
    status: 'success',
    detail: '差异化改写已应用',
  },
  {
    id: 'log-007',
    time: '2025-01-14 22:18:10',
    action: '安全检测',
    target: '机器人前线（指纹环境）',
    operator: 'system',
    status: 'success',
    detail: '通过 - UA / 分辨率 / 时区独立',
  },
];

function buildDailyMetrics(days = 30): DailyMetric[] {
  const list: DailyMetric[] = [];
  const base = new Date(2025, 0, 15);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const seed = i + 1;
    // 当前仅 HAO科技 + 武汉吃喝玩乐 已上线，所以日产能不高
    list.push({
      date: d.toISOString().slice(0, 10),
      reads: Math.floor(95_000 + pseudoRandom(seed) * 65_000),
      followers: Math.floor(120 + pseudoRandom(seed + 1) * 260),
      income: Math.floor(380 + pseudoRandom(seed + 2) * 520),
      publishCount: Math.floor(3 + pseudoRandom(seed + 3) * 4),
    });
  }
  return list;
}

export const MOCK_ACCOUNTS: Account[] = ACCOUNT_NAMES;
export const MOCK_ARTICLES: Article[] = buildArticles();
export const MOCK_PROXIES: Proxy[] = PROXIES;
export const MOCK_LOGS: OperationLog[] = LOGS;
export const MOCK_DAILY_METRICS: DailyMetric[] = buildDailyMetrics(30);

export const CATEGORY_LIST: Account['category'][] = [
  '科技',
  '民生',
  '养生',
  '副业',
  '本地',
  '三农',
  '情感',
];
