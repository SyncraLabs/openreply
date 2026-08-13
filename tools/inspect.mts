import { prisma } from "../lib/db/client.js";

const [users, ws, ig, autos] = await Promise.all([
  prisma.user.findMany({ select: { id: true, email: true } }),
  prisma.workspace.findMany({ select: { id: true, name: true } }),
  prisma.instagramAccount.findMany({
    select: { id: true, username: true, instagramId: true, workspaceId: true },
  }),
  prisma.automation.findMany({
    select: { id: true, name: true, isActive: true, matchAnyPost: true, postId: true },
  }),
]);

console.log("users:      ", users);
console.log("workspaces: ", ws);
console.log("instagram:  ", ig);
console.log("automations:", autos);
await prisma.$disconnect();
