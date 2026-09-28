# 代码索引

> 由 `tools/build-code-index.mjs` 确定性生成。修改代码后运行 `pnpm code:index` 保持本文件、`ARCHITECTURE.md` 和 `CODE_OWNERSHIP.md` 与源码一致。

## 业务域

### 服务端 - 认证与积分

| 模块 | 主要导出 | 依赖方向 | 负责人 |
| --- | --- | --- | --- |
| `apps/api/src/auth.test.ts` | 无 | `apps/api/src/auth.js` | 服务端 - 认证与积分 |
| `apps/api/src/auth.ts` | `AuthUser`、`AuthenticatedRequest`、`authMiddleware`、`clearSessionCookie`、`createUserSession`、`ensureSecurityConfiguration`、`extensionScopeGuard`、`hashExtensionSecret`、`hashOpaqueSecret`、`readCookie`、`requireHumanSession`、`resolveSecuritySecret` | `apps/api/src/prisma.js`、`apps/api/src/response.js` | 服务端 - 认证与积分 |
| `apps/api/src/credits.ts` | `chargeDiagnosisCredit`、`diagnosisCreditCost`、`initialCreditBalance`、`refundDecisionRunCredit` | 无 | 服务端 - 认证与积分 |
| `apps/api/src/csrf.ts` | `csrfProtection`、`hashCsrfToken` | `apps/api/src/auth.js`、`apps/api/src/http-security.js`、`apps/api/src/response.js` | 服务端 - 认证与积分 |
| `apps/api/src/email-verification.ts` | `ensureEmailDeliveryConfigured`、`resetTestEmailDeliveries`、`sendEmailVerification`、`takeLatestVerificationForTest` | 无 | 服务端 - 认证与积分 |
| `apps/api/src/ownership.ts` | `getOwnedActionProposal`、`getOwnedProject`、`getOwnedReviewedMetric`、`getOwnedTask`、`getOwnedTaskAccess`、`getTaskForDecision` | `apps/api/src/collection-runs.js`、`apps/api/src/current-snapshots.js`、`apps/api/src/prisma.js` | 服务端 - 认证与积分 |
| `apps/api/src/persisted-input.test.ts` | 无 | `apps/api/src/audit.js`、`apps/api/src/persisted-input.js` | 服务端 - 认证与积分 |
| `apps/api/src/persisted-input.ts` | `SensitivePersistedInputError`、`readSafeOptionalText`、`sanitizeDerivedPersistedJson`、`sanitizePersistedJson`、`sanitizeRequestMetadata` | `@douyin-local-life/shared` | 服务端 - 认证与积分 |
| `apps/api/src/rate-limit.test.ts` | 无 | `apps/api/src/prisma.js`、`apps/api/src/rate-limit.js` | 服务端 - 认证与积分 |
| `apps/api/src/rate-limit.ts` | `RateLimitCheck`、`checkAiExplanationRateLimit`、`checkDecisionRateLimit`、`checkEmailVerificationRateLimit`、`checkExtensionPairingRateLimit`、`checkLoginRateLimit`、`checkMetricPulseRateLimit`、`checkRegisterRateLimit`、`checkSnapshotRateLimit`、`checkWriteRateLimit`、`metricPulseRateLimitWindowMs`、`resetRateLimitBuckets` | `@douyin-local-life/shared`、`apps/api/src/auth.js`、`apps/api/src/prisma.js` | 服务端 - 认证与积分 |
| `apps/api/src/routes/auth.ts` | `createAuthRouter` | `@douyin-local-life/shared`、`apps/api/src/auth.js`、`apps/api/src/credits.js`、`apps/api/src/csrf.js`、`apps/api/src/email-verification.js`、`apps/api/src/persisted-input.js`、`apps/api/src/prisma.js`、`apps/api/src/rate-limit.js`、`apps/api/src/response.js`、`apps/api/src/transactions.js` | 服务端 - 认证与积分 |
| `apps/api/src/routes/credits.ts` | `createCreditsRouter` | `apps/api/src/prisma.js`、`apps/api/src/response.js`、`apps/api/src/server-utils.js` | 服务端 - 认证与积分 |
| `packages/shared/src/auth-schemas.ts` | `authLoginSchema`、`authRegisterSchema`、`normalizePhoneNumber` | 无 | 服务端 - 认证与积分 |

### 服务端 - 采集与证据

| 模块 | 主要导出 | 依赖方向 | 负责人 |
| --- | --- | --- | --- |
| `apps/api/src/capture-derived-data-repair-cli.ts` | 无 | `apps/api/src/capture-derived-data-repair.js`、`apps/api/src/prisma.js`、`apps/api/src/server-utils.js` | 服务端 - 采集与证据 |
| `apps/api/src/capture-derived-data-repair.test.ts` | 无 | `apps/api/src/capture-derived-data-repair.js` | 服务端 - 采集与证据 |
| `apps/api/src/capture-derived-data-repair.ts` | `CaptureDerivedDataRepairResult`、`inspectCurrentVerifiedCaptureDerivedData`、`repairCurrentVerifiedCaptureDerivedData` | `@douyin-local-life/shared`、`apps/api/src/collection-runs.js`、`apps/api/src/current-snapshots.js`、`apps/api/src/normalize.js`、`apps/api/src/review-metrics.js`、`apps/api/src/server-utils.js` | 服务端 - 采集与证据 |
| `apps/api/src/collection-runs.test.ts` | 无 | `apps/api/src/collection-runs.js` | 服务端 - 采集与证据 |
| `apps/api/src/collection-runs.ts` | `assessCollectionRunQuality`、`createCollectionRunSchema`、`getOwnedCollectionRun`、`hydrateCurrentRunSnapshots`、`refreshCollectionRunStatus`、`reportCollectionRouteFailureSchema`、`requiredRoutesFromJson`、`sameCollectionRouteSet`、`toCollectionRunDTO` | `@douyin-local-life/shared`、`apps/api/src/current-snapshots.js`、`apps/api/src/prisma.js` | 服务端 - 采集与证据 |
| `apps/api/src/current-snapshots.test.ts` | 无 | `apps/api/src/current-snapshots.js` | 服务端 - 采集与证据 |
| `apps/api/src/current-snapshots.ts` | `findCurrentSnapshotIdsByRoute`、`selectLatestSnapshotsByRoute` | `@douyin-local-life/shared` | 服务端 - 采集与证据 |
| `apps/api/src/live-screen-internal-api-config.ts` | `liveScreenInternalApiEnabled` | 无 | 服务端 - 采集与证据 |
| `apps/api/src/live-screen-internal-api-validation.test.ts` | 无 | `@douyin-local-life/shared`、`apps/api/src/live-screen-internal-api-validation.js` | 服务端 - 采集与证据 |
| `apps/api/src/live-screen-internal-api-validation.ts` | `validateLiveScreenInternalApiPayload` | `@douyin-local-life/shared` | 服务端 - 采集与证据 |
| `apps/api/src/live-screen-minute-trend.test.ts` | 无 | `apps/api/src/live-screen-minute-trend.js` | 服务端 - 采集与证据 |
| `apps/api/src/live-screen-minute-trend.ts` | `structureLiveScreenMinuteTrend` | `@douyin-local-life/shared` | 服务端 - 采集与证据 |
| `apps/api/src/local-promotion-internal-api-config.ts` | `localPromotionInternalApiEnabled` | 无 | 服务端 - 采集与证据 |
| `apps/api/src/local-promotion-internal-api-validation.test.ts` | 无 | `@douyin-local-life/shared`、`apps/api/src/local-promotion-internal-api-validation.js` | 服务端 - 采集与证据 |
| `apps/api/src/local-promotion-internal-api-validation.ts` | `validateLocalPromotionInternalApiPulse` | `@douyin-local-life/shared` | 服务端 - 采集与证据 |
| `apps/api/src/metric-drift.ts` | `metricAliasOverrideInputSchema`、`metricDriftStatusSchema`、`normalizeAlias`、`recordMetricDriftEvents` | `@douyin-local-life/shared` | 服务端 - 采集与证据 |
| `apps/api/src/normalize.test.ts` | 无 | `apps/api/src/normalize.js` | 服务端 - 采集与证据 |
| `apps/api/src/normalize.ts` | `MetricAliasOverrideInput`、`normalizeMetrics` | `@douyin-local-life/shared` | 服务端 - 采集与证据 |
| `apps/api/src/security-metrics.test.ts` | 无 | `apps/api/src/prisma.js`、`apps/api/src/security-metrics.js` | 服务端 - 采集与证据 |
| `apps/api/src/security-metrics.ts` | `SecurityMetricKey`、`flushSecurityMetrics`、`observeSecurityMetricResponse`、`queueSecurityMetrics`、`recordSecurityMetrics` | `apps/api/src/http-security.js`、`apps/api/src/prisma.js` | 服务端 - 采集与证据 |
| `packages/shared/src/collection-capture.ts` | `CaptureCompleteness`、`CaptureTabState`、`MetricSource`、`MetricSourceStatus`、`PageType`、`captureCompletenessValues`、`captureMetaSchema`、`captureTabStates`、`collectionSnapshotSchema`、`metricPulseSchema`、`metricRawEvidenceSchema`、`metricSourceStatuses` | `packages/shared/src/collection-routes.js`、`packages/shared/src/live-screen-internal-api.js`、`packages/shared/src/local-promotion-internal-api.js`、`packages/shared/src/metric-value.js`、`packages/shared/src/safety.js` | 服务端 - 采集与证据 |
| `packages/shared/src/collection-dashboard.ts` | `BulkTableCellReviewInput`、`CollectionDashboardDTO`、`ConfirmTableBindingInput`、`DashboardOverviewCandidateDTO`、`DashboardOverviewCandidateStatus`、`DashboardOverviewCardDTO`、`DashboardOverviewCardStatus`、`DashboardOverviewSection`、`DashboardOverviewSourceType`、`TableCellReviewDTO`、`UpdateDecisionTargetsInput`、`bulkTableCellReviewInputSchema` | `packages/shared/src/collection-routes.js`、`packages/shared/src/index.js` | 服务端 - 采集与证据 |
| `packages/shared/src/collection-diagnostics.test.ts` | 无 | `packages/shared/src/collection-diagnostics`、`packages/shared/src/collection-routes` | 服务端 - 采集与证据 |
| `packages/shared/src/collection-diagnostics.ts` | `CollectionDataProvenance`、`CollectionDiagnosticIssue`、`CollectionIssueCode`、`CollectionIssueSeverity`、`CollectionRouteDiagnostic`、`CollectionRouteDiagnosticInput`、`CollectionRouteDiagnosticStatus`、`CollectionRouteFailureCode`、`collectionDataProvenance`、`collectionIssueCodes`、`collectionRouteDiagnosticSchema`、`collectionRouteDiagnosticStatuses` | `packages/shared/src/collection-routes.js` | 服务端 - 采集与证据 |
| `packages/shared/src/collection-field-profiles.test.ts` | 无 | `packages/shared/src/collection-field-profiles` | 服务端 - 采集与证据 |
| `packages/shared/src/collection-field-profiles.ts` | `CollectionFieldProfile`、`CollectionMetricFieldDefinition`、`CollectionTableFieldDefinition`、`collectionFieldProfiles`、`collectionMetricFieldDefinitions`、`isAllowedCollectionMetricLabel`、`metricFieldsForRoute`、`normalizeCollectionFieldName`、`tableFieldForHeader` | `packages/shared/src/collection-routes.js`、`packages/shared/src/metric-value.js` | 服务端 - 采集与证据 |
| `packages/shared/src/collection-records.ts` | `CollectionRecordProvenance`、`HourlyCollectionRow`、`MaterialCollectionRow`、`StructuredCollectionData`、`TaskCollectionRow`、`structuredCollectionDataSchema`、`structuredCollectionDataVersion`、`taskCollectionRowSchema` | `packages/shared/src/collection-routes.js` | 服务端 - 采集与证据 |
| `packages/shared/src/live-screen-internal-api.test.ts` | 无 | `packages/shared/src/live-screen-internal-api.js` | 服务端 - 采集与证据 |
| `packages/shared/src/live-screen-internal-api.ts` | `LiveScreenApiEvidencePurpose`、`LiveScreenInternalApiEndpointContract`、`LiveScreenInternalApiEndpointKey`、`LiveScreenInternalApiField`、`LiveScreenRoomIdEvidence`、`LiveScreenRoomIdResolution`、`LiveScreenRoomIdSource`、`isApprovedLiveScreenFieldPath`、`isLiveScreenInternalApiPath`、`liveScreenApiEvidencePurposes`、`liveScreenEndpointKeysForMode`、`liveScreenInternalApiAdapterVersion` | 无 | 服务端 - 采集与证据 |
| `packages/shared/src/local-promotion-internal-api.test.ts` | 无 | `packages/shared/src/local-promotion-internal-api` | 服务端 - 采集与证据 |
| `packages/shared/src/local-promotion-internal-api.ts` | `LocalPromotionApiMetricKey`、`LocalPromotionInternalApiEndpointKey`、`LocalPromotionInternalApiEvidencePurpose`、`LocalPromotionInternalApiField`、`LocalPromotionInternalApiIdentityEvidence`、`LocalPromotionInternalApiIdentityFields`、`LocalPromotionInternalApiIdentityResolution`、`LocalPromotionInternalApiMetricGroupKey`、`LocalPromotionPulseMetricKey`、`isExactLocalPromotionInternalApiPage`、`localPromotionApiMetricKeys`、`localPromotionIdentityKey` | 无 | 服务端 - 采集与证据 |
| `packages/shared/src/metric-keys.ts` | `metricKeys` | 无 | 服务端 - 采集与证据 |
| `packages/shared/src/metric-value.test.ts` | 无 | `packages/shared/src/metric-value` | 服务端 - 采集与证据 |
| `packages/shared/src/metric-value.ts` | `MetricRawEvidence`、`MetricSourceCandidate`、`MetricValidationStatus`、`MetricValueSemantic`、`ParsedMetricValue`、`VisibleMetric`、`metricValidationStatuses`、`metricValueSemantic`、`metricValueText`、`metricValueToRuleNumber`、`parseDisplayedMetricValue` | 无 | 服务端 - 采集与证据 |
| `packages/shared/src/realtime-evidence.ts` | `RealtimeEvidenceSummary`、`RealtimeMetricFrame`、`realtimeEvidenceRouteMatchesSource`、`realtimeEvidenceSummarySchema`、`realtimeMetricFrameFreshnessMs`、`realtimeMetricFrameIsFresh` | `packages/shared/src/collection-capture.js`、`packages/shared/src/collection-routes.js`、`packages/shared/src/metric-value.js` | 服务端 - 采集与证据 |

