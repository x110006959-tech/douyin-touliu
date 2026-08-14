import { describe, expect, it, vi } from "vitest";
import { buildDiagnosisEvidenceCatalog, diagnosisSkillRegistry, requiredDomainSkills } from "./index.js";
import type { DecisionEngineInput } from "@douyin-local-life/shared";

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

  it("readiness accepts reviewed live overview realtime API evidence", async () => {
    const skill = diagnosisSkillRegistry.get("audit_data_readiness")!;
    const realtimeInput: DecisionEngineInput = {
      ...input,
      metricLayer: "REALTIME_API",
      collectionQuality: {
        requiredRoutes: ["LIVE_DATA_SCREEN"],
        routes: [{ routeKey: "LIVE_DATA_SCREEN", state: "FRESH", lastCollectedAt: new Date().toISOString(), ageMs: 0 }],
        completeness: 1,
        missingRoutes: [],
        staleRoutes: [],
        blocksStrongActions: false
      },
      realtimeEvidence: {
        routeKey: "LIVE_DATA_SCREEN",
        pageType: "LIVE_DATA_SCREEN",
        observedAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        metricCount: 1,
        successfulEndpoints: ["key_index"],
        source: "LIVE_SCREEN_INTERNAL_API"
      }
    };
    const result = await skill.execute({
      businessMode: "MANAGED_LIVE_GROWTH",
      decisionInput: realtimeInput,
      evidenceCatalog: buildDiagnosisEvidenceCatalog(realtimeInput),
      availableRoutes: ["LIVE_DATA_SCREEN"],
      similarCases: []
    }, { completeSkill: async () => { throw new Error("must not be called"); } });

    expect(result.output.refused).toBe(false);
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
});
