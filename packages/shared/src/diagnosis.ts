import { z } from "zod";
import type { ActionType, DecisionEngineInput, RiskLevel } from "./index.js";
import { collectionRouteKeys, type CollectionRouteKey } from "./collection-routes.js";

export const diagnosisSkillIds = [
  "audit_data_readiness",
  "diagnose_traffic_acquisition",
  "diagnose_live_room_conversion",
  "diagnose_product_structure",
  "diagnose_delivery_units",
  "diagnose_activity_and_compliance",
  "retrieve_similar_cases"
] as const;

export const diagnosisActionTypes = [
  "OBSERVE",
  "INCREASE_BUDGET",
  "DECREASE_BUDGET",
  "KEEP_BUDGET",
  "FINE_TUNE_TARGETING",
  "DECREASE_BID",
  "PAUSE_TASK",
  "ADJUST_ROI_TARGET",
  "CHECK_LIVE_ROOM",
  "CHECK_CREATIVE",
  "CHECK_AUDIENCE",
  "VERIFY_ACTIVITY",
  "APPLY_ACTIVITY",
  "OPTIMIZE_SCRIPT",
  "REPAIR_REPUTATION",
  "STRENGTHEN_SHELF",
  "CHECK_INVENTORY_BOOKING",
  "OPTIMIZE_POI_SEARCH",
  "REPLACE_CREATOR",
  "UNIFY_CREATOR_SCRIPT",
  "ADJUST_SERVICE_PROVIDER_SOP",
  "RENEGOTIATE_SERVICE_FEE",
  "REUSE_MATERIAL",
  "ALLOCATE_HIGH_VERIFY_STORES",
  "CALIBRATE_SUBJECT",
  "REQUEST_MANUAL_REVIEW"
] as const satisfies readonly ActionType[];

export type DiagnosisSkillId = (typeof diagnosisSkillIds)[number];
export type DecisionRunMode = "LEGACY_RULE" | "AI_SKILL_ORCHESTRATED";
export type DecisionRunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type DiagnosisSkillExecutionStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
export type DiagnosisCaseStatus = "DRAFT" | "ELIGIBLE" | "EXCLUDED";

export const diagnosisEvidenceSchema = z.object({
  id: z.string().min(1).max(240),
  kind: z.enum(["METRIC", "TABLE_ROW", "ROUTE", "CASE", "POLICY"]),
  label: z.string().min(1).max(300),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  routeKey: z.enum(collectionRouteKeys).nullable().optional(),
  metricKey: z.string().max(100).nullable().optional(),
  tableIndex: z.number().int().nonnegative().nullable().optional(),
  rowIndex: z.number().int().nonnegative().nullable().optional(),
  capturedAt: z.string().datetime().nullable().optional()
});

export const diagnosisClaimSchema = z.object({
  statement: z.string().min(1).max(1000),
  evidenceIds: z.array(z.string().min(1)).min(1).max(20)
});

export const diagnosisHypothesisSchema = z.object({
  id: z.string().min(1).max(100),
  dimension: z.enum(["DATA", "TRAFFIC", "LIVE_ROOM", "PRODUCT", "DELIVERY", "ACTIVITY_COMPLIANCE"]),
  title: z.string().min(1).max(200),
  conclusion: z.string().min(1).max(1200),
  supportingEvidenceIds: z.array(z.string().min(1)).max(20),
  conflictingEvidenceIds: z.array(z.string().min(1)).max(20),
  missingEvidence: z.array(z.string().min(1).max(300)).max(20),
  confidence: z.number().min(0).max(1)
});

export const diagnosisExperimentSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  hypothesisId: z.string().min(1).max(100),
  steps: z.array(z.string().min(1).max(500)).min(1).max(10),
  verifyMetrics: z.array(z.string().min(1).max(100)).min(1).max(10),
  stopConditions: z.array(z.string().min(1).max(500)).min(1).max(10),
  evidenceIds: z.array(z.string().min(1)).min(1).max(20)
});

export const aiCandidateActionSchema = z.object({
  actionType: z.enum(diagnosisActionTypes),
  title: z.string().min(1).max(200),
  reason: z.string().min(1).max(1200),
  expectedImpact: z.string().min(1).max(500).nullable().optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().min(1)).min(1).max(20),
  experimentId: z.string().min(1).max(100).nullable().optional()
});

