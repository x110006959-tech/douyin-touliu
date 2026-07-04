import { NextResponse } from "next/server";
import { z } from "zod";
import { validateDiagnosisActions } from "@/lib/constants";
import { runDiagnosis } from "@/lib/diagnosis";
import { buildMetricSignalsForSnapshot } from "@/lib/metric-smoothing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const diagnoseSchema = z.object({
  snapshotId: z.string().min(1)
});

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = diagnoseSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少快照 ID" }, { status: 400 });
  }

  const snapshot = await prisma.liveSnapshot.findUnique({
    where: { id: parsed.data.snapshotId },
    include: { activity: true, subjectProfile: true }
  });

  if (!snapshot) {
    return NextResponse.json({ error: "快照不存在" }, { status: 404 });
  }

  const metricSignals = await buildMetricSignalsForSnapshot(snapshot);
  const diagnosis = runDiagnosis({
    snapshot,
    activity: snapshot.activity,
    subjectProfile: snapshot.subjectProfile,
    metricSignals
  });
  const actions = validateDiagnosisActions(diagnosis.actions);

  const saved = await prisma.diagnosisResult.create({
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

  return NextResponse.json(saved);
}
