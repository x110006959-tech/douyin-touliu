import { spawn } from "node:child_process";
import type { CollectionJob } from "@prisma/client";
import { accountArtifactsDir, restoreStorageStateFromVault } from "./account-session-files";
import {
  hasRunnableSubjectConfig,
  nextRunAt,
  parseCollectionJobCursor,
  selectorToCliValue,
  stringifyCollectionJobCursor
} from "./collection-config";
import { createEvidenceWithCalibration } from "./evidence-store";
import { prisma } from "./prisma";
import { collectorPath } from "./workspace-paths";

type CollectorPayload = {
  source?: string;
  pageName?: string | null;
  targetUrl?: string | null;
  status?: string;
  confidence?: unknown;
  rawText?: string | null;
  rawPayload?: unknown;
  parsedFields?: unknown;
  failureReason?: string | null;
  screenshotPath?: string | null;
};

type LiveRuntimePayload = {
  liveDate?: string;
  liveStatus?: string;
  sessionFingerprint?: string;
  observedAt?: string;
};

type ProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

export type CollectionRunResult = {
  jobId: string;
  status: "idle" | "failed";
  evidenceIds: string[];
  exitCode: number | null;
  stderr?: string;
};

type CollectionJobWithAccount = CollectionJob & {
  account?: {
    loginEntryUrl: string | null;
  } | null;
};

const supportedTypes = new Set(["scrapling_public", "public_page", "scrapling", "live_dashboard"]);

function collectorScriptPath() {
  return collectorPath("collector.py");
}

function liveDashboardScriptPath() {
  return collectorPath("live_dashboard_collector.py");
}

function collectorCacheDir() {
  return collectorPath(".cache", "collector");
}

function pythonCommand() {
  return process.env.COLLECTOR_PYTHON || (process.platform === "win32" ? "py" : "python");
}

function collectorTimeoutMs() {
  const configured = Number(process.env.COLLECTOR_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 45_000;
}

function parseJsonl(stdout: string) {
  const payloads: CollectorPayload[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") payloads.push(parsed as CollectorPayload);
    } catch {
      payloads.push({
        source: "scrapling",
        status: "failed",
        confidence: 0,
        rawText: trimmed,
        parsedFields: {},
        failureReason: "采集器输出了非 JSONL 内容"
      });
    }
  }
  return payloads;
}

function runProcess(args: string[]) {
  return new Promise<ProcessResult>((resolve) => {
    const child = spawn(pythonCommand(), args, {
      env: process.env,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ stdout, stderr: `${stderr}\n采集超时`.trim(), exitCode: null, timedOut: true });
    }, collectorTimeoutMs());

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ stdout, stderr: error.message, exitCode: null, timedOut: false });
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode, timedOut: false });
    });
  });
}

function buildCollectorArgs(job: CollectionJob) {
  const cursor = parseCollectionJobCursor(job.cursor);
  const args = [
    collectorScriptPath(),
    job.targetUrl || "",
    "--cache-dir",
    collectorCacheDir(),
    "--checkpoint-key",
    job.id,
    "--resume"
  ];
  for (const selector of cursor.selectors) {
    args.push("--selector", selectorToCliValue(selector));
  }
  return args;
}

function buildLiveDashboardArgs(job: CollectionJob, targetUrl: string, stateFile: string) {
  const cursor = parseCollectionJobCursor(job.cursor);
  const args = [
    liveDashboardScriptPath(),
    "collect",
    "--account-id",
    job.accountId || "",
    "--url",
    targetUrl,
    "--state-file",
    stateFile,
    "--artifact-dir",
    accountArtifactsDir(job.accountId || "unknown"),
    "--page-name",
    job.targetName
  ];
  for (const selector of cursor.selectors) {
    args.push("--selector", selectorToCliValue(selector));
  }
  return args;
}

