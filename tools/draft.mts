/**
 * Deja una campaña en BORRADOR: pausada, sin vídeo y sin reserva del próximo reel.
 *
 *   cd ~/openreply && ./tools/ops draft "R1 — 5 skills de Claude Code"
 *
 * Es el estado en el que conviene tener las campañas escritas por adelantado. Luego,
 * al publicar el vídeo:
 *
 *   ./tools/ops posts
 *   ./tools/ops bind "<nombre>" <url-del-reel>
 *   ./tools/ops campaign activate "<nombre>"
 *
 * Preferible a `pendingNextReel` por dos motivos: solo puede haber una campaña
 * esperando a la vez —el cron engancha todas las pendientes al mismo reel— y si se
 * publica cualquier otra cosa antes, la campaña se ata al vídeo equivocado sin avisar.
 */
import { prisma } from "../lib/db/client.js";

const nombre = process.argv[2];
if (!nombre) {
  console.error('uso: ./tools/ops draft "<nombre de campaña>"');
  process.exit(1);
}

const campaña = await prisma.automation.findFirst({
  where: { name: nombre },
  select: {
    id: true,
    name: true,
    isActive: true,
    pendingNextReel: true,
    postId: true,
  },
});
if (!campaña) {
  console.error(`No existe la campaña «${nombre}».`);
  process.exit(1);
}

console.log("antes:", campaña);
const actualizada = await prisma.automation.update({
  where: { id: campaña.id },
  data: { pendingNextReel: false, postId: null, postUrl: null, isActive: false },
  select: {
    name: true,
    isActive: true,
    pendingNextReel: true,
    postId: true,
    keywords: true,
  },
});
console.log("después:", actualizada);

await prisma.$disconnect();
