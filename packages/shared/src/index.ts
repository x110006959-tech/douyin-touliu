import { z } from "zod";
import { snapshotSafetyLimits } from "./safety.js";
import { collectionRouteKeys } from "./collection-routes.js";

export * from "./safety.js";
export * from "./collection-routes.js";

export const businessTypes = ["DOUYIN_LOCAL_LIFE"] as const;
export const subjectTypes = [
  "SUBJECT_PENDING",
  "MERCHANT_OFFICIAL",
  "PROFESSIONAL",
  "EXTERNAL_CREATOR",
  "CREATOR_MATRIX",
  "SERVICE_PROVIDER",
  "PLATFORM_EVENT",
  "BRAND_REGION_MATRIX"
] as const;
export const operatorTypes = [
  "OPERATOR_PENDING",
  "MERCHANT_SELF",
  "SERVICE_PROVIDER_LIVE",
  "SERVICE_PROVIDER_OPERATION",
  "CREATOR_SELF",
  "AGENCY_LEADER",
  "PLATFORM_OPERATION",
  "BRAND_REGION"
] as const;
export const cooperationTypes = [
  "COOPERATION_PENDING",
  "NONE",
  "PROFESSIONAL_BINDING",
  "CREATOR_COOPERATION",
  "SERVICE_PROVIDER_CONTRACT",
  "PLATFORM_INVITATION",
  "BRAND_MATRIX"
] as const;
export const controlLevels = ["PENDING", "HIGH", "MEDIUM", "LOW"] as const;
export const collectionTaskStatuses = ["PENDING", "COLLECTING", "REVIEWING", "UPLOADED", "PROCESSING", "ANALYZED", "FAILED"] as const;
export const riskLevels = ["LOW", "MEDIUM", "HIGH"] as const;
export const analysisStatuses = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED"] as const;
export const pageTypes = ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN", "TASK_TABLE", "UNKNOWN"] as const;
export const actionTypes = [
  "OBSERVE",
  "INCREASE_BUDGET",
  "DECREASE_BUDGET",
  "KEEP_BUDGET",
  "FINE_TUNE_TARGETING",
  "DECREASE_BID",
  "PAUSE_TASK",
  "ADJUST_ROI_TARGET",
  "CHECK_LIVE_ROOM",
  "CHECK_CREATIVE",
  "CHECK_AUDIENCE",
  "VERIFY_ACTIVITY",
  "APPLY_ACTIVITY",
  "OPTIMIZE_SCRIPT",
  "REPAIR_REPUTATION",
  "STRENGTHEN_SHELF",
  "CHECK_INVENTORY_BOOKING",
  "OPTIMIZE_POI_SEARCH",
  "REPLACE_CREATOR",
  "UNIFY_CREATOR_SCRIPT",
  "ADJUST_SERVICE_PROVIDER_SOP",
  "RENEGOTIATE_SERVICE_FEE",
  "REUSE_MATERIAL",
  "ALLOCATE_HIGH_VERIFY_STORES",
  "CALIBRATE_SUBJECT",
  "REQUEST_MANUAL_REVIEW"
] as const;
export const actionProposalStatuses = ["PENDING_APPROVAL", "APPROVED", "REJECTED", "OBSERVING", "MANUAL_EXECUTED", "EXPIRED", "SUPERSEDED"] as const;
export const approvalDecisions = ["APPROVE", "REJECT", "APPROVED", "REJECTED", "OBSERVE"] as const;
export const executionModes = ["MANUAL"] as const;
export const executionStatuses = ["PENDING", "MANUAL_EXECUTED", "FAILED"] as const;
export const metricSources = ["XHR_JSON", "TABLE", "DOM_TEXT", "SCREENSHOT", "MANUAL_INPUT", "UNKNOWN"] as const;
export const metricReviewStatuses = ["PENDING", "CONFIRMED", "MODIFIED", "IGNORED"] as const;
export const dataReviewStatuses = ["REVIEWED", "UNREVIEWED"] as const;
export const metricLayers = ["REVIEWED_METRIC", "NORMALIZED_METRIC"] as const;
export const metricKeys = [
  "unknown",
  "verify_roi",
  "gross_profit_roi",
  "pay_roi",
  "target_roi",
  "spend",
  "daily_budget",
  "remaining_budget",
  "recent_30m_spend",
  "recent_30m_orders",
  "live_duration_minutes",
  "minutes_since_last_adjustment",
  "orders",
  "impressions",
  "clicks",
  "ctr",
  "cpa",
  "target_cpa",
  "live_viewers",
  "gpm",
  "gmv",
  "gross_profit",
  "merchant_subsidy",
  "service_fee",
  "store_rating",
  "complaint_rate",
  "refund_rate",
  "fulfillment_exception_rate",
  "inventory_capacity",
  "wrong_price_promise_risk",
  "activity_verified",
  "platform_subsidy",
  "ad_coupon",
  "rebate_coupon",
  "shelf_gmv",
  "search_gmv",
  "poi_visits",
  "store_searches"
] as const;
export const metricCategories = ["ROI", "COST", "CONVERSION", "TRAFFIC", "LIVE_ROOM", "FULL_DOMAIN", "SERVICE_PROVIDER", "RISK", "ACTIVITY", "TIMING", "UNKNOWN"] as const;
export const observationWindows = ["30m", "2h", "1d", "custom"] as const;
export const actionOutcomeResults = ["IMPROVED", "WORSENED", "NO_CHANGE", "UNCLEAR"] as const;

