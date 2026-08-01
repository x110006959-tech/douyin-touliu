import { z } from "zod";
import { decisionEngineInputSchema, type DecisionEngineInput, type MetricKey, type VisibleMetric } from "@douyin-local-life/shared";
import {
  diagnosisEvidenceSchema,
  diagnosisSkillIds,
  diagnosisSkillOutputSchema,
  type DiagnosisEvidence,
  type DiagnosisSkillId,
  type DiagnosisSkillInput,
  type DiagnosisSkillOutput
} from "@douyin-local-life/shared/diagnosis";
import type { CollectionRouteKey } from "@douyin-local-life/shared/collection-routes";

export const diagnosisSkillSetVersion = "managed-live-growth-skills-v2";

export type DiagnosisTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type DiagnosisSkillModel = {
  completeSkill(input: {
    skillId: DiagnosisSkillId;
    skillVersion: string;
    systemPrompt: string;
    evidence: DiagnosisEvidence[];
    deterministicContext: Record<string, unknown>;
  }): Promise<{ output: unknown; usage: DiagnosisTokenUsage }>;
};

export const diagnosisSkillInputSchema = z.object({
  businessMode: z.literal("MANAGED_LIVE_GROWTH"),
  decisionInput: decisionEngineInputSchema,
  evidenceCatalog: z.array(diagnosisEvidenceSchema).max(5_000),
  availableRoutes: z.array(z.enum([
    "LOCAL_PROMOTION_DASHBOARD",
    "LIVE_DATA_SCREEN",
    "LIVE_PRODUCT_TAB",
    "LIVE_TRAFFIC_TAB",
    "TASK_TABLE",
    "MATERIAL_LIBRARY",
    "HOURLY_TREND",
    "UNKNOWN"
  ])).max(20),
  similarCases: z.array(z.object({
    id: z.string(),
    mainProblemTag: z.string().nullable(),
    summary: z.string(),
    actionTypes: z.array(z.string()),
    outcome: z.string().nullable(),
    score: z.number()
  })).max(3)
});

const domainOutputSchema = diagnosisSkillOutputSchema.omit({ skillId: true, skillVersion: true });

export type DiagnosisSkillDefinition = {
  id: DiagnosisSkillId;
  version: string;
  title: string;
  businessModes: readonly ["MANAGED_LIVE_GROWTH"];
  applicableRoutes: readonly CollectionRouteKey[];
  inputSchema: typeof diagnosisSkillInputSchema;
  outputSchema: typeof diagnosisSkillOutputSchema;
  execute(input: DiagnosisSkillInput, model: DiagnosisSkillModel): Promise<{ output: DiagnosisSkillOutput; usage: DiagnosisTokenUsage }>;
};

type DomainSpec = {
  id: Exclude<DiagnosisSkillId, "audit_data_readiness" | "retrieve_similar_cases">;
  version: string;
  title: string;
  dimension: string;
  routes: CollectionRouteKey[];
  metricKeys: MetricKey[];
  tableKeywords?: string[];
  method: string;
};

