import type { Prisma } from "@prisma/client";
import {
  applyApprovalGuard,
  decisionEngineVersion,
  decisionRuleVersion,
  runDecisionRules
} from "@douyin-local-life/decision-engine";
import type { ActionProposalDTO, DecisionEngineInput, DecisionEngineOutput } from "@douyin-local-life/shared";
import {
  normalizedMetricsToVisibleMetrics,
  reviewedMetricsToVisibleMetrics,
  reviewCoverage,
  selectedReviewedMetrics
} from "./review-metrics.js";

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
    id: string;
    rawDomText: string | null;
    rawNetworkJson: Prisma.JsonValue | null;
    rawTableData: Prisma.JsonValue | null;
    normalizedMetrics: Array<{
      id: string;
      metricKey: string;
      metricName: string;
      metricValue: string;
      metricUnit: string | null;
      metricSource: string;
      confidence?: number | null;
      rawEvidence?: Prisma.JsonValue | null;
    }>;
  }>;
  reviewedMetrics?: Array<{
    id: string;
    taskId: string;
    snapshotId: string | null;
    normalizedMetricId: string | null;
    metricKey: string;
    metricName: string;
    originalValue: string | null;
    reviewedValue: string | null;
    metricUnit: string | null;
    metricSource: "XHR_JSON" | "TABLE" | "DOM_TEXT" | "SCREENSHOT" | "MANUAL_INPUT" | "UNKNOWN";
    confidence: number;
    rawEvidence: Prisma.JsonValue | null;
    pageType: string | null;
    scope: string | null;
    timeRange: string | null;
    reviewStatus: "PENDING" | "CONFIRMED" | "MODIFIED" | "IGNORED";
    reviewerId: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}): DecisionEngineInput {
  const latestSnapshot = task.snapshots[0];
  if (!latestSnapshot) {
    throw new Error("SNAPSHOT_REQUIRED");
  }
  const latestReviewedMetrics = (task.reviewedMetrics || []).filter((metric) => metric.snapshotId === latestSnapshot.id);
  const usableReviewedMetrics = selectedReviewedMetrics(latestReviewedMetrics);
  const useReviewedMetrics = usableReviewedMetrics.length > 0;

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
    metrics: useReviewedMetrics ? reviewedMetricsToVisibleMetrics(latestReviewedMetrics) : normalizedMetricsToVisibleMetrics(latestSnapshot.normalizedMetrics),
    tables: Array.isArray(latestSnapshot.rawTableData) ? [...latestSnapshot.rawTableData] : [],
    visibleText: latestSnapshot.rawDomText || "",
    networkJsonSummary: Array.isArray(latestSnapshot.rawNetworkJson)
      ? (latestSnapshot.rawNetworkJson.slice(0, 50) as DecisionEngineInput["networkJsonSummary"])
      : [],
    dataReviewStatus: useReviewedMetrics ? "REVIEWED" : "UNREVIEWED",
    reviewCoverage: latestReviewedMetrics.length ? reviewCoverage(latestReviewedMetrics) : undefined,
    metricLayer: useReviewedMetrics ? "REVIEWED_METRIC" : "NORMALIZED_METRIC"
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
