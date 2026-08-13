import { prisma } from "../lib/db/client.js";
const ahora = new Date();
const ultimos = await prisma.operationalEvent.findMany({
  orderBy: { createdAt: "desc" }, take: 3, select: { message: true, createdAt: true },
});
console.log("ahora:", ahora.toISOString());
console.log("último evento:", ultimos[0]?.createdAt.toISOString());
const mins = ultimos[0] ? (ahora.getTime() - ultimos[0].createdAt.getTime()) / 60000 : null;
console.log("hace", mins?.toFixed(0), "minutos");
const desde = new Date(ahora.getTime() - 60 * 60 * 1000);
const ultimaHora = await prisma.operationalEvent.count({ where: { createdAt: { gte: desde } } });
console.log("eventos en la última hora:", ultimaHora);
await prisma.$disconnect();
