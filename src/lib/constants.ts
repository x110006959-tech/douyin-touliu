export const actionLibrary = [
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
  "倾斜高核销门店"
] as const;

export type DiagnosisAction = (typeof actionLibrary)[number];

const actionSet = new Set<string>(actionLibrary);

export function isDiagnosisAction(value: unknown): value is DiagnosisAction {
  return typeof value === "string" && actionSet.has(value);
}

export function validateDiagnosisActions(actions: readonly unknown[]): DiagnosisAction[] {
  const invalid = actions.filter((action) => !isDiagnosisAction(action));
  if (invalid.length > 0) {
    throw new Error(`诊断动作不在动作库中：${invalid.join("、")}`);
  }
  return [...actions] as DiagnosisAction[];
}

export function diagnosisOperation(actions: readonly DiagnosisAction[]) {
  return validateDiagnosisActions(actions).join("、");
}

export const subjectTypes = [
  "商家官方自播",
  "职人/店长直播",
  "外部达人直播",
  "达人矩阵/机构团长直播",
  "服务商代播/代运营",
  "平台活动/官方会场",
  "品牌/区域矩阵直播",
  "主体待校准"
] as const;

export type SubjectType = (typeof subjectTypes)[number];

const subjectTypeSet = new Set<string>(subjectTypes);

export function isSubjectType(value: unknown): value is SubjectType {
  return typeof value === "string" && subjectTypeSet.has(value);
}

export const accountIdentityOptions = ["商家官方号", "门店号", "职人号", "外部达人号", "机构达人号", "平台活动号", "区域/总部号"] as const;

export const operatorTypeOptions = [
  "商家自播",
  "服务商代播",
  "服务商代运营",
  "达人本人",
  "机构团长",
  "平台招商活动",
  "品牌区域运营",
  "待校准"
] as const;

export const cooperationTypeOptions = ["无", "职人绑定", "达人合作", "服务商合同", "平台招商", "品牌矩阵", "待校准"] as const;

export const controlLevelOptions = ["高", "中", "低", "待校准"] as const;

export const sourceOptions = ["manual", "csv", "ocr", "browser", "scrapling", "public_page"] as const;

export const evidenceStatuses = ["pending_verification", "verified", "failed", "rejected"] as const;

export const calibrationStatuses = ["pending", "manual_verified", "auto_verified"] as const;

export const sessionStatuses = ["missing", "active", "expired", "needs_login", "login_pending", "failed"] as const;

export const activityStatuses = ["unverified", "verified", "expired", "ineligible"] as const;
