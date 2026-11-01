import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { getRedisConnection } from "./client";
import type { SetterConfig } from "@/lib/sequence";

// AI setter: instead of a fixed sequence, Claude reads the conversation and
// answers each reply in the account owner's voice (Automation.sequence.setter).
// State lives in Redis next to the queue and expires with Instagram's window.
// It goes quiet ("paused") as soon as the owner writes by hand or it hands off.

const TTL_SECONDS = 48 * 60 * 60;
const MODEL = "claude-opus-5-5";
// Hard stop on spend: calls per account per day, whatever the traffic does.
const DAILY_CALL_LIMIT = 500;

export interface SetterTurn {
  from: "tu" | "lead";
  text: string;
  at: number;
}

export interface SetterState {
  automationId: string;
  commenterName: string | null;
  status: "active" | "paused";
  replies: number;
  turns: SetterTurn[];
}

const metaKey = (account: string, user: string) => `setter:meta:${account}:${user}`;
const turnsKey = (account: string, user: string) => `setter:turns:${account}:${user}`;

/** Open a setter conversation after the private reply went out. */
export async function startSetter(
  account: string,
  user: string,
  automationId: string,
  commenterName: string | null,
  opener: string
) {
  const meta = metaKey(account, user);
  const turns = turnsKey(account, user);
  await getRedisConnection()
    .multi()
    .del(meta, turns)
    .hset(meta, { automationId, commenterName: commenterName ?? "", status: "active", replies: 0 })
    .rpush(turns, JSON.stringify({ from: "tu", text: opener, at: Date.now() }))
    .expire(meta, TTL_SECONDS)
    .expire(turns, TTL_SECONDS)
    .exec();
}

export async function getSetter(account: string, user: string): Promise<SetterState | null> {
  const redis = getRedisConnection();
  const meta = await redis.hgetall(metaKey(account, user));
  if (!meta.automationId) return null;
  const turns = await redis.lrange(turnsKey(account, user), 0, -1);
  return {
    automationId: meta.automationId,
    commenterName: meta.commenterName || null,
    status: meta.status === "paused" ? "paused" : "active",
    replies: Number(meta.replies) || 0,
    turns: turns.map((t) => JSON.parse(t) as SetterTurn),
  };
}

export async function addSetterTurn(account: string, user: string, from: SetterTurn["from"], text: string) {
  const key = turnsKey(account, user);
  await getRedisConnection()
    .multi()
    .rpush(key, JSON.stringify({ from, text: text.slice(0, 2000), at: Date.now() }))
    .ltrim(key, -60, -1)
    .expire(key, TTL_SECONDS)
    .expire(metaKey(account, user), TTL_SECONDS)
    .exec();
}

export async function pauseSetter(account: string, user: string) {
  await getRedisConnection().hset(metaKey(account, user), "status", "paused");
}

/** Count one more AI turn; returns the new count. */
export async function countSetterReply(account: string, user: string): Promise<number> {
  return getRedisConnection().hincrby(metaKey(account, user), "replies", 1);
}

/** Whether this account still has AI calls left today. */
export async function takeDailyCall(account: string): Promise<boolean> {
  const key = `setter:calls:${account}:${new Date().toISOString().slice(0, 10)}`;
  const redis = getRedisConnection();
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 2 * 24 * 60 * 60);
  return n <= DAILY_CALL_LIMIT;
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

/** An echo is ours if we sent that exact text in this conversation. */
export function isOwnEcho(turns: SetterTurn[], text: string): boolean {
  const echo = normalize(text);
  return turns.some((t) => t.from === "tu" && normalize(t.text) === echo);
}

/**
 * The account sent a message to this person. If it isn't one the setter sent,
 * the owner is writing by hand: the setter stops so they never talk over each
 * other. Returns whether it paused.
 */
export async function noteOwnerMessage(account: string, user: string, text: string): Promise<boolean> {
  const state = await getSetter(account, user);
  if (!state || state.status !== "active") return false;
  // Before they answer, the only thing going out is the private reply itself.
  if (!state.turns.some((t) => t.from === "lead")) return false;
  if (text && isOwnEcho(state.turns, text)) return false;
  await pauseSetter(account, user);
  await addSetterTurn(account, user, "tu", text || "(audio o archivo)");
  return true;
}

// ─── The model ──────────────────────────────────────────────────────────────

export const SETTER_NEXT = ["seguir", "agenda", "skool", "syncra", "humano"] as const;

const replySchema = z.object({
  mensajes: z.array(z.string()).max(3),
  siguiente: z.enum(SETTER_NEXT),
  motivo: z.string(),
});

export type SetterReply = z.infer<typeof replySchema>;

