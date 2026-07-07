import type { Prisma } from "@prisma/client";
import {
  applyApprovalGuard,
  decisionEngineVersion,
  decisionRuleVersion,
  runDecisionRules
} from "@douyin-local-life/decision-engine";
import type { ActionProposalDTO, DecisionEngineInput, DecisionEngineOutput, VisibleMetric } from "@douyin-local-life/shared";

export const strategyVersion = decisionRuleVersion;

export function buildDecisionInput(task: {
  id: string;
  sourceUrl: string | null;
  pageTitle: string | null;
  project: {
    id: string;
    businessType: string;
    subjectType: string;
    operatorType: string;
    cooperationType: string;
    controlLevel: string;
    subjectConfidence: number;
    serviceProviderName: string | null;
    serviceMode: string | null;
    serviceFee: number | null;
  };
  snapshots: Array<{
    rawDomText: string | null;
    rawNetworkJson: Prisma.JsonValue | null;
    rawTableData: Prisma.JsonValue | null;
    normalizedMetrics: Array<{
      metricKey: string;
      metricName: string;
      metricValue: string;
      metricUnit: string | null;
      metricSource: string;
    }>;
  }>;
}): DecisionEngineInput {
  const latestSnapshot = task.snapshots[0];
  if (!latestSnapshot) {
    throw new Error("SNAPSHOT_REQUIRED");
  }

  return {
    projectId: task.project.id,
    collectionTaskId: task.id,
    businessType: task.project.businessType as DecisionEngineInput["businessType"],
    subject: {
      subjectType: task.project.subjectType as DecisionEngineInput["subject"]["subjectType"],
      operatorType: task.project.operatorType as DecisionEngineInput["subject"]["operatorType"],
      cooperationType: task.project.cooperationType as DecisionEngineInput["subject"]["cooperationType"],
      controlLevel: task.project.controlLevel as DecisionEngineInput["subject"]["controlLevel"],
      confidence: task.project.subjectConfidence,
      serviceProviderName: task.project.serviceProviderName,
      serviceMode: task.project.serviceMode,
      serviceFee: task.project.serviceFee
    },
    pageTitle: task.pageTitle || "",
    sourceUrl: task.sourceUrl || "",
    metrics: latestSnapshot.normalizedMetrics.map(toVisibleMetric),
    tables: Array.isArray(latestSnapshot.rawTableData) ? [...latestSnapshot.rawTableData] : [],
    visibleText: latestSnapshot.rawDomText || "",
    networkJsonSummary: Array.isArray(latestSnapshot.rawNetworkJson)
      ? (latestSnapshot.rawNetworkJson.slice(0, 50) as DecisionEngineInput["networkJsonSummary"])
      : []
  };
}

export function runDecisionEngine(input: DecisionEngineInput) {
  const ruleOutput = withVersions(runDecisionRules(input));
  const finalOutput = withVersions(applyApprovalGuard(ruleOutput));
  return { ruleOutput, finalOutput };
}

export function toActionProposalCreate(
  proposal: ActionProposalDTO,
  decisionRunId: string,
  projectId: string,
  collectionTaskId: string
): Prisma.ActionProposalCreateManyInput {
  return {
    decisionRunId,
    projectId,
    collectionTaskId,
    actionType: proposal.actionType,
    title: proposal.title,
    summary: proposal.summary || null,
    reason: proposal.reason,
    expectedImpact: proposal.expectedImpact || null,
    riskLevel: proposal.riskLevel,
    confidence: proposal.confidence,
    requiresApproval: true,
    blockedReason: proposal.blockedReason || null,
    status: "PENDING_APPROVAL"
  };
}

function withVersions(output: DecisionEngineOutput): DecisionEngineOutput {
  return {
    ...output,
    engineVersion: decisionEngineVersion,
    ruleVersion: decisionRuleVersion,
    strategyVersion
  };
}

function toVisibleMetric(metric: {
  metricKey: string;
  metricName: string;
  metricValue: string;
  metricUnit: string | null;
  metricSource: string;
}): VisibleMetric {
  return {
    key: metric.metricKey,
    name: metric.metricName,
    value: Number.isFinite(Number(metric.metricValue)) && metric.metricValue.trim() !== "" ? Number(metric.metricValue) : metric.metricValue,
    unit: metric.metricUnit,
    source: metric.metricSource as VisibleMetric["source"]
  };
}