export type BusinessType = (typeof businessTypes)[number];
export type SubjectType = (typeof subjectTypes)[number];
export type OperatorType = (typeof operatorTypes)[number];
export type CooperationType = (typeof cooperationTypes)[number];
export type ControlLevel = (typeof controlLevels)[number];
export type CollectionTaskStatus = (typeof collectionTaskStatuses)[number];
export type RiskLevel = (typeof riskLevels)[number];
export type AnalysisStatus = (typeof analysisStatuses)[number];
export type PageType = (typeof pageTypes)[number];
export type ActionType = (typeof actionTypes)[number];
export type ActionProposalStatus = (typeof actionProposalStatuses)[number];
export type ApprovalDecision = (typeof approvalDecisions)[number];
export type ExecutionMode = (typeof executionModes)[number];
export type ExecutionStatus = (typeof executionStatuses)[number];
export type MetricSource = (typeof metricSources)[number];
export type MetricReviewStatus = (typeof metricReviewStatuses)[number];
export type DataReviewStatus = (typeof dataReviewStatuses)[number];
export type MetricLayer = (typeof metricLayers)[number];
export type MetricKey = (typeof metricKeys)[number];
export type MetricCategory = (typeof metricCategories)[number];
export type ObservationWindow = (typeof observationWindows)[number];
export type ActionOutcomeResult = (typeof actionOutcomeResults)[number];

export const subjectTypeLabels: Record<SubjectType, string> = {
  SUBJECT_PENDING: "主体待校准",
  MERCHANT_OFFICIAL: "商家官方自播",
  PROFESSIONAL: "职人/店长直播",
  EXTERNAL_CREATOR: "外部达人直播",
  CREATOR_MATRIX: "达人矩阵/机构团长",
  SERVICE_PROVIDER: "服务商代播/代运营",
  PLATFORM_EVENT: "平台活动/官方会场",
  BRAND_REGION_MATRIX: "品牌/区域矩阵"
};

export const operatorTypeLabels: Record<OperatorType, string> = {
  OPERATOR_PENDING: "操盘待校准",
  MERCHANT_SELF: "商家自播",
  SERVICE_PROVIDER_LIVE: "服务商代播",
  SERVICE_PROVIDER_OPERATION: "服务商代运营",
  CREATOR_SELF: "达人本人",
  AGENCY_LEADER: "机构团长",
  PLATFORM_OPERATION: "平台招商活动",
  BRAND_REGION: "品牌/区域运营"
};

export const cooperationTypeLabels: Record<CooperationType, string> = {
  COOPERATION_PENDING: "合作关系待校准",
  NONE: "无",
  PROFESSIONAL_BINDING: "职人绑定",
  CREATOR_COOPERATION: "达人合作",
  SERVICE_PROVIDER_CONTRACT: "服务商合同",
  PLATFORM_INVITATION: "平台招商",
  BRAND_MATRIX: "品牌矩阵"
};

export const controlLevelLabels: Record<ControlLevel, string> = {
  PENDING: "可控程度待校准",
  HIGH: "高",
  MEDIUM: "中",
  LOW: "低"
};

export const diagnosisActionLibrary = [
  "加预算",
  "稳预算",
  "微调定向",
  "降低出价",
  "暂停跑量",
  "核验活动",
  "报名活动",
  "优化讲解",
  "修复口碑",
  "强化货架承接",
  "检查库存/预约",
  "优化 POI/搜索承接",
  "更换达人",
  "统一达人话术",
  "调整服务商 SOP",
  "重谈服务费用",
  "沉淀素材复投",
  "倾斜高核销门店",
  "主体识别校准"
] as const;

export type DiagnosisAction = (typeof diagnosisActionLibrary)[number];

export const actionTypeLabels: Record<ActionType, string> = {
  OBSERVE: "继续观察",
  INCREASE_BUDGET: "加预算",
  DECREASE_BUDGET: "降预算",
  KEEP_BUDGET: "稳预算",
  FINE_TUNE_TARGETING: "微调定向",
  DECREASE_BID: "降低出价",
  PAUSE_TASK: "暂停跑量",
  ADJUST_ROI_TARGET: "调整 ROI 目标",
  CHECK_LIVE_ROOM: "检查直播间承接",
  CHECK_CREATIVE: "检查素材/创意",
  CHECK_AUDIENCE: "检查人群/定向",
  VERIFY_ACTIVITY: "核验活动",
  APPLY_ACTIVITY: "报名活动",
  OPTIMIZE_SCRIPT: "优化讲解",
  REPAIR_REPUTATION: "修复口碑",
  STRENGTHEN_SHELF: "强化货架承接",
  CHECK_INVENTORY_BOOKING: "检查库存/预约",
  OPTIMIZE_POI_SEARCH: "优化 POI/搜索承接",
  REPLACE_CREATOR: "更换达人",
  UNIFY_CREATOR_SCRIPT: "统一达人话术",
  ADJUST_SERVICE_PROVIDER_SOP: "调整服务商 SOP",
  RENEGOTIATE_SERVICE_FEE: "重谈服务费用",
  REUSE_MATERIAL: "沉淀素材复投",
  ALLOCATE_HIGH_VERIFY_STORES: "倾斜高核销门店",
  CALIBRATE_SUBJECT: "主体识别校准",
  REQUEST_MANUAL_REVIEW: "人工复核"
};

