import { prisma } from "../lib/db/client.js";
const l = await prisma.dmLog.findFirst({
  where: { commentId: "18024515453899455" },
  select: { status: true, attempts: true, publicReplySentAt: true, publicReplyError: true,
            errorMessage: true, automation: { select: { name: true, publicReplyEnabled: true } } },
});
console.log(JSON.stringify(l, null, 2));
const recientes = await prisma.operationalEvent.findMany({
  orderBy: { createdAt: "desc" }, take: 5,
  select: { message: true, createdAt: true },
});
console.log("\nÚltimos eventos:");
for (const e of recientes) console.log(` ${e.createdAt.toISOString()}  ${e.message.slice(0, 90)}`);
await prisma.$disconnect();
