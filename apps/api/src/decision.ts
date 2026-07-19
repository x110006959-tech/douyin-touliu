import type { Prisma } from "@prisma/client";
import {
  applyApprovalGuard,
  decisionEngineVersion,
  decisionRuleVersion,
  runDecisionRules
} from "@douyin-local-life/decision-engine";
import {
  decisionEngineInputSchema,
  generatedDecisionEngineOutputSchema,
  normalizeCollectionRouteKey,
  projectRawTableData,
  structuredCollectionDataSchema,
  type ActionProposalDTO,
  type DecisionEngineInput,
  type DecisionEngineOutput
} from "@douyin-local-life/shared";
import { assessCollectionRunQuality } from "./collection-runs.js";
import { proposalExpiresAfterMs } from "./proposal-lifecycle.js";
import { selectLatestSnapshotsByRoute } from "./current-snapshots.js";
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
    collectionRunId?: string | null;
    routeVerificationStatus?: "VERIFIED" | "MANUAL_PENDING";
    routeKey?: string | null;
    pageType?: string | null;
    localCollectedAt?: Date;
    createdAt?: Date;
    rawDomText: string | null;
    rawNetworkJson: Prisma.JsonValue | null;
    rawTableData: Prisma.JsonValue | null;
    structuredDataJson?: Prisma.JsonValue | null;
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
  collectionRuns?: Array<{
    id: string;
    requiredRoutesJson: Prisma.JsonValue;
    snapshots: Array<{
      routeKey: string | null;
      pageType: string | null;
      localCollectedAt: Date;
    }>;
    routeHealth?: Array<{ routeKey: string; consecutiveFailures: number }>;
  }>;
}): DecisionEngineInput {
  if (!task.snapshots.length) {
    throw new Error("SNAPSHOT_REQUIRED");
  }
  const latestCollectionRun = task.collectionRuns?.[0];
  const collectionRun = latestCollectionRun;
  const selectedSnapshots = selectLatestSnapshotsByRoute(task.snapshots, collectionRun?.id)
    .filter((snapshot) => snapshot.routeVerificationStatus !== "MANUAL_PENDING");
  const selectedSnapshotIds = new Set(selectedSnapshots.map((snapshot) => snapshot.id));
  const latestReviewedMetrics = (task.reviewedMetrics || []).filter((metric) => metric.snapshotId && selectedSnapshotIds.has(metric.snapshotId));
  const usableReviewedMetrics = selectedReviewedMetrics(latestReviewedMetrics);
  const useReviewedMetrics = usableReviewedMetrics.length > 0;
  const collectionQuality = collectionRun
    ? assessCollectionRunQuality(collectionRun.requiredRoutesJson, collectionRun.snapshots, collectionRun.routeHealth)
    : undefined;

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
    metrics: useReviewedMetrics
      ? reviewedMetricsToVisibleMetrics(latestReviewedMetrics)
      : normalizedMetricsToVisibleMetrics(selectedSnapshots.flatMap((snapshot) => snapshot.normalizedMetrics)),
    tables: selectedSnapshots.flatMap((snapshot) => projectRawTableData(snapshot.rawTableData, {
      routeKey: normalizeCollectionRouteKey(snapshot.routeKey || snapshot.pageType),
      pageType: snapshot.pageType || "UNKNOWN"
    })),
    structuredCollectionData: selectedSnapshots.flatMap((snapshot) => {
      const parsed = structuredCollectionDataSchema.safeParse(snapshot.structuredDataJson);
      return parsed.success ? [parsed.data] : [];
    }),
    visibleText: selectedSnapshots.map((snapshot) => snapshot.rawDomText || "").filter(Boolean).join("\n\n"),
    networkJsonSummary: selectedSnapshots.flatMap((snapshot) => Array.isArray(snapshot.rawNetworkJson)
      ? (snapshot.rawNetworkJson.slice(0, 20) as DecisionEngineInput["networkJsonSummary"])
      : []).slice(0, 50),
    dataReviewStatus: useReviewedMetrics ? "REVIEWED" : "UNREVIEWED",
    reviewCoverage: latestReviewedMetrics.length ? reviewCoverage(latestReviewedMetrics) : undefined,
    metricLayer: useReviewedMetrics ? "REVIEWED_METRIC" : "NORMALIZED_METRIC",
    collectionQuality
  };
}

export function runDecisionEngine(input: DecisionEngineInput) {
  decisionEngineInputSchema.parse(input);
  const ruleOutput = withVersions(runDecisionRules(input));
  const finalOutput = withVersions(applyApprovalGuard(ruleOutput));
  generatedDecisionEngineOutputSchema.parse(ruleOutput);
  generatedDecisionEngineOutputSchema.parse(finalOutput);
  return { ruleOutput, finalOutput };
}

export function toActionProposalCreate(
  proposal: ActionProposalDTO,
  decisionRunId: string,
  projectId: string,
  collectionTaskId: string,
  now = new Date(),
  expiresAt = new Date(now.getTime() + 15 * 60 * 1000)
): Prisma.ActionProposalCreateManyInput {
  const dedupeKey = `${projectId}:${collectionTaskId}:${proposal.actionType}`;
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
    status: "PENDING_APPROVAL",
    expiresAt: new Date(Math.min(expiresAt.getTime(), now.getTime() + proposalExpiresAfterMs(proposal.actionType))),
    dedupeKey
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