### 服务端 - 复核校准

| 模块 | 主要导出 | 依赖方向 | 负责人 |
| --- | --- | --- | --- |
| `apps/api/src/capture-summary.test.ts` | 无 | `apps/api/src/capture-summary.js`、`apps/api/src/current-snapshots.js` | 服务端 - 复核校准 |
| `apps/api/src/capture-summary.ts` | `getCaptureSummary`、`selectOverviewMetrics`、`summaryDisplayValue`、`summarySemanticScope`、`tableReviewCoverageForSummary` | `@douyin-local-life/shared`、`apps/api/src/collection-runs.js`、`apps/api/src/current-snapshots.js`、`apps/api/src/prisma.js`、`apps/api/src/table-cell-reviews.js` | 服务端 - 复核校准 |
| `apps/api/src/decision-flow.review-calibration.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js`、`apps/api/src/ai-diagnosis/worker.js`、`apps/api/src/decision-flow-test-support.js`、`apps/api/src/live-screen-internal-api-config.js`、`apps/api/src/local-promotion-internal-api-config.js`、`apps/api/src/prisma.js` | 服务端 - 复核校准 |
| `apps/api/src/decision-flow.table-calibration.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js`、`apps/api/src/ai-diagnosis/worker.js`、`apps/api/src/decision-flow-test-support.js`、`apps/api/src/live-screen-internal-api-config.js`、`apps/api/src/local-promotion-internal-api-config.js`、`apps/api/src/prisma.js` | 服务端 - 复核校准 |
| `apps/api/src/metric-validation.test.ts` | 无 | `apps/api/src/metric-validation.js` | 服务端 - 复核校准 |
| `apps/api/src/metric-validation.ts` | `calibrateFullyReviewedTables`、`calibrationInputForMetric`、`canAutoConfirmMetric`、`confirmTableBindingCalibration`、`hasTrustedMetricEvidence`、`hasTrustedTableBinding`、`hasTrustedTableBindings`、`isConfirmableMetricEvidence`、`isInvalidMetricEvidence`、`needsManualBindingReview`、`qualifyCapturedMetrics`、`qualifyTableBindings` | `@douyin-local-life/shared` | 服务端 - 复核校准 |
| `apps/api/src/review-metrics.test.ts` | 无 | `apps/api/src/review-metrics.js` | 服务端 - 复核校准 |
| `apps/api/src/review-metrics.ts` | `TaskReviewInput`、`canConfirmMetric`、`canModifyMetric`、`currentReviewSnapshots`、`currentReviewedMetrics`、`defaultConfidence`、`ensureReviewMetricsForTask`、`isSourceConflictMetric`、`latestSnapshot`、`normalizeReviewPatch`、`normalizedMetricsToVisibleMetrics`、`resolveSourceConflictReview` | `@douyin-local-life/shared`、`apps/api/src/current-snapshots.js`、`apps/api/src/metric-validation.js`、`apps/api/src/prisma.js` | 服务端 - 复核校准 |
| `apps/api/src/routes/review-metrics.ts` | `createReviewMetricRouter` | `@douyin-local-life/shared`、`apps/api/src/audit.js`、`apps/api/src/metric-validation.js`、`apps/api/src/ownership.js`、`apps/api/src/persisted-input.js`、`apps/api/src/response.js`、`apps/api/src/review-metrics.js`、`apps/api/src/server-utils.js`、`apps/api/src/transactions.js` | 服务端 - 复核校准 |
| `apps/api/src/table-cell-reviews.ts` | `applyTableCellReviews`、`coordinateKey`、`getTableCellValue`、`projectSnapshotTables`、`tableCellReviewCoverage`、`toTableCellReviewDTO` | `@douyin-local-life/shared` | 服务端 - 复核校准 |

### 服务端 - 决策编排

