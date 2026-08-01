import { z } from "zod";
import { snapshotSafetyLimits } from "./safety.js";
import { collectionRouteKeys } from "./collection-routes.js";
import { decisionTableInputSchema, type DecisionTableInput } from "./decision-tables.js";
import { metricValidationStatuses, type MetricRawEvidence } from "./metric-value.js";
import { collectionRouteDiagnosticSchema } from "./collection-diagnostics.js";
import { structuredCollectionDataSchema } from "./collection-records.js";
export { failure, success, type ApiResponse } from "./api-response.js";
export * from "./safety.js";
export * from "./metric-value.js";
export * from "./collection-routes.js";
export * from "./collection-field-profiles.js";
export * from "./collection-diagnostics.js";
export * from "./collection-records.js";
export * from "./decision-tables.js";
export * from "./collection-dashboard.js";
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
export const accountPlatforms = ["DOUYIN_LOCAL_LIFE"] as const;
export const accountProfileStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const accountIdentityStatuses = ["PENDING_ID", "VERIFIED"] as const;
export const collectionRouteSourceStatuses = ["PENDING", "CAPTURED", "FAILED"] as const;
export const routeVerificationStatuses = ["VERIFIED", "MANUAL_PENDING"] as const;
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
export const metricLayers = ["REVIEWED_METRIC"] as const;
export const metricKeys = [
  "unknown",
  "verify_roi",
  "gross_profit_roi",
  "pay_roi",
  "full_domain_pay_roi",
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
  "hourly_live_views",
  "hourly_natural_live_views",
  "hourly_commercial_live_views",
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
export const captureCompletenessValues = ["COMPLETE", "PARTIAL", "UNKNOWN"] as const;
export const captureTabStates = ["VISIBLE", "HIDDEN", "FROZEN", "DISCARDED", "UNKNOWN"] as const;
export const extensionConnectionStates = [
  "UNPAIRED",
  "PAIRED_NOT_CONNECTED",
  "BOUND_OTHER_TASK",
  "READY",
  "PAGE_UNSUPPORTED",
  "PAGE_INACTIVE",
  "ROUTE_UNVERIFIED",
  "VERSION_OUTDATED",
  "OFFLINE",
  "ERROR"
] as const;
export const extensionBridgeProtocolVersion = 2 as const;
// Bump this whenever the extension-to-API capture write contract changes.
// Unlike the Web Bridge protocol, this protects the persisted evidence path.
export const extensionCollectionProtocolVersion = 1 as const;
export const captureSummaryRouteStates = ["PENDING", "READY", "UPLOADED", "AGING", "PARTIAL", "UNVERIFIED", "MANUAL_PENDING", "STALE", "FAILED"] as const;
export const realtimeSignalKinds = ["ROI_CHANGE", "SPEND_ACCELERATION", "ORDER_STALL", "TRAFFIC_CHANGE", "DATA_STALE", "PAGE_INACTIVE"] as const;
export const realtimeSignalSeverities = ["INFO", "WARNING", "CRITICAL"] as const;
export const extensionCredentialScopes = ["COLLECT", "READ_DIAGNOSIS"] as const;

export type BusinessType = (typeof businessTypes)[number];
export type SubjectType = (typeof subjectTypes)[number];
export type OperatorType = (typeof operatorTypes)[number];
export type CooperationType = (typeof cooperationTypes)[number];
export type ControlLevel = (typeof controlLevels)[number];
export type AccountPlatform = (typeof accountPlatforms)[number];
export type AccountProfileStatus = (typeof accountProfileStatuses)[number];
export type AccountIdentityStatus = (typeof accountIdentityStatuses)[number];
export type CollectionRouteSourceStatus = (typeof collectionRouteSourceStatuses)[number];
export type RouteVerificationStatus = (typeof routeVerificationStatuses)[number];
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
export type CaptureCompleteness = (typeof captureCompletenessValues)[number];
export type CaptureTabState = (typeof captureTabStates)[number];
export type ExtensionConnectionState = (typeof extensionConnectionStates)[number];
export type CaptureSummaryRouteState = (typeof captureSummaryRouteStates)[number];
export type RealtimeSignalKind = (typeof realtimeSignalKinds)[number];
export type RealtimeSignalSeverity = (typeof realtimeSignalSeverities)[number];
export type ExtensionCredentialScope = (typeof extensionCredentialScopes)[number];

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

export const accountIdentityStatusLabels: Record<AccountIdentityStatus, string> = {
  PENDING_ID: "已建档",
  VERIFIED: "已建档"
};


export const collectionTaskStatusLabels: Record<CollectionTaskStatus, string> = {
  PENDING: "待采集",
  COLLECTING: "采集中",
  REVIEWING: "待复核",
  UPLOADED: "已上传",
  PROCESSING: "处理中",
  ANALYZED: "已诊断",
  FAILED: "采集失败"
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
  full_domain_pay_roi: "全域支付 ROI",
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
  hourly_live_views: "小时看播次数",
  hourly_natural_live_views: "小时自然看播次数",
  hourly_commercial_live_views: "小时商业看播次数",
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
  full_domain_pay_roi: "FULL_DOMAIN",
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
  hourly_live_views: "TRAFFIC",
  hourly_natural_live_views: "TRAFFIC",
  hourly_commercial_live_views: "TRAFFIC",
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
  pay_roi: ["pay_roi", "支付 ROI", "支付ROI", "付款 ROI", "付款ROI", "整体支付 ROI", "整体支付ROI"],
  full_domain_pay_roi: ["full_domain_pay_roi", "全域支付 ROI", "全域支付ROI", "全域 ROI", "全域ROI"],
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
  hourly_live_views: ["hourly_live_views", "小时看播次数"],
  hourly_natural_live_views: ["hourly_natural_live_views", "小时自然看播次数"],
  hourly_commercial_live_views: ["hourly_commercial_live_views", "小时商业看播次数"],
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

export type AccountProfileDTO = {
  id: string;
  workspaceId: string;
  platform: AccountPlatform;
  accountName: string;
  merchantName?: string | null;
  storeName?: string | null;
  memo?: string | null;
  identityStatus: AccountIdentityStatus;
  status: AccountProfileStatus;
  createdAt: string;
  updatedAt: string;
};

export type CollectionRouteSourceDTO = {
  id: string;
  taskId: string;
  routeKey: import("./collection-routes.js").CollectionRouteKey;
  label: string;
  sourceUrl?: string | null;
  required: boolean;
  status: CollectionRouteSourceStatus;
  lastCapturedAt?: string | null;
  lastError?: string | null;
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
  displayValue?: string | null;
  normalizedValue?: string | null;
  fieldLabel?: string | null;
  displayPrecision?: number | null;
  unitSource?: "VALUE" | "HEADER" | "LABEL" | "DEFAULT" | "NONE" | null;
  bindingLocation?: string | null;
  bindingStatus?: import("./metric-value.js").MetricValidationStatus | null;
  bindingReasons?: string[];
  pageType?: string | null;
  scope?: string | null;
  timeRange?: string | null;
  reviewStatus: MetricReviewStatus;
  reviewedAt?: string | null;
};

export type ReviewMetricInput = {
  reviewedValue?: string;
  timeRange?: string;
  reviewStatus: "CONFIRMED" | "MODIFIED" | "IGNORED";
};

export type BulkReviewMetricInput = {
  items: Array<{
    metricId: string;
    reviewedValue?: string;
    timeRange?: string;
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

export type CaptureMeta = {
  adapterId: string;
  adapterVersion: string;
  pageFingerprint: string;
  completeness: CaptureCompleteness;
  coverageRatio: number;
  expectedFields: string[];
  extractedFields: string[];
  visibleRegions: string[];
  renderModes: Array<"DOM" | "TABLE" | "CANVAS" | "VIRTUALIZED">;
  tableBindings?: Array<{
    tableIndex: number;
    headers: string[];
    identityColumn: string | null;
    identityColumnIndex?: number | null;
    timeRange?: string | null;
    timeRangeLocation?: string | null;
    componentPath?: string | null;
    bindingSignature: string;
    validationStatus: import("./metric-value.js").MetricValidationStatus;
    validationReasons: string[];
  }>;
  tabState: CaptureTabState;
  originalBytes: number;
  acceptedBytes: number;
  truncatedFields: string[];
  truncationReasons: string[];
  routeDetection?: {
    routeKey: import("./collection-routes.js").CollectionRouteKey;
    source: import("./collection-routes.js").CollectionRouteDetectionSource;
    confidence: number;
    manuallyConfirmed: boolean;
    evidence: string[];
  };
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
  captureProtocolVersion?: number;
  captureMeta?: CaptureMeta;
};

export type ExtensionHeartbeatPayload = {
  collectionTaskId: string;
  extensionVersion: string;
  bridgeProtocolVersion?: number;
  buildFingerprint?: string | null;
  currentUrl: string;
  pageType: PageType;
  routeKey?: import("./collection-routes.js").CollectionRouteKey;
  collectable: boolean;
  tabState: CaptureTabState;
  lastError?: string | null;
  observedAt: string;
};

export type ExtensionStatusDTO = {
  state: ExtensionConnectionState;
  installedDetectedByWeb: boolean;
  paired: boolean;
  boundTaskId: string | null;
  boundTaskTitle: string | null;
  extensionVersion: string | null;
  bridgeProtocolVersion: number | null;
  buildFingerprint: string | null;
  currentUrl: string | null;
  pageType: PageType | null;
  routeKey: import("./collection-routes.js").CollectionRouteKey | null;
  collectable: boolean;
  tabState: CaptureTabState | null;
  lastHeartbeatAt: string | null;
  lastError: string | null;
  message: string;
};

export type CaptureSummaryMetricDTO = {
  metricKey: string;
  metricName: string;
  metricValue: string;
  displayValue: string | null;
  metricUnit: string | null;
  category: MetricCategory;
  confidence: number;
  metricSource: MetricSource;
  routeKey: import("./collection-routes.js").CollectionRouteKey | null;
  pageType: string | null;
  capturedAt: string;
  reviewStatus: MetricReviewStatus;
  provenance: import("./collection-diagnostics.js").CollectionDataProvenance;
};
export type CaptureSummaryDTO = {
  snapshotCount: number;
  latestCapturedAt: string | null;
  collectionRun: {
    id: string;
    status: "ACTIVE" | "COMPLETED" | "STOPPED" | "DEGRADED";
    startedAt: string;
    lastSnapshotAt: string | null;
    completedAt: string | null;
  } | null;
  coverageRatio: number | null;
  requiredRoutesCaptured: boolean;
  requiredRoutesComplete: boolean;
  pendingRouteConfirmationCount: number;
  overviewRouteKey: import("./collection-routes.js").CollectionRouteKey | null;
  overviewMetrics: CaptureSummaryMetricDTO[];
  routes: Array<{
    routeKey: import("./collection-routes.js").CollectionRouteKey;
    label: string;
    required: boolean;
    sourceUrl: string | null;
    snapshotId: string | null;
    snapshotUpdatedAt: string | null;
    state: CaptureSummaryRouteState;
    routeVerificationStatus: RouteVerificationStatus | null;
    completeness: CaptureCompleteness | null;
    lastCapturedAt: string | null;
    metricCount: number;
    coverageRatio: number | null;
    lastError: string | null;
    diagnostic: import("./collection-diagnostics.js").CollectionRouteDiagnostic;
  }>;
  metrics: CaptureSummaryMetricDTO[];
  structuredData: import("./collection-records.js").StructuredCollectionData[];
  tables: Array<{
    snapshotId: string;
    snapshotUpdatedAt: string;
    tableIndex: number;
    bindingStatus: import("./metric-value.js").MetricValidationStatus;
    bindingReasons: string[];
    headers: string[];
    identityColumn: string | null;
    identityColumnIndex: number | null;
    timeRange: string | null;
    bindingLocation: string | null;
    routeKey: import("./collection-routes.js").CollectionRouteKey | null;
    routeDetectionConfidence: number | null;
    pageType: string | null;
    capturedAt: string;
    rows: string[][];
    cellReviews: import("./collection-dashboard.js").TableCellReviewDTO[];
  }>;
};

export type MetricPulse = {
  collectionRunId?: string | null;
  routeKey: import("./collection-routes.js").CollectionRouteKey;
  pageType: PageType;
  localCapturedAt: string;
  tabState: CaptureTabState;
  metrics: VisibleMetric[];
  captureMeta: CaptureMeta;
  sourceUrl?: string | null;
};

export type RealtimeSignal = {
  id: string;
  collectionTaskId: string;
  kind: RealtimeSignalKind;
  severity: RealtimeSignalSeverity;
  message: string;
  observedAt: string;
  dataAgeMs: number;
  evidence: Record<string, number | string | null>;
};

export type BuildMetadata = {
  productVersion: string;
  gitSha: string;
  buildTime: string;
  schemaVersion: string;
  extensionVersion: string;
  collectionProtocolVersion: number;
  artifactSha256?: string | null;
};

export type ActionEligibility = {
  eligible: boolean;
  blockingEvidence: string[];
  missingEvidence: string[];
  maxDataAgeMs: number;
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

export const diagnosticDimensions = ["DATA_QUALITY", "PROFITABILITY", "TRAFFIC", "LIVE_ROOM", "PRODUCT", "COMPLIANCE"] as const;
export const recommendationPriorities = ["P0", "P1", "P2"] as const;
export const decisionAnalysisModes = ["MANAGED_LIVE_GROWTH", "FULL_BUSINESS"] as const;
export type DiagnosticDimension = (typeof diagnosticDimensions)[number];
export type RecommendationPriority = (typeof recommendationPriorities)[number];
export type DecisionAnalysisMode = (typeof decisionAnalysisModes)[number];
export type DiagnosticFinding = {
  dimension: DiagnosticDimension;
  title: string;
  conclusion: string;
  evidence: string[];
  riskLevel: RiskLevel;
};

export type OptimizationRecommendation = {
  priority: RecommendationPriority;
  dimension: DiagnosticDimension;
  title: string;
  reason: string;
  evidence?: string[];
  steps: string[];
  verifyMetrics: string[];
  ruleBoundary: string;
};
export type EvidenceBackedOptimizationRecommendation = OptimizationRecommendation & {
  evidence: string[];
};

export type BusinessMetricExplanation = {
  title: string;
  value: number | null;
  meaning: string;
  use: string;
  caveat: string;
};

export type DecisionBusinessAnalysis = {
  mode?: DecisionAnalysisMode;
  headline: string;
  performanceSnapshot: string[];
  findings: DiagnosticFinding[];
  recommendations: OptimizationRecommendation[];
  metricExplanations: BusinessMetricExplanation[];
  ruleReferences: Array<{
    title: string;
    url: string;
    scope: string;
    checkedAt: string;
  }>;
};

export type DecisionDataQuality = {
  missingFields: string[];
  lowConfidenceFields?: string[];
  blockingReasons?: string[];
  subjectReady?: boolean;
  reviewReady?: boolean;
  completeness: number;
  blocksStrongActions: boolean;
  globalSafetyBlock?: boolean;
  actionEligibility?: Partial<Record<ActionType, ActionEligibility>>;
  blockingEvidence?: string[];
  missingEvidence?: string[];
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
  tables: DecisionTableInput[];
  structuredCollectionData?: import("./collection-records.js").StructuredCollectionData[];
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
  beforeMetrics?: OutcomeMetric[];
  afterMetrics?: OutcomeMetric[];
  result: ActionOutcomeResult;
  note?: string | null;
  conclusion?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateActionOutcomeInput = {
  observationWindow: ObservationWindow;
  customWindow?: string | null;
  beforeMetrics?: OutcomeMetric[];
  afterMetrics?: OutcomeMetric[];
  result: ActionOutcomeResult;
  note?: string | null;
  conclusion?: string | null;
};

export type OutcomeMetric = {
  metricKey: Exclude<MetricKey, "unknown">;
  value: number;
  unit?: string | null;
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
  businessAnalysis?: DecisionBusinessAnalysis;
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
  textSnippet: z.string().max(500).optional(),
  fieldLabel: z.string().max(100).optional(),
  displayValue: z.string().max(100).optional(),
  normalizedValue: z.string().max(100).nullable().optional(),
  displayPrecision: z.number().int().min(0).max(20).nullable().optional(),
  multiplier: z.number().positive().optional(),
  unitSource: z.enum(["VALUE", "HEADER", "LABEL", "DEFAULT", "NONE"]).optional(),
  timeRange: z.string().max(100).nullable().optional(),
  timeRangeSource: z.enum(["COMPONENT", "TABLE_CONTEXT", "MANUAL"]).optional(),
  timeRangeLocation: z.string().max(300).nullable().optional(),
  bindingKind: z.enum(["CARD", "TABLE", "MANUAL"]).optional(),
  componentPath: z.string().max(300).optional(),
  rowIdentity: z.string().max(200).optional(),
  calibrationSignature: z.string().max(500).optional(),
  validationStatus: z.enum(metricValidationStatuses).optional(),
  validationReasons: z.array(z.string().max(100)).max(20).optional()
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
    beforeMetrics: z.array(z.object({
      metricKey: z.enum(metricKeys).exclude(["unknown"]),
      value: z.number().finite(),
      unit: z.string().trim().max(30).nullable().optional()
    }).strict()).max(100).optional(),
    afterMetrics: z.array(z.object({
      metricKey: z.enum(metricKeys).exclude(["unknown"]),
      value: z.number().finite(),
      unit: z.string().trim().max(30).nullable().optional()
    }).strict()).max(100).optional(),
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

export const captureMetaSchema = z.object({
  adapterId: z.string().min(1).max(100),
  adapterVersion: z.string().min(1).max(50),
  pageFingerprint: z.string().min(1).max(128),
  completeness: z.enum(captureCompletenessValues),
  coverageRatio: z.number().min(0).max(1),
  expectedFields: z.array(z.string().max(100)).max(100),
  extractedFields: z.array(z.string().max(100)).max(100),
  visibleRegions: z.array(z.string().max(100)).max(50),
  renderModes: z.array(z.enum(["DOM", "TABLE", "CANVAS", "VIRTUALIZED"])).max(4),
  tableBindings: z.array(z.object({
    tableIndex: z.number().int().min(0).max(3),
    headers: z.array(z.string().max(100)).min(1).max(100),
    identityColumn: z.string().max(100).nullable(),
    identityColumnIndex: z.number().int().min(0).max(99).nullable().optional(),
    timeRange: z.string().max(100).nullable().optional(),
    timeRangeLocation: z.string().max(300).nullable().optional(),
    componentPath: z.string().max(300).nullable().optional(),
    bindingSignature: z.string().min(1).max(500),
    validationStatus: z.enum(metricValidationStatuses),
    validationReasons: z.array(z.string().max(100)).max(20)
  })).max(4).optional(),
  tabState: z.enum(captureTabStates),
  originalBytes: z.number().int().min(0),
  acceptedBytes: z.number().int().min(0),
  truncatedFields: z.array(z.string().max(100)).max(100),
  truncationReasons: z.array(z.string().max(200)).max(100),
  routeDetection: z.object({
    routeKey: z.enum(collectionRouteKeys),
    source: z.enum(["MANUAL", "URL", "ACTIVE_TAB", "VISIBLE_CONTENT", "PAGE_TYPE", "UNKNOWN"]),
    confidence: z.number().min(0).max(1),
    manuallyConfirmed: z.boolean(),
    evidence: z.array(z.string().max(200)).max(20)
  }).optional()
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
  routeKey: z.enum(collectionRouteKeys).optional(),
  captureProtocolVersion: z.number().int().min(1).max(100).optional(),
  captureMeta: captureMetaSchema.optional()
});

export const createExtensionPairingCodeSchema = z.object({
  accountProfileId: z.string().min(1, "请选择要绑定的平台账号"),
  collectionTaskId: z.string().min(1, "请选择要绑定的采集任务").optional()
});

export const exchangeExtensionPairingCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "请输入 6 位配对码"),
  apiBaseUrl: z.string().url().optional(),
  label: z.string().trim().max(100).optional()
});

export const selectExtensionTaskSchema = z.object({
  collectionTaskId: z.string().min(1, "请选择采集任务")
});

export const extensionHeartbeatSchema = z.object({
  collectionTaskId: z.string().min(1, "插件尚未绑定采集任务"),
  extensionVersion: z.string().trim().min(1).max(50),
  bridgeProtocolVersion: z.number().int().min(1).max(100).optional(),
  buildFingerprint: z.string().trim().max(100).nullable().optional(),
  currentUrl: z.string().url().max(snapshotSafetyLimits.urlChars),
  pageType: z.enum(pageTypes),
  routeKey: z.enum(collectionRouteKeys).optional(),
  collectable: z.boolean(),
  tabState: z.enum(captureTabStates),
  lastError: z.string().trim().max(500).nullable().optional(),
  observedAt: z.string().datetime()
});

export const manualMetricItemSchema = z.object({
  key: z.string().trim().max(100).optional(),
  name: z.string().trim().min(1, "指标名称不能为空").max(100),
  value: z.union([z.number(), z.string().trim().max(200)]),
  unit: z.string().trim().max(30).optional().nullable()
});

export const manualMetricsInputSchema = z.object({
  accountConfirmed: z.literal(true, { message: "请确认数据属于当前账号" }),
  pageType: z.enum(pageTypes).default("LOCAL_PROMOTION_DASHBOARD"),
  routeKey: z.enum(collectionRouteKeys).default("LOCAL_PROMOTION_DASHBOARD"),
  sourceLabel: z.string().trim().max(100).default("网页手工录入"),
  metrics: z.array(manualMetricItemSchema).min(1, "请至少填写一个指标").max(200, "单次最多录入 200 个指标")
});

export const metricPulseSchema = z.object({
  collectionRunId: z.string().min(1).max(128).nullable().optional(),
  routeKey: z.enum(collectionRouteKeys),
  pageType: z.enum(pageTypes),
  localCapturedAt: z.string().datetime(),
  tabState: z.enum(captureTabStates),
  metrics: z.array(visibleMetricSchema).max(32),
  captureMeta: captureMetaSchema,
  sourceUrl: z.string().url().max(snapshotSafetyLimits.urlChars).nullable().optional()
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
  globalSafetyBlock: z.boolean().optional(),
  actionEligibility: z.record(z.string(), z.object({
    eligible: z.boolean(),
    blockingEvidence: z.array(z.string()),
    missingEvidence: z.array(z.string()),
    maxDataAgeMs: z.number().int().min(0)
  })).optional(),
  blockingEvidence: z.array(z.string()).optional(),
  missingEvidence: z.array(z.string()).optional(),
  collectionQuality: z.object({
    requiredRoutes: z.array(z.enum(collectionRouteKeys)),
    routes: z.array(z.object({
      routeKey: z.enum(collectionRouteKeys),
      state: z.enum(["FRESH", "AGING", "STALE", "MISSING"]),
      lastCollectedAt: z.string().datetime().nullable(),
      ageMs: z.number().nonnegative().nullable()
    })),
    diagnostics: z.array(collectionRouteDiagnosticSchema).optional(),
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
  displayValue: z.string().nullable().optional(),
  normalizedValue: z.string().nullable().optional(),
  fieldLabel: z.string().nullable().optional(),
  displayPrecision: z.number().int().min(0).nullable().optional(),
  unitSource: z.enum(["VALUE", "HEADER", "LABEL", "DEFAULT", "NONE"]).nullable().optional(),
  bindingLocation: z.string().nullable().optional(),
  bindingStatus: z.enum(metricValidationStatuses).nullable().optional(),
  bindingReasons: z.array(z.string()).optional(),
  pageType: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  timeRange: z.string().nullable().optional(),
  reviewStatus: z.enum(metricReviewStatuses),
  reviewedAt: z.string().nullable().optional()
});

export const reviewMetricInputSchema = z
  .object({
    expectedSnapshotUpdatedAt: z.string().datetime(),
    reviewedValue: z.string().optional(),
    timeRange: z.string().trim().min(1).max(100).optional(),
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
          expectedSnapshotUpdatedAt: z.string().datetime(),
          reviewedValue: z.string().optional(),
          timeRange: z.string().trim().min(1).max(100).optional(),
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

export const confirmAllReviewMetricsInputSchema = z.object({
  snapshotVersions: z.array(z.object({
    snapshotId: z.string().min(1),
    expectedSnapshotUpdatedAt: z.string().datetime()
  })).min(1).max(100).superRefine((versions, ctx) => {
    const seen = new Set<string>();
    for (const [index, version] of versions.entries()) {
      if (seen.has(version.snapshotId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "snapshotId"], message: "snapshotId must be unique" });
      }
      seen.add(version.snapshotId);
    }
  })
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

export const generatedOptimizationRecommendationSchema = z.object({
  priority: z.enum(recommendationPriorities),
  dimension: z.enum(diagnosticDimensions),
  title: z.string().min(1),
  reason: z.string().min(1),
  evidence: z.array(z.string().min(1)).min(1),
  steps: z.array(z.string().min(1)).min(1),
  verifyMetrics: z.array(z.string().min(1)).min(1),
  ruleBoundary: z.string().min(1)
});

export const decisionEngineInputSchema = z.object({
  projectId: z.string().optional(),
  collectionTaskId: z.string().optional(),
  businessType: z.enum(businessTypes),
  subject: subjectContextSchema,
  pageTitle: z.string().default(""),
  sourceUrl: z.string().default(""),
  metrics: z.array(visibleMetricSchema),
  tables: z.array(decisionTableInputSchema),
  structuredCollectionData: z.array(structuredCollectionDataSchema).optional(),
  visibleText: z.string().default(""),
  networkJsonSummary: z.array(networkRecordSchema).max(50),
  targetRoi: z.number().nullable().optional(),
  targetCpa: z.number().nullable().optional(),
  latestAnalysis: z.unknown().nullable().optional(),
  dataReviewStatus: z.enum(dataReviewStatuses).optional(),
  reviewCoverage: reviewCoverageSchema.optional(),
  metricLayer: z.enum(metricLayers).optional(),
  collectionQuality: z.object({
    requiredRoutes: z.array(z.enum(collectionRouteKeys)),
    routes: z.array(z.object({
      routeKey: z.enum(collectionRouteKeys),
      state: z.enum(["FRESH", "AGING", "STALE", "MISSING"]),
      lastCollectedAt: z.string().datetime().nullable(),
      ageMs: z.number().nonnegative().nullable()
    })),
    diagnostics: z.array(collectionRouteDiagnosticSchema).optional(),
    completeness: z.number().min(0).max(1),
    missingRoutes: z.array(z.enum(collectionRouteKeys)),
    staleRoutes: z.array(z.enum(collectionRouteKeys)),
    blocksStrongActions: z.boolean()
  }).optional()
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
  businessAnalysis: z
    .object({
      mode: z.enum(decisionAnalysisModes).optional(),
      headline: z.string().min(1),
      performanceSnapshot: z.array(z.string()),
      findings: z.array(
        z.object({
          dimension: z.enum(diagnosticDimensions),
          title: z.string().min(1),
          conclusion: z.string().min(1),
          evidence: z.array(z.string()),
          riskLevel: z.enum(riskLevels)
        })
      ),
      recommendations: z.array(
        z.object({
          priority: z.enum(recommendationPriorities),
          dimension: z.enum(diagnosticDimensions),
          title: z.string().min(1),
          reason: z.string().min(1),
          evidence: z.array(z.string().min(1)).optional(),
          steps: z.array(z.string().min(1)),
          verifyMetrics: z.array(z.string().min(1)),
          ruleBoundary: z.string().min(1)
        })
      ),
      metricExplanations: z.array(
        z.object({
          title: z.string().min(1),
          value: z.number().nullable(),
          meaning: z.string().min(1),
          use: z.string().min(1),
          caveat: z.string().min(1)
        })
      ),
      ruleReferences: z.array(
        z.object({
          title: z.string().min(1),
          url: z.string().url(),
          scope: z.string().min(1),
          checkedAt: z.string().min(1)
        })
      )
    })
    .optional(),
  calculatedMetrics: z
    .object({
      serviceProviderAfterCost: z.number().nullable().optional(),
      serviceProviderGrossProfitRoi: z.number().nullable().optional(),
      verifiedPlatformBenefits: z.number().nullable().optional(),
      evidence: z.array(z.string()).optional()
    })
    .optional()
});

export const generatedDecisionEngineOutputSchema = decisionEngineOutputSchema.superRefine((output, ctx) => {
  for (const [index, recommendation] of (output.businessAnalysis?.recommendations || []).entries()) {
    if (!generatedOptimizationRecommendationSchema.safeParse(recommendation).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["businessAnalysis", "recommendations", index, "evidence"],
        message: "新生成的经营建议必须包含至少一条真实证据"
      });
    }
  }
});

export const createProjectSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  accountProfileId: z.string().min(1).optional(),
  name: z.string().trim().min(1, "请填写项目名称").max(100, "项目名称不能超过 100 个字"),
  businessType: z.enum(businessTypes).default("DOUYIN_LOCAL_LIFE"),
  subjectType: z.enum(subjectTypes).default("SUBJECT_PENDING"),
  operatorType: z.enum(operatorTypes).default("OPERATOR_PENDING"),
  cooperationType: z.enum(cooperationTypes).default("COOPERATION_PENDING"),
  controlLevel: z.enum(controlLevels).default("PENDING"),
  subjectConfidence: z.coerce.number().min(0).max(1).default(0),
  serviceProviderName: z.string().trim().optional().nullable(),
  serviceMode: z.string().trim().optional().nullable(),
  serviceFee: z.coerce.number().min(0).optional().nullable()
}).superRefine((value, ctx) => {
  const usesServiceProvider = value.subjectType === "SERVICE_PROVIDER"
    || value.operatorType === "SERVICE_PROVIDER_LIVE"
    || value.operatorType === "SERVICE_PROVIDER_OPERATION";
  if (usesServiceProvider && !value.serviceProviderName?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["serviceProviderName"],
      message: "服务商代播或代运营项目必须填写服务商名称"
    });
  }
});

export const createAccountProfileSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  platform: z.enum(accountPlatforms).default("DOUYIN_LOCAL_LIFE"),
  accountName: z.string().trim().min(1, "请填写平台账号名称").max(100, "账号名称不能超过 100 个字"),
  merchantName: z.string().trim().max(100).optional().nullable(),
  storeName: z.string().trim().max(100).optional().nullable(),
  memo: z.string().trim().max(1000).optional().nullable()
});