const RULES = `Eres Rodrigo y contestas tú mismo los mensajes directos de Instagram de gente que ha comentado en uno de tus vídeos. Escribes como Rodrigo, en primera persona, y nunca dices ni das a entender que eres una IA, un bot o un equipo.

Cómo escribes:
- Como en un chat con alguien, con prisa: minúsculas, frases cortas, sin saludos ni despedidas.
- Uno o dos mensajes por turno, casi nunca tres. A veces basta con una palabra («top», «vale», «dale») y luego la pregunta.
- Una sola pregunta por turno.
- A veces «??» en vez de «?», a veces «tio», «y tal», «la verdad». Sin pasarte, que no se note.
- Sin emojis, salvo alguno suelto muy de vez en cuando. Sin rayas largas, listas, negritas ni exclamaciones.
- Nada de frases de vendedor o de coach («increíble oportunidad», «no es X, es Y», «transforma», «desbloquea», «te entiendo perfectamente»). Si algo suena a plantilla, dilo más normal.
- Contestas a lo que te ha dicho de verdad, con sus palabras. Si te cuenta algo personal, lo reconoces en pocas palabras antes de seguir.
- No repites preguntas que ya ha contestado y no haces un interrogatorio.

Lo que buscas en la conversación, en este orden, sin prisas pero sin enrollarte:
1. Qué hace ahora y en qué punto está.
2. Qué quiere conseguir y para cuándo.
3. Si estaría en posición de invertir en ello ahora si ve que encaja. Lo preguntas directo, una vez, cuando ya sabes lo anterior.

Con eso eliges "siguiente":
- "seguir": todavía te falta algo de lo de arriba, o la conversación sigue después de haber pasado un enlace.
- "agenda": puede y quiere invertir ahora. Le pasas {agenda} para una llamada de 30 min y le dices que lo veis ahí.
- "skool": ahora no puede invertir, o está empezando sin prisa. Le pasas {skool} y, si le sirve, el curso gratis {curso}. Sin hacerle sentir mal.
- "syncra": tiene un negocio propio y lo que quiere es meter IA en él, no montar un negocio de IA. Le preguntas a qué se dedica y qué le come más tiempo, y le dices que eso lo hacéis desde Syncra, tu consultora de IA.
- "humano": no sabes qué contestar sin inventar; te preguntan el precio, condiciones, garantías o algo que no está aquí; se queja o está molesto; pide hablar por otro lado; pregunta si eres un bot; o la conversación se pone rara. Deja "mensajes" vacío y Rodrigo lo sigue a mano.

Nunca te inventas datos, precios, resultados de alumnos, plazos ni promesas. Lo que no está en este texto no lo dices.
Los enlaces solo los escribes con su marcador entre llaves (por ejemplo {agenda}), nunca la URL.
"motivo" es una frase para Rodrigo explicando por qué has elegido "siguiente".`;

let client: Anthropic | null = null;

/** Ask Claude for the next turn. Null when it can't answer (refusal, bad output). */
export async function askSetter(
  config: SetterConfig,
  turns: SetterTurn[],
  commenterName: string | null
): Promise<SetterReply | null> {
  client ??= new Anthropic();
  const markers = Object.keys(config.links).map((k) => `{${k}}`).join(", ") || "ninguno";
  const transcript = turns.map((t) => `[${t.from === "tu" ? "tú" : "lead"}] ${t.text}`).join("\n");
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: `${RULES}\n\nMarcadores de enlace disponibles: ${markers}.\n\n# Quién eres y qué ofreces\n\n${config.brief}`,
    messages: [
      {
        role: "user",
        content: `Conversación por DM${commenterName ? ` con ${commenterName}` : ""}, de la más antigua a la más reciente:\n\n${transcript}\n\nDecide qué le contestas ahora.`,
      },
    ],
    output_config: { effort: "low", format: betaZodOutputFormat(replySchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (response.stop_reason === "refusal") return null;
  return response.parsed_output ?? null;
}

/**
 * Swap link markers for their URLs. Null if a message carries a marker or a
 * URL the config doesn't have: never send a link the owner didn't give.
 */
export function renderSetterMessages(messages: string[], links: Record<string, string>): string[] | null {
  const allowed = new Set(Object.values(links));
  const out: string[] = [];
  for (const raw of messages) {
    let unknown = false;
    const text = raw
      .replace(/\{([a-z]+)\}/g, (_, name: string) => {
        if (!links[name]) unknown = true;
        return links[name] ?? "";
      })
      .trim();
    if (unknown) return null;
    const urls = text.match(/https?:\/\/\S+/g) ?? [];
    if (urls.some((u) => !allowed.has(u.replace(/[.,;:!?)]+$/, "")))) return null;
    if (text) out.push(text);
  }
  return out;
}
