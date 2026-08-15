/**
 * Deja lista y activa la campaña de R1.
 *
 *   cd ~/openreply && ./tools/ops activate-r1
 *
 * El copy pierde la frase «con el enlace de cada una». Mientras `rodri-recursos` no
 * esté desplegado, el enlace corto redirige a la home del archivo, y esa frase sería
 * mentira. Nombrando las cinco skills dentro del propio DM, el mensaje se cumple igual
 * antes y después del deploy, y el enlace mejora solo cuando la página exista.
 *
 * Se activa aunque falte el deploy porque no puede dispararse hasta que Rodrigo
 * publique el reel (está en `pendingNextReel`), y dejarla pausada se arriesga a que se
 * quede así el día del estreno. La red de seguridad existe igual: el reconciliador
 * barre los comentarios de las últimas 72 h, así que activarla tarde tampoco los
 * perdería del todo.
 */
import { prisma } from "../lib/db/client.js";

const NOMBRE = "R1 — 5 skills de Claude Code";
const RECURSOS = "https://archivo.syncralabs.es/v/ig-r1/5-skills-claude-code";

const DM =
  "aquí tienes las 5 skills del vídeo:\n\n" +
  "Find Skills, Superpowers, Claude Mem, Impeccable y Task Observer\n\n" +
  `${RECURSOS}\n\n` +
  "instálalas en ese orden y me cuentas";

const campaña = await prisma.automation.findFirst({
  where: { name: NOMBRE },
  select: { id: true, isActive: true, pendingNextReel: true, keywords: true },
});

if (!campaña) {
  throw new Error(`No existe «${NOMBRE}». Crea antes con create-r1-findskills.`);
}

const actualizada = await prisma.automation.update({
  where: { id: campaña.id },
  data: { dmMessage: DM, isActive: true },
  select: {
    id: true,
    name: true,
    isActive: true,
    pendingNextReel: true,
    keywords: true,
    dmMessage: true,
  },
});

console.log("activada:", {
  ...actualizada,
  dmMessage: actualizada.dmMessage.replace(/\n/g, " ⏎ "),
});

await prisma.$disconnect();
