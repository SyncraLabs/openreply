/**
 * Setter con IA en las campañas «Skool» de @rodrigov.ia: en vez de botones, Claude lee la
 * conversación y contesta como Rodrigo (lib/queue/setter.ts).
 *
 *   ./tools/ops setter-rodrigov            muestra qué cambiaría, sin tocar nada
 *   ./tools/ops setter-simular             conversaciones de prueba con leads simulados (no escribe nada)
 *   ./tools/ops setter-rodrigov aplicar    guarda copia en ~/Backups y lo activa
 *   ./tools/ops setter-rodrigov quitar     vuelve a los botones (borra solo `setter`)
 *
 * Deja la secuencia de botones dentro: quien estaba a mitad la termina. Lo nuevo entra por la IA.
 */
import fs from "node:fs";
import { prisma } from "@/lib/db/client";
import { sequenceSchema } from "@/lib/sequence";

const RODRIGOV_IA = "cmslqda9l000404kv76a8n701";

import { setter } from "./setter-rodrigov-config.mjs";

const mode = process.argv[2];

const camps = await prisma.automation.findMany({
  where: { instagramAccountId: RODRIGOV_IA, name: { startsWith: "Skool" }, isActive: true },
  orderBy: { createdAt: "asc" },
});
console.log(`${camps.length} campañas «Skool» activas en @rodrigov.ia:`);
for (const c of camps) {
  const s = sequenceSchema.safeParse(c.sequence);
  console.log(`  ${c.name} | ${c.id} | secuencia ${s.success ? "válida" : "INVÁLIDA"}${s.success && s.data.setter ? " | setter ya activo" : ""}`);
}

if (mode !== "aplicar" && mode !== "quitar") {
  console.log("\nNada cambiado. Para activar: ./tools/ops setter-rodrigov aplicar");
  await prisma.$disconnect();
  process.exit(0);
}

const bk = `${process.env.HOME}/Backups/skool-rodrigov-antes-setter-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(bk, JSON.stringify(camps, null, 2));
console.log("\ncopia previa:", bk);

await prisma.$transaction(
  camps.map((c) => {
    const current = sequenceSchema.parse(c.sequence ?? {});
    const sequence = sequenceSchema.parse(
      mode === "aplicar" ? { ...current, setter } : { main: current.main, branches: current.branches }
    );
    return prisma.automation.update({ where: { id: c.id }, data: { sequence } });
  })
);
for (const c of await prisma.automation.findMany({ where: { id: { in: camps.map((c) => c.id) } } })) {
  const s = sequenceSchema.safeParse(c.sequence);
  console.log(`${c.isActive ? "ON " : "off"} ${c.name} | setter: ${s.success && s.data.setter ? "sí" : "no"}`);
}
await prisma.$disconnect();
