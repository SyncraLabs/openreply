import { prisma } from "../lib/db/client.js";
const gen = await prisma.automation.findFirst({
  where: { name: "GENERAL" }, select: { isActive: true, updatedAt: true },
});
console.log("GENERAL:", gen);
const despues = await prisma.operationalEvent.count({
  where: { createdAt: { gt: gen!.updatedAt }, message: { contains: "GENERAL" } },
});
console.log("sweeps de GENERAL DESPUÉS de pausarla:", despues);
const otros = await prisma.operationalEvent.findMany({
  where: { createdAt: { gt: gen!.updatedAt } },
  select: { message: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5,
});
console.log("eventos tras la pausa:");
for (const e of otros) console.log(" ", e.createdAt.toISOString(), e.message.slice(0, 80));
await prisma.$disconnect();