| 模块 | 主要导出 | 依赖方向 | 负责人 |
| --- | --- | --- | --- |
| `apps/api/src/action-proposals.ts` | `ActionProposalAuditInput`、`approveActionProposal`、`markActionProposalManualExecuted`、`observeActionProposal`、`rejectActionProposal` | `apps/api/src/persisted-input.js`、`apps/api/src/prisma.js` | 服务端 - 决策编排 |
| `apps/api/src/ai-circuit.test.ts` | 无 | `apps/api/src/ai-circuit.js`、`apps/api/src/prisma.js` | 服务端 - 决策编排 |
| `apps/api/src/ai-circuit.ts` | `AiCircuitOpenError`、`executeWithAiCircuit`、`getAiCircuitStatus`、`recordAiFailure`、`recordAiSuccess` | `apps/api/src/persisted-input.js`、`apps/api/src/prisma.js` | 服务端 - 决策编排 |
| `apps/api/src/audit.ts` | `AuditActorSnapshot`、`createAuditActorSnapshot`、`writeAuditLog`、`writeAuditLogs` | `apps/api/src/auth.js`、`apps/api/src/persisted-input.js`、`apps/api/src/prisma.js` | 服务端 - 决策编排 |
| `apps/api/src/decision-evidence.test.ts` | 无 | `apps/api/src/decision-evidence.js` | 服务端 - 决策编排 |
| `apps/api/src/decision-evidence.ts` | `DecisionEvidenceChangedError`、`decisionEvidenceFingerprint` | `apps/api/src/current-snapshots.js` | 服务端 - 决策编排 |
| `apps/api/src/decision-flow-test-support.ts` | `ActionOutcomeResponse`、`ApiEnvelope`、`DecisionRunResponse`、`ProjectOutcomeSummaryResponse`、`ReviewMetricResponse`、`captureMeta`、`createDecisionFlowApiClient`、`hashForTest`、`internalApiPulseMetric`、`localPromotionPulseMetric`、`metric`、`restoreDecisionTestEnvironment` | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/shared`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js`、`apps/api/src/ai-diagnosis/worker.js` | 服务端 - 决策编排 |
| `apps/api/src/decision-flow.account-pairing.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js`、`apps/api/src/ai-diagnosis/worker.js`、`apps/api/src/decision-flow-test-support.js`、`apps/api/src/live-screen-internal-api-config.js`、`apps/api/src/local-promotion-internal-api-config.js`、`apps/api/src/prisma.js` | 服务端 - 决策编排 |
| `apps/api/src/decision-flow.realtime-manual-import.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js`、`apps/api/src/ai-diagnosis/worker.js`、`apps/api/src/decision-flow-test-support.js`、`apps/api/src/live-screen-internal-api-config.js`、`apps/api/src/local-promotion-internal-api-config.js`、`apps/api/src/prisma.js` | 服务端 - 决策编排 |
| `apps/api/src/decision-flow.route-confirmation.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js`、`apps/api/src/ai-diagnosis/worker.js`、`apps/api/src/decision-flow-test-support.js`、`apps/api/src/live-screen-internal-api-config.js`、`apps/api/src/local-promotion-internal-api-config.js`、`apps/api/src/prisma.js` | 服务端 - 决策编排 |
| `apps/api/src/decision-flow.smoke.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js`、`apps/api/src/ai-diagnosis/worker.js`、`apps/api/src/decision-flow-test-support.js`、`apps/api/src/live-screen-internal-api-config.js`、`apps/api/src/local-promotion-internal-api-config.js`、`apps/api/src/prisma.js` | 服务端 - 决策编排 |
| `apps/api/src/decision-readiness.ts` | `evaluateDecisionReadiness` | `@douyin-local-life/decision-engine`、`@douyin-local-life/shared`、`@douyin-local-life/shared/formal-decision-readiness`、`apps/api/src/collection-runs.js`、`apps/api/src/current-snapshots.js`、`apps/api/src/decision.js`、`apps/api/src/ownership.js`、`apps/api/src/realtime-decision-evidence.js`、`apps/api/src/review-metrics.js` | 服务端 - 决策编排 |
| `apps/api/src/decision-safety.test.ts` | 无 | `@douyin-local-life/shared`、`apps/api/src/collection-runs.js`、`apps/api/src/decision-readiness.js`、`apps/api/src/decision.js` | 服务端 - 决策编排 |
| `apps/api/src/decision-targets.ts` | `currentTargetRoiMetric`、`replaceTaskTargetRoi`、`targetRoiFromMetrics`、`targetRoiMetricKey`、`targetRoiVisibleMetric` | `@douyin-local-life/shared`、`apps/api/src/review-metrics.js` | 服务端 - 决策编排 |
| `apps/api/src/decision.ts` | `buildDecisionInput`、`hasUntrustedCurrentEvidence`、`runDecisionEngine`、`strategyVersion`、`toActionProposalCreate` | `@douyin-local-life/decision-engine`、`@douyin-local-life/shared`、`apps/api/src/collection-runs.js`、`apps/api/src/current-snapshots.js`、`apps/api/src/decision-targets.js`、`apps/api/src/metric-validation.js`、`apps/api/src/proposal-lifecycle.js`、`apps/api/src/realtime-decision-evidence.js`、`apps/api/src/review-metrics.js`、`apps/api/src/table-cell-reviews.js` | 服务端 - 决策编排 |
| `apps/api/src/diagnosis-cases.ts` | `DiagnosisCaseRetrievalHints`、`attachOutcomeToDiagnosisCase`、`caseCanBecomeEligible`、`findSimilarDiagnosisCases`、`upsertDraftDiagnosisCase` | `@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/persisted-input.js`、`apps/api/src/prisma.js` | 服务端 - 决策编排 |
| `apps/api/src/extension-presence.test.ts` | 无 | `@douyin-local-life/shared`、`apps/api/src/extension-presence.js` | 服务端 - 决策编排 |
| `apps/api/src/extension-presence.ts` | `clearExtensionPresenceForTests`、`getExtensionStatus`、`recordExtensionPresence`、`removeExtensionPresence` | `@douyin-local-life/shared` | 服务端 - 决策编排 |
| `apps/api/src/http-security.ts` | `assignRequestId`、`configuredExtensionOrigins`、`configuredWebOrigins`、`corsOrigin`、`getRequestId`、`isAllowedWebOrigin`、`requireConfiguredWebOrigins`、`sanitizeErrorForLog`、`sanitizeErrorMessage` | 无 | 服务端 - 决策编排 |
| `apps/api/src/idempotency.test.ts` | 无 | `apps/api/src/idempotency.js` | 服务端 - 决策编排 |
| `apps/api/src/idempotency.ts` | `isUniqueConstraintError`、`readIdempotencyKey` | 无 | 服务端 - 决策编排 |
| `apps/api/src/index.ts` | 无 | `apps/api/src/email-verification.js`、`apps/api/src/http-security.js`、`apps/api/src/prisma.js`、`apps/api/src/project-history.js`、`apps/api/src/security-metrics.js`、`apps/api/src/server.js`、`apps/api/src/sse-limits.js` | 服务端 - 决策编排 |
| `apps/api/src/outcomes.ts` | `createActionOutcome`、`getProjectOutcomeSummary`、`listActionOutcomes`、`toActionOutcomeDTO` | `@douyin-local-life/shared`、`apps/api/src/pagination.js`、`apps/api/src/persisted-input.js`、`apps/api/src/prisma.js` | 服务端 - 决策编排 |
| `apps/api/src/pagination.test.ts` | 无 | `apps/api/src/pagination.js` | 服务端 - 决策编排 |
| `apps/api/src/pagination.ts` | `cursorArgs`、`readPagination` | 无 | 服务端 - 决策编排 |
| `apps/api/src/prisma.ts` | `prisma` | 无 | 服务端 - 决策编排 |
| `apps/api/src/proposal-lifecycle.ts` | `actionProposalStatusFilter`、`isSafeActionType`、`prepareActionProposals`、`proposalExpiresAfterMs`、`proposalLifecyclePolicy`、`readableActionProposalStatus`、`toReadableActionProposal` | `@douyin-local-life/shared` | 服务端 - 决策编排 |
| `apps/api/src/realtime-decision-evidence.test.ts` | 无 | `@douyin-local-life/shared`、`apps/api/src/decision.js` | 服务端 - 决策编排 |
| `apps/api/src/realtime-decision-evidence.ts` | `applyLiveOverviewRealtimeRouteCoverage`、`applyRealtimeRouteCoverage`、`hasUsableLiveOverviewRealtimeEvidence`、`liveOverviewRealtimeDecisionEvidence`、`liveOverviewRealtimeDecisionFreshnessMs`、`localPromotionRealtimeDecisionEvidence`、`localPromotionRealtimeDecisionFreshnessMs`、`realtimeDecisionEvidenceForFrame` | `@douyin-local-life/shared` | 服务端 - 决策编排 |
| `apps/api/src/realtime-signals.test.ts` | 无 | `@douyin-local-life/shared`、`apps/api/src/realtime-signals.js` | 服务端 - 决策编排 |
| `apps/api/src/realtime-signals.ts` | `clearRealtimeSignalStore`、`latestRealtimeMetricFrame`、`latestRealtimeMetricFrames`、`latestRealtimeSignals`、`recordMetricPulse`、`subscribeRealtimeMetricFrames`、`subscribeRealtimeSignals` | `@douyin-local-life/shared` | 服务端 - 决策编排 |
| `apps/api/src/response.ts` | `sendError`、`sendSuccess`、`validationErrorOptions` | `@douyin-local-life/shared` | 服务端 - 决策编排 |
| `apps/api/src/retention-cli.ts` | 无 | `apps/api/src/prisma.js`、`apps/api/src/retention.js` | 服务端 - 决策编排 |
| `apps/api/src/retention-scheduler.ts` | 无 | `apps/api/src/http-security.js`、`apps/api/src/prisma.js`、`apps/api/src/retention.js`、`apps/api/src/security-metrics.js` | 服务端 - 决策编排 |
| `apps/api/src/retention.test.ts` | 无 | `apps/api/src/prisma.js`、`apps/api/src/retention.js` | 服务端 - 决策编排 |
| `apps/api/src/retention.ts` | `RetentionMode`、`RetentionOptions`、`RetentionReport`、`retentionPolicy`、`runRetention` | 无 | 服务端 - 决策编排 |
| `apps/api/src/routes/accounts.ts` | `accountIdentity`、`createAccountRouter`、`normalizeAccountValue`、`ownedAccount` | `@douyin-local-life/shared`、`apps/api/src/audit.js`、`apps/api/src/idempotency.js`、`apps/api/src/persisted-input.js`、`apps/api/src/prisma.js`、`apps/api/src/response.js`、`apps/api/src/server-utils.js` | 服务端 - 决策编排 |
| `apps/api/src/routes/action-proposals.ts` | `createActionProposalRouter` | `@douyin-local-life/shared`、`apps/api/src/action-proposals.js`、`apps/api/src/ai-diagnosis/orchestrator.js`、`apps/api/src/audit.js`、`apps/api/src/diagnosis-cases.js`、`apps/api/src/idempotency.js`、`apps/api/src/outcomes.js`、`apps/api/src/ownership.js`、`apps/api/src/pagination.js`、`apps/api/src/persisted-input.js` | 服务端 - 决策编排 |
| `apps/api/src/routes/collection-dashboard.ts` | `createCollectionDashboardRouter` | `@douyin-local-life/shared`、`apps/api/src/audit.js`、`apps/api/src/capture-summary.js`、`apps/api/src/current-snapshots.js`、`apps/api/src/decision-targets.js`、`apps/api/src/metric-validation.js`、`apps/api/src/ownership.js`、`apps/api/src/persisted-input.js`、`apps/api/src/realtime-signals.js`、`apps/api/src/response.js` | 服务端 - 决策编排 |
| `apps/api/src/routes/decision-runs.ts` | `createDecisionRunRouter` | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/config.js`、`apps/api/src/ai-diagnosis/decision-view.js`、`apps/api/src/ai-diagnosis/orchestrator.js`、`apps/api/src/audit.js`、`apps/api/src/credits.js`、`apps/api/src/decision-evidence.js` | 服务端 - 决策编排 |
| `apps/api/src/routes/extension-pairing.ts` | `createExtensionProtectedRouter`、`createExtensionPublicRouter` | `@douyin-local-life/shared`、`apps/api/src/audit.js`、`apps/api/src/auth.js`、`apps/api/src/extension-presence.js`、`apps/api/src/live-screen-internal-api-config.js`、`apps/api/src/local-promotion-internal-api-config.js`、`apps/api/src/persisted-input.js`、`apps/api/src/prisma.js`、`apps/api/src/rate-limit.js`、`apps/api/src/response.js` | 服务端 - 决策编排 |
| `apps/api/src/routes/snapshot-accounts.ts` | `createSnapshotAccountRouter` | `@douyin-local-life/shared`、`apps/api/src/audit.js`、`apps/api/src/collection-runs.js`、`apps/api/src/prisma.js`、`apps/api/src/project-history.js`、`apps/api/src/response.js`、`apps/api/src/review-metrics.js`、`apps/api/src/server-utils.js`、`apps/api/src/transactions.js` | 服务端 - 决策编排 |
| `apps/api/src/routes/system-health.ts` | `createSystemHealthRouter` | `@douyin-local-life/llm`、`apps/api/src/ai-circuit.js`、`apps/api/src/collection-runs.js`、`apps/api/src/prisma.js`、`apps/api/src/response.js`、`apps/api/src/server-utils.js` | 服务端 - 决策编排 |
| `apps/api/src/routes/workspaces.ts` | `createWorkspaceRouter` | `apps/api/src/audit.js`、`apps/api/src/persisted-input.js`、`apps/api/src/prisma.js`、`apps/api/src/response.js`、`apps/api/src/server-utils.js` | 服务端 - 决策编排 |
| `apps/api/src/security.test.ts` | 无 | `apps/api/src/auth.js`、`apps/api/src/prisma.js`、`apps/api/src/rate-limit.js`、`apps/api/src/server.js` | 服务端 - 决策编排 |
| `apps/api/src/server-routes.ts` | `registerLegacyRoutes` | `@douyin-local-life/decision-engine`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`apps/api/src/ai-circuit.js`、`apps/api/src/audit.js`、`apps/api/src/auth.js`、`apps/api/src/capture-summary.js`、`apps/api/src/collection-runs.js`、`apps/api/src/csrf.js`、`apps/api/src/decision-evidence.js` | 服务端 - 决策编排 |
| `apps/api/src/server-utils.ts` | `actionProposalAudit`、`currentUser`、`readOptionalText`、`toJson` | `apps/api/src/audit.js`、`apps/api/src/auth.js`、`apps/api/src/persisted-input.js` | 服务端 - 决策编排 |
| `apps/api/src/server.ts` | `createServer` | `apps/api/src/auth.js`、`apps/api/src/csrf.js`、`apps/api/src/http-security.js`、`apps/api/src/prisma.js`、`apps/api/src/rate-limit.js`、`apps/api/src/response.js`、`apps/api/src/routes/accounts.js`、`apps/api/src/routes/action-proposals.js`、`apps/api/src/routes/auth.js`、`apps/api/src/routes/collection-dashboard.js` | 服务端 - 决策编排 |
| `apps/api/src/sse-limits.test.ts` | 无 | `apps/api/src/sse-limits.js` | 服务端 - 决策编排 |
| `apps/api/src/sse-limits.ts` | `closeAllSseConnections`、`getSseConnectionMetrics`、`registerSseConnectionCloser`、`reserveSseConnection`、`resetSseConnectionLimits` | 无 | 服务端 - 决策编排 |
| `apps/api/src/sse-writer.test.ts` | 无 | `apps/api/src/sse-writer.js` | 服务端 - 决策编排 |
| `apps/api/src/sse-writer.ts` | `createKeyedLatestSseWriter`、`createLatestSseWriter`、`maxSseBufferedBytes` | 无 | 服务端 - 决策编排 |
| `apps/api/src/transactions.test.ts` | 无 | `apps/api/src/transactions.js` | 服务端 - 决策编排 |
| `apps/api/src/transactions.ts` | `isSerializableConflict`、`runSerializableTransaction` | `apps/api/src/prisma.js` | 服务端 - 决策编排 |
| `apps/api/src/version.ts` | `getBuildMetadata` | `@douyin-local-life/shared` | 服务端 - 决策编排 |
| `packages/decision-engine/src/ai-policy.test.ts` | 无 | `packages/decision-engine/src/ai-policy.js` | 服务端 - 决策编排 |
| `packages/decision-engine/src/ai-policy.ts` | `guardAiCandidateActionsWithPolicy` | `@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis` | 服务端 - 决策编排 |
| `packages/decision-engine/src/index.test.ts` | 无 | `@douyin-local-life/shared`、`packages/decision-engine/src/index` | 服务端 - 决策编排 |
| `packages/decision-engine/src/index.ts` | `applyApprovalGuard`、`decisionEngineVersion`、`decisionPolicyVersion`、`decisionRuleVersion`、`evaluateDecisionPolicy`、`guardAiCandidateActions`、`runDecisionRules`、`structureTaskCollectionTables` | `@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`packages/decision-engine/src/ai-policy.js`、`packages/decision-engine/src/table-analysis.js` | 服务端 - 决策编排 |
| `packages/decision-engine/src/table-analysis.test.ts` | 无 | `@douyin-local-life/shared`、`packages/decision-engine/src/table-analysis` | 服务端 - 决策编排 |
| `packages/decision-engine/src/table-analysis.ts` | `InvestmentUnitAnalysis`、`ProductTableAnalysis`、`analyzeInvestmentUnitTables`、`analyzeProductTables`、`buildFunnelEvidence`、`structureTaskCollectionTables` | `@douyin-local-life/shared` | 服务端 - 决策编排 |
| `packages/llm/src/deepseek.test.ts` | 无 | `packages/llm/src/deepseek.js`、`packages/llm/src/tool-loop.js` | 服务端 - 决策编排 |
| `packages/llm/src/deepseek.ts` | `ChatMessage`、`ChatRequest`、`ChatResponse`、`ChatTokenUsage`、`ChatToolCall`、`ChatToolDefinition`、`ChatTransport`、`DEFAULT_AI_DIAGNOSIS_TIMEOUT_MS`、`DEFAULT_DEEPSEEK_BASE_URL`、`DEFAULT_DEEPSEEK_MODEL`、`LlmTransportError`、`createDeepSeekTransport` | 无 | 服务端 - 决策编排 |
| `packages/llm/src/index.test.ts` | 无 | `@douyin-local-life/shared`、`packages/llm/src/index` | 服务端 - 决策编排 |
| `packages/llm/src/index.ts` | `AGENCY_AGENTS_REVISION`、`DECISION_REFERENCE_POLICY_VERSION`、`EXPLANATION_PROMPT_VERSION`、`ExplanationOutput`、`LlmProvider`、`LlmProviderName`、`agencyAgentSources`、`buildDecisionReferenceBundle`、`buildDecisionReferenceInstructions`、`createLlmProvider`、`mockAnalyze`、`type DecisionReferenceBundle` | `@douyin-local-life/shared`、`packages/llm/src/deepseek.js`、`packages/llm/src/reference-playbooks.js`、`packages/llm/src/tool-loop.js` | 服务端 - 决策编排 |
| `packages/llm/src/reference-playbooks.test.ts` | 无 | `@douyin-local-life/shared`、`packages/llm/src/reference-playbooks` | 服务端 - 决策编排 |
| `packages/llm/src/reference-playbooks.ts` | `AGENCY_AGENTS_REVISION`、`AgencyAgentSourceId`、`DECISION_REFERENCE_POLICY_VERSION`、`DecisionReferenceBundle`、`DecisionReferenceInsight`、`DecisionReferenceSource`、`agencyAgentSourceIds`、`agencyAgentSources`、`buildDecisionReferenceBundle`、`buildDecisionReferenceInstructions` | `@douyin-local-life/shared` | 服务端 - 决策编排 |
| `packages/llm/src/tool-loop.ts` | `ToolLoopResult`、`ToolLoopTool`、`completeJsonWithRepair`、`runToolLoop` | `packages/llm/src/deepseek.js` | 服务端 - 决策编排 |
| `packages/llm/src/validation-recovery.test.ts` | 无 | `packages/llm/src/deepseek.js`、`packages/llm/src/tool-loop.js` | 服务端 - 决策编排 |
| `packages/shared/src/action-types.ts` | `actionOutcomeResults`、`actionTypes` | 无 | 服务端 - 决策编排 |
| `packages/shared/src/api-response.ts` | `ApiResponse`、`failure`、`success` | 无 | 服务端 - 决策编排 |
| `packages/shared/src/collection-routes.test.ts` | 无 | `packages/shared/src/collection-routes` | 服务端 - 决策编排 |
| `packages/shared/src/collection-routes.ts` | `CollectionQuality`、`CollectionRouteDetection`、`CollectionRouteDetectionSource`、`CollectionRouteHealth`、`CollectionRouteKey`、`CollectionRouteState`、`CollectionRouteTemplate`、`PrimaryCollectionRouteKey`、`assessCollectionQuality`、`collectionFreshnessPolicy`、`collectionRouteKeys`、`collectionRouteLabels` | 无 | 服务端 - 决策编排 |
| `packages/shared/src/dashboard-overview.test.ts` | 无 | `packages/shared/src/dashboard-overview`、`packages/shared/src/index` | 服务端 - 决策编排 |
| `packages/shared/src/dashboard-overview.ts` | `buildDashboardOverviewCards` | `packages/shared/src/collection-dashboard.js`、`packages/shared/src/collection-routes.js`、`packages/shared/src/index.js`、`packages/shared/src/live-screen-internal-api.js`、`packages/shared/src/local-promotion-internal-api.js`、`packages/shared/src/metric-value.js`、`packages/shared/src/realtime-evidence.js` | 服务端 - 决策编排 |
| `packages/shared/src/decision-tables.ts` | `DecisionTableCell`、`DecisionTableInput`、`decisionTableCellSchema`、`decisionTableInputSchema`、`projectRawTableData` | `packages/shared/src/collection-routes.js` | 服务端 - 决策编排 |
| `packages/shared/src/diagnosis-context.ts` | `DiagnosisContext`、`DiagnosisManualActionSummary`、`DiagnosisRecentTrend`、`DiagnosisScenario`、`diagnosisContextSchema`、`diagnosisManualActionSummarySchema`、`diagnosisRecentTrendMetricSchema`、`diagnosisRecentTrendSchema`、`diagnosisScenarios` | `packages/shared/src/action-types.js`、`packages/shared/src/collection-routes.js`、`packages/shared/src/metric-keys.js` | 服务端 - 决策编排 |
| `packages/shared/src/diagnosis.ts` | `AiCandidateAction`、`AiDecisionRunDTO`、`DecisionRunMode`、`DecisionRunStatus`、`DiagnosisCaseStatus`、`DiagnosisClaim`、`DiagnosisDomainAnalysisOutput`、`DiagnosisEvidence`、`DiagnosisExperiment`、`DiagnosisExperimentModelOutput`、`DiagnosisFinalModelOutput`、`DiagnosisFinalResult` | `packages/shared/src/collection-routes.js`、`packages/shared/src/index.js` | 服务端 - 决策编排 |
| `packages/shared/src/formal-decision-readiness.test.ts` | 无 | `packages/shared/src/formal-decision-readiness` | 服务端 - 决策编排 |
| `packages/shared/src/formal-decision-readiness.ts` | `FormalDecisionReadiness`、`FormalDecisionReadinessInput`、`evaluateFormalDecisionReadiness` | 无 | 服务端 - 决策编排 |
| `packages/shared/src/index.test.ts` | 无 | `packages/shared/src/collection-capture`、`packages/shared/src/index` | 服务端 - 决策编排 |
| `packages/shared/src/index.ts` | `AccountIdentityStatus`、`AccountPlatform`、`AccountProfileDTO`、`AccountProfileStatus`、`ActionEligibility`、`ActionOutcomeDTO`、`ActionOutcomeResult`、`ActionProposalDTO`、`ActionProposalStatus`、`ActionType`、`AnalysisProblem`、`AnalysisStatus` | `packages/shared/src/action-types.js`、`packages/shared/src/api-response.js`、`packages/shared/src/auth-schemas.js`、`packages/shared/src/collection-capture.js`、`packages/shared/src/collection-dashboard.js`、`packages/shared/src/collection-diagnostics.js`、`packages/shared/src/collection-field-profiles.js`、`packages/shared/src/collection-records.js`、`packages/shared/src/collection-routes.js`、`packages/shared/src/dashboard-overview.js` | 服务端 - 决策编排 |
| `packages/shared/src/safety.test.ts` | 无 | `packages/shared/src/safety` | 服务端 - 决策编排 |
| `packages/shared/src/safety.ts` | `PersistedInputValidation`、`addSafeNetworkRecord`、`aiDisclaimer`、`containsSensitivePersistedInput`、`extensionSafetyNotice`、`sanitizeAndValidatePersistedInput`、`sanitizeCaptureUrl`、`sanitizeCapturedNetworkRecord`、`sanitizeCollectionSnapshotPayload`、`sanitizeSensitiveData`、`sanitizeVisibleText`、`shouldRedactSensitiveKey` | 无 | 服务端 - 决策编排 |

