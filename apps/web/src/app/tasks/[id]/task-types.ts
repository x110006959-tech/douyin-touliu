import type {
  AccountMatchStatus,
  ActionProposalStatus,
  ActionType,
  CooperationType,
  DecisionBusinessAnalysis,
  OperatorType,
  RiskLevel,
  SubjectType
} from "@douyin-local-life/shared";

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
    accountProfile: { id: string; accountName: string; platformAccountId: string | null };
  };
  routeSources: Array<{ routeKey: string; label: string; status: string; required: boolean; sourceUrl: string | null }>;
  snapshots: Array<{
    id: string;
    pageType: string | null;
    rawDomText: string | null;
    visibleMetricsJson: unknown;
    normalizedMetrics: Array<{ metricKey: string; metricName: string; metricValue: string; metricUnit: string | null }>;
    accountMatchStatus: AccountMatchStatus;
    detectedAccountId: string | null;
    detectedAccountName: string | null;
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
  diagnosis: string;
  riskLevel: RiskLevel;
  confidence: number;
  strategyVersion: string;
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
  };
  routeHealth: Array<{ routeKey: string; consecutiveFailures: number; lastError: string | null }>;
};


