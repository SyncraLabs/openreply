import { prisma } from "../lib/db/client.js";
const ultimos = await prisma.webhookEvent.findMany({
  orderBy: { createdAt: "desc" }, take: 3,
  select: { createdAt: true, status: true },
});
const total = await prisma.webhookEvent.count();
console.log(`  total: ${total}`);
for (const e of ultimos) console.log(`  ${e.createdAt.toISOString()}  ${e.status}`);
await prisma.$disconnect();
