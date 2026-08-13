import { prisma } from "../lib/db/client.js";

const WORKSPACE_ID = "cmslqbntw000104kvxsotaf17";
const IG_ACCOUNT_ID = "cmslqda9l000404kv76a8n701";

const created = await prisma.automation.create({
  data: {
    workspaceId: WORKSPACE_ID,
    instagramAccountId: IG_ACCOUNT_ID,
    name: "PRUEBA — próximo reel",
    goal: "Recursos gratis agencia IA",

    // Se engancha sola al siguiente reel que publique Rodrigo.
    pendingNextReel: true,
    matchAnyPost: false,

    // Cualquier comentario dispara, como en ManyChat.
    matchAnyWord: true,
    keywords: [],

    dmMessage:
      "Aquí tienes mis mejores recursos para crear tu agencia de IA! Son 100% free\n\nhttps://archivo.syncralabs.es/\n\nya me dirás qué taaal",
    linkButtonLabel: "Ábrelo",

    requireFollow: true,
    followPromptMessage:
      "una cosa antes, esto es solo para mi comunidad. dale a seguir y te lo mando",
    followPromptButtonLabel: "te sigo",

    followUpEnabled: true,
    followUpMessage: "qué tal?? le echaste un ojo?",
    followUpDelayMinutes: 120,

    publicReplyEnabled: true,
    publicReplyMessages: ["Enviadooo", "Lo tienesss", "Mira DM"],

    // Pausada a propósito: GENERAL es más antigua y se comería el DM.
    isActive: false,
  },
  select: { id: true, name: true, isActive: true, pendingNextReel: true },
});

console.log("creada:", created);
await prisma.$disconnect();
