import { NextResponse } from "next/server";
import { actionLibrary } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(actionLibrary);
}
