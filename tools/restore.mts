/**
 * Restaura un volcado de tools/backup.mts sobre una base de datos VACÍA
 * (recién migrada con `prisma migrate deploy`).
 *
 * Uso:
 *   DATABASE_URL="postgres://..." npx tsx tools/restore.mts tools/backup-pre-europa.json
 *
 * Detalles que importan:
 * - Las tablas se insertan en orden de dependencias; el orden viene ya dado
 *   por el propio JSON, así que no se reordena aquí.
 * - JSON no tiene tipo fecha: los ISO-8601 vuelven a ser Date o Prisma revienta.
 * - `skipDuplicates` hace el script reejecutable sin duplicar nada.
 */
import { readFileSync } from "node:fs";
import { prisma } from "../lib/db/client.js";

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function revivirFechas<T>(valor: T): T {
  if (typeof valor === "string" && ISO.test(valor)) {
    return new Date(valor) as unknown as T;
  }
  if (Array.isArray(valor)) {
    return valor.map(revivirFechas) as unknown as T;
  }
  if (valor && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor)) salida[k] = revivirFechas(v);
    return salida as T;
  }
  return valor;
}

const ruta = process.argv[2];
if (!ruta) {
  console.error("uso: npx tsx tools/restore.mts <fichero.json>");
  process.exit(1);
}

const dump = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;

// clave del JSON -> delegado de Prisma
const tablas: Record<string, { createMany: (a: never) => Promise<{ count: number }> }> = {
  users: prisma.user,
  accounts: prisma.account,
  sessions: prisma.session,
  verificationTokens: prisma.verificationToken,
  workspaces: prisma.workspace,
  workspaceMembers: prisma.workspaceMember,
  workspaceInvitations: prisma.workspaceInvitation,
  instagramAccounts: prisma.instagramAccount,
  followerSnapshots: prisma.followerSnapshot,
  automations: prisma.automation,
  dmLogs: prisma.dmLog,
  processedComments: prisma.processedComment,
  trackedLinks: prisma.trackedLink,
  linkClicks: prisma.linkClick,
  webhookEvents: prisma.webhookEvent,
  operationalEvents: prisma.operationalEvent,
} as never;

console.log(`restaurando desde ${ruta} (exportado ${dump.exportedAt})`);
let total = 0;

for (const [clave, delegado] of Object.entries(tablas)) {
  const filas = dump[clave];
  if (!Array.isArray(filas) || filas.length === 0) continue;

  const datos = revivirFechas(filas);
  const { count } = await delegado.createMany({
    data: datos,
    skipDuplicates: true,
  } as never);
  total += count;
  console.log(`  ${clave}: ${count}/${filas.length}`);
}

console.log(`TOTAL restaurado: ${total} filas`);
await prisma.$disconnect();
