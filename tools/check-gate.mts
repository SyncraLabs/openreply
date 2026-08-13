import { prisma } from "../lib/db/client.js";

const autos = await prisma.automation.findMany({
  orderBy: { createdAt: "asc" },
  select: {
    name: true,
    requireFollow: true,
    followPromptMessage: true,
    followPromptButtonLabel: true,
    openingDmEnabled: true,
    openingDmMessage: true,
    followUpEnabled: true,
    followUpMessage: true,
    followUpDelayMinutes: true,
    linkButtonLabel: true,
  },
});
console.log(JSON.stringify(autos, null, 2));
await prisma.$disconnect();
