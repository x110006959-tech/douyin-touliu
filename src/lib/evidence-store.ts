import { numberOrNull, safeJsonString } from "./coerce";
import { prisma } from "./prisma";

type RawEvidenceInput = {
  accountId?: string | null;
  source: string;
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

export async function createEvidenceWithCalibration(input: RawEvidenceInput) {
  const confidence = numberOrNull(input.confidence);
  const status = input.status || "pending_verification";
  const failed = status === "failed";
  const lowConfidence = confidence !== null && confidence < 0.85;
  const needsCalibration = failed || lowConfidence || status === "pending_verification";

  const evidence = await prisma.rawEvidence.create({
    data: {
      accountId: input.accountId || null,
      source: input.source,
      pageName: input.pageName || null,
      targetUrl: input.targetUrl || null,
      status,
      confidence,
      rawText: input.rawText || null,
      rawPayload: safeJsonString(input.rawPayload),
      parsedFields: safeJsonString(input.parsedFields),
      failureReason: input.failureReason || null,
      screenshotPath: input.screenshotPath || null,
      needsCalibration
    }
  });

  if (needsCalibration) {
    await prisma.calibrationItem.create({
      data: {
        evidenceId: evidence.id,
        fieldName: "parsedFields",
        currentValue: evidence.parsedFields,
        confidence,
        status: "pending",
        reason: failed ? input.failureReason || "采集失败" : "字段待人工校准"
      }
    });
  }

  return evidence;
}