export const actionProposalStatusLabels: Record<ActionProposalStatus, string> = {
  PENDING_APPROVAL: "待人工审批",
  APPROVED: "已审批",
  REJECTED: "已拒绝",
  OBSERVING: "观察中",
  MANUAL_EXECUTED: "人工已执行",
  EXPIRED: "已过期",
  SUPERSEDED: "已被新建议替代"
};

export const approvalDecisionLabels: Record<ApprovalDecision, string> = {
  APPROVE: "通过",
  REJECT: "拒绝",
  APPROVED: "通过",
  REJECTED: "拒绝",
  OBSERVE: "观察"
};

export const executionModeLabels: Record<ExecutionMode, string> = {
  MANUAL: "人工执行"
};

export const executionStatusLabels: Record<ExecutionStatus, string> = {
  PENDING: "待记录",
  MANUAL_EXECUTED: "人工已执行",
  FAILED: "执行记录异常"
};

export const metricKeyLabels: Record<MetricKey, string> = {
  unknown: "未知指标",
  verify_roi: "核销 ROI",
  gross_profit_roi: "毛利 ROI",
  pay_roi: "支付 ROI",
  target_roi: "目标 ROI",
  spend: "消耗",
  daily_budget: "日预算",
  remaining_budget: "剩余预算",
  recent_30m_spend: "近 30 分钟消耗",
  recent_30m_orders: "近 30 分钟订单数",
  live_duration_minutes: "开播时长（分钟）",
  minutes_since_last_adjustment: "距上次调价（分钟）",
  orders: "成交订单数",
  impressions: "曝光量",
  clicks: "点击量",
  ctr: "点击率",
  cpa: "订单成本",
  target_cpa: "目标 CPA",
  live_viewers: "直播间观看人数",
  gpm: "GPM",
  gmv: "GMV",
  gross_profit: "核销毛利",
  merchant_subsidy: "商家补贴",
  service_fee: "服务商费用",
  store_rating: "门店评分",
  complaint_rate: "投诉率",
  refund_rate: "退款率",
  fulfillment_exception_rate: "履约异常率",
  inventory_capacity: "库存/预约承接量",
  wrong_price_promise_risk: "错价/承诺风险",
  activity_verified: "活动后台核验状态",
  platform_subsidy: "平台补贴",
  ad_coupon: "投放券",
  rebate_coupon: "消返券",
  shelf_gmv: "货架成交 GMV",
  search_gmv: "搜索成交 GMV",
  poi_visits: "POI 访问量",
  store_searches: "门店搜索量"
};

export const metricKeyCategories: Record<MetricKey, MetricCategory> = {
  unknown: "UNKNOWN",
  verify_roi: "ROI",
  gross_profit_roi: "ROI",
  pay_roi: "ROI",
  target_roi: "ROI",
  spend: "COST",
  daily_budget: "COST",
  remaining_budget: "COST",
  recent_30m_spend: "TIMING",
  recent_30m_orders: "TIMING",
  live_duration_minutes: "TIMING",
  minutes_since_last_adjustment: "TIMING",
  orders: "CONVERSION",
  impressions: "TRAFFIC",
  clicks: "TRAFFIC",
  ctr: "TRAFFIC",
  cpa: "COST",
  target_cpa: "COST",
  live_viewers: "LIVE_ROOM",
  gpm: "LIVE_ROOM",
  gmv: "CONVERSION",
  gross_profit: "CONVERSION",
  merchant_subsidy: "COST",
  service_fee: "SERVICE_PROVIDER",
  store_rating: "RISK",
  complaint_rate: "RISK",
  refund_rate: "RISK",
  fulfillment_exception_rate: "RISK",
  inventory_capacity: "RISK",
  wrong_price_promise_risk: "RISK",
  activity_verified: "ACTIVITY",
  platform_subsidy: "ACTIVITY",
  ad_coupon: "ACTIVITY",
  rebate_coupon: "ACTIVITY",
  shelf_gmv: "FULL_DOMAIN",
  search_gmv: "FULL_DOMAIN",
  poi_visits: "FULL_DOMAIN",
  store_searches: "FULL_DOMAIN"
};