### 服务端 - AI Worker

| 模块 | 主要导出 | 依赖方向 | 负责人 |
| --- | --- | --- | --- |
| `apps/api/src/ai-diagnosis/comparison-language.ts` | `hasKnownRoiContradiction`、`hasUnsupportedBenchmark`、`hasUnsupportedQualitativeComparison` | 无 | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/comparison-recovery.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`apps/api/src/ai-diagnosis/orchestrator.js`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/config.test.ts` | 无 | `@douyin-local-life/llm`、`apps/api/src/ai-diagnosis/config.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/config.ts` | `AiDiagnosisConfigurationIssue`、`aiDiagnosisConfigurationIssue`、`aiDiagnosisEnabled`、`aiDiagnosisTimeoutMs`、`createConfiguredDiagnosisTransport` | `@douyin-local-life/llm` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/decision-view.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/decision-view.js`、`apps/api/src/ai-diagnosis/orchestrator.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/decision-view.ts` | `DiagnosisDecisionView`、`buildDiagnosisDecisionView`、`buildTrustedDiagnosisFactsView` | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/comparison-language.js`、`apps/api/src/ai-diagnosis/experiment-variables.js`、`apps/api/src/ai-diagnosis/orchestrator.js`、`apps/api/src/ai-diagnosis/server-insights.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/experiment-design.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/orchestrator.js`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/experiment-variables.test.ts` | 无 | `apps/api/src/ai-diagnosis/experiment-variables.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/experiment-variables.ts` | `changedExperimentVariables`、`experimentVariableNames` | 无 | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/orchestrator-validation.ts` | `DiagnosisOrchestrationError`、`addUsage`、`assertBriefReferences`、`assertBusinessFacingLanguage`、`assertDeterministicResultConsistency`、`assertDomainReferences`、`assertDomainResultConsistency`、`assertExperimentDesign`、`assertFinalReferences`、`assertFixedSkillPlan`、`buildDecisionRunDeterministicReview`、`buildDeterministicDiagnosticSignals` | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`@douyin-local-life/shared/collection-routes`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/comparison-language.js`、`apps/api/src/ai-diagnosis/experiment-variables.js`、`apps/api/src/ai-diagnosis/server-insights.js`、`apps/api/src/ai-diagnosis/validation-diagnostic.js`、`apps/api/src/diagnosis-cases.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/orchestrator.ts` | `DiagnosisOrchestrationError`、`SkillExecutionEvent`、`buildDecisionRunDeterministicReview`、`buildDeterministicDiagnosticSignals`、`determineMainProblemTag`、`diagnosisOrchestrationVersion`、`diagnosisPromptVersion`、`isUsefulDiagnosisHypothesis`、`legacyDiagnosisOrchestrationLimits`、`normalizeDiagnosisModelOutput`、`orchestrateDiagnosis` | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`@douyin-local-life/shared/collection-routes`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/orchestrator-validation.js`、`apps/api/src/ai-diagnosis/server-insights.js`、`apps/api/src/ai-diagnosis/validation-diagnostic.js`、`apps/api/src/diagnosis-cases.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/scenario-strategy.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`apps/api/src/ai-diagnosis/orchestrator.js`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/server-insights.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/shared`、`apps/api/src/ai-diagnosis/server-insights.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/server-insights.ts` | `ServerDiagnosisInsight`、`buildServerDiagnosisInsights` | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/synthetic-evaluation.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/shared`、`apps/api/src/ai-diagnosis/orchestrator.js`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/synthetic-evaluation.ts` | `DiagnosisEvaluationCase`、`createSyntheticDiagnosisTransport`、`evaluateSyntheticDiagnosisSuite`、`evaluateSyntheticFailureDisplaySuite`、`isDecisionEngineInput` | `@douyin-local-life/decision-engine`、`@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/config.js`、`apps/api/src/ai-diagnosis/decision-view.js`、`apps/api/src/ai-diagnosis/orchestrator.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/validation-diagnostic.test.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/orchestrator.js`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js`、`apps/api/src/ai-diagnosis/validation-diagnostic.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/validation-diagnostic.ts` | `ObservationValidationDiagnostic`、`observationValidationDiagnostic` | `@douyin-local-life/shared`、`apps/api/src/ai-diagnosis/experiment-variables.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/worker-orphan.test.ts` | 无 | `apps/api/src/ai-diagnosis/worker.js`、`apps/api/src/prisma.js` | 服务端 - AI Worker |
| `apps/api/src/ai-diagnosis/worker.ts` | `finalizeExpiredMaxAttemptDecisionRuns`、`finalizeSucceededDecisionRun`、`processNextDecisionRun`、`startDecisionWorker` | `@douyin-local-life/decision-engine`、`@douyin-local-life/diagnosis-skills`、`@douyin-local-life/llm`、`@douyin-local-life/shared`、`apps/api/src/ai-diagnosis/config.js`、`apps/api/src/ai-diagnosis/orchestrator.js`、`apps/api/src/ai-diagnosis/validation-diagnostic.js`、`apps/api/src/credits.js`、`apps/api/src/decision-evidence.js`、`apps/api/src/decision-readiness.js` | 服务端 - AI Worker |
| `apps/api/src/decision-worker-main.ts` | 无 | `apps/api/src/ai-diagnosis/worker.js`、`apps/api/src/prisma.js` | 服务端 - AI Worker |
| `apps/api/src/diagnosis-eval-cli.ts` | 无 | `@douyin-local-life/diagnosis-skills`、`@douyin-local-life/shared/diagnosis`、`apps/api/src/ai-diagnosis/config.js`、`apps/api/src/ai-diagnosis/synthetic-evaluation.js`、`apps/api/src/prisma.js` | 服务端 - AI Worker |
| `packages/diagnosis-skills/src/evaluation-cases.ts` | `SyntheticDiagnosisCase`、`syntheticDiagnosisCases` | `@douyin-local-life/shared`、`@douyin-local-life/shared/collection-routes`、`@douyin-local-life/shared/diagnosis` | 服务端 - AI Worker |
| `packages/diagnosis-skills/src/index.test.ts` | 无 | `@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`packages/diagnosis-skills/src/index.js` | 服务端 - AI Worker |
| `packages/diagnosis-skills/src/index.ts` | `DiagnosisDomainSkillId`、`DiagnosisSkillDefinition`、`DiagnosisSkillModel`、`DiagnosisSkillPlan`、`DiagnosisTokenUsage`、`auditDataReadinessSkill`、`buildDiagnosisEvidenceCatalog`、`createDiagnosisSkillPlan`、`diagnosisSkillIds`、`diagnosisSkillInputSchema`、`diagnosisSkillRegistry`、`diagnosisSkillSetVersion` | `@douyin-local-life/shared`、`@douyin-local-life/shared/collection-routes`、`@douyin-local-life/shared/diagnosis`、`packages/diagnosis-skills/src/evaluation-cases.js`、`packages/diagnosis-skills/src/scenario-strategy.js` | 服务端 - AI Worker |
| `packages/diagnosis-skills/src/scenario-strategy.ts` | `getDiagnosisScenarioStrategy` | `@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis` | 服务端 - AI Worker |

### 服务端 - 项目历史

| 模块 | 主要导出 | 依赖方向 | 负责人 |
| --- | --- | --- | --- |
| `apps/api/src/project-history-comparison.ts` | `compareAnalysisWindowPoints`、`compareHistoryMetrics`、`comparePeriodPoints`、`emptyComparison`、`latestMetricsForSession` | `@douyin-local-life/shared`、`apps/api/src/project-history-metrics.js` | 服务端 - 项目历史 |
| `apps/api/src/project-history-metrics.ts` | `DiagnosisContextClient`、`HistoryClient`、`ProjectHistoryComparisonPoint`、`analysisWindowToleranceMs`、`archiveMetricsFromDecisionInput`、`beijingDayKey`、`beijingOffsetMs`、`fingerprintComparison`、`historyMetricSetFingerprint`、`isCumulativeMetric`、`isRatioMetric`、`metricComparisonKey` | `@douyin-local-life/shared` | 服务端 - 项目历史 |
| `apps/api/src/project-history-queries.ts` | `buildDiagnosisContext`、`buildProjectHistoryDecisionContext`、`getProjectHistoryComparison`、`getProjectHistoryOverview` | `@douyin-local-life/shared`、`apps/api/src/project-history-comparison.js`、`apps/api/src/project-history-metrics.js`、`apps/api/src/project-history-recent-trend.js` | 服务端 - 项目历史 |
| `apps/api/src/project-history-recent-trend.ts` | `buildRecentFifteenMinuteTrend` | `@douyin-local-life/shared`、`apps/api/src/project-history-metrics.js` | 服务端 - 项目历史 |
| `apps/api/src/project-history-write.ts` | `archiveInactiveProjectHistorySessions`、`createProjectAnalysisArchive`、`markProjectAnalysisArchiveRunStatus`、`recordProjectHistoryObservation`、`startProjectHistoryLifecycle` | `@douyin-local-life/shared`、`apps/api/src/project-history-metrics.js` | 服务端 - 项目历史 |
| `apps/api/src/project-history.test.ts` | 无 | `apps/api/src/project-history.js` | 服务端 - 项目历史 |
| `apps/api/src/project-history.ts` | `archiveInactiveProjectHistorySessions`、`archiveMetricsFromDecisionInput`、`buildDiagnosisContext`、`buildProjectHistoryDecisionContext`、`buildRecentFifteenMinuteTrend`、`compareAnalysisWindowPoints`、`compareHistoryMetrics`、`comparePeriodPoints`、`createProjectAnalysisArchive`、`getProjectHistoryComparison`、`getProjectHistoryOverview`、`markProjectAnalysisArchiveRunStatus` | `apps/api/src/project-history-comparison.js`、`apps/api/src/project-history-metrics.js`、`apps/api/src/project-history-queries.js`、`apps/api/src/project-history-recent-trend.js`、`apps/api/src/project-history-write.js` | 服务端 - 项目历史 |
| `apps/api/src/routes/project-history.ts` | `createProjectHistoryRouter` | `apps/api/src/ownership.js`、`apps/api/src/prisma.js`、`apps/api/src/project-history.js`、`apps/api/src/response.js`、`apps/api/src/server-utils.js` | 服务端 - 项目历史 |
| `packages/shared/src/project-history.ts` | `ProjectHistoryArchiveDTO`、`ProjectHistoryComparison`、`ProjectHistoryComparisonKind`、`ProjectHistoryComparisonStatus`、`ProjectHistoryDecisionContext`、`ProjectHistoryMetric`、`ProjectHistoryMetricQuality`、`ProjectHistoryOverviewDTO`、`ProjectHistorySessionDTO`、`projectHistoryComparisonKinds`、`projectHistoryComparisonMetricSchema`、`projectHistoryComparisonSchema` | `packages/shared/src/collection-routes.js`、`packages/shared/src/metric-keys.js` | 服务端 - 项目历史 |

### Web - 展示

| 模块 | 主要导出 | 依赖方向 | 负责人 |
| --- | --- | --- | --- |
| `apps/web/src/app/accounts/[id]/page.tsx` | `AccountPage` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/accounts/new/page.tsx` | `NewAccountPage` | 无 | Web - 展示 |
| `apps/web/src/app/action-proposals/[id]/page.tsx` | `ActionProposalDetailPage` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/dashboard/page.tsx` | `DashboardPage` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/decision-center/page.tsx` | `DecisionCenterPage` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/email-verification/page.tsx` | `EmailVerificationPage` | 无 | Web - 展示 |
| `apps/web/src/app/extension/page.tsx` | `ExtensionPage` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/home-footer.test.ts` | 无 | 无 | Web - 展示 |
| `apps/web/src/app/layout.tsx` | `RootLayout`、`metadata` | `apps/web/src/app/globals.css` | Web - 展示 |
| `apps/web/src/app/login/page.test.ts` | 无 | `apps/web/src/lib/auth-redirect` | Web - 展示 |
| `apps/web/src/app/login/page.tsx` | `LoginPage` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/page.tsx` | `HomePage` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/privacy/page.tsx` | `PrivacyPage` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/projects/[id]/history/page.tsx` | `ProjectHistoryPage` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/projects/[id]/page.tsx` | `ProjectDetailPage` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/projects/new/page.tsx` | `NewProjectPage` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/register/page.tsx` | `RegisterPage` | 无 | Web - 展示 |
| `apps/web/src/app/tasks/[id]/collection-dashboard/collection-route-flow.tsx` | `CollectionRouteFlow`、`routeHasUsableData`、`routeNeedsAttention`、`sortPrimaryRoutes` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/tasks/[id]/collection-dashboard/overview-panel.tsx` | `OverviewPanel` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/tasks/[id]/collection-dashboard/page.tsx` | `CollectionDashboardPage` | `@douyin-local-life/shared`、`apps/web/src/app/tasks/[id]/collection-dashboard/collection-route-flow`、`apps/web/src/app/tasks/[id]/collection-dashboard/overview-panel`、`apps/web/src/app/tasks/[id]/collection-dashboard/refresh-policy`、`apps/web/src/app/tasks/[id]/diagnosis-business-summary`、`apps/web/src/app/tasks/[id]/diagnosis-comparison`、`apps/web/src/app/tasks/[id]/task-types` | Web - 展示 |
| `apps/web/src/app/tasks/[id]/collection-dashboard/refresh-policy.test.ts` | 无 | `apps/web/src/app/tasks/[id]/collection-dashboard/refresh-policy` | Web - 展示 |
| `apps/web/src/app/tasks/[id]/collection-dashboard/refresh-policy.ts` | `CollectionDashboardCalibrationState`、`CollectionDashboardRefreshMode`、`collectionDashboardCalibrationState`、`collectionDashboardRefreshMode` | 无 | Web - 展示 |
| `apps/web/src/app/tasks/[id]/collection-tutorial.tsx` | `CollectionTutorial` | 无 | Web - 展示 |
| `apps/web/src/app/tasks/[id]/diagnosis-business-summary.tsx` | `DiagnosisBusinessSummary` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/tasks/[id]/diagnosis-comparison.tsx` | `DiagnosisComparison` | `@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis`、`apps/web/src/app/tasks/[id]/task-types` | Web - 展示 |
| `apps/web/src/app/tasks/[id]/page.tsx` | `TaskDetailPage` | `@douyin-local-life/shared`、`@douyin-local-life/shared/formal-decision-readiness`、`apps/web/src/app/tasks/[id]/collection-tutorial`、`apps/web/src/app/tasks/[id]/diagnosis-business-summary`、`apps/web/src/app/tasks/[id]/diagnosis-comparison`、`apps/web/src/app/tasks/[id]/task-types`、`apps/web/src/app/tasks/[id]/use-extension-task-status`、`apps/web/src/app/tasks/[id]/use-task-data` | Web - 展示 |
| `apps/web/src/app/tasks/[id]/task-types.ts` | `CollectionRun`、`DecisionPreview`、`DecisionReferenceInsight`、`DecisionRun`、`ExpertAnalysis`、`TaskDetail` | `@douyin-local-life/shared`、`@douyin-local-life/shared/diagnosis` | Web - 展示 |
| `apps/web/src/app/tasks/[id]/use-extension-task-status.ts` | `WebBridgeUiState`、`useExtensionTaskStatus` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/app/tasks/[id]/use-task-data.ts` | `useTaskData` | `@douyin-local-life/shared`、`apps/web/src/app/tasks/[id]/task-types` | Web - 展示 |
| `apps/web/src/app/terms/page.tsx` | `TermsPage` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/components/auth-page-state.tsx` | `AuthLoadingState`、`AuthRequiredState` | 无 | Web - 展示 |
| `apps/web/src/components/ui/button.tsx` | `Button` | 无 | Web - 展示 |
| `apps/web/src/components/ui/card.tsx` | `Card`、`CardTitle` | 无 | Web - 展示 |
| `apps/web/src/components/ui/confirm-dialog.tsx` | `ConfirmDialog` | 无 | Web - 展示 |
| `apps/web/src/components/ui/input.tsx` | `Input`、`Select`、`Textarea` | 无 | Web - 展示 |
| `apps/web/src/lib/api.test.ts` | 无 | `apps/web/src/lib/api` | Web - 展示 |
| `apps/web/src/lib/api.ts` | `ApiError`、`apiBaseUrl`、`apiFetch`、`cookieSessionMarker`、`createIdempotencyKey`、`setCsrfToken` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/lib/auth-redirect.ts` | `createLoginHref`、`getSafeReturnTo`、`loginDestination` | 无 | Web - 展示 |
| `apps/web/src/lib/AuthContext.tsx` | `AuthProvider`、`AuthUser`、`useAuth` | `apps/web/src/lib/api`、`apps/web/src/lib/credits`、`apps/web/src/lib/latest-request` | Web - 展示 |
| `apps/web/src/lib/brand-copy-collection-tutorial.test.ts` | 无 | `apps/web/src/lib/collection-tutorial` | Web - 展示 |
| `apps/web/src/lib/credits.test.ts` | 无 | `apps/web/src/lib/api`、`apps/web/src/lib/credits`、`apps/web/src/lib/latest-request` | Web - 展示 |
| `apps/web/src/lib/credits.ts` | `fetchLatestCreditBalance` | `apps/web/src/lib/api`、`apps/web/src/lib/latest-request` | Web - 展示 |
| `apps/web/src/lib/diagnosis-insights.test.ts` | 无 | `@douyin-local-life/shared/diagnosis`、`apps/web/src/lib/diagnosis-insights` | Web - 展示 |
| `apps/web/src/lib/diagnosis-insights.ts` | `TrustedBusinessInsight`、`TrustedInsightTone`、`buildTrustedBusinessInterpretation` | `@douyin-local-life/shared/diagnosis` | Web - 展示 |
| `apps/web/src/lib/diagnosis-presentation.test.ts` | 无 | `apps/web/src/lib/diagnosis-presentation` | Web - 展示 |
| `apps/web/src/lib/diagnosis-presentation.ts` | `diagnosisExperimentFailureReason`、`humanizeBusinessText`、`humanizeDiagnosisFailure`、`summarizeDecisionBoundaries` | 无 | Web - 展示 |
| `apps/web/src/lib/diagnosis-render.test.ts` | 无 | `@douyin-local-life/shared/diagnosis`、`apps/web/src/app/tasks/[id]/diagnosis-comparison`、`apps/web/src/app/tasks/[id]/task-types` | Web - 展示 |
| `apps/web/src/lib/extension-bridge.test.ts` | 无 | `apps/web/src/lib/extension-bridge` | Web - 展示 |
| `apps/web/src/lib/extension-bridge.ts` | `ExtensionBridgeError`、`WebExtensionBridgeMarker`、`WebExtensionBridgeResponse`、`announceExtensionBridge`、`getExtensionBridgeStatus`、`onExtensionBridgeReady`、`pairExtensionTask`、`parseBridgeResponse`、`readExtensionBridgeMarker`、`syncExtensionCurrentTask` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/lib/extension-connection.test.ts` | 无 | `@douyin-local-life/shared`、`apps/web/src/lib/extension-bridge`、`apps/web/src/lib/extension-connection` | Web - 展示 |
| `apps/web/src/lib/extension-connection.ts` | `isCurrentExtensionConnected`、`shouldRecoverExtensionTask` | `@douyin-local-life/shared`、`apps/web/src/lib/extension-bridge` | Web - 展示 |
| `apps/web/src/lib/latest-request.test.ts` | 无 | `apps/web/src/lib/latest-request` | Web - 展示 |
| `apps/web/src/lib/latest-request.ts` | `LatestRequestGuard`、`createLatestRequestGuard` | 无 | Web - 展示 |
| `apps/web/src/lib/realtime-metric-stream.test.ts` | 无 | `apps/web/src/lib/realtime-metric-stream` | Web - 展示 |
| `apps/web/src/lib/realtime-metric-stream.ts` | `RealtimeMetricStreamStatus`、`createSseEventParser`、`subscribeRealtimeMetricStream`、`usableRealtimeMetrics` | `@douyin-local-life/shared` | Web - 展示 |
| `apps/web/src/lib/task-page-source.test.ts` | 无 | 无 | Web - 展示 |
| `apps/web/src/lib/task-progress.test.ts` | 无 | `apps/web/src/lib/task-progress` | Web - 展示 |
| `apps/web/src/lib/task-progress.ts` | `TaskWizardProgressInput`、`getTaskWizardProgress` | 无 | Web - 展示 |
| `apps/web/src/lib/utils.ts` | `cn` | 无 | Web - 展示 |
| `apps/web/src/proxy.test.ts` | 无 | `apps/web/src/proxy` | Web - 展示 |
| `apps/web/src/proxy.ts` | `config`、`proxy` | 无 | Web - 展示 |

### Extension - 插件采集

| 模块 | 主要导出 | 依赖方向 | 负责人 |
| --- | --- | --- | --- |
| `apps/extension/src/bridge-protocol.test.ts` | 无 | `@douyin-local-life/shared`、`apps/extension/src/bridge-protocol` | Extension - 插件采集 |
| `apps/extension/src/bridge-protocol.ts` | `BridgeWindowMessage`、`BridgeWindowMessageType`、`ExtensionBridgeRequest`、`ExtensionBridgeResponse`、`isAllowedBridgeApiBaseUrl`、`isAllowedBridgeOrigin`、`parseBridgeRequest`、`parseBridgeWindowMessage`、`sanitizeBridgeResponse`、`serializeBridgeWindowMessage` | `@douyin-local-life/shared`、`apps/extension/src/build-target` | Extension - 插件采集 |
| `apps/extension/src/build-target.ts` | `apiBaseUrlGuidance`、`defaultApiBaseUrl`、`developmentLoopbackHostnames`、`isLocalBuild`、`localWebPort` | 无 | Extension - 插件采集 |
| `apps/extension/src/capture-budget.test.ts` | 无 | `apps/extension/src/capture-budget` | Extension - 插件采集 |
| `apps/extension/src/capture-budget.ts` | `CaptureBudgetState`、`applyCaptureBudget`、`captureBudget`、`collectBudgetedTables`、`collectBudgetedVisibleText`、`createCaptureBudgetState`、`isCaptureVisibleElement` | `@douyin-local-life/shared` | Extension - 插件采集 |
| `apps/extension/src/connection-recovery.integration.test.ts` | 无 | `@douyin-local-life/shared`、`apps/extension/src/bridge-protocol`、`apps/extension/src/messages` | Extension - 插件采集 |
| `apps/extension/src/content.ts` | 无 | `@douyin-local-life/shared`、`@douyin-local-life/shared/collection-routes`、`apps/extension/src/capture-budget`、`apps/extension/src/live-pulse-schedule`、`apps/extension/src/live-screen-capture-plan`、`apps/extension/src/live-screen-internal-api`、`apps/extension/src/live-screen-metric-merge`、`apps/extension/src/live-screen-pulse-page`、`apps/extension/src/live-screen-room-id`、`apps/extension/src/messages` | Extension - 插件采集 |
| `apps/extension/src/extension-context.test.ts` | 无 | `apps/extension/src/extension-context` | Extension - 插件采集 |
| `apps/extension/src/extension-context.ts` | `ExtensionConfig`、`ExtensionContext`、`ExtensionContextProtocolCheck`、`ExtensionProject`、`ExtensionTask`、`checkExtensionContextProtocol`、`parseExtensionContext`、`refreshConfigFromContext` | 无 | Extension - 插件采集 |
| `apps/extension/src/globals.d.ts` | 无 | 无 | Extension - 插件采集 |
| `apps/extension/src/live-pulse-activity.test.ts` | 无 | `apps/extension/src/content.ts?raw`、`apps/extension/src/live-pulse-activity`、`apps/extension/src/service-worker-runtime.ts?raw`、`apps/extension/src/service-worker.ts?raw` | Extension - 插件采集 |
| `apps/extension/src/live-pulse-activity.ts` | `LivePulseActivity`、`isLivePulseActivityReporter`、`livePulseActivityForTab` | `@douyin-local-life/shared` | Extension - 插件采集 |
| `apps/extension/src/live-pulse-api-collector.test.ts` | 无 | `apps/extension/popup.html?raw`、`apps/extension/sidepanel.html?raw`、`apps/extension/src/content.ts?raw`、`apps/extension/src/metric-pulse-upload.ts?raw`、`apps/extension/src/service-worker.ts?raw`、`apps/extension/src/sidepanel.ts?raw` | Extension - 插件采集 |
| `apps/extension/src/live-pulse-failure.test.ts` | 无 | `apps/extension/src/live-pulse-failure` | Extension - 插件采集 |
| `apps/extension/src/live-pulse-failure.ts` | `LivePulseFailureProgress`、`advanceLivePulseFailure`、`fatalLivePulseFailureReason`、`isFatalLivePulseFailure` | `apps/extension/src/live-pulse-status` | Extension - 插件采集 |
| `apps/extension/src/live-pulse-schedule.test.ts` | 无 | `apps/extension/src/live-pulse-schedule` | Extension - 插件采集 |
| `apps/extension/src/live-pulse-schedule.ts` | `livePulseCadenceMs`、`livePulseUploadSafetyIntervalMs`、`localPromotionPulseCadenceMs`、`localPromotionRateLimitCooldownMs`、`localPromotionRateLimitCooldownRemaining`、`nextLivePulseAfter`、`nextLivePulseAfterRateLimit`、`nextLivePulseAt` | 无 | Extension - 插件采集 |
| `apps/extension/src/live-pulse-status.test.ts` | 无 | `@douyin-local-life/shared`、`apps/extension/src/live-pulse-status` | Extension - 插件采集 |
| `apps/extension/src/live-pulse-status.ts` | `LivePulseDisplayState`、`LivePulseOutcome`、`LivePulseOutcomeContext`、`livePulseButtonState`、`livePulseMetricCoverage`、`livePulseOutcomeMessage`、`livePulseReasonText`、`livePulseStatusText`、`localPromotionPulseMetricCoverage`、`normalizeLivePulseMetricKeys`、`parseLivePulseOutcome`、`safeLivePulseFailureReason` | `@douyin-local-life/shared` | Extension - 插件采集 |
| `apps/extension/src/live-pulse-tab-update.test.ts` | 无 | `apps/extension/src/live-pulse-tab-update` | Extension - 插件采集 |
| `apps/extension/src/live-pulse-tab-update.ts` | `LivePulseTabUpdateState`、`canKeepLivePulseForUrlUpdate` | `@douyin-local-life/shared`、`apps/extension/src/live-screen-pulse-page` | Extension - 插件采集 |
| `apps/extension/src/live-screen-capture-plan.test.ts` | 无 | `apps/extension/src/live-screen-capture-plan` | Extension - 插件采集 |
| `apps/extension/src/live-screen-capture-plan.ts` | `liveScreenCapturePlan` | 无 | Extension - 插件采集 |
| `apps/extension/src/live-screen-internal-api.test.ts` | 无 | `apps/extension/src/live-screen-internal-api` | Extension - 插件采集 |
| `apps/extension/src/live-screen-internal-api.ts` | `LiveScreenInternalApiCollection`、`collectLiveScreenInternalApi`、`liveScreenInternalApiRequestTimeoutMs`、`readApprovedFieldValue` | `@douyin-local-life/shared` | Extension - 插件采集 |
| `apps/extension/src/live-screen-metric-merge.test.ts` | 无 | `@douyin-local-life/shared`、`apps/extension/src/live-screen-metric-merge` | Extension - 插件采集 |
| `apps/extension/src/live-screen-metric-merge.ts` | `liveScreenMetricsForMode`、`mergeLiveScreenMetrics` | `@douyin-local-life/shared` | Extension - 插件采集 |
| `apps/extension/src/live-screen-pulse-page.test.ts` | 无 | `apps/extension/src/live-screen-pulse-page` | Extension - 插件采集 |
| `apps/extension/src/live-screen-pulse-page.ts` | `LivePulsePageContext`、`isExactLiveScreenPage`、`livePulsePageContext`、`livePulseRouteDetection` | `@douyin-local-life/shared/collection-routes` | Extension - 插件采集 |
| `apps/extension/src/live-screen-room-id.test.ts` | 无 | `apps/extension/src/live-screen-room-id` | Extension - 插件采集 |
| `apps/extension/src/live-screen-room-id.ts` | `resolveLiveScreenRoomId`、`type LiveScreenRoomIdEvidence`、`type LiveScreenRoomIdResolution`、`type LiveScreenRoomIdSource` | `@douyin-local-life/shared` | Extension - 插件采集 |
| `apps/extension/src/local-promotion-internal-api.test.ts` | 无 | `@douyin-local-life/shared`、`apps/extension/src/content.ts?raw`、`apps/extension/src/local-promotion-internal-api`、`apps/extension/src/local-promotion-pulse-snapshot`、`apps/extension/src/service-worker.ts?raw` | Extension - 插件采集 |
| `apps/extension/src/local-promotion-internal-api.ts` | `LocalPromotionInternalApiCollection`、`collectLocalPromotionInternalApi`、`localPromotionInternalApiRequestTimeoutMs` | `@douyin-local-life/shared` | Extension - 插件采集 |
| `apps/extension/src/local-promotion-pulse-snapshot.ts` | `createLocalPromotionPulseSnapshot` | `@douyin-local-life/shared`、`apps/extension/src/local-promotion-internal-api`、`apps/extension/src/safety` | Extension - 插件采集 |
| `apps/extension/src/messages.ts` | `MESSAGE`、`STORAGE` | 无 | Extension - 插件采集 |
| `apps/extension/src/metric-pulse-upload.test.ts` | 无 | `@douyin-local-life/shared`、`apps/extension/src/metric-pulse-upload` | Extension - 插件采集 |
| `apps/extension/src/metric-pulse-upload.ts` | `MetricPulseUploadResult`、`metricPulseUploadTimeoutMs`、`uploadMetricPulseRequest` | `@douyin-local-life/shared` | Extension - 插件采集 |
| `apps/extension/src/page-adapters.test.ts` | 无 | `apps/extension/src/page-adapters` | Extension - 插件采集 |
| `apps/extension/src/page-adapters.ts` | `PageAdapter`、`PageAdapterInput`、`selectPageAdapter` | `@douyin-local-life/shared`、`apps/extension/src/capture-budget` | Extension - 插件采集 |
| `apps/extension/src/popup-lifecycle.test.ts` | 无 | `apps/extension/popup.html?raw`、`apps/extension/src/live-pulse-status.ts?raw`、`apps/extension/src/popup.ts?raw` | Extension - 插件采集 |
| `apps/extension/src/popup.ts` | 无 | `@douyin-local-life/shared`、`@douyin-local-life/shared/collection-routes`、`apps/extension/src/extension-context`、`apps/extension/src/live-pulse-schedule`、`apps/extension/src/live-pulse-status`、`apps/extension/src/messages`、`apps/extension/src/safety` | Extension - 插件采集 |
| `apps/extension/src/raw-imports.d.ts` | `source` | 无 | Extension - 插件采集 |
| `apps/extension/src/request-timeout.test.ts` | 无 | `apps/extension/src/request-timeout`、`apps/extension/src/service-worker.ts?raw` | Extension - 插件采集 |
| `apps/extension/src/request-timeout.ts` | `bridgeRecoveryRequestTimeoutMs`、`extensionRequestTimeoutMs`、`fetchWithTimeout`、`isRequestTimeout` | 无 | Extension - 插件采集 |
| `apps/extension/src/safety.test.ts` | 无 | `apps/extension/src/safety` | Extension - 插件采集 |
| `apps/extension/src/safety.ts` | `isSupportedExtensionCollectionUrl`、`normalizeApiBaseUrl`、`sanitizeSensitiveFields`、`sanitizeSnapshotPayload`、`shouldRedactKey` | `@douyin-local-life/shared`、`apps/extension/src/build-target` | Extension - 插件采集 |
| `apps/extension/src/service-worker-runtime.ts` | `registerServiceWorkerRuntime` | `@douyin-local-life/shared`、`apps/extension/src/messages` | Extension - 插件采集 |
| `apps/extension/src/service-worker-state.ts` | `CollectionSessionState`、`PageActivity`、`PairingExchangeInput`、`PendingPairingConfirmation`、`PulseState`、`RouteUploadState`、`StoredPulseActivityMap`、`StoredPulseOutcomeMap`、`StoredPulseState`、`StoredPulseStateMap` | `@douyin-local-life/shared`、`apps/extension/src/live-pulse-activity`、`apps/extension/src/live-pulse-status` | Extension - 插件采集 |
| `apps/extension/src/service-worker.ts` | 无 | `@douyin-local-life/shared`、`@douyin-local-life/shared/collection-routes`、`apps/extension/src/build-target`、`apps/extension/src/extension-context`、`apps/extension/src/live-pulse-activity`、`apps/extension/src/live-pulse-failure`、`apps/extension/src/live-pulse-schedule`、`apps/extension/src/live-pulse-status`、`apps/extension/src/live-pulse-tab-update`、`apps/extension/src/live-screen-pulse-page` | Extension - 插件采集 |
| `apps/extension/src/sidepanel.ts` | 无 | `apps/extension/src/live-pulse-status`、`apps/extension/src/messages` | Extension - 插件采集 |
| `apps/extension/src/single-flight.test.ts` | 无 | `apps/extension/src/single-flight` | Extension - 插件采集 |
| `apps/extension/src/single-flight.ts` | `createKeyedSingleFlight` | 无 | Extension - 插件采集 |
| `apps/extension/src/task-page-bridge-recovery.test.ts` | 无 | `apps/extension/src/extension-context`、`apps/extension/src/task-page-bridge-recovery` | Extension - 插件采集 |
| `apps/extension/src/task-page-bridge-recovery.ts` | `TaskPageBinding`、`contextRefreshErrorCode`、`createTaskPageConnectionActivity`、`isTaskBridgePageUrl`、`resolveTaskPageBinding`、`shouldBlockTaskSwitchForActivePulse`、`taskIdFromBridgePageUrl` | `apps/extension/src/build-target`、`apps/extension/src/extension-context` | Extension - 插件采集 |
| `apps/extension/src/web-bridge.ts` | 无 | `@douyin-local-life/shared`、`apps/extension/src/bridge-protocol`、`apps/extension/src/messages` | Extension - 插件采集 |

### 工程 - 数据与基础设施

| 模块 | 主要导出 | 依赖方向 | 负责人 |
| --- | --- | --- | --- |
| `prisma/migrations/20260712190000_baseline_v021/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260712191000_v021_realtime_safety/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260714170000_v022_account_profiles/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260715120000_v023_extension_pairing/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260715170000_v024_task_scoped_extension_pairing/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260716110000_v025_sessions/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260716120000_v026_rate_limit_buckets/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260716130000_v027_decision_evidence_fingerprint/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260716140000_v028_route_verification/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260717100000_v029_email_verification/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260718110000_v030_security_metrics/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260719180000_v031_collection_diagnostics/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260720110000_v032_audit_actor_snapshot/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260722090000_v033_table_cell_reviews/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260729120000_metric_binding_calibration/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260731120000_v035_ai_skill_diagnosis/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260903210000_project_history_comparison/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/migrations/20260910120000_simplified_accounts_and_credits/migration.sql` | 无 | 无 | 工程 - 数据与基础设施 |
| `prisma/schema.prisma` | 无 | 无 | 工程 - 数据与基础设施 |
| `tools/architecture-check.mjs` | 无 | `tools/build-code-index.mjs` | 工程 - 数据与基础设施 |
| `tools/backup-postgres.sh` | 无 | 无 | 工程 - 数据与基础设施 |
| `tools/build-code-index.mjs` | `computeCodeIndex`、`writeCodeIndex` | 无 | 工程 - 数据与基础设施 |
| `tools/clean-dist.mjs` | 无 | 无 | 工程 - 数据与基础设施 |
| `tools/docs-verify.mjs` | 无 | 无 | 工程 - 数据与基础设施 |
| `tools/reconcile-v035-legacy-database.ps1` | 无 | 无 | 工程 - 数据与基础设施 |
| `tools/source-hygiene-check.mjs` | 无 | 无 | 工程 - 数据与基础设施 |
| `tools/trim-local-pxxis-runtime.ps1` | 无 | 无 | 工程 - 数据与基础设施 |
| `tools/trim-local-pxxis-runtime.test.ps1` | 无 | 无 | 工程 - 数据与基础设施 |
| `tools/upgrade-pxxis-prelaunch-v035.ps1` | 无 | 无 | 工程 - 数据与基础设施 |
| `tools/verify-diagnosis-closure-candidate.ps1` | 无 | `tools/apps/api/dist/ai-diagnosis/orchestrator.js`、`tools/apps/api/dist/ai-diagnosis/synthetic-evaluation.js` | 工程 - 数据与基础设施 |
| `tools/verify-local-pxxis-runtime.ps1` | 无 | `tools/apps/api/dist/ai-diagnosis/orchestrator.js`、`tools/apps/api/dist/ai-diagnosis/synthetic-evaluation.js`、`tools/packages/diagnosis-skills/dist/index.js` | 工程 - 数据与基础设施 |
| `tools/verify-postgres-backup.sh` | 无 | 无 | 工程 - 数据与基础设施 |
| `tools/version-check.mjs` | 无 | 无 | 工程 - 数据与基础设施 |

## 使用说明

1. 查找业务入口时先按业务域定位。
2. 新模块应落在单一业务域，不得把多个域塞进同一超大文件。
3. 涉及跨包依赖时先看 `ARCHITECTURE.md` 的禁止边界。
