import { prisma } from "../lib/db/client.js";

const COMMENT = "18024515453899455";

const logs = await prisma.dmLog.findMany({
  where: { commentId: COMMENT },
  select: {
    automation: { select: { name: true } },
    status: true,
    attempts: true,
    commenterName: true,
    commentText: true,
    errorMessage: true,
    createdAt: true,
    updatedAt: true,
  },
});
console.log("DmLog de ese comentario:");
console.log(JSON.stringify(logs, null, 2));

const porEstado = await prisma.dmLog.groupBy({
  by: ["status"],
  _count: { _all: true },
});
console.log("\nTodos los envíos por estado:");
for (const g of porEstado) console.log(`  ${g.status}: ${g._count._all}`);

const eventos = await prisma.operationalEvent.groupBy({
  by: ["message"],
  _count: { _all: true },
  orderBy: { _count: { message: "desc" } },
  take: 6,
});
console.log("\nEventos operativos más repetidos:");
for (const e of eventos) console.log(`  ${e._count._all}×  ${e.message}`);

const proc = await prisma.processedComment.findMany({
  where: { commentId: COMMENT },
  select: { commentId: true, source: true, seenAt: true },
});
console.log("\nProcessedComment (dedupe):", proc.length ? proc : "vacío ← aquí está la clave");

await prisma.$disconnect();