async function createFailedEvidence(job: CollectionJob, reason: string) {
  const evidence = await createEvidenceWithCalibration({
    accountId: job.accountId,
    source: job.type || "collector",
    pageName: job.targetName,
    targetUrl: job.targetUrl,
    status: "failed",
    confidence: 0,
    rawPayload: { collectionJobId: job.id, collectionJobType: job.type },
    parsedFields: {},
    failureReason: reason
  });
  return evidence.id;
}

async function savePayloadEvidence(job: CollectionJob, payload: CollectorPayload) {
  const cursor = parseCollectionJobCursor(job.cursor);
  const parsedFields =
    payload.parsedFields && typeof payload.parsedFields === "object" && !Array.isArray(payload.parsedFields)
      ? { ...(payload.parsedFields as Record<string, unknown>) }
      : {};
  if (cursor.subjectConfig) {
    Object.assign(parsedFields, {
      ...cursor.subjectConfig,
      subjectConfiguredAt: "collection_job"
    });
  }
  const rawPayload =
    payload.rawPayload && typeof payload.rawPayload === "object"
      ? { ...(payload.rawPayload as Record<string, unknown>), collectionJobId: job.id }
      : { rawPayload: payload.rawPayload ?? null, collectionJobId: job.id };

  const evidence = await createEvidenceWithCalibration({
    accountId: job.accountId,
    source: payload.source || job.type || "collector",
    pageName: payload.pageName || job.targetName,
    targetUrl: payload.targetUrl || job.targetUrl,
    status: payload.status || "pending_verification",
    confidence: payload.confidence,
    rawText: payload.rawText || null,
    rawPayload,
    parsedFields,
    failureReason: payload.failureReason || null,
    screenshotPath: payload.screenshotPath || null
  });
  return evidence.id;
}

function getParsedRecord(payload: CollectorPayload) {
  return payload.parsedFields && typeof payload.parsedFields === "object" && !Array.isArray(payload.parsedFields)
    ? (payload.parsedFields as Record<string, unknown>)
    : {};
}

function getLiveRuntime(payloads: CollectorPayload[]): LiveRuntimePayload | null {
  for (const payload of payloads) {
    const parsed = getParsedRecord(payload);
    const runtime = parsed.liveRuntime;
    if (runtime && typeof runtime === "object" && !Array.isArray(runtime)) {
      return runtime as LiveRuntimePayload;
    }
  }
  return null;
}

function updateLiveRuntimeCursor(cursor: ReturnType<typeof parseCollectionJobCursor>, payloads: CollectorPayload[]) {
  const runtime = getLiveRuntime(payloads);
  if (!runtime?.liveDate) return cursor.liveRuntime;

  const previous = cursor.liveRuntime;
  const sameDate = previous?.liveDate === runtime.liveDate;
  const previousSequence = sameDate ? previous?.currentSequence || 0 : 0;
  const previousFingerprint = sameDate ? previous?.currentSessionFingerprint : undefined;
  const incomingFingerprint = runtime.sessionFingerprint || previousFingerprint;
  const active = runtime.liveStatus === "active";
  const newActiveSession = active && incomingFingerprint && previousFingerprint && incomingFingerprint !== previousFingerprint;
  const firstActiveSession = active && incomingFingerprint && !previousFingerprint;

  return {
    liveDate: runtime.liveDate,
    currentSessionFingerprint: incomingFingerprint,
    currentSequence: newActiveSession || firstActiveSession ? previousSequence + 1 : previousSequence || 1,
    lastLiveStatus: runtime.liveStatus,
    lastObservedAt: runtime.observedAt || new Date().toISOString()
  };
}

async function updateAccountSessionStatus(job: CollectionJob, payloads: CollectorPayload[], failed: boolean) {
  if (job.type !== "live_dashboard" || !job.accountId) return;
  const failureText = payloads
    .map((payload) => payload.failureReason || "")
    .join("\n");
  if (failed && /登录态|登录页|重新确认登录|验证码/.test(failureText)) {
    await prisma.accountProfile.update({
      where: { id: job.accountId },
      data: { sessionStatus: "needs_login" }
    });
    return;
  }
  if (!failed && payloads.length > 0) {
    await prisma.accountProfile.update({
      where: { id: job.accountId },
      data: { sessionStatus: "active" }
    });
  }
}

