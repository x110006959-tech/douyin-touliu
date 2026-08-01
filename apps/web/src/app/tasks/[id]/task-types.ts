import type {
  ActionProposalStatus,
  ActionType,
  CooperationType,
  CollectionRouteDiagnostic,
  DecisionBusinessAnalysis,
  DecisionEngineOutput,
  OperatorType,
  RiskLevel,
  SubjectType
} from "@douyin-local-life/shared";
import type {
  DiagnosisEvidence,
  DiagnosisFinalResult,
  DiagnosisRuleAdjudication,
  DiagnosisSkillExecutionDTO,
  DecisionRunMode,
  DecisionRunStatus
} from "@douyin-local-life/shared/diagnosis";

export type TaskDetail = {
  id: string;
  status: string;
  sourceUrl: string | null;
  pageTitle: string | null;
  project: {
    id: string;
    name: string;
    subjectType: SubjectType;
    operatorType: OperatorType;
    cooperationType: CooperationType;
    subjectConfidence: number;
    serviceProviderName: string | null;
    serviceMode: string | null;
    serviceFee: number | null;
    accountProfile: { id: string; accountName: string };
  };
  routeSources: Array<{ routeKey: string; label: string; status: string; required: boolean; sourceUrl: string | null }>;
  snapshots: Array<{
    id: string;
    pageType: string | null;
    rawDomText: string | null;
    visibleMetricsJson: unknown;
    normalizedMetrics: Array<{ metricKey: string; metricName: string; metricValue: string; metricUnit: string | null }>;
  }>;
  analyses: Array<{
    id: string;
    status: string;
    provider: string;
    model: string;
    responsePayload?: {
      summary?: string;
      manualCheckItems?: Array<{ title: string; reason: string }>;
      problems?: Array<{ title: string; evidence: string; severity: RiskLevel }>;
      suggestions?: Array<{ title: string; reason: string; expectedImpact: string; priority: RiskLevel }>;
      confidence?: number;
      finalActionsSource?: string;
    } | null;
  }>;
  auditLogs: Array<{ id: string; action: string; createdAt: string }>;
};

export type DecisionRun = {
  id: string;
  mode: DecisionRunMode;
  status: DecisionRunStatus;
  diagnosis: string | null;
  riskLevel: RiskLevel | null;
  confidence: number | null;
  strategyVersion: string;
  provider: string | null;
  model: string | null;
  currentStage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  skillExecutions: DiagnosisSkillExecutionDTO[];
  diagnosisCase?: { id: string; status: "DRAFT" | "ELIGIBLE" | "EXCLUDED" } | null;
  feedback?: Array<{ mainProblemCorrect: boolean; usefulnessScore: number; correctionNote: string | null }>;
  createdAt: string;
  actionProposals: Array<{
    id: string;
    actionType: ActionType;
    title: string;
    reason: string;
    riskLevel: RiskLevel;
    confidence: number;
    status: ActionProposalStatus;
    requiresApproval: boolean;
    manualExecutedAt: string | null;
  }>;
  finalResultJson?: {
    businessAnalysis?: DecisionBusinessAnalysis;
    manualCheckItems?: Array<{ title: string; reason: string }>;
    dataQuality?: { missingFields?: string[]; lowConfidenceFields?: string[] };
    calculatedMetrics?: {
      serviceProviderAfterCost?: number | null;
      serviceProviderGrossProfitRoi?: number | null;
      verifiedPlatformBenefits?: number | null;
      evidence?: string[];
    };
  };
  finalResult: (DiagnosisFinalResult & {
    evidenceCatalog?: DiagnosisEvidence[];
    ruleAdjudication?: DiagnosisRuleAdjudication & { lifecycleSuppressed?: unknown[] };
  }) | null;
};

export type DecisionPreview = {
  preview: true;
  createsRecords: false;
  mode: "FORMAL_READY" | "CONSERVATIVE_ONLY";
  readiness: {
    ready: boolean;
    blockingReasons: string[];
  };
  finalOutput: DecisionEngineOutput;
};

export type DecisionReferenceInsight = {
  id: string;
  dimension: DecisionBusinessAnalysis["findings"][number]["dimension"];
  title: string;
  evidence: string[];
  requiredEvidence: string[];
  manualSteps: string[];
  verifyMetrics: string[];
  stopConditions: string[];
  safetyBoundary: string;
  confidence: "REFERENCE_ONLY";
};

export type ExpertAnalysis = {
  id: string;
  status: string;
  provider: string;
  model: string;
  promptVersion: string;
  responsePayload?: {
    summary?: string;
    manualCheckItems?: Array<{ title: string; reason: string }>;
    problems?: Array<{ title: string; evidence: string; severity: RiskLevel }>;
    suggestions?: Array<{ title: string; reason: string; expectedImpact: string; priority: RiskLevel }>;
    confidence?: number;
    finalActionsSource?: string;
    fallback?: boolean;
    decisionReference?: {
      policyVersion: string;
      mode: "ADVISORY_ONLY";
      notice: string;
      insights: DecisionReferenceInsight[];
      sources: Array<{ id: string; title: string; sourceRevision: string }>;
    };
  } | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CollectionRun = {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "STOPPED" | "DEGRADED";
  startedAt: string;
  lastSnapshotAt: string | null;
  quality: {
    completeness: number;
    blocksStrongActions: boolean;
    missingRoutes: string[];
    staleRoutes: string[];
    routes: Array<{ routeKey: string; state: "FRESH" | "AGING" | "STALE" | "MISSING"; lastCollectedAt: string | null; ageMs: number | null }>;
    diagnostics?: CollectionRouteDiagnostic[];
  };
  routeHealth: Array<{
    routeKey: string;
    consecutiveFailures: number;
    lastAttemptAt: string;
    lastSuccessAt: string | null;
    lastErrorCode: string | null;
    lastError: string | null;
  }>;
};
