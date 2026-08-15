import { prisma } from "../lib/db/client.js";
import { decryptToken } from "../lib/meta/oauth.js";

const cuenta = await prisma.instagramAccount.findFirst();
if (!cuenta) { console.log("❌ sin cuenta"); process.exit(1); }

console.log("cuenta:", cuenta.username, "| instagramId:", cuenta.instagramId);
try {
  const t = decryptToken(cuenta.accessToken);
  console.log(`token descifra ✅  (${t.length} chars, empieza por ${t.slice(0, 6)}…)`);
} catch (e) {
  console.log("❌ el token NO descifra:", e instanceof Error ? e.message : e);
}

const autos = await prisma.automation.findMany({
  orderBy: { createdAt: "asc" },
  select: { name: true, isActive: true, matchAnyPost: true, postId: true },
});
console.log(`\ncampañas: ${autos.length}`);
for (const a of autos) console.log(`  ${a.isActive ? "ACTIVA " : "pausada"} ${a.name}`);

const snaps = await prisma.followerSnapshot.count();
const logs = await prisma.dmLog.count();
console.log(`\nsnapshots de seguidores: ${snaps} · envíos: ${logs}`);
await prisma.$disconnect();
