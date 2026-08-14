/**
 * Crea la campaña comentario→DM del carrusel «Los 5 niveles vendiendo IA».
 *
 *   cd ~/openreply && ./tools/ops create-c1-5-niveles <url-del-carrusel>
 *
 * Idempotente: si ya existe una campaña con ese nombre, no la duplica.
 *
 * El CTA del carrusel es "comenta tu número", así que las keywords son 1-5. El DM es
 * el MISMO para los cinco: OpenReply no ramifica por keyword, y crear cinco campañas
 * no sirve porque Meta concede un único private reply por comentario y el worker
 * resuelve el empate por `createdAt asc` — dispararía siempre la más antigua.
 *
 * Se crea PAUSADA. Antes de activarla:
 *   ./tools/ops campaign conflicts     # ¿hay una matchAnyPost más antigua que la tape?
 *   ./tools/ops campaign activate "C1 — Los 5 niveles vendiendo IA"
 */
import { prisma } from "../lib/db/client.js";

const NOMBRE = "C1 — Los 5 niveles vendiendo IA";
const BIBLIOTECA = "https://archivo.syncralabs.es";

const POST_URL = process.argv[2];
if (!POST_URL || !POST_URL.startsWith("https://www.instagram.com/")) {
  console.error("Falta la URL del carrusel ya publicado.");
  console.error("  ./tools/ops create-c1-5-niveles https://www.instagram.com/p/XXXX/");
  process.exit(1);
}

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
      goal: "Biblioteca de recursos para montar la agencia",

      // Atada a este carrusel, no a todos los posts.
      matchAnyPost: false,
      pendingNextReel: false,
      postUrl: POST_URL,

      // El CTA pide el número del nivel en el que está cada uno.
      matchAnyWord: false,
      keywords: ["1", "2", "3", "4", "5"],
      wholeWordMatch: true,

      dmMessage:
        "gracias por decirme tu nivel 👇\n\n" +
        "el salto que de verdad cambia las cosas es del 2 al 3: dejar de montar " +
        "sistemas y salir a vender.\n\n" +
        "te dejo la biblioteca entera, sistemas, agentes, prompts y plantillas:\n\n" +
        `${BIBLIOTECA}\n\n` +
        "es gratis, te creas la cuenta y entras",
      linkButtonLabel: "Abrir la biblioteca",

      requireFollow: true,
      followPromptMessage:
        "una cosa antes, esto es solo para mi comunidad. dale a seguir y te lo mando",
      followPromptButtonLabel: "te sigo",

      followUpEnabled: true,
      followUpMessage: "le echaste un ojo? dime en qué te has atascado",
      followUpDelayMinutes: 120,

      publicReplyEnabled: true,
      publicReplyMessages: ["Te contesto por DM", "Mira DM", "Enviadooo"],

      dmTriggerEnabled: true,

      isActive: false,
    },
    select: { id: true, name: true, keywords: true, isActive: true, postUrl: true },
  });
  console.log("creada (pausada):", creada);
}

await prisma.$disconnect();
