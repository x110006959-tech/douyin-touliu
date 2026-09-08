import { describe, expect, it } from "vitest";
import { createDiagnosisSkillPlan, getDiagnosisScenarioStrategy, syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";
import type { DecisionEngineInput, DiagnosisScenario } from "@douyin-local-life/shared";
import type { ChatRequest } from "@douyin-local-life/llm";
import { orchestrateDiagnosis } from "./orchestrator.js";
import { createSyntheticDiagnosisTransport } from "./synthetic-evaluation.js";

function scenarioInput(scenario: DiagnosisScenario): DecisionEngineInput {
  return {
    ...syntheticDiagnosisCases[0]!.input,
    metrics: [
      ...syntheticDiagnosisCases[0]!.input.metrics,
      { key: "current_online_viewers", name: "当前在线人数", value: 0, source: "network", confidence: 1, rawEvidence: { sourceType: "test", routeKey: "LIVE_DATA_SCREEN" } },
      { key: "average_watch_duration_seconds", name: "人均观看时长", value: 60.86, source: "network", confidence: 1, rawEvidence: { sourceType: "test", routeKey: "LIVE_DATA_SCREEN" } }
    ],
    diagnosisContext: {
      version: 1, scenario, manualActions: [],
      recentTrend: {
        status: "INSUFFICIENT", reason: "尚无完整观察窗口", routeKey: null, scope: null,
        baselineStartAt: null, baselineEndAt: null, currentStartAt: null, currentEndAt: null, metrics: [], efficiency: null
      }
    }
  };
}

describe("scenario-specific production orchestration", () => {
  it.each(["UNSPECIFIED", "LIVE_MONITORING", "POST_LIVE_REVIEW"] as const)("uses the frozen %s strategy throughout domain and synthesis requests", async (scenario) => {
    const input = scenarioInput(scenario);
    const strategy = getDiagnosisScenarioStrategy(scenario);
    const plan = createDiagnosisSkillPlan(input);
    const base = createSyntheticDiagnosisTransport({ ...syntheticDiagnosisCases[0]!, input });
    const requests: ChatRequest[] = [];
    const events: Array<{ skillId: string; input?: unknown }> = [];
    await orchestrateDiagnosis({
      decisionInput: input, skillPlan: plan,
      transport: { ...base, async chat(request) { requests.push(request); return base.chat(request); } },
      onSkillEvent: async (event) => { if (event.status === "RUNNING") events.push(event); }
    });
    expect(plan.domainSkillIds).toEqual(strategy.domainOrder.filter((id) => plan.domainSkillIds.includes(id)));
    const systems = requests.map((request) => request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n"));
    const domainRequests = requests.filter((request) => request.messages.some((message) => message.content?.includes("analysisQuestion")));
    expect(domainRequests.length).toBeGreaterThan(0);
    expect(systems.some((text) => text.includes(strategy.domainQuestions.diagnose_live_room_conversion))).toBe(true);
    for (const request of domainRequests) {
      const user = request.messages.find((message) => message.role === "user")?.content || "{}";
      const body = JSON.parse(user);
      expect(body.deterministicContext.diagnosisScenario).toBe(scenario);
      expect(Object.values(strategy.domainQuestions)).toContain(body.deterministicContext.analysisQuestion);
      expect(request.messages[0]?.content).toContain(body.deterministicContext.analysisQuestion);
    }
    expect(systems.filter((text) => text.includes(strategy.synthesisInstruction))).toHaveLength(2);
    expect(requests).toHaveLength(domainRequests.length + 2);
    expect(events[0]?.skillId).toBe("audit_data_readiness");
    expect(events.every((event) => JSON.stringify(event.input).includes(strategy.title))).toBe(true);
    expect(input.diagnosisContext?.scenario).toBe(scenario);
  });

  it("changes order across scenarios without dropping evidence-required skills", () => {
    const live = createDiagnosisSkillPlan(scenarioInput("LIVE_MONITORING"));
    const post = createDiagnosisSkillPlan(scenarioInput("POST_LIVE_REVIEW"));
    expect(live.domainSkillIds).not.toEqual(post.domainSkillIds);
    expect(new Set(live.domainSkillIds)).toEqual(new Set(post.domainSkillIds));
    expect(post.domainSkillIds[0]).toBe("diagnose_delivery_units");
  });

  it("rejects a plan copied from another scenario before any model request", async () => {
    let calls = 0;
    const input = scenarioInput("POST_LIVE_REVIEW");
    const base = createSyntheticDiagnosisTransport({ ...syntheticDiagnosisCases[0]!, input });
    await expect(orchestrateDiagnosis({
      decisionInput: input, skillPlan: createDiagnosisSkillPlan(scenarioInput("LIVE_MONITORING")),
      transport: { ...base, async chat(request) { calls++; return base.chat(request); } }
    })).rejects.toMatchObject({ code: "DIAGNOSIS_SKILL_PLAN_INVALID" });
    expect(calls).toBe(0);
  });
});
