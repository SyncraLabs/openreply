import { prisma } from "../lib/db/client.js";
const desde = new Date(Date.now() - 30 * 864e5);
const evs = await prisma.webhookEvent.findMany({ where: { createdAt: { gte: desde } }, select: { createdAt: true, payload: true } });
const act: Record<string, number> = {}; let n = 0;
for (const e of evs) {
  const m = (e.payload as any)?.entry?.[0]?.messaging?.[0];
  if (m?.postback?.payload?.startsWith("ACT::")) { n++; const k = `${m.postback.title} · ${m.postback.payload}`; act[k] = (act[k] ?? 0) + 1; }
}
console.log("postbacks de ManyChat en 30 días:", n); console.log(act);
await prisma.$disconnect();
