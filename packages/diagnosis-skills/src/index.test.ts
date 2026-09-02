import { describe, expect, it, vi } from "vitest";
import { buildDiagnosisEvidenceCatalog, createDiagnosisSkillPlan, diagnosisSkillRegistry, requiredDomainSkills } from "./index.js";
import type { DecisionEngineInput } from "@douyin-local-life/shared";
import type { DiagnosisSkillInput } from "@douyin-local-life/shared/diagnosis";

const input: DecisionEngineInput = {
  businessType: "DOUYIN_LOCAL_LIFE",
  subject: {
    subjectType: "SERVICE_PROVIDER",
    operatorType: "SERVICE_PROVIDER_LIVE",
    cooperationType: "SERVICE_PROVIDER_CONTRACT",
    controlLevel: "MEDIUM",
    confidence: 1
  },
  pageTitle: "",
  sourceUrl: "",
  metrics: [{ key: "spend", name: "消耗", value: 100, source: "table", confidence: 1 }],
  tables: [],
  visibleText: "",
  networkJsonSummary: [],
  dataReviewStatus: "REVIEWED",
  metricLayer: "REVIEWED_METRIC",
  collectionQuality: {
    requiredRoutes: ["LOCAL_PROMOTION_DASHBOARD"],
    routes: [{ routeKey: "LOCAL_PROMOTION_DASHBOARD", state: "FRESH", lastCollectedAt: new Date().toISOString(), ageMs: 0 }],
    completeness: 1,
    missingRoutes: [],
    staleRoutes: [],
    blocksStrongActions: false
  }
};