const domainSpecs: DomainSpec[] = [
  {
    id: "diagnose_traffic_acquisition",
    version: "1.0.0",
    title: "流量获取诊断",
    dimension: "TRAFFIC",
    routes: ["LIVE_TRAFFIC_TAB", "LIVE_DATA_SCREEN"],
    metricKeys: ["impressions", "clicks", "ctr", "live_viewers", "hourly_live_views", "hourly_natural_live_views", "hourly_commercial_live_views"],
    method: "区分流量规模、来源结构、曝光到点击及点击到进房效率；没有同周期证据时不得作因果判断。"
  },
  {
    id: "diagnose_live_room_conversion",
    version: "1.0.0",
    title: "直播间承接诊断",
    dimension: "LIVE_ROOM",
    routes: ["LIVE_DATA_SCREEN"],
    metricKeys: ["live_viewers", "orders", "gmv", "gpm", "clicks", "ctr", "refund_rate"],
    method: "沿进房、商品点击、下单与成交漏斗定位承接问题，明确反证和需要单变量验证的环节。"
  },
  {
    id: "diagnose_product_structure",
    version: "1.0.0",
    title: "商品结构诊断",
    dimension: "PRODUCT",
    routes: ["LIVE_PRODUCT_TAB"],
    metricKeys: ["gmv", "orders", "impressions", "clicks", "ctr"],
    method: "使用商品表中的曝光、点击、订单和成交证据区分引流款、承接款与低效款；样本不足时拒绝排名。"
  },
  {
    id: "diagnose_delivery_units",
    version: "1.0.0",
    title: "投流单元诊断",
    dimension: "DELIVERY",
    routes: ["LOCAL_PROMOTION_DASHBOARD", "TASK_TABLE"],
    metricKeys: ["spend", "daily_budget", "remaining_budget", "orders", "pay_roi", "verify_roi", "target_roi", "cpa", "target_cpa"],
    method: "对照本地推总览、任务列表、目标 ROI 与单元差异；预算、暂停和目标调整只可作为待规则裁决的人工候选动作。"
  },
  {
    id: "diagnose_activity_and_compliance",
    version: "1.1.0",
    title: "活动权益与合规诊断",
    dimension: "ACTIVITY_COMPLIANCE",
    routes: ["LIVE_DATA_SCREEN", "LIVE_PRODUCT_TAB", "LOCAL_PROMOTION_DASHBOARD"],
    metricKeys: ["activity_verified", "platform_subsidy", "ad_coupon", "rebate_coupon", "wrong_price_promise_risk", "refund_rate", "fulfillment_exception_rate", "inventory_capacity"],
    tableKeywords: ["活动", "权益", "优惠", "补贴", "券", "价格", "履约", "核销", "退款", "库存", "activity", "coupon", "subsidy", "price", "fulfillment", "inventory", "risk"],
    method: "只使用已核验权益和履约证据；未核验优惠不得进入到手价或口播，风险证据优先于增长建议。"
  }
];

export const auditDataReadinessSkill: DiagnosisSkillDefinition = {
  id: "audit_data_readiness",
  version: "1.0.0",
  title: "诊断数据就绪审计",
  businessModes: ["MANAGED_LIVE_GROWTH"],
  applicableRoutes: [],
  inputSchema: diagnosisSkillInputSchema,
  outputSchema: diagnosisSkillOutputSchema,
  async execute(rawInput) {
    const input = parseInput(rawInput);
    const readinessEvidence = input.evidenceCatalog.filter((item) => item.kind === "ROUTE" || item.id.startsWith("policy:data-review"));
    const decision = input.decisionInput;
    const blocking = [
      ...(decision.dataReviewStatus === "REVIEWED" ? [] : ["数据尚未全部人工复核"]),
      ...(decision.metricLayer === "REVIEWED_METRIC" ? [] : ["诊断输入不是人工复核层"]),
      ...((decision.collectionQuality?.missingRoutes || []).map((route) => `缺少路线 ${route}`)),
      ...((decision.collectionQuality?.staleRoutes || []).map((route) => `路线已过期 ${route}`))
    ];
    const evidenceIds = readinessEvidence.map((item) => item.id);
    const output: DiagnosisSkillOutput = {
      skillId: "audit_data_readiness",
      skillVersion: "1.0.0",
      applicable: true,
      refused: blocking.length > 0,
      refusalReason: blocking.length ? blocking.join("；") : null,
      facts: evidenceIds.length ? [{ statement: "诊断输入来自已复核证据，路线与时效门禁已执行。", evidenceIds }] : [],
      hypotheses: [],
      missingEvidence: blocking,
      experiments: [],
      candidateActions: [],
      confidence: blocking.length ? 0 : 1
    };
    return { output: diagnosisSkillOutputSchema.parse(output), usage: emptyUsage() };
  }
};

