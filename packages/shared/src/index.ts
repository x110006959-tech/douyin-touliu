import { z } from "zod";

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
export const actionProposalStatuses = ["PENDING_APPROVAL", "APPROVED", "REJECTED", "OBSERVING", "MANUAL_EXECUTED"] as const;
export const approvalDecisions = ["APPROVE", "REJECT", "APPROVED", "REJECTED", "OBSERVE"] as const;
export const executionModes = ["MANUAL"] as const;
export const executionStatuses = ["PENDING", "MANUAL_EXECUTED", "FAILED"] as const;

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
  MANUAL_EXECUTED: "人工已执行"
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
  "ADJUST_ROI_TARGET",
  "CHECK_LIVE_ROOM",
  "CHECK_CREATIVE",
  "CHECK_AUDIENCE",
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
      };
    };

export type VisibleMetric = {
  key: string;
  name: string;
  value: number | string | null;
  unit?: string | null;
  source: "dom" | "table" | "network" | "manual";
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
  completeness: number;
  blocksStrongActions: boolean;
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
};

export type AnalyzeOutput = {
  summary: string;
  riskLevel: RiskLevel;
  problems: AnalysisProblem[];
  suggestions: AnalysisSuggestion[];
  manualCheckItems: ManualCheckItem[];
  confidence: number;
};

export const visibleMetricSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  value: z.union([z.number(), z.string(), z.null()]),
  unit: z.string().nullable().optional(),
  source: z.enum(["dom", "table", "network", "manual"])
});

export const networkRecordSchema = z.object({
  url: z.string().url(),
  method: z.string().min(1),
  status: z.number().int(),
  responseJson: z.any(),
  capturedAt: z.string().min(1)
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
  sourceUrl: z.string().url(),
  pageTitle: z.string().default(""),
  rawDomText: z.string().default(""),
  rawNetworkJson: z.array(networkRecordSchema).max(50).default([]),
  rawTableData: z.array(z.unknown()).default([]),
  visibleMetricsJson: z.array(visibleMetricSchema).default([]),
  screenshotUrl: z.string().url().nullable().optional(),
  localCollectedAt: z.string().min(1)
});

export const manualCheckItemSchema = z.object({
  title: z.string().min(1),
  reason: z.string().min(1)
});

export const decisionDataQualitySchema = z.object({
  missingFields: z.array(z.string()),
  lowConfidenceFields: z.array(z.string()).optional(),
  completeness: z.number().min(0).max(1),
  blocksStrongActions: z.boolean()
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
  latestAnalysis: z.unknown().nullable().optional()
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
  dataQuality: decisionDataQualitySchema
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
  email: z.string().email(),
  password: z.string().min(6)
});

export const authRegisterSchema = authLoginSchema.extend({
  name: z.string().min(1).optional()
});

export function success<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null };
}

export function failure(code: string, message: string): ApiResponse<never> {
  return { success: false, data: null, error: { code, message } };
}

export function subjectLabel(type: SubjectType) {
  return subjectTypeLabels[type] || "主体待校准";
}

export const aiDisclaimer = "AI 诊断结果仅供投流决策参考，请结合业务目标、预算和平台规则人工确认。第一版系统不会自动执行任何投放操作。";

export const extensionSafetyNotice =
  "本插件仅在用户授权并打开目标后台页面时采集当前页面可见数据和允许的 JSON 响应。插件不会自动点击、修改预算、暂停任务、创建计划或提交任何平台操作。";