describe("diagnosis skill registry", () => {
  it("keeps readiness audit first and all seven ids versioned", () => {
    expect([...diagnosisSkillRegistry.keys()][0]).toBe("audit_data_readiness");
    expect(diagnosisSkillRegistry.size).toBe(7);
    expect([...diagnosisSkillRegistry.values()].every((skill) => /^\d+\.\d+\.\d+$/.test(skill.version))).toBe(true);
  });

  it("builds deterministic evidence and selects required delivery skill", () => {
    const evidence = buildDiagnosisEvidenceCatalog(input);
    expect(evidence.some((item) => item.id.startsWith("metric:spend"))).toBe(true);
    expect(requiredDomainSkills(["LOCAL_PROMOTION_DASHBOARD"], false)).toContain("diagnose_delivery_units");
  });

  it("creates the same fixed plan for the same released routes in registry order", () => {
    const plannedInput: DecisionEngineInput = {
      ...input,
      collectionQuality: {
        ...input.collectionQuality!,
        requiredRoutes: ["LIVE_DATA_SCREEN", "LOCAL_PROMOTION_DASHBOARD"],
        routes: [
          { routeKey: "LOCAL_PROMOTION_DASHBOARD", state: "FRESH", lastCollectedAt: new Date().toISOString(), ageMs: 0 },
          { routeKey: "LIVE_DATA_SCREEN", state: "AGING", lastCollectedAt: new Date().toISOString(), ageMs: 1 }
        ]
      }
    };

    const first = createDiagnosisSkillPlan(plannedInput);
    const second = createDiagnosisSkillPlan({
      ...plannedInput,
      collectionQuality: {
        ...plannedInput.collectionQuality!,
        routes: [...plannedInput.collectionQuality!.routes].reverse()
      }
    });

    expect(first).toEqual({
      auditSkillId: "audit_data_readiness",
      domainSkillIds: [
        "diagnose_traffic_acquisition",
        "diagnose_live_room_conversion",
        "diagnose_delivery_units",
        "diagnose_activity_and_compliance"
      ],
      retrievalEnabled: false
    });
    expect(second).toEqual(first);
  });

  it("readiness refuses unreviewed input without calling a model", async () => {
    const skill = diagnosisSkillRegistry.get("audit_data_readiness")!;
    const result = await skill.execute({
      businessMode: "MANAGED_LIVE_GROWTH",
      decisionInput: { ...input, dataReviewStatus: "UNREVIEWED" },
      evidenceCatalog: buildDiagnosisEvidenceCatalog({ ...input, dataReviewStatus: "UNREVIEWED" }),
      availableRoutes: ["LOCAL_PROMOTION_DASHBOARD"],
      similarCases: []
    }, { completeSkill: async () => { throw new Error("must not be called"); } });
    expect(result.output.refused).toBe(true);
  });

  it("readiness accepts reviewed multi-route realtime API evidence when the primary route is local promotion", async () => {
    const skill = diagnosisSkillRegistry.get("audit_data_readiness")!;
    const capturedAt = new Date().toISOString();
    const realtimeInput: DecisionEngineInput = {
      ...input,
      metricLayer: "REALTIME_API",
      collectionQuality: {
        requiredRoutes: ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN"],
        routes: [
          { routeKey: "LOCAL_PROMOTION_DASHBOARD", state: "FRESH", lastCollectedAt: capturedAt, ageMs: 0 },
          { routeKey: "LIVE_DATA_SCREEN", state: "FRESH", lastCollectedAt: capturedAt, ageMs: 0 }
        ],
        completeness: 1,
        missingRoutes: [],
        staleRoutes: [],
        blocksStrongActions: false
      },
      realtimeEvidence: {
        routeKey: "LOCAL_PROMOTION_DASHBOARD",
        pageType: "LOCAL_PROMOTION_DASHBOARD",
        observedAt: capturedAt,
        receivedAt: capturedAt,
        metricCount: 1,
        successfulEndpoints: ["pageMetrics"],
        source: "LOCAL_PROMOTION_INTERNAL_API"
      },
      realtimeEvidenceItems: [
        {
          routeKey: "LOCAL_PROMOTION_DASHBOARD",
          pageType: "LOCAL_PROMOTION_DASHBOARD",
          observedAt: capturedAt,
          receivedAt: capturedAt,
          metricCount: 1,
          successfulEndpoints: ["pageMetrics"],
          source: "LOCAL_PROMOTION_INTERNAL_API"
        },
        {
          routeKey: "LIVE_DATA_SCREEN",
          pageType: "LIVE_DATA_SCREEN",
          observedAt: capturedAt,
          receivedAt: capturedAt,
          metricCount: 1,
          successfulEndpoints: ["key_index"],
          source: "LIVE_SCREEN_INTERNAL_API"
        }
      ]
    };
    const result = await skill.execute({
      businessMode: "MANAGED_LIVE_GROWTH",
      decisionInput: realtimeInput,
      evidenceCatalog: buildDiagnosisEvidenceCatalog(realtimeInput),
      availableRoutes: ["LOCAL_PROMOTION_DASHBOARD", "LIVE_DATA_SCREEN"],
      similarCases: []
    }, { completeSkill: async () => { throw new Error("must not be called"); } });

    expect(result.output.refused).toBe(false);
    expect(createDiagnosisSkillPlan(realtimeInput).domainSkillIds).toContain("diagnose_delivery_units");
  });

  it("does not treat an ordinary product table as activity or compliance evidence", async () => {
    const skill = diagnosisSkillRegistry.get("diagnose_activity_and_compliance")!;
    const decisionInput: DecisionEngineInput = {
      ...input,
      metrics: [],
      tables: [{ routeKey: "LIVE_PRODUCT_TAB", pageType: "LIVE_DATA_SCREEN", rows: [["商品", "曝光", "点击", "订单"], ["A", 100, 10, 1]] }],
      collectionQuality: {
        ...input.collectionQuality!,
        requiredRoutes: ["LIVE_PRODUCT_TAB"],
        routes: [{ routeKey: "LIVE_PRODUCT_TAB", state: "FRESH", lastCollectedAt: new Date().toISOString(), ageMs: 0 }]
      }
    };
    const completeSkill = vi.fn();

    const result = await skill.execute({
      businessMode: "MANAGED_LIVE_GROWTH",
      decisionInput,
      evidenceCatalog: buildDiagnosisEvidenceCatalog(decisionInput),
      availableRoutes: ["LIVE_PRODUCT_TAB"],
      similarCases: []
    }, { completeSkill });

    expect(result.output.refused).toBe(true);
    expect(completeSkill).not.toHaveBeenCalled();
  });

  it("refuses a planned domain with no usable evidence without calling the model", async () => {
    const skill = diagnosisSkillRegistry.get("diagnose_delivery_units")!;
    const decisionInput: DecisionEngineInput = {
      ...input,
      metrics: [],
      collectionQuality: {
        ...input.collectionQuality!,
        requiredRoutes: ["LOCAL_PROMOTION_DASHBOARD"],
        routes: [{ routeKey: "LOCAL_PROMOTION_DASHBOARD", state: "FRESH", lastCollectedAt: new Date().toISOString(), ageMs: 0 }]
      }
    };
    const completeSkill = vi.fn();

    const result = await skill.execute({
      businessMode: "MANAGED_LIVE_GROWTH",
      decisionInput,
      evidenceCatalog: buildDiagnosisEvidenceCatalog(decisionInput),
      availableRoutes: ["LOCAL_PROMOTION_DASHBOARD"],
      similarCases: []
    }, { completeSkill });

    expect(result.output).toMatchObject({
      applicable: true,
      refused: true,
      refusalReason: "该领域没有足够的已复核指标或表格证据"
    });
    expect(completeSkill).not.toHaveBeenCalled();
  });

  it("keeps domain metrics on their applicable routes and gives delivery the full-domain ROI target pair", async () => {
    const capturedAt = new Date().toISOString();
    const routeMetric = (key: string, value: number, routeKey: "LIVE_DATA_SCREEN" | "LOCAL_PROMOTION_DASHBOARD") => ({
      key: key as DecisionEngineInput["metrics"][number]["key"],
      name: key,
      value,
      source: "network" as const,
      confidence: 1,
      rawEvidence: { sourceType: "test", routeKey }
    });
    const decisionInput: DecisionEngineInput = {
      ...input,
      targetRoi: 60,
      metrics: [
        routeMetric("live_viewers", 104_972, "LOCAL_PROMOTION_DASHBOARD"),
        routeMetric("clicks", 36_462, "LOCAL_PROMOTION_DASHBOARD"),
        routeMetric("current_online_viewers", 356, "LIVE_DATA_SCREEN"),
        routeMetric("average_watch_duration_seconds", 126, "LIVE_DATA_SCREEN"),
        routeMetric("transaction_users", 7_346, "LIVE_DATA_SCREEN"),
        routeMetric("product_conversion_rate", 0.3984, "LIVE_DATA_SCREEN"),
        routeMetric("orders", 9_600, "LIVE_DATA_SCREEN"),
        routeMetric("gpm", 2_399.56, "LIVE_DATA_SCREEN"),
        routeMetric("spend", 7_674.39, "LOCAL_PROMOTION_DASHBOARD"),
        routeMetric("full_domain_pay_roi", 44.59, "LOCAL_PROMOTION_DASHBOARD"),
        routeMetric("target_roi", 60, "LOCAL_PROMOTION_DASHBOARD")
      ],
      collectionQuality: {
        requiredRoutes: ["LIVE_DATA_SCREEN", "LOCAL_PROMOTION_DASHBOARD"],
        routes: [
          { routeKey: "LIVE_DATA_SCREEN", state: "FRESH", lastCollectedAt: capturedAt, ageMs: 0 },
          { routeKey: "LOCAL_PROMOTION_DASHBOARD", state: "FRESH", lastCollectedAt: capturedAt, ageMs: 0 }
        ],
        completeness: 1,
        missingRoutes: [],
        staleRoutes: [],
        blocksStrongActions: false
      }
    };
    const evidenceCatalog = buildDiagnosisEvidenceCatalog(decisionInput);
    const capturedEvidenceIds: Record<string, string[]> = {};
    const capturedContexts: Record<string, Record<string, unknown>> = {};
    const completeSkill = async (request: {
      skillId: string;
      evidence: Array<{ id: string }>;
      deterministicContext: Record<string, unknown>;
    }) => {
      capturedEvidenceIds[request.skillId] = request.evidence.map((item) => item.id);
      capturedContexts[request.skillId] = request.deterministicContext;
      return {
        output: {
          applicable: true,
          refused: false,
          refusalReason: null,
          facts: [],
          hypotheses: [],
          missingEvidence: [],
          experiments: [],
          candidateActions: [],
          confidence: 0.8
        },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      };
    };
    const skillInput: DiagnosisSkillInput = {
      businessMode: "MANAGED_LIVE_GROWTH" as const,
      decisionInput,
      evidenceCatalog,
      availableRoutes: ["LIVE_DATA_SCREEN", "LOCAL_PROMOTION_DASHBOARD"],
      similarCases: []
    };

    await diagnosisSkillRegistry.get("diagnose_live_room_conversion")!.execute(skillInput, { completeSkill });
    await diagnosisSkillRegistry.get("diagnose_delivery_units")!.execute(skillInput, { completeSkill });

    expect(capturedEvidenceIds.diagnose_live_room_conversion).toEqual(expect.arrayContaining([
      expect.stringContaining("metric:current_online_viewers:LIVE_DATA_SCREEN"),
      expect.stringContaining("metric:average_watch_duration_seconds:LIVE_DATA_SCREEN"),
      expect.stringContaining("metric:transaction_users:LIVE_DATA_SCREEN"),
      expect.stringContaining("metric:product_conversion_rate:LIVE_DATA_SCREEN"),
      expect.stringContaining("metric:orders:LIVE_DATA_SCREEN"),
      expect.stringContaining("metric:gpm:LIVE_DATA_SCREEN")
    ]));
    expect(capturedEvidenceIds.diagnose_live_room_conversion?.join(" ")).not.toContain("LOCAL_PROMOTION_DASHBOARD");
    expect(capturedEvidenceIds.diagnose_delivery_units).toEqual(expect.arrayContaining([
      expect.stringContaining("metric:full_domain_pay_roi:LOCAL_PROMOTION_DASHBOARD"),
      expect.stringContaining("metric:target_roi:LOCAL_PROMOTION_DASHBOARD")
    ]));
    expect(capturedContexts.diagnose_live_room_conversion).not.toHaveProperty("targetRoi");
    expect(capturedContexts.diagnose_delivery_units).toMatchObject({ dimension: "DELIVERY", targetRoi: 60 });
  });
});