export const retrieveSimilarCasesSkill: DiagnosisSkillDefinition = {
  id: "retrieve_similar_cases",
  version: "1.0.0",
  title: "相似案例检索",
  businessModes: ["MANAGED_LIVE_GROWTH"],
  applicableRoutes: [],
  inputSchema: diagnosisSkillInputSchema,
  outputSchema: diagnosisSkillOutputSchema,
  async execute(rawInput) {
    const input = parseInput(rawInput);
    const cases = input.similarCases.slice(0, 3);
    const validIds = new Set(input.evidenceCatalog.map((item) => item.id));
    const facts = cases.map((item) => ({
      statement: `相似案例：${item.summary}${item.outcome ? `；结果：${item.outcome}` : ""}`,
      evidenceIds: [`case:${item.id}`]
    })).filter((item) => item.evidenceIds.every((id) => validIds.has(id)));
    return {
      output: diagnosisSkillOutputSchema.parse({
        skillId: "retrieve_similar_cases",
        skillVersion: "1.0.0",
        applicable: cases.length > 0,
        refused: false,
        refusalReason: null,
        facts,
        hypotheses: [],
        missingEvidence: cases.length ? [] : ["当前工作区暂无符合纳入条件的相似案例"],
        experiments: [],
        candidateActions: [],
        confidence: cases.length ? Math.min(0.9, cases[0]!.score) : 0
      }),
      usage: emptyUsage()
    };
  }
};

const domainSkills = domainSpecs.map(createDomainSkill);

export const diagnosisSkills = [auditDataReadinessSkill, ...domainSkills, retrieveSimilarCasesSkill] as const;
export const diagnosisSkillRegistry = new Map<DiagnosisSkillId, DiagnosisSkillDefinition>(
  diagnosisSkills.map((skill) => [skill.id, skill])
);

export function buildDiagnosisEvidenceCatalog(input: DecisionEngineInput, similarCases: DiagnosisSkillInput["similarCases"] = []) {
  const evidence: DiagnosisEvidence[] = [];
  evidence.push({
    id: "policy:data-review",
    kind: "POLICY",
    label: "人工复核层",
    value: input.dataReviewStatus === "REVIEWED" && input.metricLayer === "REVIEWED_METRIC"
  });
  for (const route of input.collectionQuality?.routes || []) {
    evidence.push({
      id: `route:${route.routeKey}`,
      kind: "ROUTE",
      label: `${route.routeKey} 路线状态`,
      value: route.state,
      routeKey: route.routeKey,
      capturedAt: route.lastCollectedAt
    });
  }
  input.metrics.forEach((metric, index) => {
    const routeKey = readMetricRoute(metric);
    evidence.push({
      id: `metric:${String(metric.key)}:${routeKey || "UNKNOWN"}:${index}`,
      kind: "METRIC",
      label: metric.name || String(metric.key),
      value: primitiveMetricValue(metric.value),
      routeKey,
      metricKey: String(metric.key)
    });
  });
  input.tables.forEach((table, tableIndex) => {
    table.rows.slice(0, 100).forEach((row, rowIndex) => {
      evidence.push({
        id: `table:${table.routeKey || "UNKNOWN"}:${tableIndex}:row:${rowIndex}`,
        kind: "TABLE_ROW",
        label: `${table.routeKey || "UNKNOWN"} 表 ${tableIndex + 1} 第 ${rowIndex + 1} 行`,
        value: JSON.stringify(row).slice(0, 1_500),
        routeKey: table.routeKey,
        tableIndex,
        rowIndex
      });
    });
  });
  for (const item of similarCases) {
    evidence.push({ id: `case:${item.id}`, kind: "CASE", label: "工作区相似案例", value: item.summary });
  }
  return z.array(diagnosisEvidenceSchema).parse(evidence);
}

export function requiredDomainSkills(availableRoutes: CollectionRouteKey[], hasSimilarCases: boolean): DiagnosisSkillId[] {
  const present = new Set(availableRoutes);
  const ids: DiagnosisSkillId[] = domainSpecs
    .filter((spec) => spec.routes.some((route) => present.has(route)))
    .map((spec) => spec.id);
  if (hasSimilarCases) ids.push("retrieve_similar_cases");
  return ids;
}

