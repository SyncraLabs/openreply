/**
 * Saca «PRUEBA — próximo reel» de la cola del próximo reel.
 *
 *   cd ~/openreply && ./tools/ops neutralize-prueba
 *
 * Está pausada, así que no manda nada, pero tiene `pendingNextReel: true` y el cron
 * `attach-next-reel` no filtra por `isActive`: se engancharía al mismo reel que la
 * campaña de R1. Como es más antigua y además hace match con cualquier palabra, el día
 * que alguien la activara por error se llevaría todos los comentarios de ese reel.
 *
 * No se borra —es historial— solo se le quita la reserva.
 */
import { prisma } from "../lib/db/client.js";

const NOMBRE = "PRUEBA — próximo reel";

const campaña = await prisma.automation.findFirst({
  where: { name: NOMBRE },
  select: { id: true, isActive: true, pendingNextReel: true, postId: true },
});

if (!campaña) {
  console.log(`No existe «${NOMBRE}».`);
} else if (!campaña.pendingNextReel) {
  console.log("Ya no está esperando reel. Nada que hacer.");
} else {
  console.log("antes:", campaña);
  const actualizada = await prisma.automation.update({
    where: { id: campaña.id },
    data: { pendingNextReel: false },
    select: { id: true, name: true, pendingNextReel: true, isActive: true },
  });
  console.log("después:", actualizada);
}

await prisma.$disconnect();
