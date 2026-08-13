import { prisma } from "../lib/db/client.js";
const arranque = new Date("2026-08-10T22:46:47Z");
const ahora = new Date();
const mins = (ahora.getTime() - arranque.getTime()) / 60000;
const ciclos = Math.floor(mins / 5);

const sweeps = await prisma.operationalEvent.count({
  where: { createdAt: { gte: arranque }, message: { contains: "Comment sweep" } },
});
const errores = await prisma.operationalEvent.count({
  where: { createdAt: { gte: arranque }, message: { contains: "invalid for a private reply" } },
});
console.log(`worker arrancó hace ${mins.toFixed(0)} min → ~${ciclos} ciclos de barrido`);
console.log(`  sweeps con algo encolado: ${sweeps}`);
console.log(`  errores de private reply: ${errores}`);
console.log(sweeps === 0 && errores === 0
  ? "\n✅ el barrido corre y ya NO encola ese comentario"
  : "\n⚠️ revisar");
await prisma.$disconnect();