export const metricAliases: Record<MetricKey, readonly string[]> = {
  unknown: [],
  verify_roi: ["verify_roi", "核销 ROI", "核销ROI", "核销roi"],
  gross_profit_roi: ["gross_profit_roi", "毛利 ROI", "毛利ROI", "核销毛利 ROI", "核销毛利ROI"],
  pay_roi: ["pay_roi", "支付 ROI", "支付ROI", "付款 ROI", "付款ROI"],
  target_roi: ["target_roi", "目标 ROI", "目标ROI"],
  spend: ["spend", "消耗", "广告消耗", "今日消耗", "投放消耗"],
  daily_budget: ["daily_budget", "日预算", "预算"],
  remaining_budget: ["remaining_budget", "剩余预算"],
  recent_30m_spend: ["recent_30m_spend", "近30分钟消耗", "近 30 分钟消耗"],
  recent_30m_orders: ["recent_30m_orders", "近30分钟订单", "近 30 分钟订单数"],
  live_duration_minutes: ["live_duration_minutes", "开播时长", "直播时长", "已开播分钟"],
  minutes_since_last_adjustment: ["minutes_since_last_adjustment", "距上次调价", "距上次调整", "最近一次调价时间"],
  orders: ["orders", "order_count", "conversions", "成交订单数", "成交人数", "支付订单", "支付订单数"],
  impressions: ["impressions", "曝光量", "曝光次数", "商品曝光人数", "直播曝光人数", "直播曝光次数"],
  clicks: ["clicks", "点击量", "点击人数", "商品点击人数"],
  ctr: ["ctr", "CTR", "点击率", "商品点击率", "曝光点击率"],
  cpa: ["cpa", "cost_per_order", "order_cost", "转化成本", "成交成本", "订单成本", "CPA"],
  target_cpa: ["target_cpa", "target_cost", "目标 CPA", "目标CPA", "目标成本"],
  live_viewers: ["live_viewers", "viewers", "直播间观看人数", "观看人数", "看播人数", "累计在线人数"],
  gpm: ["gpm", "GPM", "千次观看成交金额"],
  gmv: ["gmv", "GMV", "成交金额", "支付金额"],
  gross_profit: ["gross_profit", "核销毛利", "毛利"],
  merchant_subsidy: ["merchant_subsidy", "商家补贴"],
  service_fee: ["service_fee", "服务费", "服务商费用"],
  store_rating: ["store_rating", "门店评分", "体验分", "经营分"],
  complaint_rate: ["complaint_rate", "投诉率", "客诉率"],
  refund_rate: ["refund_rate", "退款率"],
  fulfillment_exception_rate: ["fulfillment_exception_rate", "履约异常率", "履约异常"],
  inventory_capacity: ["inventory_capacity", "库存承接", "预约承接", "可接待量"],
  wrong_price_promise_risk: ["wrong_price_promise_risk", "错价风险", "虚假承诺", "承诺风险"],
  activity_verified: ["activity_verified", "活动已核验", "后台核验", "活动核验状态"],
  platform_subsidy: ["platform_subsidy", "平台补贴"],
  ad_coupon: ["ad_coupon", "投放券"],
  rebate_coupon: ["rebate_coupon", "消返券"],
  shelf_gmv: ["shelf_gmv", "货架成交 GMV", "货架成交GMV", "团购货架"],
  search_gmv: ["search_gmv", "搜索成交 GMV", "搜索成交GMV", "搜索成交"],
  poi_visits: ["poi_visits", "POI 访问量", "POI访问量", "POI访问", "门店访问"],
  store_searches: ["store_searches", "门店搜索量", "搜索量"]
};

export const observationWindowLabels: Record<ObservationWindow, string> = {
  "30m": "30 分钟",
  "2h": "2 小时",
  "1d": "1 天",
  custom: "自定义"
};

export const actionOutcomeResultLabels: Record<ActionOutcomeResult, string> = {
  IMPROVED: "改善",
  WORSENED: "变差",
  NO_CHANGE: "无明显变化",
  UNCLEAR: "不明确"
};

export const diagnosisActionToActionType: Record<DiagnosisAction, ActionType> = {
  加预算: "INCREASE_BUDGET",
  稳预算: "KEEP_BUDGET",
  微调定向: "FINE_TUNE_TARGETING",
  降低出价: "DECREASE_BID",
  暂停跑量: "PAUSE_TASK",
  核验活动: "VERIFY_ACTIVITY",
  报名活动: "APPLY_ACTIVITY",
  优化讲解: "OPTIMIZE_SCRIPT",
  修复口碑: "REPAIR_REPUTATION",
  强化货架承接: "STRENGTHEN_SHELF",
  "检查库存/预约": "CHECK_INVENTORY_BOOKING",
  "优化 POI/搜索承接": "OPTIMIZE_POI_SEARCH",
  更换达人: "REPLACE_CREATOR",
  统一达人话术: "UNIFY_CREATOR_SCRIPT",
  "调整服务商 SOP": "ADJUST_SERVICE_PROVIDER_SOP",
  重谈服务费用: "RENEGOTIATE_SERVICE_FEE",
  沉淀素材复投: "REUSE_MATERIAL",
  倾斜高核销门店: "ALLOCATE_HIGH_VERIFY_STORES",
  主体识别校准: "CALIBRATE_SUBJECT"
};