export const diagnosisSkillOutputSchema = z.object({
  skillId: z.enum(diagnosisSkillIds),
  skillVersion: z.string().min(1),
  applicable: z.boolean(),
  refused: z.boolean(),
  refusalReason: z.string().min(1).max(500).nullable(),
  facts: z.array(diagnosisClaimSchema).max(30),
  hypotheses: z.array(diagnosisHypothesisSchema).max(12),
  missingEvidence: z.array(z.string().min(1).max(300)).max(30),
  experiments: z.array(diagnosisExperimentSchema).max(12),
  candidateActions: z.array(aiCandidateActionSchema).max(12),
  confidence: z.number().min(0).max(1)
});

export const diagnosisFinalResultSchema = z.object({
  schemaVersion: z.literal("ai-diagnosis-result-v1"),
  coreConclusion: z.string().min(1).max(2000),
  mainProblemTag: z.enum(["HEALTHY", "DATA_READINESS", "TRAFFIC", "LIVE_ROOM", "PRODUCT", "DELIVERY_ROI", "ACTIVITY_COMPLIANCE", "MULTI_FACTOR"]),
  confidence: z.number().min(0).max(1),
  factSnapshot: z.array(diagnosisClaimSchema).min(1).max(40),
  hypotheses: z.array(diagnosisHypothesisSchema).min(1).max(20),
  missingEvidence: z.array(z.string().min(1).max(300)).max(30),
  experiments: z.array(diagnosisExperimentSchema).max(20),
  stopConditions: z.array(z.string().min(1).max(500)).min(1).max(20),
  candidateActions: z.array(aiCandidateActionSchema).max(20)
});

export type DiagnosisEvidence = z.infer<typeof diagnosisEvidenceSchema>;
export type DiagnosisClaim = z.infer<typeof diagnosisClaimSchema>;
export type DiagnosisHypothesis = z.infer<typeof diagnosisHypothesisSchema>;
export type DiagnosisExperiment = z.infer<typeof diagnosisExperimentSchema>;
export type AiCandidateAction = z.infer<typeof aiCandidateActionSchema>;
export type DiagnosisSkillOutput = z.infer<typeof diagnosisSkillOutputSchema>;
export type DiagnosisFinalResult = z.infer<typeof diagnosisFinalResultSchema>;

export type SimilarDiagnosisCase = {
  id: string;
  mainProblemTag: string | null;
  summary: string;
  actionTypes: ActionType[];
  outcome: string | null;
  score: number;
};

export type DiagnosisSkillInput = {
  businessMode: "MANAGED_LIVE_GROWTH";
  decisionInput: DecisionEngineInput;
  evidenceCatalog: DiagnosisEvidence[];
  availableRoutes: CollectionRouteKey[];
  similarCases: SimilarDiagnosisCase[];
};

export type DiagnosisPolicyRejection = {
  candidate: AiCandidateAction;
  reasonCode: "ACTION_NOT_ALLOWED" | "EVIDENCE_REQUIRED" | "EVIDENCE_INVALID" | "ACTION_POLICY_BLOCKED";
  reason: string;
};

export type DiagnosisRuleAdjudication = {
  policyVersion: string;
  accepted: Array<AiCandidateAction & { requiresApproval: true }>;
  rejected: DiagnosisPolicyRejection[];
  lifecycleSuppressed?: Array<{ actionType: ActionType; reason: "COOLDOWN" | "FREQUENCY_LIMIT" }>;
};

export type DiagnosisSkillExecutionDTO = {
  id: string;
  skillId: DiagnosisSkillId;
  skillVersion: string;
  sequence: number;
  status: DiagnosisSkillExecutionStatus;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type AiDecisionRunDTO = {
  id: string;
  projectId: string;
  collectionTaskId: string;
  mode: DecisionRunMode;
  status: DecisionRunStatus;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  skillSetVersion: string | null;
  orchestrationVersion: string | null;
  evidenceFingerprint: string | null;
  currentStage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  riskLevel: RiskLevel | null;
  confidence: number | null;
  diagnosis: string | null;
  finalResult: (DiagnosisFinalResult & { ruleAdjudication?: DiagnosisRuleAdjudication; evidenceCatalog?: DiagnosisEvidence[] }) | null;
  skillExecutions: DiagnosisSkillExecutionDTO[];
  actionProposals: unknown[];
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export const diagnosisFeedbackInputSchema = z.object({
  mainProblemCorrect: z.boolean(),
  usefulnessScore: z.number().int().min(1).max(5),
  adoptedActionTypes: z.array(z.enum(diagnosisActionTypes)).max(20).default([]),
  correctionNote: z.string().trim().max(2000).nullable().optional()
});

export const diagnosisCaseStatusInputSchema = z.object({
  status: z.enum(["ELIGIBLE", "EXCLUDED"])
});
