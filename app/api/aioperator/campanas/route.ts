import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { listarCampanasConCache } from "@/lib/aioperator-campanas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AI Operator → RodriChat: read-only list of campaigns with 30-day counters.
// Same secret as the webhook and the DM endpoint (AIOPERATOR_WEBHOOK_SECRET).

function authorized(request: NextRequest): boolean {
  const secret = process.env.AIOPERATOR_WEBHOOK_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }
  try {
    const campanas = await listarCampanasConCache();
    return NextResponse.json({ ok: true, dias: 30, campanas });
  } catch (error) {
    console.error("[AI Operator campanas] unexpected:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "error interno" }, { status: 500 });
  }
}