export const actionTypeToDiagnosisAction: Partial<Record<ActionType, DiagnosisAction>> = Object.fromEntries(
  Object.entries(diagnosisActionToActionType).map(([label, type]) => [type, label])
) as Partial<Record<ActionType, DiagnosisAction>>;

export const budgetActionTypes = ["INCREASE_BUDGET", "DECREASE_BUDGET", "KEEP_BUDGET", "DECREASE_BID"] as const satisfies readonly ActionType[];
export const strongActionTypes = ["INCREASE_BUDGET", "DECREASE_BUDGET", "DECREASE_BID", "PAUSE_TASK"] as const satisfies readonly ActionType[];
export const decisionEngineActionTypes = [
  "OBSERVE",
  "PAUSE_TASK",
  "INCREASE_BUDGET",
  "DECREASE_BUDGET",
  "KEEP_BUDGET",
  "DECREASE_BID",
  "ADJUST_ROI_TARGET",
  "CHECK_LIVE_ROOM",
  "CHECK_CREATIVE",
  "CHECK_AUDIENCE",
  "VERIFY_ACTIVITY",
  "OPTIMIZE_SCRIPT",
  "REPAIR_REPUTATION",
  "STRENGTHEN_SHELF",
  "CHECK_INVENTORY_BOOKING",
  "OPTIMIZE_POI_SEARCH",
  "ADJUST_SERVICE_PROVIDER_SOP",
  "RENEGOTIATE_SERVICE_FEE",
  "REUSE_MATERIAL",
  "REQUEST_MANUAL_REVIEW"
] as const satisfies readonly ActionType[];

export type ApiResponse<T = unknown> =
  | { success: true; data: T; error: null }
  | {
      success: false;
      data: null;
      error: {
        code: string;
        message: string;
        requestId?: string;
      };
    };

export type MetricRawEvidence = {
  sourceType: string;
  path?: string;
  selector?: string;
  tableIndex?: number;
  rowIndex?: number;
  columnName?: string;
  url?: string;
  method?: string;
  jsonPath?: string;
  textSnippet?: string;
};

export type VisibleMetric = {
  key: MetricKey | string;
  name: string;
  value: number | string | null;
  unit?: string | null;
  source: "dom" | "table" | "network" | "manual";
  metricSource?: MetricSource;
  confidence?: number;
  rawEvidence?: MetricRawEvidence | null;
};

export type ReviewCoverage = {
  confirmedCount: number;
  modifiedCount: number;
  ignoredCount: number;
  pendingCount: number;
  totalCount: number;
};

export type ReviewedMetricDTO = {
  id: string;
  taskId: string;
  snapshotId?: string | null;
  normalizedMetricId?: string | null;
  metricKey: string;
  metricName: string;
  originalValue?: string | null;
  reviewedValue?: string | null;
  metricUnit?: string | null;
  metricSource: MetricSource;
  confidence: number;
  rawEvidence?: unknown;
  pageType?: string | null;
  scope?: string | null;
  timeRange?: string | null;
  reviewStatus: MetricReviewStatus;
  reviewedAt?: string | null;
};

export type ReviewMetricInput = {
  reviewedValue?: string;
  reviewStatus: "CONFIRMED" | "MODIFIED" | "IGNORED";
};

export type BulkReviewMetricInput = {
  items: Array<{
    metricId: string;
    reviewedValue?: string;
    reviewStatus: "CONFIRMED" | "MODIFIED" | "IGNORED";
  }>;
};

export type CapturedNetworkRecord = {
  url: string;
  method: string;
  status: number;
  responseJson: unknown;
  capturedAt: string;
};

export type CollectionSnapshotPayload = {
  pageType: PageType;
  sourceUrl: string;
  pageTitle: string;
  rawDomText: string;
  rawNetworkJson: CapturedNetworkRecord[];
  rawTableData: unknown[];
  visibleMetricsJson: VisibleMetric[];
  screenshotUrl?: string | null;
  localCollectedAt: string;
  collectionRunId?: string | null;
  routeKey?: import("./collection-routes.js").CollectionRouteKey;
};

export type SubjectContext = {
  subjectType: SubjectType;
  operatorType: OperatorType;
  cooperationType: CooperationType;
  controlLevel: ControlLevel;
  confidence: number;
  serviceProviderName?: string | null;
  serviceMode?: string | null;
  serviceFee?: number | null;
};

export type AnalyzeInput = {
  businessType: BusinessType;
  subject: SubjectContext;
  pageTitle: string;
  sourceUrl: string;
  metrics: VisibleMetric[];
  tables: unknown[];
  visibleText: string;
  networkJsonSummary: CapturedNetworkRecord[];
};

export type AnalysisProblem = {
  title: string;
  evidence: string;
  severity: RiskLevel;
};

