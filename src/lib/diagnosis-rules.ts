import type { DiagnosisAction } from "./constants";

export const diagnosisRuleVersion = "subject-first-local-life-v2";

export const diagnosisPriorityPath = [
  "风险",
  "主体分类",
  "真实成本/ROI",
  "活动核验",
  "全域溢出",
  "直播即时转化",
  "内容价值"
] as const;

export const outputContract = {
  sections: ["全域情报", "深度研判", "操作指令"],
  maxChars: 120,
  mustIncludeAction: true,
  noReasoningTrace: true,
  missingDataPhrase: "数据缺失/待校准"
} as const;

export type SubjectRule = {
  subjectType: string;
  tag: string;
  algorithm: string;
  focusSignals: string[];
  costSignals: string[];
  overflowSignals: string[];
  riskSignals: string[];
  preferredActions: DiagnosisAction[];
  conservativeActions: DiagnosisAction[];
  goodJudgement: string;
  weakJudgement: string;
};

export const subjectRulebook: Record<string, SubjectRule> = {
  商家官方自播: {
    subjectType: "商家官方自播",
    tag: "official_self_live",
    algorithm: "官方自播算法",
    focusSignals: ["核销 ROI", "门店承接", "搜索/POI 增量", "货架成交", "口碑履约"],
    costSignals: ["今日消耗", "目标 ROI/CPA", "核销 GMV", "商家补贴"],
    overflowSignals: ["门店搜索量", "POI 访问", "团购货架成交", "搜索成交"],
    riskSignals: ["评分下滑", "投诉/差评/退款升高", "履约异常", "库存/预约不足"],
    preferredActions: ["稳预算", "加预算", "微调定向", "强化货架承接", "优化 POI/搜索承接"],
    conservativeActions: ["稳预算", "检查库存/预约", "强化货架承接"],
    goodJudgement: "官方自播 ROI 达标且承接稳定",
    weakJudgement: "官方自播转化和承接偏弱"
  },
  "职人/店长直播": {
    subjectType: "职人/店长直播",
    tag: "professional_live",
    algorithm: "职人信任算法",
    focusSignals: ["专业信任", "商品点击", "搜索增量", "核销", "低退款"],
    costSignals: ["今日消耗", "目标 ROI/CPA", "职人激励", "毛利 ROI"],
    overflowSignals: ["搜索增量", "POI 访问", "详情页点击率"],
    riskSignals: ["资质不清", "效果承诺不清", "退款升高", "投诉升高"],
    preferredActions: ["稳预算", "微调定向", "优化讲解", "强化货架承接"],
    conservativeActions: ["稳预算", "优化讲解", "检查库存/预约"],
    goodJudgement: "职人信任带动点击与核销",
    weakJudgement: "职人身份未转化为可信成交"
  },
  外部达人直播: {
    subjectType: "外部达人直播",
    tag: "external_creator",
    algorithm: "达人增量算法",
    focusSignals: ["增量 GMV", "新客", "粉丝画像匹配", "达人全成本", "内容授权"],
    costSignals: ["广告消耗", "坑位费", "CPS 佣金", "样品/接待成本", "商家补贴"],
    overflowSignals: ["搜索增量", "POI 访问", "货架增量", "内容授权复投价值"],
    riskSignals: ["粉丝不匹配", "退款高", "投诉高", "内容不可授权"],
    preferredActions: ["稳预算", "更换达人", "沉淀素材复投", "强化货架承接"],
    conservativeActions: ["稳预算", "更换达人", "强化货架承接"],
    goodJudgement: "达人增量 ROI 与人群匹配有效",
    weakJudgement: "达人增量与人群匹配不足"
  },
  "达人矩阵/机构团长直播": {
    subjectType: "达人矩阵/机构团长直播",
    tag: "creator_matrix",
    algorithm: "达人矩阵算法",
    focusSignals: ["单达人分层", "重复人群", "区域覆盖", "矩阵总 ROI", "话术一致性"],
    costSignals: ["达人分层成本", "CPS 佣金", "坑位费", "商家补贴"],
    overflowSignals: ["区域搜索热度", "POI 增量", "货架增量"],
    riskSignals: ["低转化达人", "重复覆盖", "话术不一致", "价格/核销规则不一致"],
    preferredActions: ["稳预算", "统一达人话术", "更换达人", "微调定向"],
    conservativeActions: ["稳预算", "统一达人话术", "更换达人"],
    goodJudgement: "矩阵高 ROI 达人可分层放大",
    weakJudgement: "矩阵分配或话术一致性不足"
  },
  "服务商代播/代运营": {
    subjectType: "服务商代播/代运营",
    tag: "service_provider",
    algorithm: "服务商真实成本算法",
    focusSignals: ["商家号 ROI", "服务商执行质量", "服务费后毛利 ROI", "素材/粉丝/搜索资产沉淀"],
    costSignals: ["广告消耗", "服务商费用", "商家补贴", "核销毛利"],
    overflowSignals: ["粉丝沉淀", "素材沉淀", "搜索资产", "货架承接"],
    riskSignals: ["错价", "虚假承诺", "场控问题", "排班异常", "客诉"],
    preferredActions: ["调整服务商 SOP", "重谈服务费用", "优化讲解", "沉淀素材复投", "稳预算"],
    conservativeActions: ["稳预算", "调整服务商 SOP", "强化货架承接"],
    goodJudgement: "服务商成本可控且执行无风险",
    weakJudgement: "服务商执行与成本需复盘"
  },
  "平台活动/官方会场": {
    subjectType: "平台活动/官方会场",
    tag: "platform_event",
    algorithm: "活动核验算法",
    focusSignals: ["活动后台核验", "补贴窗口", "活动后 ROI", "库存承接"],
    costSignals: ["平台补贴", "投放券", "消返券", "商家补贴"],
    overflowSignals: ["会场流量", "搜索/POI 增量", "货架成交"],
    riskSignals: ["活动未核验", "活动临近结束", "库存不足", "补贴消失后亏损"],
    preferredActions: ["核验活动", "报名活动", "稳预算", "检查库存/预约"],
    conservativeActions: ["核验活动", "稳预算", "检查库存/预约"],
    goodJudgement: "活动已核验且活动后 ROI 达标",
    weakJudgement: "活动窗口或承接条件不足"
  },
  "品牌/区域矩阵直播": {
    subjectType: "品牌/区域矩阵直播",
    tag: "brand_region_matrix",
    algorithm: "区域矩阵算法",
    focusSignals: ["多门店核销", "区域分配", "库存承接", "门店间 ROI 差异", "商圈搜索热度"],
    costSignals: ["区域总消耗", "目标 ROI/CPA", "门店核销 GMV", "商家补贴"],
    overflowSignals: ["商圈搜索热度", "POI 增量", "跨店核销", "货架成交"],
    riskSignals: ["通兑库存不足", "门店差异过大", "跨店履约异常"],
    preferredActions: ["稳预算", "倾斜高核销门店", "微调定向", "强化货架承接"],
    conservativeActions: ["稳预算", "倾斜高核销门店", "检查库存/预约"],
    goodJudgement: "区域总核销 ROI 达标",
    weakJudgement: "区域预算分配或承接偏弱"
  },
  主体待校准: {
    subjectType: "主体待校准",
    tag: "subject_missing",
    algorithm: "保守校准算法",
    focusSignals: ["主体类型", "操盘主体", "合作关系", "可控程度"],
    costSignals: ["今日消耗", "目标 ROI/CPA", "核销 ROI"],
    overflowSignals: ["搜索/POI", "货架成交"],
    riskSignals: ["数据缺失", "主体低置信", "采集失败"],
    preferredActions: ["稳预算", "检查库存/预约", "强化货架承接"],
    conservativeActions: ["稳预算", "检查库存/预约", "强化货架承接"],
    goodJudgement: "主体信息待校准",
    weakJudgement: "主体未确认，不套专属算法"
  }
};

export function getSubjectRule(subjectType: string | null | undefined) {
  return subjectRulebook[subjectType || ""] || subjectRulebook["主体待校准"];
}

export function getRulePromptSummary(subjectType: string | null | undefined) {
  const rule = getSubjectRule(subjectType);
  return {
    version: diagnosisRuleVersion,
    priorityPath: [...diagnosisPriorityPath],
    algorithm: rule.algorithm,
    focusSignals: rule.focusSignals,
    costSignals: rule.costSignals,
    overflowSignals: rule.overflowSignals,
    outputContract
  };
}
