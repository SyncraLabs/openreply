/**
 * Setting fase 1 en @rodrigov.ia: las campañas «Skool» dejan de mandar a todos el mismo audio y el
 * curso gratis, y pasan a cualificar con botones.
 *
 *   comentario → (privada, la de siempre) «acabo de ver que has comentado…»
 *   responde   → ¿en qué punto estás?  [empiezo de cero] [ya sé montar cosas] [tengo un negocio]
 *   cero/monta → qué quiere en 6 meses → ¿podría invertir?  [sí, si tiene sentido] [ahora no]
 *     sí       → cualificado: la llamada y, en su propio mensaje, el enlace corto a /agendar
 *     no       → curso gratis (Skool salió del embudo el 3 nov 2026)
 *   negocio    → cualificado (Syncra): qué negocio y qué le come el tiempo, y sigue Rodrigo a mano
 *
 *   ./tools/ops setting-fase1           muestra qué cambiaría, sin tocar nada
 *   ./tools/ops setting-fase1 aplicar   guarda copia en ~/Backups y aplica
 *
 * Solo toca la secuencia. La privada, las respuestas públicas y los tiempos de envío se quedan.
 * Quien estaba a mitad del flujo viejo no recibe los pasos que le faltaban (los índices cambian).
 */
import fs from "node:fs";
import { prisma } from "@/lib/db/client";
import { sequenceSchema } from "@/lib/sequence";
import { pasoPunto, ramasSetting } from "./setting-secuencia.mjs";

const RODRIGOV_IA = "cmslqda9l000404kv76a8n701";

const sequence = sequenceSchema.parse({
  main: [pasoPunto("para no mandarte lo mismo que a todos: ¿en qué punto estás?")],
  branches: ramasSetting(),
});

const camps = await prisma.automation.findMany({
  where: { instagramAccountId: RODRIGOV_IA, name: { startsWith: "Skool" }, isActive: true },
  orderBy: { createdAt: "asc" },
});
console.log(`${camps.length} campañas «Skool» activas en @rodrigov.ia:`);
for (const c of camps) console.log(`  ${c.name} | ${c.id}`);

if (process.argv[2] !== "aplicar") {
  console.log("\nSecuencia nueva válida. Ramas:", sequence.branches.map((b) => `${b.id}${b.qualified ? "*" : ""}`).join(", "));
  console.log("Nada cambiado. Para aplicar: ./tools/ops setting-fase1 aplicar");
  await prisma.$disconnect();
  process.exit(0);
}

const bk = `${process.env.HOME}/Backups/skool-rodrigov-antes-setting-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(bk, JSON.stringify(camps, null, 2));
console.log("\ncopia previa:", bk);

await prisma.$transaction(
  camps.map((c) =>
    prisma.automation.update({
      where: { id: c.id },
      data: { sequence, goal: "Setting fase 1: triaje con botones → llamada (cualificados), curso gratis (ahora no) o Syncra (negocio)" },
    })
  )
);
for (const c of await prisma.automation.findMany({ where: { id: { in: camps.map((c) => c.id) } } })) {
  console.log(`${c.isActive ? "ON " : "off"} ${c.name} | secuencia válida: ${sequenceSchema.safeParse(c.sequence).success}`);
}
await prisma.$disconnect();