export type AnalysisSuggestion = {
  action: DiagnosisAction;
  title: string;
  reason: string;
  expectedImpact: string;
  priority: RiskLevel;
};

export type ManualCheckItem = {
  title: string;
  reason: string;
};

export type DecisionDataQuality = {
  missingFields: string[];
  lowConfidenceFields?: string[];
  blockingReasons?: string[];
  subjectReady?: boolean;
  reviewReady?: boolean;
  completeness: number;
  blocksStrongActions: boolean;
  collectionQuality?: import("./collection-routes.js").CollectionQuality;
};

export type DecisionEngineInput = {
  projectId?: string;
  collectionTaskId?: string;
  businessType: BusinessType;
  subject: SubjectContext;
  pageTitle: string;
  sourceUrl: string;
  metrics: VisibleMetric[];
  tables: unknown[];
  visibleText: string;
  networkJsonSummary: CapturedNetworkRecord[];
  targetRoi?: number | null;
  targetCpa?: number | null;
  latestAnalysis?: AnalyzeOutput | null;
  dataReviewStatus?: DataReviewStatus;
  reviewCoverage?: ReviewCoverage;
  metricLayer?: MetricLayer;
  collectionQuality?: import("./collection-routes.js").CollectionQuality;
};

export type ActionProposalDTO = {
  id?: string;
  decisionRunId?: string;
  projectId?: string;
  collectionTaskId?: string;
  actionType: ActionType;
  title: string;
  summary?: string | null;
  reason: string;
  expectedImpact?: string | null;
  riskLevel: RiskLevel;
  confidence: number;
  requiresApproval: boolean;
  status: ActionProposalStatus;
  blockedReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  observedAt?: string | null;
  manualExecutedAt?: string | null;
  expiresAt?: string | null;
  dedupeKey?: string | null;
  supersededAt?: string | null;
};

export type ActionOutcomeDTO = {
  id: string;
  actionProposalId: string;
  projectId: string;
  collectionTaskId: string;
  observationWindow: ObservationWindow;
  customWindow?: string | null;
  beforeMetrics?: unknown;
  afterMetrics?: unknown;
  result: ActionOutcomeResult;
  note?: string | null;
  conclusion?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateActionOutcomeInput = {
  observationWindow: ObservationWindow;
  customWindow?: string | null;
  beforeMetrics?: unknown;
  afterMetrics?: unknown;
  result: ActionOutcomeResult;
  note?: string | null;
  conclusion?: string | null;
};

export type ProjectOutcomeSummary = {
  projectId: string;
  total: number;
  byResult: Record<ActionOutcomeResult, number>;
  byActionType: Array<{
    actionType: ActionType;
    total: number;
    improved: number;
    worsened: number;
    noChange: number;
    unclear: number;
  }>;
};

export type DecisionEngineOutput = {
  engineVersion?: string;
  ruleVersion?: string;
  strategyVersion?: string;
  riskLevel: RiskLevel;
  confidence: number;
  diagnosis: string;
  actionProposals: ActionProposalDTO[];
  manualCheckItems: ManualCheckItem[];
  dataQuality: DecisionDataQuality;
  calculatedMetrics?: {
    serviceProviderAfterCost?: number | null;
    serviceProviderGrossProfitRoi?: number | null;
    verifiedPlatformBenefits?: number | null;
    evidence?: string[];
  };
};

export type AnalyzeOutput = {
  summary: string;
  riskLevel: RiskLevel;
  problems: AnalysisProblem[];
  suggestions: AnalysisSuggestion[];
  manualCheckItems: ManualCheckItem[];
  confidence: number;
};

export const metricRawEvidenceSchema = z.object({
  sourceType: z.string().min(1),
  path: z.string().optional(),
  selector: z.string().optional(),
  tableIndex: z.number().int().optional(),
  rowIndex: z.number().int().optional(),
  columnName: z.string().optional(),
  url: z.string().optional(),
  method: z.string().optional(),
  jsonPath: z.string().optional(),
  textSnippet: z.string().optional()
});

export const metricKeySchema = z.enum(metricKeys);

export const visibleMetricSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  value: z.union([z.number(), z.string(), z.null()]),
  unit: z.string().nullable().optional(),
  source: z.enum(["dom", "table", "network", "manual"]),
  metricSource: z.enum(metricSources).optional(),
  confidence: z.number().min(0).max(1).optional(),
  rawEvidence: metricRawEvidenceSchema.nullable().optional()
});

export const createActionOutcomeInputSchema = z
  .object({
    observationWindow: z.enum(observationWindows),
    customWindow: z.string().trim().max(100).nullable().optional(),
    beforeMetrics: z.unknown().optional(),
    afterMetrics: z.unknown().optional(),
    result: z.enum(actionOutcomeResults),
    note: z.string().trim().max(2000).nullable().optional(),
    conclusion: z.string().trim().max(2000).nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.observationWindow === "custom" && !value.customWindow?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customWindow"],
        message: "custom observationWindow requires customWindow"
      });
    }
  });

