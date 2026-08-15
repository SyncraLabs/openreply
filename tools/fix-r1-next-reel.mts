/**
 * Ata la campaña de R1 al PRÓXIMO reel publicado, no a uno antiguo.
 *
 *   cd ~/openreply && ./tools/ops fix-r1-next-reel
 *
 * Por qué: se creó apuntando a `https://www.instagram.com/reel/DaN0yYtPzjY/`, que es el
 * reel que Rodrigo publicó en su día, no el montaje nuevo que va a subir. Y además el
 * worker empareja por `postId`, nunca por `postUrl` (`dm-worker.ts`:
 * `OR: [{ postId: mediaId }, { matchAnyPost: true }]`), así que con solo la URL la
 * campaña no habría disparado nunca.
 *
 * Con `pendingNextReel` el cron `attach-next-reel` la engancha sola al primer reel
 * publicado después de crearla, y le rellena `postId` y `postUrl`. Ese cron no filtra
 * por `isActive`, así que funciona con la campaña en pausa.
 */
import { prisma } from "../lib/db/client.js";

const NOMBRE = "R1 — 5 skills de Claude Code";

const campaña = await prisma.automation.findFirst({
  where: { name: NOMBRE },
  select: { id: true, postId: true, postUrl: true, pendingNextReel: true },
});

if (!campaña) {
  console.log(`No existe la campaña «${NOMBRE}».`);
} else {
  console.log("antes:", campaña);
  const actualizada = await prisma.automation.update({
    where: { id: campaña.id },
    data: {
      pendingNextReel: true,
      matchAnyPost: false,
      postId: null,
      postUrl: null,
    },
    select: {
      id: true,
      name: true,
      pendingNextReel: true,
      postId: true,
      postUrl: true,
      isActive: true,
      keywords: true,
    },
  });
  console.log("después:", actualizada);
}

await prisma.$disconnect();
