import { prisma } from "../lib/db/client.js";

/**
 * Quita "claude" de las keywords de la campaña GENERAL.
 *
 * GENERAL es `matchAnyPost` y se creó el 2026-08-09, antes que las campañas por reel.
 * Meta solo permite UN private reply por comentario y el worker resuelve el empate
 * por `createdAt asc`, así que GENERAL gana siempre. Con "claude" en su lista, todo
 * el que comente CLAUDE en el reel de las 5 skills recibiría el DM genérico de
 * recursos en vez de la página del vídeo, y vería dos respuestas públicas.
 *
 * Quitando solo esa palabra, GENERAL sigue funcionando para el resto y el reel R1
 * puede activarse sin pisarse.
 *
 * Uso:
 *   cd ~/openreply
 *   DATABASE_URL="<url pública de Railway>" npx tsx tools/fix-general-keywords.mts
 */

const general = await prisma.automation.findFirst({
  where: { name: "GENERAL" },
  select: { id: true, keywords: true, isActive: true, matchAnyPost: true },
});

if (!general) {
  console.log("No hay ninguna campaña llamada GENERAL. Nada que hacer.");
} else {
  console.log("antes:", general);
  const keywords = general.keywords.filter(
    (word) => word.toLowerCase() !== "claude",
  );
  if (keywords.length === general.keywords.length) {
    console.log('GENERAL ya no tiene "claude". Nada que cambiar.');
  } else {
    const updated = await prisma.automation.update({
      where: { id: general.id },
      data: { keywords },
      select: { id: true, keywords: true },
    });
    console.log("después:", updated);
  }
}

await prisma.$disconnect();