export async function runCollectionJob(jobId: string): Promise<CollectionRunResult> {
  const job = await prisma.collectionJob.findUnique({
    where: { id: jobId },
    include: { account: { select: { loginEntryUrl: true } } }
  });
  if (!job) throw new Error("采集任务不存在");

  await prisma.collectionJob.update({
    where: { id: job.id },
    data: { status: "running", lastError: null }
  });

  const cursor = parseCollectionJobCursor(job.cursor);
  const evidenceIds: string[] = [];
  let lastPayloads: CollectorPayload[] = [];
  let exitCode: number | null = null;
  let lastError: string | null = null;
  let lastStatus: "idle" | "failed" = "idle";

  try {
    if (!supportedTypes.has(job.type)) {
      throw new Error(`暂不支持的采集类型：${job.type}`);
    }

    const processResult = await runProcess(await buildProcessArgs(job));
    exitCode = processResult.exitCode;
    const payloads = parseJsonl(processResult.stdout);
    lastPayloads = payloads;

    if (payloads.length === 0) {
      const reason = processResult.stderr || "采集器没有返回证据";
      evidenceIds.push(await createFailedEvidence(job, reason));
      lastError = reason;
      lastStatus = "failed";
    } else {
      for (const payload of payloads) {
        evidenceIds.push(await savePayloadEvidence(job, payload));
      }
      const failed = processResult.exitCode !== 0 || payloads.every((payload) => payload.status === "failed");
      await updateAccountSessionStatus(job, payloads, failed);
      lastStatus = failed ? "failed" : "idle";
      lastError = failed ? processResult.stderr || payloads.map((payload) => payload.failureReason).filter(Boolean).join("; ") : null;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "采集任务运行失败";
    evidenceIds.push(await createFailedEvidence(job, reason));
    lastError = reason;
    lastStatus = "failed";
  }

  const nextCursor = stringifyCollectionJobCursor({
    ...cursor,
    lastEvidenceIds: evidenceIds,
    lastStatus,
    lastExitCode: exitCode,
    liveRuntime: updateLiveRuntimeCursor(cursor, lastStatus === "failed" ? [] : lastPayloads),
    nextRunAt: nextRunAt(job.schedule)
  });

  await prisma.collectionJob.update({
    where: { id: job.id },
    data: {
      status: lastStatus,
      lastRunAt: new Date(),
      lastError,
      cursor: nextCursor
    }
  });

  return {
    jobId: job.id,
    status: lastStatus,
    evidenceIds,
    exitCode,
    stderr: lastError || undefined
  };
}

async function buildProcessArgs(job: CollectionJobWithAccount) {
  if (job.type === "live_dashboard") {
    const cursor = parseCollectionJobCursor(job.cursor);
    if (!hasRunnableSubjectConfig(cursor)) {
      throw new Error("直播大屏采集任务缺少直播主体分类，请先在采集任务中选择主体类型");
    }
    if (!job.accountId) {
      throw new Error("直播大屏采集任务必须绑定账号");
    }
    const targetUrl = job.targetUrl || job.account?.loginEntryUrl;
    if (!targetUrl) {
      throw new Error("直播大屏采集任务缺少 URL，且账号未配置登录入口");
    }
    const stateFile = await restoreStorageStateFromVault(job.accountId);
    if (!stateFile) {
      throw new Error("账号还没有确认登录态，请先在账号档案里打开登录并确认");
    }
    return buildLiveDashboardArgs(job, targetUrl, stateFile);
  }

  if (!job.targetUrl) {
    throw new Error("采集任务缺少目标 URL");
  }
  return buildCollectorArgs(job);
}
