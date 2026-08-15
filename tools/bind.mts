/**
 * Asigna un vídeo concreto a una campaña que está en borrador.
 *
 *   cd ~/openreply && ./tools/ops bind "R2 — Claude Code sin límites" <url-o-id>
 *
 * Acepta la URL del reel, su shortcode o el ID de media directamente:
 *
 *   ./tools/ops bind "R2 — Claude Code sin límites" https://www.instagram.com/reel/DaXXXX/
 *   ./tools/ops bind "R2 — Claude Code sin límites" 18060131435779392
 *
 * Resuelve el ID real contra la API de Meta —el worker empareja por `postId` y nunca
 * por `postUrl`— y de paso quita `pendingNextReel`, para que la campaña deje de estar
 * esperando a un reel futuro.
 *
 * No la activa. Para eso: ./tools/ops campaign activate "<nombre>"
 */
import { prisma } from "../lib/db/client.js";
import { decryptToken } from "../lib/meta/oauth.js";
import { getUserMedia } from "../lib/meta/client.js";

const [nombre, referencia] = process.argv.slice(2);
if (!nombre || !referencia) {
  console.error('uso: ./tools/ops bind "<nombre de campaña>" <url|shortcode|id>');
  process.exit(1);
}

const campaña = await prisma.automation.findFirst({
  where: { name: nombre },
  select: { id: true, name: true, postId: true, isActive: true },
});
if (!campaña) {
  const todas = await prisma.automation.findMany({ select: { name: true } });
  console.error(`No existe la campaña «${nombre}». Las que hay:`);
  for (const c of todas) console.error(`  - ${c.name}`);
  process.exit(1);
}

const cuenta = await prisma.instagramAccount.findFirst({
  select: { username: true, accessToken: true },
});
if (!cuenta?.accessToken) throw new Error("No hay cuenta conectada con token.");

const media = await getUserMedia(decryptToken(cuenta.accessToken), 50);

// Un ID de media es solo dígitos; lo demás se trata como URL o shortcode.
let elegido = /^\d+$/.test(referencia)
  ? media.find((m) => m.id === referencia)
  : undefined;

if (!elegido) {
  const shortcode = referencia
    .replace(/^https?:\/\/(www\.)?instagram\.com/, "")
    .replace(/^\/(reel|p|tv)\//, "")
    .replace(/[/?#].*$/, "")
    .trim();
  elegido = media.find((m) => m.permalink?.includes(`/${shortcode}`));
}

if (!elegido) {
  console.error(
    `No encuentro «${referencia}» entre tus 50 últimas publicaciones.\n` +
      "Míralas con: ./tools/ops posts 50"
  );
  process.exit(1);
}

const actualizada = await prisma.automation.update({
  where: { id: campaña.id },
  data: {
    postId: elegido.id,
    postUrl: elegido.permalink ?? null,
    pendingNextReel: false,
    matchAnyPost: false,
  },
  select: { name: true, postId: true, postUrl: true, isActive: true },
});

console.log("asignada:", actualizada);
if (!actualizada.isActive) {
  console.log(`\nSigue en pausa. Para activarla:`);
  console.log(`  ./tools/ops campaign activate "${actualizada.name}"`);
}

await prisma.$disconnect();
