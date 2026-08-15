/**
 * Importa el CSV del tracker de Google Sheets a DailyMetric.
 *
 *   ./tools/ops import-tracker "/ruta/al/Tracker diario.csv"
 *
 * Solo trae lo que el CSV tiene de origen: cifras de redes y de negocio. Los
 * porcentajes, CPL y ROAS del Sheets NO se importan — son fórmulas, y aquí se
 * recalculan al leer, para que corregir un dato de ayer arrastre el cambio.
 *
 * Reejecutable: hace upsert por fecha, así que volver a pasarlo actualiza en
 * vez de duplicar.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../lib/db/client.js";

const MESES: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
  jan: 0, apr: 3, aug: 7, dec: 11,
};

/** "01 Jul 2026" -> Date en medianoche UTC. */
function parseFecha(v: string): Date | null {
  const m = v.trim().match(/^(\d{1,2})\s+([A-Za-zñÑ]{3})[a-z]*\.?\s+(\d{4})$/);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase().slice(0, 3)];
  if (mes === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), mes, Number(m[1])));
}

/** "2,327" -> 2327 · "" o "-" -> null. Los miles vienen con coma. */
function num(v: string | undefined): number | null {
  if (!v) return null;
  const limpio = v.replace(/[,\s€]/g, "").trim();
  if (!limpio || limpio === "-") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Divide una línea CSV respetando las comillas. */
function partirLinea(linea: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else enComillas = !enComillas;
    } else if (c === "," && !enComillas) {
      celdas.push(actual);
      actual = "";
    } else actual += c;
  }
  celdas.push(actual);
  return celdas;
}

const ruta = process.argv[2];
if (!ruta) {
  console.error('uso: ./tools/ops import-tracker "/ruta/al/csv"');
  process.exit(1);
}

const workspace = await prisma.workspace.findFirst({ select: { id: true } });
if (!workspace) {
  console.error("No hay workspace");
  process.exit(1);
}

const lineas = readFileSync(ruta, "utf8").split(/\r?\n/);
let importadas = 0;
let vacias = 0;

for (const linea of lineas) {
  const c = partirLinea(linea);
  const date = parseFecha(c[0] ?? "");
  if (!date) continue;

  const datos = {
    youtube: num(c[1]),
    instagram: num(c[3]),
    tiktok: num(c[5]),
    igSyncra: num(c[7]),
    contenido: num(c[11]),
    leads: num(c[12]),
    llamadasReservadas: num(c[13]),
    llamadasHechas: num(c[14]),
    clientes: num(c[15]),
    ingresos: num(c[16]),
    mrr: num(c[17]),
    gastoAds: num(c[18]),
  };

  // Una fila del Sheets con la fecha pero todo lo demás en blanco no aporta
  // nada y ensuciaría el cálculo de variaciones.
  if (Object.values(datos).every((v) => v === null)) {
    vacias += 1;
    continue;
  }

  await prisma.dailyMetric.upsert({
    where: { workspaceId_date: { workspaceId: workspace.id, date } },
    create: { workspaceId: workspace.id, date, ...datos },
    update: datos,
  });
  importadas += 1;
}

console.log(`importadas: ${importadas} · filas vacías saltadas: ${vacias}`);

const total = await prisma.dailyMetric.count();
const rango = await prisma.dailyMetric.aggregate({
  _min: { date: true },
  _max: { date: true },
});
console.log(`en base: ${total} días · de ${rango._min.date?.toISOString().slice(0, 10)} a ${rango._max.date?.toISOString().slice(0, 10)}`);
await prisma.$disconnect();
