import { describe, expect, it } from "vitest";
import { createDiagnosisSkillPlan, syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";
import type { ChatTransport } from "@douyin-local-life/llm";
import { orchestrateDiagnosis } from "./orchestrator.js";
import { createSyntheticDiagnosisTransport } from "./synthetic-evaluation.js";

function repeatedOutput(
  marker: string,
  mutate: (value: Record<string, unknown>) => void,
  testCase = syntheticDiagnosisCases[0]!
) {
  const base = createSyntheticDiagnosisTransport(testCase);
  let calls = 0;
  let targetSystem: string | undefined;
  let repeated: Awaited<ReturnType<ChatTransport["chat"]>> | undefined;
  const transport: ChatTransport = {
    ...base,
    async chat(request) {
      const system = request.messages.find((message) => message.role === "system")?.content || "";
      if (!system.includes(marker) || (targetSystem && targetSystem !== system)) return base.chat(request);
      targetSystem = system;
      calls += 1;
      if (repeated) return repeated;
      const response = await base.chat(request);
      const value = JSON.parse(response.message.content!) as Record<string, unknown>;
      mutate(value);
      repeated = { ...response, message: { ...response.message, content: JSON.stringify(value) } };
      return repeated;
    }
  };
  return {
    calls: () => calls,
    run: () => orchestrateDiagnosis({ decisionInput: testCase.input, skillPlan: createDiagnosisSkillPlan(testCase.input), transport })
  };
}

describe.each([
  { stage: "domain", marker: "业务诊断 Skill", factsKey: "facts" },
  { stage: "final", marker: "诊断综合器", factsKey: "factSnapshot" }
])("bounded comparison recovery in $stage", ({ marker, factsKey }) => {
  it.each([
    "缺少行业基准，无法判断当前承接效率是否较低。",
    "未提供人均观看时长的行业平均值，暂不能判断时长较低。",
    "当前无法判断承接效率较低是否成立。",
    "当前承接效率无法判断是否较低。",
    "无法判断承接效率是否低于行业平均。"
  ])("accepts explicit missing evidence and uncertainty on the first response: %s", async (text) => {
    const attempt = repeatedOutput(marker, (value) => {
      value.missingEvidence = [text];
      (value.hypotheses as Array<Record<string, unknown>>)[0]!.missingEvidence = [text];
    });
    await attempt.run();
    expect(attempt.calls()).toBe(1);
  });

  it.each([
    "缺少行业基准，但行业平均为 5%。",
    "无法判断承接效率较低，但是成交效率较低。",
    "缺少历史对比，当前承接效率较低。"
  ])("does not let a neighboring uncertainty or history word authorize a verdict: %s", async (text) => {
    const attempt = repeatedOutput(marker, (value) => { value.missingEvidence = [text]; });
    await expect(attempt.run()).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID" });
    expect(attempt.calls()).toBe(2);
  });

  it("withdraws a broad health verdict without deleting numbers or neighboring uncertainty", async () => {
    const attempt = repeatedOutput(marker, (value) => {
      (value[factsKey] as Array<Record<string, unknown>>)[0]!.statement = "成交金额 243719 元，订单 1062 单正常；不能据此判断整体经营健康。";
    });
    const output = await attempt.run();
    const facts = factsKey === "facts" ? output.skillOutputs.flatMap((skill) => skill.facts) : output.result.factSnapshot;
    expect(facts.some((fact) => fact.statement === "成交金额 243719 元，订单 1062 单状态尚未确认；不能据此判断整体经营健康。")).toBe(true);
    expect(attempt.calls()).toBe(2);
  });
  it("preserves numbers and evidence while withdrawing unsupported assessments and dependent proposals", async () => {
    let evidenceIds: unknown;
    const attempt = repeatedOutput(marker, (value) => {
      const facts = value[factsKey] as Array<Record<string, unknown>>;
      evidenceIds = facts[0]!.evidenceIds;
      facts[0]!.statement = "成交金额 100.50 元，成交表现良好；人均观看时长 42 秒较低。";
    });
    const result = await attempt.run();
    const output = factsKey === "facts"
      ? result.skillOutputs.find((skill) => skill.facts.some((fact) => fact.statement.includes("100.50")))!
      : result.result;
    const facts = "facts" in output ? output.facts : output.factSnapshot;
    expect(facts[0]).toEqual({
      statement: "成交金额 100.50 元，成交表现暂不能判断优劣；人均观看时长 42 秒暂不能判断优劣。",
      evidenceIds
    });
    expect(output.experiments).toEqual([]);
    expect(output.candidateActions).toEqual([]);
    expect(attempt.calls()).toBe(2);
  });

  it.each([
    "当前成交低于行业平均 35%，通常应达到 35% 以上。",
    "行业基准为 5%，应当降低预算。"
  ])("rejects repeated invented numeric benchmarks: %s", async (statement) => {
    const attempt = repeatedOutput(marker, (value) => {
      (value[factsKey] as Array<Record<string, unknown>>)[0]!.statement = statement;
    });
    await expect(attempt.run()).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID", message: expect.stringContaining("DIAGNOSIS_BENCHMARK_UNSUPPORTED") });
    expect(attempt.calls()).toBe(2);
  });

  it("cannot hide fabricated evidence behind a recoverable language violation", async () => {
    const attempt = repeatedOutput(marker, (value) => {
      value[factsKey] = [{ statement: "成交表现良好。", evidenceIds: ["metric:invented"] }];
    });
    await expect(attempt.run()).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID", message: expect.stringContaining("DIAGNOSIS_EVIDENCE_INVALID") });
    expect(attempt.calls()).toBe(2);
  });

  it("keeps unsupported comparison in string arrays fail closed", async () => {
    const attempt = repeatedOutput(marker, (value) => {
      value.missingEvidence = ["当前承接效率较低。"];
    });
    await expect(attempt.run()).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID", message: expect.stringContaining("DIAGNOSIS_BENCHMARK_UNSUPPORTED") });
    expect(attempt.calls()).toBe(2);
  });
});

it("rechecks deterministic facts after final language recovery", async () => {
  const attempt = repeatedOutput("诊断综合器", (value) => {
    value.coreConclusion = "成交表现良好。缺少支付金额，无法判断实际 ROI。";
  });
  await expect(attempt.run()).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID", message: expect.stringContaining("DIAGNOSIS_DETERMINISTIC_CONFLICT") });
  expect(attempt.calls()).toBe(2);
});

it("rejects legacy action and experiment fields in a new domain response", async () => {
  const attempt = repeatedOutput("业务诊断 Skill", (value) => {
    value.experiments = [];
    value.candidateActions = [];
  });
  await expect(attempt.run()).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID" });
  expect(attempt.calls()).toBe(2);
});

it("never rewrites a broad health assertion inside protected action conditions", async () => {
  const attempt = repeatedOutput("诊断综合器", (value) => {
    (value.candidateActions as Array<Record<string, unknown>>)[0]!.reason = "订单 1062 单正常，可以继续调整。";
  });
  await expect(attempt.run()).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID" });
  expect(attempt.calls()).toBe(2);
});

it("does not conceal an unsafe proposal by withdrawing it after language recovery", async () => {
  const attempt = repeatedOutput("诊断综合器", (value) => {
    (value.factSnapshot as Array<Record<string, unknown>>)[0]!.statement = "成交表现良好。";
    (value.candidateActions as Array<Record<string, unknown>>)[0]!.reason = "估算客单价为 100 / 5。";
  });
  await expect(attempt.run()).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID", message: expect.stringContaining("DIAGNOSIS_DERIVED_METRIC_UNSUPPORTED") });
  expect(attempt.calls()).toBe(2);
});

it("rejects an unsupported funnel verdict in the visible core conclusion after recovery", async () => {
  const attempt = repeatedOutput("诊断综合器", (value) => {
    value.coreConclusion = "成交表现良好。存在明显流失。";
  }, syntheticDiagnosisCases.find((testCase) => testCase.expectedMainProblemTag === "HEALTHY")!);
  await expect(attempt.run()).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID", message: expect.stringContaining("DIAGNOSIS_DETERMINISTIC_CONFLICT") });
  expect(attempt.calls()).toBe(2);
});

it("preserves an explicit uncertainty statement about funnel loss", async () => {
  const attempt = repeatedOutput("诊断综合器", (value) => {
    value.coreConclusion = "成交表现良好。当前无法判断是否存在流失。";
  }, syntheticDiagnosisCases.find((testCase) => testCase.expectedMainProblemTag === "HEALTHY")!);
  const output = await attempt.run();
  expect(output.result.coreConclusion).toBe("成交表现暂不能判断优劣。当前无法判断是否存在流失。");
  expect(attempt.calls()).toBe(2);
});

describe("known cumulative ROI versus unknown trend and scoped ROI", () => {
  const source = syntheticDiagnosisCases.find((item) => item.expectedMainProblemTag === "DELIVERY_ROI")!;
  const testCase = {
    ...source,
    input: {
      ...source.input,
      diagnosisContext: {
        version: 1 as const, scenario: "POST_LIVE_REVIEW" as const, manualActions: [],
        recentTrend: {
          status: "AVAILABLE" as const, reason: "存在零消耗窗口，区间产出比未知。",
          routeKey: "LOCAL_PROMOTION_DASHBOARD" as const, scope: "FULL_DOMAIN" as const,
          baselineStartAt: "2026-09-07T15:45:00.000Z", baselineEndAt: "2026-09-07T16:00:00.000Z",
          currentStartAt: "2026-09-07T16:00:00.000Z", currentEndAt: "2026-09-07T16:15:00.000Z",
          metrics: [{ metricKey: "spend", metricName: "消耗", unit: "yuan", baselineValue: 0, currentValue: 0, delta: 0 }],
          efficiency: null
        }
      }
    }
  };

  it.each([
    // First entry is a persisted domain-output sentence from the reported failure;
    // the rejected final model response was not stored, so it is not replayed here.
    "缺少近期同口径历史趋势，无法判断当前ROI和消耗是在改善还是回落。",
    "两个窗口消耗均为零，无法计算区间 ROI。",
    "无法判断最近两个15分钟窗口的ROI是否达标。",
    "缺少分计划数据，无法计算分计划 ROI。",
    "缺少商品支付金额和客单价，无法判断 ROI 未达目标的具体原因。",
    "无法判断当前 ROI 是否持续低于目标。"
  ])("preserves a distinct unknown without repair: %s", async (text) => {
    const attempt = repeatedOutput("诊断综合器", (value) => {
      value.missingEvidence = [text];
      (value.hypotheses as Array<Record<string, unknown>>)[0]!.conclusion = text;
    }, testCase);
    const output = await attempt.run();
    expect(output.result.missingEvidence).toContain(text);
    expect(output.result.mainProblemTag).toBe("DELIVERY_ROI");
    expect(attempt.calls()).toBe(1);
  });

  it.each([
    "缺少支付金额和客单价，无法计算实际 ROI。",
    "无法判断当前 ROI 是否达标。",
    "当前 ROI 是否达标无法判断。",
    "缺少目标 ROI。",
    "窗口消耗为零，但无法判断当前累计 ROI 是否达标。",
    "无法计算区间 ROI；无法判断实际 ROI。",
    "无法根据已采集数据判断实际 ROI 是否达标。",
    "窗口 ROI 无法计算，但当前实际 ROI 也无法判断。",
    "无法判断当前 ROI 是否达标，也不能判断近期趋势。",
    "无法判断当前 ROI 是否达标，因为缺少历史窗口数据。",
    "无法判断当前 ROI 是否持续低于目标，但也无法判断当前 ROI 是否达标。"
  ])("continues to reject denial of the known cumulative result: %s", async (text) => {
    const attempt = repeatedOutput("诊断综合器", (value) => { value.missingEvidence = [text]; }, testCase);
    await expect(attempt.run()).rejects.toMatchObject({
      code: "DIAGNOSIS_OUTPUT_INVALID", message: expect.stringContaining("DIAGNOSIS_DETERMINISTIC_CONFLICT")
    });
    expect(attempt.calls()).toBe(2);
  });
});
