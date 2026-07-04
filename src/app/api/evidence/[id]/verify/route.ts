import { NextResponse } from "next/server";
import { z } from "zod";
import { validateDiagnosisActions } from "@/lib/constants";
import { safeJsonString } from "@/lib/coerce";
import { runDiagnosis } from "@/lib/diagnosis";
import { extractSnapshotDataFromEvidence } from "@/lib/evidence-to-snapshot";
import { buildMetricSignalsForSnapshot } from "@/lib/metric-smoothing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const verifySchema = z.object({
  parsedFields: z.unknown(),
  status: z.string().optional().default("verified")
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = await request.json();
  const parsed = verifySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "校准字段不完整" }, { status: 400 });
  }

  const parsedFields = safeJsonString(parsed.data.parsedFields);
  const evidence = await prisma.rawEvidence.update({
    where: { id },
    data: {
      parsedFields,
      status: parsed.data.status,
      needsCalibration: false,
      verifiedAt: new Date()
    },
    include: { account: true }
  });

  await prisma.calibrationItem.updateMany({
    where: { evidenceId: id, status: "pending" },
    data: {
      manualValue: parsedFields,
      status: "manual_verified"
    }
  });

  if (parsed.data.status === "verified") {
    const snapshotData = extractSnapshotDataFromEvidence(evidence);
    if (snapshotData) {
      const snapshot = await prisma.liveSnapshot.upsert({
        where: { sourceEvidenceId: evidence.id },
        update: snapshotData,
        create: snapshotData
      });

      const metricSignals = await buildMetricSignalsForSnapshot(snapshot);
      const diagnosis = runDiagnosis({ snapshot, metricSignals });
      const actions = validateDiagnosisActions(diagnosis.actions);
      const savedDiagnosis = await prisma.diagnosisResult.create({
        data: {
          snapshotId: snapshot.id,
          intelligence: diagnosis.intelligence,
          judgement: diagnosis.judgement,
          operation: diagnosis.operation,
          output: diagnosis.output,
          actions: JSON.stringify(actions),
          tags: JSON.stringify(diagnosis.tags),
          confidence: diagnosis.confidence,
          missingFields: JSON.stringify(diagnosis.missingFields),
          evidenceFields: JSON.stringify(diagnosis.evidenceFields)
        }
      });

      return NextResponse.json({ evidence, snapshot, diagnosis: savedDiagnosis });
    }
  }

  return NextResponse.json({ evidence });
}
