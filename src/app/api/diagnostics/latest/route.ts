import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const diagnostics = await prisma.diagnosisResult.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { snapshot: true }
  });

  return NextResponse.json(diagnostics);
}
