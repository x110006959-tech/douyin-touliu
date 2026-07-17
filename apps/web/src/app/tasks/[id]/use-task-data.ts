"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewedMetricDTO } from "@douyin-local-life/shared";
import { apiFetch } from "@/lib/api";
import { createLatestRequestGuard } from "@/lib/latest-request";
import type { CollectionRun, DecisionRun, TaskDetail } from "./task-types";

export function useTaskData(taskId: string, token: string | null) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [decisionRun, setDecisionRun] = useState<DecisionRun | null>(null);
  const [collectionRun, setCollectionRun] = useState<CollectionRun | null>(null);
  const [reviewMetrics, setReviewMetrics] = useState<ReviewedMetricDTO[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const requestGuard = useRef(createLatestRequestGuard());

  const applyReviewMetrics = useCallback((metrics: ReviewedMetricDTO[]) => {
    setReviewMetrics(metrics);
    setReviewDrafts(Object.fromEntries(metrics.map((metric) => [metric.id, metric.reviewedValue ?? metric.originalValue ?? ""])));
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const version = requestGuard.current.begin();
    try {
      const [nextTask, nextDecisionRun, nextReviewMetrics, nextCollectionRun] = await Promise.all([
        apiFetch<TaskDetail>(`/collection-tasks/${taskId}`, token),
        apiFetch<DecisionRun | null>(`/collection-tasks/${taskId}/decision-runs/latest`, token),
        apiFetch<ReviewedMetricDTO[]>(`/collection-tasks/${taskId}/review-metrics`, token),
        apiFetch<CollectionRun | null>(`/collection-tasks/${taskId}/collection-runs/latest`, token)
      ]);
      if (!requestGuard.current.isCurrent(version)) return;
      setTask(nextTask);
      setDecisionRun(nextDecisionRun);
      applyReviewMetrics(nextReviewMetrics);
      setCollectionRun(nextCollectionRun);
    } catch (loadError) {
      if (requestGuard.current.isCurrent(version)) {
        setError(loadError instanceof Error ? loadError.message : "读取任务失败");
      }
    }
  }, [applyReviewMetrics, taskId, token]);

  useEffect(() => {
    void load();
    return () => {
      requestGuard.current.invalidate();
    };
  }, [load]);

  return {
    task,
    decisionRun,
    setDecisionRun,
    collectionRun,
    reviewMetrics,
    reviewDrafts,
    setReviewDrafts,
    applyReviewMetrics,
    load,
    error,
    setError
  };
}