export const updateAccountProfileSchema = createAccountProfileSchema.omit({ workspaceId: true }).partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "请至少修改一项账号资料" }
);

export const deleteAccountProfileSchema = z.object({
  accountName: z.string().trim().min(1, "请确认要删除的账号名称")
});

export const cloneProjectSchema = z.object({
  name: z.string().trim().min(1, "请填写新项目名称").max(100),
  accountProfileId: z.string().min(1).optional(),
  subjectType: z.enum(subjectTypes).optional(),
  operatorType: z.enum(operatorTypes).optional(),
  cooperationType: z.enum(cooperationTypes).optional(),
  serviceProviderName: z.string().trim().max(100, "服务商名称不能超过 100 个字").optional().nullable(),
  serviceFee: z.coerce.number().min(0, "服务成本不能小于 0").optional().nullable()
});

export const collectionRouteSourceInputSchema = z.object({
  routeKey: z.enum(collectionRouteKeys),
  sourceUrl: z.string().trim().url("请输入完整的页面地址，例如 https://example.com/page").max(snapshotSafetyLimits.urlChars).optional().nullable()
});

export const createCollectionTaskSchema = z.object({
  projectId: z.string().min(1),
  sourceUrl: z.string().trim().url("请输入完整的页面地址，例如 https://example.com/page").max(snapshotSafetyLimits.urlChars).optional(),
  pageTitle: z.string().trim().max(100).optional(),
  routeSources: z.array(collectionRouteSourceInputSchema).max(10).optional()
});

export const confirmSnapshotRouteSchema = z.object({
  confirmed: z.literal(true),
  routeKey: z.enum(collectionRouteKeys).refine((routeKey) => routeKey !== "UNKNOWN", "请选择当前任务中的采集路线"),
  expectedUpdatedAt: z.string().datetime()
});

export const updateCollectionTaskStatusSchema = z.object({
  status: z.enum(collectionTaskStatuses)
});

export const authLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效邮箱").max(128, "邮箱不能超过 128 个字符"),
  password: z.string().min(6, "密码至少 6 位").max(128, "密码不能超过 128 位")
});

export const authRegisterSchema = authLoginSchema.extend({
  name: z.string().trim().min(1, "请输入姓名").max(100, "姓名不能超过 100 个字").optional()
});

export const emailVerificationConfirmSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "验证链接无效或已过期")
});

export const emailVerificationResendSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效邮箱").max(128, "邮箱不能超过 128 个字符")
});

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
