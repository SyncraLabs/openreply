import { prisma } from "../lib/db/client.js";

/**
 * Campañas comentario→DM de los reels editados en VIDEO STUDIO (tanda Nick).
 *
 * Se crean PAUSADAS a propósito, por dos motivos:
 *
 * 1. Las páginas de recurso viven en `rodri-recursos` y todavía NO están desplegadas.
 *    Activar antes del deploy = mandar DMs con un enlace que da 404.
 * 2. La campaña GENERAL (2026-08-09) es `matchAnyPost` y lleva "claude" entre sus
 *    keywords. Meta permite UN solo private reply por comentario y gana la campaña
 *    MÁS ANTIGUA, así que GENERAL se comería el DM de R1 (keyword CLAUDE) y el
 *    usuario recibiría el enlace genérico en vez de la página de las 5 skills.
 *    Además saldrían DOS respuestas públicas.
 *
 * Antes de activar R1 hay que quitar "claude" de las keywords de GENERAL:
 *   npx tsx tools/fix-general-keywords.mts
 *
 * Uso:
 *   cd ~/openreply
 *   DATABASE_URL="<url pública de Railway>" npx tsx tools/create-reels-campaigns.mts
 */

const WORKSPACE_ID = "cmslqbntw000104kvxsotaf17";
const IG_ACCOUNT_ID = "cmslqda9l000404kv76a8n701";

const BASE = "https://archivo.syncralabs.es";

type Reel = {
  name: string;
  goal: string;
  keyword: string;
  postUrl: string;
  dmMessage: string;
  publicReplyMessages: string[];
};

const REELS: Reel[] = [
  {
    name: "R1 — 5 skills de Claude Code",
    goal: "Las 5 skills del reel",
    keyword: "CLAUDE",
    postUrl: "https://www.instagram.com/reel/DaN0yYtPzjY/",
    dmMessage:
      "aquí tienes las 5 skills del vídeo, con el enlace de cada una:\n\n" +
      "Find Skills, Superpowers, Claude Mem, Impeccable y Task Observer\n\n" +
      `${BASE}/v/ig-r1/5-skills-claude-code\n\n` +
      "instálalas en este orden y me cuentas",
    publicReplyMessages: ["Enviadooo", "Lo tienesss", "Mira DM"],
  },
  {
    name: "R2 — Claude Code sin límites",
    goal: "Router para usar Claude Code con proveedores baratos",
    keyword: "CÓDIGO",
    postUrl: "https://www.instagram.com/reel/DaQIJHnP6zn/",
    dmMessage:
      "aquí tienes la herramienta del vídeo y cómo instalarla:\n\n" +
      `${BASE}/v/ig-r2/claude-code-gratis\n\n` +
      "conectas tus proveedores una vez y se encarga solo",
    publicReplyMessages: ["Enviadooo", "Lo tienesss", "Mira DM"],
  },
  {
    name: "R4 — +1.400 APIs gratis",
    goal: "Repositorio de APIs públicas",
    keyword: "API",
    postUrl: "https://www.instagram.com/reel/DaYDKRKyOl9/",
    dmMessage:
      "aquí tienes el repositorio de APIs gratis del vídeo:\n\n" +
      `${BASE}/v/ig-r4/1400-apis-gratis\n\n` +
      "están por categorías, mira las de finanzas y deportes",
    publicReplyMessages: ["Enviadooo", "Lo tienesss", "Mira DM"],
  },
];

for (const reel of REELS) {
  const existing = await prisma.automation.findFirst({
    where: { workspaceId: WORKSPACE_ID, name: reel.name },
    select: { id: true },
  });
  if (existing) {
    console.log(`ya existe, no se toca: ${reel.name} (${existing.id})`);
    continue;
  }

  const created = await prisma.automation.create({
    data: {
      workspaceId: WORKSPACE_ID,
      instagramAccountId: IG_ACCOUNT_ID,
      name: reel.name,
      goal: reel.goal,

      // Atada a su reel concreto, no a todos los posts.
      matchAnyPost: false,
      pendingNextReel: false,
      postUrl: reel.postUrl,

      // Palabra clave del CTA, no cualquier comentario.
      matchAnyWord: false,
      keywords: [reel.keyword],
      wholeWordMatch: true,

      dmMessage: reel.dmMessage,
      linkButtonLabel: "Ábrelo",

      requireFollow: true,
      followPromptMessage:
        "una cosa antes, esto es solo para mi comunidad. dale a seguir y te lo mando",
      followPromptButtonLabel: "te sigo",

      followUpEnabled: true,
      followUpMessage: "qué tal?? le echaste un ojo?",
      followUpDelayMinutes: 120,

      publicReplyEnabled: true,
      publicReplyMessages: reel.publicReplyMessages,

      dmTriggerEnabled: true,

      // Pausada: ver la cabecera del fichero.
      isActive: false,
    },
    select: { id: true, name: true, keywords: true, isActive: true },
  });

  console.log("creada (pausada):", created);
}

await prisma.$disconnect();
