/**
 * Crea la campaña permanente de la palabra EMPIEZO → biblioteca de recursos.
 *
 *   cd ~/openreply && ./tools/ops create-empiezo
 *
 * Idempotente: si ya existe una campaña con ese nombre, no la duplica.
 *
 * Es `matchAnyPost` a propósito, no una campaña por post. El motivo es que
 * `pendingNextReel` NO sirve aquí: `lib/polling/attach-next-reel.ts` filtra por
 * `media_product_type === "REELS"`, así que un carrusel nunca la engancharía y la
 * campaña se quedaría esperando para siempre. Con `matchAnyPost` la palabra funciona
 * desde el minuto uno en el carrusel que se publique hoy y en todo lo que venga
 * después, sin tener que tocar nada cada vez.
 *
 * No choca con GENERAL (matchAnyPost, activa, del 2026-08-09): sus keywords son
 * skill, ia, claude, humano, vender y ventas. "empiezo" no está entre ellas, así que
 * no hay empate y no se aplica el "gana la más antigua". Si algún día se le añade
 * "empiezo" a GENERAL, esta campaña deja de disparar en silencio.
 */
import { prisma } from "../lib/db/client.js";

const NOMBRE = "EMPIEZO — biblioteca de recursos";
const BIBLIOTECA = "https://archivo.syncralabs.es";

const workspace = await prisma.workspace.findFirst({ select: { id: true, name: true } });
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

      // Vale para cualquier post, presente y futuro.
      matchAnyPost: true,
      pendingNextReel: false,

      matchAnyWord: false,
      keywords: ["empiezo"],
      wholeWordMatch: true,

      dmMessage:
        "va 👇\n\n" +
        "no necesitas otro vídeo, necesitas empezar. te dejo la biblioteca entera: " +
        "sistemas, agentes, prompts y plantillas para montar tu agencia.\n\n" +
        `${BIBLIOTECA}\n\n` +
        "es gratis, te creas la cuenta y entras. empieza por Sistemas.\n\n" +
        "y me cuentas qué has hecho esta tarde",
      linkButtonLabel: "Abrir la biblioteca",

      requireFollow: true,
      followPromptMessage:
        "una cosa antes, esto es solo para mi comunidad. dale a seguir y te lo mando",
      followPromptButtonLabel: "te sigo",

      followUpEnabled: true,
      followUpMessage: "qué tal? has abierto algo o sigues viendo vídeos 👀",
      followUpDelayMinutes: 120,

      publicReplyEnabled: true,
      publicReplyMessages: ["Te lo mando por DM", "Mira DM", "Enviadooo"],

      dmTriggerEnabled: true,

      // Se crea pausada; se activa tras comprobar conflictos.
      isActive: false,
    },
    select: { id: true, name: true, keywords: true, matchAnyPost: true, isActive: true },
  });
  console.log("creada (pausada):", creada);
}

await prisma.$disconnect();
