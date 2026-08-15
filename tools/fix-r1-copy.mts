/**
 * Corrige el copy del DM de R1. NO activa nada: la campaña sigue como esté.
 *
 *   cd ~/openreply && ./tools/ops fix-r1-copy
 *
 * Quita la frase «con el enlace de cada una». Mientras `rodri-recursos` no esté
 * desplegado, el enlace corto redirige a la home del archivo y esa frase no se cumple.
 * Nombrando las cinco skills dentro del propio DM, el mensaje es cierto antes y después
 * del deploy, y el enlace mejora solo cuando la página exista.
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
  select: { id: true, isActive: true },
});

if (!campaña) {
  throw new Error(`No existe «${NOMBRE}».`);
}

const actualizada = await prisma.automation.update({
  where: { id: campaña.id },
  data: { dmMessage: DM },
  select: { id: true, name: true, isActive: true, dmMessage: true },
});

console.log("copy actualizado. isActive sigue en:", actualizada.isActive);
console.log("---");
console.log(actualizada.dmMessage);

await prisma.$disconnect();
