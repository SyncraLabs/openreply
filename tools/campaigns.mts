import { prisma } from "../lib/db/client.js";

const autos = await prisma.automation.findMany({
  orderBy: { createdAt: "asc" },
  select: {
    id: true,
    name: true,
    createdAt: true,
    isActive: true,
    matchAnyPost: true,
    pendingNextReel: true,
    postId: true,
    postUrl: true,
    keywords: true,
    matchAnyWord: true,
    wholeWordMatch: true,
    dmMessage: true,
    dmTriggerEnabled: true,
    publicReplyEnabled: true,
    publicReplyMessages: true,
    requireFollow: true,
    followUpEnabled: true,
    followUpDelayMinutes: true,
  },
});

for (const a of autos) {
  console.log("─".repeat(70));
  console.log(`${a.name}  [${a.isActive ? "ACTIVA" : "pausada"}]  ${a.createdAt.toISOString()}`);
  console.log(`  id            ${a.id}`);
  console.log(`  alcance       ${a.matchAnyPost ? "TODOS los posts" : a.pendingNextReel ? "próximo reel" : `post ${a.postId}`}`);
  console.log(`  palabras      ${a.matchAnyWord ? "CUALQUIERA" : JSON.stringify(a.keywords)}`);
  console.log(`  respuesta pública ${a.publicReplyEnabled ? JSON.stringify(a.publicReplyMessages) : "no"}`);
  console.log(`  follow gate   ${a.requireFollow}`);
  console.log(`  follow-up     ${a.followUpEnabled ? `sí (+${a.followUpDelayMinutes} min)` : "no"}`);
  console.log(`  DM:\n${a.dmMessage.split("\n").map((l) => "    | " + l).join("\n")}`);
}
console.log("─".repeat(70));
await prisma.$disconnect();
