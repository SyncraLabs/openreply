/**
 * Crea la campaña comentario→DM del reel R2 «Claude Code sin límites» (keyword CÓDIGO).
 *
 *   cd ~/openreply && ./tools/ops create-r2-codigo
 *
 * Se crea en BORRADOR: pausada y sin vídeo asignado. Cuando subas el reel, le dices
 * cuál es y ya está:
 *
 *   ./tools/ops posts                                  # ver tus últimas publicaciones
 *   ./tools/ops bind "R2 — Claude Code sin límites" <url-del-reel>
 *   ./tools/ops campaign activate "R2 — Claude Code sin límites"
 *
 * No usa `pendingNextReel` a propósito: ese modo engancha TODAS las campañas pendientes
 * al mismo reel, así que solo puede haber una a la vez. En borrador puede haber las que
 * hagan falta.
 *
 * Las keywords van en las dos formas, con y sin tilde: `stripSpecialCharacters` deja
 * "código" en "c digo" y eso NO casa con "codigo", que es como escribe la mayoría.
 * Verificado con `./tools/ops test-keywords`.
 */
import { prisma } from "../lib/db/client.js";

const NOMBRE = "R2 — Claude Code sin límites";
const RECURSOS = "https://archivo.syncralabs.es/v/ig-r2/claude-code-gratis";

const workspace = await prisma.workspace.findFirst({ select: { id: true } });
if (!workspace) throw new Error("No hay workspace.");
const cuenta = await prisma.instagramAccount.findFirst({
  where: { workspaceId: workspace.id },
  select: { id: true },
});
if (!cuenta) throw new Error("No hay cuenta de Instagram conectada.");

const existente = await prisma.automation.findFirst({
  where: { workspaceId: workspace.id, name: NOMBRE },
  select: { id: true },
});

if (existente) {
  console.log(`Ya existe, no se toca: ${NOMBRE} (${existente.id})`);
} else {
  const creada = await prisma.automation.create({
    data: {
      workspaceId: workspace.id,
      instagramAccountId: cuenta.id,
      name: NOMBRE,
      goal: "El router para usar Claude Code con proveedores baratos",

      // Borrador: sin vídeo. Se asigna con `./tools/ops bind` al publicarlo.
      matchAnyPost: false,
      pendingNextReel: false,
      postId: null,
      postUrl: null,

      matchAnyWord: false,
      keywords: ["CODIGO", "CÓDIGO"],
      wholeWordMatch: true,

      dmMessage:
        "aquí tienes la herramienta del vídeo:\n\n" +
        `${RECURSOS}\n\n` +
        "conectas tus proveedores una vez y se encarga solo. dime si te lía la instalación",
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
    select: { id: true, name: true, keywords: true, isActive: true, pendingNextReel: true },
  });
  console.log("creada (pausada):", creada);
}

await prisma.$disconnect();
