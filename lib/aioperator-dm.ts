import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { getRedisConnection } from "@/lib/queue/client";
import { getLastInbound } from "@/lib/queue/conversation";
import { decryptToken } from "@/lib/meta/oauth";
import { MetaApiError, sendDirectMessage, sendDirectMessageAttachment } from "@/lib/meta/client";

// Lets AI Operator (the CRM) send a DM to a lead through the same Instagram
// account that talked to them. Called from POST /api/aioperator/dm.
//
// Meta's rule: you may write to someone for 24 h after THEIR last message. Up to
// 7 days after it, the HUMAN_AGENT tag still allows a reply written by a person.
// Beyond that nothing can be sent from the API.

const HOUR = 60 * 60 * 1000;
export const STANDARD_WINDOW_MS = 24 * HOUR;
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * HOUR;
export const OUT_OF_WINDOW_MESSAGE = "fuera de ventana: escríbele desde la app de Instagram";
export const ORIGIN = "aioperator";

const RATE_LIMIT_PER_MINUTE = 20;

export type WindowMode = "standard" | "human_agent" | null;

/** Pure: which kind of send is allowed given their last message. */
export function windowMode(lastInbound: number | null, now = Date.now()): WindowMode {
  if (lastInbound === null) return null;
  const age = now - lastInbound;
  if (age <= STANDARD_WINDOW_MS) return "standard";
  if (age <= HUMAN_AGENT_WINDOW_MS) return "human_agent";
  return null;
}

/** Simple fixed-window limiter: true while under the cap for this minute. */
export async function takeRateLimit(now = Date.now()): Promise<boolean> {
  const key = `aioperator:dm:${Math.floor(now / 60000)}`;
  const redis = getRedisConnection();
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 120);
  return n <= RATE_LIMIT_PER_MINUTE;
}

export type SendResult =
  | { ok: true; dmLogId: string }
  | { ok: false; status: 404 | 409 | 500; error: string };

export interface SendInput {
  instagramId: string;
  texto?: string;
  audioUrl?: string;
}

export async function sendAiOperatorDm(input: SendInput): Promise<SendResult> {
  const { instagramId, texto, audioUrl } = input;

  // The latest conversation we have with this person tells us which account and
  // campaign to log against.
  const last = await prisma.dmLog.findFirst({
    where: { commenterId: instagramId },
    orderBy: { createdAt: "desc" },
    include: { instagramAccount: true },
  });
  if (!last || !last.instagramAccount.accessToken) {
    return { ok: false, status: 404, error: "contacto desconocido" };
  }
  const account = last.instagramAccount;

  // Their last message: free text (Redis, 48 h) or a button press (database).
  const [inboundText, choice] = await Promise.all([
    getLastInbound(account.instagramId, instagramId).catch(() => null),
    prisma.sequenceChoice.findFirst({
      where: { workspaceId: account.workspaceId, userId: instagramId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
  ]);
  const lastInbound = Math.max(inboundText ?? 0, choice?.updatedAt.getTime() ?? 0) || null;
  const mode = windowMode(lastInbound);
  if (!mode) return { ok: false, status: 409, error: OUT_OF_WINDOW_MESSAGE };

  let accessToken: string;
  try {
    accessToken = decryptToken(account.accessToken);
  } catch {
    console.error("[AI Operator DM] could not decrypt the account token");
    return { ok: false, status: 500, error: "error interno" };
  }
  const tag = mode === "human_agent" ? ("HUMAN_AGENT" as const) : undefined;

  const record = (status: "SENT" | "FAILED", errorMessage?: string) =>
    prisma.dmLog.create({
      data: {
        workspaceId: last.workspaceId,
        automationId: last.automationId,
        instagramAccountId: account.id,
        commenterId: instagramId,
        commenterName: last.commenterName,
        commentText: [texto, audioUrl ? `(audio) ${audioUrl}` : null].filter(Boolean).join("\n").slice(0, 2000),
        commentId: `${ORIGIN}:${randomUUID()}`,
        matchedKeyword: ORIGIN,
        status,
        attempts: 1,
        dmSentAt: status === "SENT" ? new Date() : null,
        errorMessage: errorMessage?.slice(0, 500),
      },
      select: { id: true },
    });

  try {
    if (texto) await sendDirectMessage(accessToken, account.instagramId, instagramId, texto, tag);
    if (audioUrl) {
      await sendDirectMessageAttachment(accessToken, account.instagramId, instagramId, "audio", audioUrl, tag);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[AI Operator DM] send to ${instagramId} failed:`, detail);
    await record("FAILED", detail).catch(() => undefined);
    // 10 / 2534022: Meta says the window is closed even though our clock said open.
    if (error instanceof MetaApiError && error.code === 10 && error.subcode === 2534022) {
      return { ok: false, status: 409, error: OUT_OF_WINDOW_MESSAGE };
    }
    return { ok: false, status: 500, error: "no se pudo enviar" };
  }

  const log = await record("SENT");
  return { ok: true, dmLogId: log.id };
}
