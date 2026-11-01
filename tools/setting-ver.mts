/** Solo lectura: qué ha pasado en las campañas «Skool» de @rodrigov.ia desde que entró el setting. */
import { prisma } from "@/lib/db/client";
const DESDE = new Date(process.argv[2] ?? "2026-11-01T12:56:49Z");
const camps = await prisma.automation.findMany({
  where: { instagramAccountId: "cmslqda9l000404kv76a8n701", name: { startsWith: "Skool" } }, select: { id: true },
});
const ids = camps.map((c) => c.id);
const logs = await prisma.dmLog.groupBy({ by: ["status"], where: { automationId: { in: ids }, createdAt: { gte: DESDE } }, _count: true });
console.log("comentarios desde", DESDE.toISOString(), logs);
const choices = await prisma.sequenceChoice.findMany({ where: { automationId: { in: ids }, updatedAt: { gte: DESDE } }, orderBy: { updatedAt: "asc" } });
console.log("botones pulsados:", choices.length);
for (const c of choices) console.log(`  ${c.updatedAt.toISOString().slice(11, 16)} ${c.branchName}${c.qualified ? " *" : ""}`);
const ev = await (prisma as any).operationalEvent?.findMany?.({ where: { createdAt: { gte: DESDE } }, orderBy: { createdAt: "desc" }, take: 10 });
if (ev) for (const e of ev) console.log("evento:", e.createdAt.toISOString().slice(11, 16), JSON.stringify(e).slice(0, 220));
await prisma.$disconnect();
