import { prisma } from "../lib/db/client.js";
const ws = await prisma.workspace.findFirst({ select: { id: true } });
const del = await prisma.radarAccount.deleteMany({ where: { username: "nicksaraev" } });
console.log("cuenta de prueba eliminada:", del.count);
await prisma.radarAccount.upsert({
  where: { workspaceId_username: { workspaceId: ws!.id, username: "rodrigov.ia" } },
  create: { workspaceId: ws!.id, username: "rodrigov.ia", niche: "IA en español" },
  update: { isActive: true },
});
console.log("vigilando @rodrigov.ia");
await prisma.$disconnect();
