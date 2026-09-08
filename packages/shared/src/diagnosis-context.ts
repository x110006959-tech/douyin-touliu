import { z } from "zod";
import { actionTypes, actionOutcomeResults } from "./action-types.js";
import { collectionRouteKeys } from "./collection-routes.js";
import { metricKeys } from "./metric-keys.js";

/**
 * 用户说明本次诊断的使用场景。它决定领域分析方式、调度顺序与综合重点，不能作为
 * 直播已开始或已经结束的证据。
 */
export const diagnosisScenarios = ["UNSPECIFIED", "LIVE_MONITORING", "POST_LIVE_REVIEW"] as const;
export type DiagnosisScenario = (typeof diagnosisScenarios)[number];

export const diagnosisRecentTrendMetricSchema = z.object({
  metricKey: z.enum(metricKeys),
  metricName: z.string().min(1).max(100),
  unit: z.string().max(30).nullable(),
  baselineValue: z.number().finite(),
  currentValue: z.number().finite(),
  delta: z.number().finite()
});

export const diagnosisRecentTrendSchema = z.object({
  status: z.enum(["AVAILABLE", "INSUFFICIENT"]),
  reason: z.string().min(1).max(500),
  baselineStartAt: z.string().datetime().nullable(),
  baselineEndAt: z.string().datetime().nullable(),
  currentStartAt: z.string().datetime().nullable(),
  currentEndAt: z.string().datetime().nullable(),
  routeKey: z.enum(collectionRouteKeys).nullable(),
  scope: z.enum(["FULL_DOMAIN", "PAYMENT"]).nullable(),
  metrics: z.array(diagnosisRecentTrendMetricSchema).max(12),
  efficiency: z.object({
    metricLabel: z.string().min(1).max(160),
    gmvMetricKey: z.enum(metricKeys),
    spendMetricKey: z.literal("spend"),
    baselineValue: z.number().finite(),
    currentValue: z.number().finite(),
    delta: z.number().finite()
  }).nullable()
});

export type DiagnosisRecentTrend = z.infer<typeof diagnosisRecentTrendSchema>;

export const diagnosisManualActionSummarySchema = z.object({
  actionProposalId: z.string().min(1),
  actionType: z.enum(actionTypes),
  actionTitle: z.string().min(1).max(200).optional(),
  executedAt: z.string().datetime(),
  outcome: z.object({
    result: z.enum(actionOutcomeResults),
    recordedAt: z.string().datetime()
  }).nullable()
});

export type DiagnosisManualActionSummary = z.infer<typeof diagnosisManualActionSummarySchema>;

/**
 * 该对象由服务端构造并随本次诊断输入冻结；客户端只能提供 scenario。
 */
export const diagnosisContextSchema = z.object({
  version: z.literal(1),
  scenario: z.enum(diagnosisScenarios),
  recentTrend: diagnosisRecentTrendSchema,
  manualActions: z.array(diagnosisManualActionSummarySchema).max(5)
});

export type DiagnosisContext = z.infer<typeof diagnosisContextSchema>;