function createDomainSkill(spec: DomainSpec): DiagnosisSkillDefinition {
  return {
    id: spec.id,
    version: spec.version,
    title: spec.title,
    businessModes: ["MANAGED_LIVE_GROWTH"],
    applicableRoutes: spec.routes,
    inputSchema: diagnosisSkillInputSchema,
    outputSchema: diagnosisSkillOutputSchema,
    async execute(rawInput, model) {
      const input = parseInput(rawInput);
      const selected = input.evidenceCatalog.filter((item) =>
        (item.kind === "METRIC" && spec.metricKeys.includes(item.metricKey as MetricKey))
        || (item.kind === "TABLE_ROW" && item.routeKey && spec.routes.includes(item.routeKey) && matchesTableKeywords(item, spec.tableKeywords))
        || (item.kind === "ROUTE" && item.routeKey && spec.routes.includes(item.routeKey))
      );
      const routeAvailable = spec.routes.some((route) => input.availableRoutes.includes(route));
      if (!routeAvailable || !selected.some((item) => item.kind === "METRIC" || item.kind === "TABLE_ROW")) {
        return {
          output: diagnosisSkillOutputSchema.parse({
            skillId: spec.id,
            skillVersion: spec.version,
            applicable: routeAvailable,
            refused: true,
            refusalReason: routeAvailable ? "该领域没有足够的已复核指标或表格证据" : "当前任务未覆盖该领域路线",
            facts: [],
            hypotheses: [],
            missingEvidence: [routeAvailable ? "缺少可用于该领域诊断的已复核证据" : `缺少路线：${spec.routes.join("、")}`],
            experiments: [],
            candidateActions: [],
            confidence: 0
          }),
          usage: emptyUsage()
        };
      }
      const response = await model.completeSkill({
        skillId: spec.id,
        skillVersion: spec.version,
        systemPrompt: [
          `你是“${spec.title}”业务诊断 Skill。`,
          spec.method,
          "只能引用输入 evidence 的 id；必须同时寻找支持证据、冲突证据和缺失证据。",
          "建议只能是人工实验或系统枚举内候选动作，不得声称已经操作平台。",
          "输出必须符合给定 JSON 结构，不得包含隐藏推理。"
        ].join("\n"),
        evidence: selected,
        deterministicContext: {
          dimension: spec.dimension,
          dataReviewStatus: input.decisionInput.dataReviewStatus,
          reviewCoverage: input.decisionInput.reviewCoverage || null,
          targetRoi: input.decisionInput.targetRoi ?? null
        }
      });
      const parsed = domainOutputSchema.parse(response.output);
      const output = diagnosisSkillOutputSchema.parse({ skillId: spec.id, skillVersion: spec.version, ...parsed });
      assertEvidenceReferences(output, new Set(selected.map((item) => item.id)));
      return { output, usage: response.usage };
    }
  };
}

function matchesTableKeywords(evidence: DiagnosisEvidence, keywords: string[] | undefined) {
  if (!keywords?.length) return true;
  if (typeof evidence.value !== "string") return false;
  const normalized = evidence.value.toLocaleLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLocaleLowerCase()));
}

function parseInput(input: DiagnosisSkillInput) {
  const parsed = diagnosisSkillInputSchema.parse(input);
  return parsed as DiagnosisSkillInput;
}

function assertEvidenceReferences(output: DiagnosisSkillOutput, validEvidenceIds: Set<string>) {
  const referenced = [
    ...output.facts.flatMap((item) => item.evidenceIds),
    ...output.hypotheses.flatMap((item) => [...item.supportingEvidenceIds, ...item.conflictingEvidenceIds]),
    ...output.experiments.flatMap((item) => item.evidenceIds),
    ...output.candidateActions.flatMap((item) => item.evidenceIds)
  ];
  const invalid = referenced.filter((id) => !validEvidenceIds.has(id));
  if (invalid.length) throw new Error(`DIAGNOSIS_EVIDENCE_INVALID:${[...new Set(invalid)].join(",")}`);
}

function readMetricRoute(metric: VisibleMetric): CollectionRouteKey | null {
  const raw = metric.rawEvidence;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = (raw as Record<string, unknown>).routeKey;
  return typeof candidate === "string" && [
    "LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN", "LIVE_PRODUCT_TAB", "LIVE_TRAFFIC_TAB", "TASK_TABLE", "MATERIAL_LIBRARY", "HOURLY_TREND", "UNKNOWN"
  ].includes(candidate) ? candidate as CollectionRouteKey : null;
}

function primitiveMetricValue(value: VisibleMetric["value"]): string | number | boolean | null {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null ? value : String(value);
}

function emptyUsage(): DiagnosisTokenUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

export { diagnosisSkillIds };
export { syntheticDiagnosisCases, type SyntheticDiagnosisCase } from "./evaluation-cases.js";