export const networkRecordSchema = z.object({
  url: z.string().url().max(snapshotSafetyLimits.urlChars),
  method: z.string().min(1).max(16),
  status: z.number().int().min(0).max(599),
  responseJson: z.unknown(),
  capturedAt: z.string().datetime()
});

export const subjectContextSchema = z.object({
  subjectType: z.enum(subjectTypes),
  operatorType: z.enum(operatorTypes),
  cooperationType: z.enum(cooperationTypes),
  controlLevel: z.enum(controlLevels),
  confidence: z.number().min(0).max(1),
  serviceProviderName: z.string().nullable().optional(),
  serviceMode: z.string().nullable().optional(),
  serviceFee: z.number().min(0).nullable().optional()
});

export const collectionSnapshotSchema = z.object({
  pageType: z.enum(pageTypes).default("UNKNOWN"),
  sourceUrl: z.string().url().max(snapshotSafetyLimits.urlChars),
  pageTitle: z.string().max(snapshotSafetyLimits.pageTitleChars).default(""),
  rawDomText: z.string().max(snapshotSafetyLimits.rawDomTextChars).default(""),
  rawNetworkJson: z.array(networkRecordSchema).max(snapshotSafetyLimits.networkRecords).default([]),
  rawTableData: z.array(z.unknown()).max(snapshotSafetyLimits.tableItems).default([]),
  visibleMetricsJson: z.array(visibleMetricSchema).max(snapshotSafetyLimits.visibleMetrics).default([]),
  screenshotUrl: z.string().url().max(snapshotSafetyLimits.urlChars).nullable().optional(),
  localCollectedAt: z.string().datetime(),
  collectionRunId: z.string().min(1).max(128).nullable().optional(),
  routeKey: z.enum(collectionRouteKeys).optional()
});

export const manualCheckItemSchema = z.object({
  title: z.string().min(1),
  reason: z.string().min(1)
});

export const decisionDataQualitySchema = z.object({
  missingFields: z.array(z.string()),
  lowConfidenceFields: z.array(z.string()).optional(),
  blockingReasons: z.array(z.string()).optional(),
  subjectReady: z.boolean().optional(),
  reviewReady: z.boolean().optional(),
  completeness: z.number().min(0).max(1),
  blocksStrongActions: z.boolean(),
  collectionQuality: z.object({
    requiredRoutes: z.array(z.enum(collectionRouteKeys)),
    routes: z.array(z.object({
      routeKey: z.enum(collectionRouteKeys),
      state: z.enum(["FRESH", "AGING", "STALE", "MISSING"]),
      lastCollectedAt: z.string().datetime().nullable(),
      ageMs: z.number().nonnegative().nullable()
    })),
    completeness: z.number().min(0).max(1),
    missingRoutes: z.array(z.enum(collectionRouteKeys)),
    staleRoutes: z.array(z.enum(collectionRouteKeys)),
    blocksStrongActions: z.boolean()
  }).optional()
});

export const reviewCoverageSchema = z.object({
  confirmedCount: z.number().int().nonnegative(),
  modifiedCount: z.number().int().nonnegative(),
  ignoredCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative()
});

export const reviewedMetricDTOSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  snapshotId: z.string().nullable().optional(),
  normalizedMetricId: z.string().nullable().optional(),
  metricKey: z.string(),
  metricName: z.string(),
  originalValue: z.string().nullable().optional(),
  reviewedValue: z.string().nullable().optional(),
  metricUnit: z.string().nullable().optional(),
  metricSource: z.enum(metricSources),
  confidence: z.number().min(0).max(1),
  rawEvidence: z.unknown().optional(),
  pageType: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  timeRange: z.string().nullable().optional(),
  reviewStatus: z.enum(metricReviewStatuses),
  reviewedAt: z.string().nullable().optional()
});

export const reviewMetricInputSchema = z
  .object({
    reviewedValue: z.string().optional(),
    reviewStatus: z.enum(["CONFIRMED", "MODIFIED", "IGNORED"])
  })
  .superRefine((value, ctx) => {
    if (value.reviewStatus === "MODIFIED" && !value.reviewedValue?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewedValue"],
        message: "MODIFIED requires reviewedValue"
      });
    }
  });

export const bulkReviewMetricInputSchema = z.object({
  items: z
    .array(
      z
        .object({
          metricId: z.string().min(1),
          reviewedValue: z.string().optional(),
          reviewStatus: z.enum(["CONFIRMED", "MODIFIED", "IGNORED"])
        })
        .superRefine((value, ctx) => {
          if (value.reviewStatus === "MODIFIED" && !value.reviewedValue?.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["reviewedValue"],
              message: "MODIFIED requires reviewedValue"
            });
          }
        })
    )
    .min(1)
});

