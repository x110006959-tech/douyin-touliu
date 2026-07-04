import type { CollectionJob } from "@prisma/client";
import { isSubjectType } from "./constants";

export type CollectionSelector = {
  fieldName: string;
  css: string;
  required: boolean;
};

export type CollectionSubjectConfig = {
  subjectType: string;
  accountIdentity?: string | null;
  operatorType?: string | null;
  cooperationType?: string | null;
  controlLevel?: string | null;
  subjectConfidence?: number | null;
  subjectSource?: string | null;
};

export type CollectionJobCursor = {
  selectors: CollectionSelector[];
  subjectConfig?: CollectionSubjectConfig;
  nextRunAt?: string | null;
  lastEvidenceIds?: string[];
  lastStatus?: string;
  lastExitCode?: number | null;
  liveRuntime?: {
    liveDate?: string;
    currentSessionFingerprint?: string;
    currentSequence?: number;
    lastLiveStatus?: string;
    lastObservedAt?: string;
  };
};

export function parseCollectionJobCursor(cursor: string | null | undefined): CollectionJobCursor {
  if (!cursor) return { selectors: [] };
  try {
    const parsed = JSON.parse(cursor) as Partial<CollectionJobCursor>;
    return {
      selectors: Array.isArray(parsed.selectors)
        ? parsed.selectors.map(normalizeSelector).filter((value): value is CollectionSelector => Boolean(value))
        : [],
      subjectConfig: normalizeSubjectConfig(parsed.subjectConfig),
      nextRunAt: typeof parsed.nextRunAt === "string" ? parsed.nextRunAt : null,
      lastEvidenceIds: Array.isArray(parsed.lastEvidenceIds)
        ? parsed.lastEvidenceIds.filter((value): value is string => typeof value === "string")
        : [],
      lastStatus: typeof parsed.lastStatus === "string" ? parsed.lastStatus : undefined,
      lastExitCode: typeof parsed.lastExitCode === "number" ? parsed.lastExitCode : null,
      liveRuntime: normalizeLiveRuntime(parsed.liveRuntime)
    };
  } catch {
    return { selectors: [] };
  }
}

export function stringifyCollectionJobCursor(cursor: CollectionJobCursor) {
  return JSON.stringify(cursor);
}

function normalizeSelector(value: unknown): CollectionSelector | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const fieldName = typeof item.fieldName === "string" ? item.fieldName.trim() : "";
  const css = typeof item.css === "string" ? item.css.trim() : "";
  if (!fieldName || !css) return null;
  return {
    fieldName,
    css,
    required: item.required === true
  };
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

export function normalizeSubjectConfig(value: unknown): CollectionSubjectConfig | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const subjectType = optionalText(item.subjectType);
  if (!subjectType || !isSubjectType(subjectType)) return undefined;
  return {
    subjectType,
    accountIdentity: optionalText(item.accountIdentity),
    operatorType: optionalText(item.operatorType),
    cooperationType: optionalText(item.cooperationType),
    controlLevel: optionalText(item.controlLevel),
    subjectConfidence: optionalNumber(item.subjectConfidence),
    subjectSource: optionalText(item.subjectSource) || "collection_job"
  };
}

export function hasRunnableSubjectConfig(cursor: CollectionJobCursor) {
  return Boolean(cursor.subjectConfig?.subjectType && cursor.subjectConfig.subjectType !== "主体待校准");
}

function normalizeLiveRuntime(value: unknown): CollectionJobCursor["liveRuntime"] {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  return {
    liveDate: typeof item.liveDate === "string" ? item.liveDate : undefined,
    currentSessionFingerprint:
      typeof item.currentSessionFingerprint === "string" ? item.currentSessionFingerprint : undefined,
    currentSequence: typeof item.currentSequence === "number" ? item.currentSequence : undefined,
    lastLiveStatus: typeof item.lastLiveStatus === "string" ? item.lastLiveStatus : undefined,
    lastObservedAt: typeof item.lastObservedAt === "string" ? item.lastObservedAt : undefined
  };
}

export function parseSelectorLine(line: string): CollectionSelector | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const required = trimmed.startsWith("!");
  const raw = required ? trimmed.slice(1) : trimmed;
  const separator = raw.indexOf("=");
  if (separator <= 0) return null;
  const fieldName = raw.slice(0, separator).trim();
  const css = raw.slice(separator + 1).trim();
  if (!fieldName || !css) return null;
  return { fieldName, css, required };
}

export function parseSelectorText(selectorText: string | null | undefined) {
  if (!selectorText) return [];
  return selectorText
    .split(/\r?\n/)
    .map(parseSelectorLine)
    .filter((value): value is CollectionSelector => Boolean(value));
}

export function selectorToCliValue(selector: CollectionSelector) {
  return `${selector.required ? "!" : ""}${selector.fieldName}=${selector.css}`;
}

export function scheduleToMs(schedule: string | null | undefined) {
  const value = schedule?.trim();
  if (!value) return null;
  const match = value.match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hour|hours)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = (match[2] || "m").toLowerCase();
  if (unit.startsWith("s")) return amount * 1000;
  if (unit.startsWith("h")) return amount * 60 * 60 * 1000;
  return amount * 60 * 1000;
}

export function nextRunAt(schedule: string | null | undefined, from = new Date()) {
  const ms = scheduleToMs(schedule);
  return ms ? new Date(from.getTime() + ms).toISOString() : null;
}

export function isCollectionJobDue(job: CollectionJob, now = new Date()) {
  if (job.status === "running") return false;
  if (!scheduleToMs(job.schedule)) return false;
  const cursor = parseCollectionJobCursor(job.cursor);
  if (!cursor.nextRunAt) return true;
  return new Date(cursor.nextRunAt).getTime() <= now.getTime();
}
