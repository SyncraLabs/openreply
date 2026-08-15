/**
 * Lista tus últimas publicaciones con su ID, para asignárselas a una campaña.
 *
 *   cd ~/openreply && ./tools/ops posts          # las 15 últimas
 *   cd ~/openreply && ./tools/ops posts 30       # las 30 últimas
 *
 * Solo lectura. El ID que imprime es el que consume `./tools/ops bind`.
 */
import { prisma } from "../lib/db/client.js";
import { decryptToken } from "../lib/meta/oauth.js";
import { getUserMedia } from "../lib/meta/client.js";

const limite = Number(process.argv[2] ?? 15);

const cuenta = await prisma.instagramAccount.findFirst({
  select: { id: true, username: true, accessToken: true },
});
if (!cuenta?.accessToken) {
  throw new Error("No hay cuenta de Instagram conectada con token.");
}

const media = await getUserMedia(decryptToken(cuenta.accessToken), limite);

const campañas = await prisma.automation.findMany({
  where: { postId: { not: null } },
  select: { name: true, postId: true },
});
const porPost = new Map<string, string[]>();
for (const c of campañas) {
  if (!c.postId) continue;
  porPost.set(c.postId, [...(porPost.get(c.postId) ?? []), c.name]);
}

console.log(`@${cuenta.username} — ${media.length} publicaciones\n`);
for (const m of media) {
  const fecha = new Date(m.timestamp).toISOString().slice(0, 16).replace("T", " ");
  const tipo = m.media_product_type ?? m.media_type;
  const usada = porPost.get(m.id);
  console.log(`${m.id}  ${fecha}  ${tipo}`);
  if (m.permalink) console.log(`   ${m.permalink}`);
  if (m.caption) console.log(`   "${m.caption.replace(/\s+/g, " ").slice(0, 70)}"`);
  if (usada) console.log(`   ya asignado a: ${usada.join(", ")}`);
  console.log();
}

await prisma.$disconnect();