export const actionProposalDTOSchema = z.object({
  id: z.string().optional(),
  decisionRunId: z.string().optional(),
  projectId: z.string().optional(),
  collectionTaskId: z.string().optional(),
  actionType: z.enum(actionTypes),
  title: z.string().min(1),
  summary: z.string().nullable().optional(),
  reason: z.string().min(1),
  expectedImpact: z.string().nullable().optional(),
  riskLevel: z.enum(riskLevels),
  confidence: z.number().min(0).max(1),
  requiresApproval: z.boolean(),
  status: z.enum(actionProposalStatuses),
  blockedReason: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  approvedAt: z.string().nullable().optional(),
  rejectedAt: z.string().nullable().optional(),
  observedAt: z.string().nullable().optional(),
  manualExecutedAt: z.string().nullable().optional()
});

export const decisionEngineInputSchema = z.object({
  projectId: z.string().optional(),
  collectionTaskId: z.string().optional(),
  businessType: z.enum(businessTypes),
  subject: subjectContextSchema,
  pageTitle: z.string().default(""),
  sourceUrl: z.string().default(""),
  metrics: z.array(visibleMetricSchema),
  tables: z.array(z.unknown()),
  visibleText: z.string().default(""),
  networkJsonSummary: z.array(networkRecordSchema).max(50),
  targetRoi: z.number().nullable().optional(),
  targetCpa: z.number().nullable().optional(),
  latestAnalysis: z.unknown().nullable().optional(),
  dataReviewStatus: z.enum(dataReviewStatuses).optional(),
  reviewCoverage: reviewCoverageSchema.optional(),
  metricLayer: z.enum(metricLayers).optional()
});

export const decisionEngineOutputSchema = z.object({
  engineVersion: z.string().optional(),
  ruleVersion: z.string().optional(),
  strategyVersion: z.string().optional(),
  riskLevel: z.enum(riskLevels),
  confidence: z.number().min(0).max(1),
  diagnosis: z.string().min(1),
  actionProposals: z.array(actionProposalDTOSchema),
  manualCheckItems: z.array(manualCheckItemSchema),
  dataQuality: decisionDataQualitySchema,
  calculatedMetrics: z
    .object({
      serviceProviderAfterCost: z.number().nullable().optional(),
      serviceProviderGrossProfitRoi: z.number().nullable().optional(),
      verifiedPlatformBenefits: z.number().nullable().optional(),
      evidence: z.array(z.string()).optional()
    })
    .optional()
});

export const createProjectSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  businessType: z.enum(businessTypes).default("DOUYIN_LOCAL_LIFE"),
  subjectType: z.enum(subjectTypes).default("SUBJECT_PENDING"),
  operatorType: z.enum(operatorTypes).default("OPERATOR_PENDING"),
  cooperationType: z.enum(cooperationTypes).default("COOPERATION_PENDING"),
  controlLevel: z.enum(controlLevels).default("PENDING"),
  subjectConfidence: z.coerce.number().min(0).max(1).default(0),
  serviceProviderName: z.string().trim().optional().nullable(),
  serviceMode: z.string().trim().optional().nullable(),
  serviceFee: z.coerce.number().min(0).optional().nullable()
});

export const createCollectionTaskSchema = z.object({
  projectId: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  pageTitle: z.string().optional()
});

export const updateCollectionTaskStatusSchema = z.object({
  status: z.enum(collectionTaskStatuses)
});

export const authLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(128)
});

export const authRegisterSchema = authLoginSchema.extend({
  name: z.string().min(1).optional()
});

export function success<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null };
}

export function failure(code: string, message: string, options: { requestId?: string } = {}): ApiResponse<never> {
  return { success: false, data: null, error: { code, message, ...(options.requestId ? { requestId: options.requestId } : {}) } };
}

export function subjectLabel(type: SubjectType) {
  return subjectTypeLabels[type] || "主体待校准";
}

export function normalizeMetricLookupValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[（）()]/g, "")
    .replace(/[\s_\-:/：，,。]+/g, "");
}

const metricAliasLookup = new Map<string, MetricKey>(
  metricKeys.flatMap((key) => [
    [normalizeMetricLookupValue(key), key] as const,
    [normalizeMetricLookupValue(metricKeyLabels[key]), key] as const,
    ...metricAliases[key].map((alias) => [normalizeMetricLookupValue(alias), key] as const)
  ])
);

export function identifyMetricKey(value: string | null | undefined): MetricKey {
  if (!value) return "unknown";
  return metricAliasLookup.get(normalizeMetricLookupValue(value)) || "unknown";
}

export function standardizeMetricKey(metric: Pick<VisibleMetric, "key" | "name">): MetricKey {
  const keyMatch = identifyMetricKey(metric.key);
  if (keyMatch !== "unknown") return keyMatch;
  return identifyMetricKey(metric.name);
}

export function isKnownMetricKey(value: string | null | undefined): value is MetricKey {
  return !!value && value !== "unknown" && metricKeys.includes(value as MetricKey);
}

export const aiDisclaimer = "AI 诊断结果仅供投流决策参考，请结合业务目标、预算和平台规则人工确认。第一版系统不会自动执行任何投放操作。";

export const extensionSafetyNotice =
  "本插件仅在用户授权并打开目标后台页面时采集当前页面可见数据和允许的 JSON 响应。插件不会自动点击、修改预算、暂停任务、创建计划或提交任何平台操作。";
