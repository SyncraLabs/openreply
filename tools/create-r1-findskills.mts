/**
 * Crea la campaña comentario→DM del reel R1 «5 skills de Claude Code» (keyword CLAUDE).
 *
 *   cd ~/openreply && ./tools/ops create-r1-findskills
 *
 * Idempotente: si ya existe una campaña con ese nombre, no la duplica.
 *
 * Se crea PAUSADA a propósito. Antes de activarla hay que resolver el choque con la
 * campaña GENERAL: es `matchAnyPost`, está activa, se creó el 2026-08-09 y lleva
 * "claude" entre sus keywords. Meta concede un único private reply por comentario y
 * el worker resuelve el empate por `createdAt asc`, así que GENERAL ganaría siempre
 * y quien comentase CLAUDE recibiría el DM genérico en vez de la página del reel,
 * además de ver dos respuestas públicas.
 *
 *   ./tools/ops campaign conflicts        # confirmar el choque
 *   ./tools/ops fix-general-keywords      # quitar "claude" de GENERAL
 *   ./tools/ops campaign activate "R1 — 5 skills de Claude Code"
 */
import { prisma } from "../lib/db/client.js";

const NOMBRE = "R1 — 5 skills de Claude Code";
const POST_URL = "https://www.instagram.com/reel/DaN0yYtPzjY/";
const RECURSOS = "https://archivo.syncralabs.es/v/ig-r1/5-skills-claude-code";

const workspace = await prisma.workspace.findFirst({
  select: { id: true, name: true },
});
if (!workspace) throw new Error("No hay workspace en la base de datos.");

const cuenta = await prisma.instagramAccount.findFirst({
  where: { workspaceId: workspace.id },
  select: { id: true, username: true },
});
if (!cuenta) throw new Error("No hay cuenta de Instagram conectada.");

const existente = await prisma.automation.findFirst({
  where: { workspaceId: workspace.id, name: NOMBRE },
  select: { id: true, isActive: true },
});
if (existente) {
  console.log(`Ya existe, no se toca: ${NOMBRE} (${existente.id})`);
} else {
  const creada = await prisma.automation.create({
    data: {
      workspaceId: workspace.id,
      instagramAccountId: cuenta.id,
      name: NOMBRE,
      goal: "Las 5 skills del reel",

      // Atada a este reel, no a todos los posts.
      matchAnyPost: false,
      pendingNextReel: false,
      postUrl: POST_URL,

      // Solo la palabra del CTA.
      matchAnyWord: false,
      keywords: ["CLAUDE"],
      wholeWordMatch: true,

      dmMessage:
        "aquí tienes las 5 skills del vídeo, con el enlace de cada una:\n\n" +
        "Find Skills, Superpowers, Claude Mem, Impeccable y Task Observer\n\n" +
        `${RECURSOS}\n\n` +
        "instálalas en ese orden y me cuentas",
      linkButtonLabel: "Ábrelo",

      requireFollow: true,
      followPromptMessage:
        "una cosa antes, esto es solo para mi comunidad. dale a seguir y te lo mando",
      followPromptButtonLabel: "te sigo",

      followUpEnabled: true,
      followUpMessage: "qué tal?? le echaste un ojo?",
      followUpDelayMinutes: 120,

      publicReplyEnabled: true,
      publicReplyMessages: ["Enviadooo", "Lo tienesss", "Mira DM"],

      dmTriggerEnabled: true,

      isActive: false,
    },
    select: { id: true, name: true, keywords: true, isActive: true, postUrl: true },
  });
  console.log("creada (pausada):", creada);
}

await prisma.$disconnect();
