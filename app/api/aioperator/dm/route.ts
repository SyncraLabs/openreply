import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { sendAiOperatorDm, takeRateLimit } from "@/lib/aioperator-dm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// AI Operator → RodriChat: send one DM to a lead. Same secret as the webhook the
// other way round (AIOPERATOR_WEBHOOK_SECRET).

const bodySchema = z
  .object({
    instagram_id: z.string().trim().min(1).max(64).regex(/^\d+$/),
    texto: z.string().trim().min(1).max(1000).optional(),
    audio_url: z.string().trim().url().max(2000).startsWith("https://").optional(),
  })
  .refine((b) => b.texto || b.audio_url, { message: "texto o audio_url" });

function authorized(request: NextRequest): boolean {
  const secret = process.env.AIOPERATOR_WEBHOOK_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "cuerpo no válido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "cuerpo no válido" }, { status: 400 });
  }

  try {
    if (!(await takeRateLimit())) {
      return NextResponse.json({ ok: false, error: "demasiados envíos, espera un minuto" }, { status: 429 });
    }
    const result = await sendAiOperatorDm({
      instagramId: parsed.data.instagram_id,
      texto: parsed.data.texto,
      audioUrl: parsed.data.audio_url,
    });
    if (result.ok) return NextResponse.json({ ok: true, dmLogId: result.dmLogId });
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  } catch (error) {
    console.error("[AI Operator DM] unexpected:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "error interno" }, { status: 500 });
  }
}
