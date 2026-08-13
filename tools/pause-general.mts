/**
 * Pausa la campaña GENERAL (matchAnyPost) y activa la de "próximo reel".
 *
 * Motivo: en un mismo comentario sólo sale UN private reply, y gana la
 * campaña más antigua, no la más específica. GENERAL es de las primeras, así
 * que tapaba cualquier campaña por vídeo creada después.
 */
import { prisma } from "../lib/db/client.js";

const general = await prisma.automation.updateMany({
  where: { name: "GENERAL", matchAnyPost: true },
  data: { isActive: false },
});

const prueba = await prisma.automation.updateMany({
  where: { pendingNextReel: true },
  data: { isActive: true },
});

console.log(`GENERAL pausada: ${general.count}`);
console.log(`campañas de próximo reel activadas: ${prueba.count}`);

const estado = await prisma.automation.findMany({
  orderBy: { createdAt: "asc" },
  select: { name: true, isActive: true, matchAnyPost: true, pendingNextReel: true },
});
for (const a of estado) {
  const alcance = a.matchAnyPost
    ? "todos los posts"
    : a.pendingNextReel
      ? "próximo reel"
      : "post concreto";
  console.log(`  ${a.isActive ? "ACTIVA " : "pausada"}  ${a.name}  (${alcance})`);
}
await prisma.$disconnect();
