import { prisma } from "@/lib/db/client";

// Sends what happens in a DM conversation to AI Operator (the sales site), so
// every lead gets a card there: who they are, what they pressed, what they
// answered. Redis forgets free text after 48 h and SequenceChoice only keeps the
// button, so without this there is no lead record.
//
// FIRE AND FORGET. Never awaited by the callers and never throws: the DM must
// go out whether or not AI Operator is up. 5 s timeout, a log line if it fails.
// Off unless AIOPERATOR_WEBHOOK_URL and AIOPERATOR_WEBHOOK_SECRET are set.

const TIMEOUT_MS = 5000;

export type AiOperatorEventType = "boton" | "texto" | "enlace";

/** The JSON body AI Operator expects at POST /api/leads/rodrichat. */
export interface AiOperatorPayload {
  evento: AiOperatorEventType;
  instagram_id: string;
  instagram?: string;
  nombre?: string;
  campana?: string;
  palabra_clave?: string;
  post_id?: string;
  boton_clave?: string;
  boton_texto?: string;
  cualificado?: boolean;
  texto?: string;
  fecha: string;
}

export interface AiOperatorEventInput {
  evento: AiOperatorEventType;
  /** Instagram-scoped user id (DmLog.commenterId). */
  userId: string;
  automationId: string;
  buttonKey?: string;
  buttonText?: string;
  qualified?: boolean;
  text?: string;
}

interface Context {
  campaign?: string | null;
  keyword?: string | null;
  postId?: string | null;
  username?: string | null;
}

/** Pure: shape the payload, dropping what is empty. */
export function buildAiOperatorPayload(
  input: AiOperatorEventInput,
  ctx: Context,
  now: Date = new Date()
): AiOperatorPayload {
  const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : undefined);
  const username = clean(ctx.username)?.replace(/^@/, "");
  return {
    evento: input.evento,
    instagram_id: input.userId,
    instagram: username,
    nombre: username,
    campana: clean(ctx.campaign),
    palabra_clave: clean(ctx.keyword),
    post_id: clean(ctx.postId),
    boton_clave: input.buttonKey,
    boton_texto: input.buttonText,
    cualificado: input.qualified,
    texto: input.text ? input.text.slice(0, 2000) : undefined,
    fecha: now.toISOString(),
  };
}

export function aiOperatorWebhookConfigured(): boolean {
  return Boolean(process.env.AIOPERATOR_WEBHOOK_URL && process.env.AIOPERATOR_WEBHOOK_SECRET);
}

async function send(input: AiOperatorEventInput): Promise<void> {
  const url = process.env.AIOPERATOR_WEBHOOK_URL;
  const secret = process.env.AIOPERATOR_WEBHOOK_SECRET;
  if (!url || !secret) return;

  const [automation, log] = await Promise.all([
    prisma.automation.findUnique({
      where: { id: input.automationId },
      select: { name: true, keywords: true, postId: true },
    }),
    prisma.dmLog.findFirst({
      where: { automationId: input.automationId, commenterId: input.userId },
      orderBy: { createdAt: "asc" },
      select: { commenterName: true, matchedKeyword: true },
    }),
  ]);

  const body = buildAiOperatorPayload(input, {
    campaign: automation?.name,
    keyword: log?.matchedKeyword ?? automation?.keywords?.[0],
    postId: automation?.postId,
    username: log?.commenterName,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    console.error(`[AI Operator] ${input.evento} for ${input.userId}: HTTP ${response.status}`);
  }
}

/** Queue an event for AI Operator. Returns at once; failures only log. */
export function notifyAiOperator(input: AiOperatorEventInput): void {
  if (!aiOperatorWebhookConfigured()) return;
  send(input).catch((error) => {
    console.error(
      `[AI Operator] ${input.evento} for ${input.userId} not sent:`,
      error instanceof Error ? error.message : error
    );
  });
}
