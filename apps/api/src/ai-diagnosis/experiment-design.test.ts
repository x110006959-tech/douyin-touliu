import { describe, expect, it } from "vitest";
import { createDiagnosisSkillPlan, syntheticDiagnosisCases } from "@douyin-local-life/diagnosis-skills";
import type { ChatTransport } from "@douyin-local-life/llm";
import type { DiagnosisFinalModelOutput } from "@douyin-local-life/shared/diagnosis";
import { orchestrateDiagnosis } from "./orchestrator.js";
import { createSyntheticDiagnosisTransport } from "./synthetic-evaluation.js";

type MutableFinalModelOutput = DiagnosisFinalModelOutput & {
  stopConditions?: string[];
  experiments: Array<DiagnosisFinalModelOutput["experiments"][number] & { stopConditions?: string[] }>;
};

function repeatedFinalOutput(mutate: (value: MutableFinalModelOutput) => void) {
  const testCase = syntheticDiagnosisCases[0]!;
  const base = createSyntheticDiagnosisTransport(testCase);
  let calls = 0;
  const transport: ChatTransport = {
    ...base,
    async chat(request) {
      const system = request.messages.find((message) => message.role === "system")?.content || "";
      if (!system.includes("诊断综合器")) return base.chat(request);
      calls += 1;
      const response = await base.chat(request);
      const value = JSON.parse(response.message.content!) as MutableFinalModelOutput;
      mutate(value);
      return { ...response, message: { ...response.message, content: JSON.stringify(value) } };
    }
  };
  return {
    calls: () => calls,
    run: () => orchestrateDiagnosis({ decisionInput: testCase.input, skillPlan: createDiagnosisSkillPlan(testCase.input), transport })
  };
}

describe("最终综合阶段的实验与风险契约", () => {
  it("拒绝模型重复提交旧 stopConditions 字段，而不是静默覆盖", async () => {
    const attempt = repeatedFinalOutput((value) => {
      value.stopConditions = ["旧字段不应参与本轮风险条件。"];
      value.experiments[0]!.stopConditions = ["旧实验字段不应参与本轮风险条件。"];
    });

    await expect(attempt.run()).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID" });
    expect(attempt.calls()).toBe(2);
  });

  it("缺少 abortCriteria 时不能靠删除风险条件通过检查", async () => {
    const attempt = repeatedFinalOutput((value) => {
      delete value.experiments[0]!.abortCriteria;
    });

    await expect(attempt.run()).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID" });
    expect(attempt.calls()).toBe(2);
  });

  it("拒绝把完成条件混进唯一的风险止损字段", async () => {
    const attempt = repeatedFinalOutput((value) => {
      value.experiments[0]!.abortCriteria = ["完成观察窗口后停止。"];
    });

    await expect(attempt.run()).rejects.toMatchObject({
      code: "DIAGNOSIS_OUTPUT_INVALID",
      message: expect.stringContaining("DIAGNOSIS_EXPERIMENT_INVALID")
    });
    expect(attempt.calls()).toBe(2);
  });

  it("拒绝在 abortCriteria 内重复生成同一风险条件", async () => {
    const attempt = repeatedFinalOutput((value) => {
      const condition = value.experiments[0]!.abortCriteria![0]!;
      value.experiments[0]!.abortCriteria = [condition, condition];
    });

    await expect(attempt.run()).rejects.toMatchObject({
      code: "DIAGNOSIS_OUTPUT_INVALID",
      message: expect.stringContaining("DIAGNOSIS_EXPERIMENT_INVALID")
    });
    expect(attempt.calls()).toBe(2);
  });

  it("拒绝脱离实验的候选动作", async () => {
    const attempt = repeatedFinalOutput((value) => {
      value.candidateActions[0]!.experimentId = null;
    });

    await expect(attempt.run()).rejects.toMatchObject({
      code: "DIAGNOSIS_OUTPUT_INVALID",
      message: expect.stringContaining("DIAGNOSIS_EXPERIMENT_INVALID")
    });
    expect(attempt.calls()).toBe(2);
  });

  it.each(["duplicate-plan", "invalid-hypothesis", "observation-change"])("拒绝不合法的唯一方案：%s", async (problem) => {
    const attempt = repeatedFinalOutput((value) => {
      if (problem === "duplicate-plan") value.candidateActions.push({ ...value.candidateActions[0]! });
      if (problem === "invalid-hypothesis") value.experiments[0]!.hypothesisId = "nonexistent";
      if (problem === "observation-change") value.experiments[0]!.steps = ["提高预算后观察成交"];
    });
    await expect(attempt.run()).rejects.toMatchObject({ code: "DIAGNOSIS_OUTPUT_INVALID" });
    expect(attempt.calls()).toBe(2);
  });

  it("拒绝一次改变多个经营变量的人工实验", async () => {
    const attempt = repeatedFinalOutput((value) => {
      const experiment = value.experiments[0]!;
      experiment.experimentType = "MANUAL_CHANGE";
      experiment.actionType = "OPTIMIZE_SCRIPT";
      experiment.singleVariable = "商品讲解话术";
      experiment.steps = ["优化商品讲解话术", "降低商品价格", "观察商品成交"];
      value.candidateActions[0]!.actionType = "OPTIMIZE_SCRIPT";
    });

    await expect(attempt.run()).rejects.toMatchObject({
      code: "DIAGNOSIS_OUTPUT_INVALID",
      message: expect.stringContaining("DIAGNOSIS_EXPERIMENT_INVALID")
    });
    expect(attempt.calls()).toBe(2);
  });

  it("由服务端从 abortCriteria 生成兼容的历史 stopConditions", async () => {
    const attempt = repeatedFinalOutput((value) => {
      const experiment = value.experiments[0]!;
      experiment.experimentType = "MANUAL_CHANGE";
      experiment.actionType = "OPTIMIZE_SCRIPT";
      experiment.singleVariable = "商品讲解话术";
      experiment.steps = ["优化商品讲解话术", "保持商品价格和预算不变", "观察商品成交"];
      value.candidateActions[0]!.actionType = "OPTIMIZE_SCRIPT";
    });

    const execution = await attempt.run();
    expect(execution.result.experiments[0]?.stopConditions).toEqual(execution.result.experiments[0]?.abortCriteria);
    expect(execution.result.stopConditions).toEqual(execution.result.experiments[0]?.abortCriteria);
    expect(attempt.calls()).toBe(1);
  });
});
