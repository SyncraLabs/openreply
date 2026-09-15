/**
 * Crea la campaña permanente de la palabra SISTEMA → biblioteca de recursos.
 *
 *   cd ~/openreply && ./tools/ops create-sistema
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
 * skill, ia, claude, humano, vender y ventas. "sistema" no está entre ellas, así que
 * no hay empate y no se aplica el "gana la más antigua". Si algún día se le añade
 * "sistema" a GENERAL, esta campaña deja de disparar en silencio.
 */
import { prisma } from "../lib/db/client.js";

const NOMBRE = "SISTEMA — sistemas para vender";
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
      keywords: ["sistema"],
      wholeWordMatch: true,

      dmMessage:
        "va 👇\n\n" +
        "los sistemas que sí uso para conseguir clientes y entregar están en la biblioteca, " +
        "en la sección Sistemas. sin montar nada de más.\n\n" +
        `${BIBLIOTECA}\n\n` +
        "es gratis, te creas la cuenta y entras.\n\n" +
        "y si estás montando sistemas para todo, para. primero vende uno",
      linkButtonLabel: "Abrir la biblioteca",

      requireFollow: true,
      followPromptMessage:
        "una cosa antes, esto es solo para mi comunidad. dale a seguir y te lo mando",
      followPromptButtonLabel: "te sigo",

      followUpEnabled: true,
      followUpMessage: "has abierto Sistemas? dime cuál vas a usar primero",
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
