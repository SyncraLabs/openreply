import { prisma } from "../lib/db/client.js";
const errs = await prisma.operationalEvent.findMany({
  where: { message: { contains: "invalid for a private reply" } },
  orderBy: { createdAt: "desc" }, take: 4,
  select: { message: true, createdAt: true },
});
console.log("últimos errores:");
for (const e of errs) console.log(" ", e.createdAt.toISOString(), e.message.slice(0, 55));

console.log("\nDmLog por comentario problemático:");
const logs = await prisma.dmLog.findMany({
  where: { status: { in: ["FAILED", "SKIPPED_DEDUP"] } },
  select: { commentId: true, status: true, errorMessage: true,
            publicReplySentAt: true,
            automation: { select: { name: true, isActive: true, publicReplyEnabled: true } } },
});
for (const l of logs) {
  console.log(` ${l.automation.name} (activa=${l.automation.isActive}, pubReply=${l.automation.publicReplyEnabled})`);
  console.log(`   comment=${l.commentId} status=${l.status} pubSent=${l.publicReplySentAt ? "sí" : "NO"}`);
  console.log(`   err=${(l.errorMessage ?? "").slice(0, 60)}`);
}
await prisma.$disconnect();
