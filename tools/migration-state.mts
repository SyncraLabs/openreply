import { prisma } from "../lib/db/client.js";
const filas = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
  `SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
   FROM _prisma_migrations ORDER BY started_at DESC LIMIT 3`
);
console.log("últimas migraciones:");
for (const f of filas) {
  const estado = f.rolled_back_at ? "REVERTIDA" : f.finished_at ? "ok" : "❌ FALLIDA";
  console.log(`  ${estado}  ${f.migration_name}`);
}
const tablas = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_name LIKE 'Radar%'`
);
console.log("\ntablas Radar creadas:", tablas.length ? tablas.map(t => t.table_name) : "ninguna");
await prisma.$disconnect();
