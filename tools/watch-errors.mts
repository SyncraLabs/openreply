import { prisma } from "../lib/db/client.js";
const desde = new Date(Date.now() - 8 * 60 * 1000);
const errores = await prisma.operationalEvent.count({
  where: { createdAt: { gte: desde }, message: { contains: "invalid for a private reply" } },
});
const barridos = await prisma.operationalEvent.count({
  where: { createdAt: { gte: desde }, message: { contains: "Comment sweep" } },
});
console.log(`últimos 8 min → barridos: ${barridos} · errores de private reply: ${errores}`);
console.log(errores === 0 ? "✅ bucle cortado" : "⚠️ siguen llegando");
await prisma.$disconnect();
