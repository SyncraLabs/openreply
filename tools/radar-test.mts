/**
 * Prueba real del Radar contra Apify. Añade una cuenta y hace un refresco.
 *   ./tools/ops radar-test <usuario>
 */
import { prisma } from "../lib/db/client.js";
import { refreshRadar } from "../lib/radar/refresh.js";

const usuario = (process.argv[2] ?? "nicksaraev").replace(/^@/, "");
const ws = await prisma.workspace.findFirst({ select: { id: true } });
if (!ws) { console.error("sin workspace"); process.exit(1); }

await prisma.radarAccount.upsert({
  where: { workspaceId_username: { workspaceId: ws.id, username: usuario } },
  create: { workspaceId: ws.id, username: usuario, niche: "IA / agencias" },
  update: { isActive: true },
});
console.log(`vigilando @${usuario}, refrescando…`);

const r = await refreshRadar(ws.id);
console.log("resultado:", r);

const top = await prisma.radarPost.findMany({
  where: { workspaceId: ws.id },
  orderBy: { outlierScore: "desc" },
  take: 5,
  include: { account: { select: { username: true, medianViews: true } } },
});
console.log(`\nTop por outlier (mediana de la cuenta: ${top[0]?.account.medianViews ?? "—"}):`);
for (const p of top) {
  console.log(`  ${(p.outlierScore ?? 0).toFixed(1)}×  ${String(p.views ?? "—").padStart(8)} views  ${(p.caption ?? "").slice(0, 50).replace(/\n/g, " ")}`);
}
await prisma.$disconnect();
