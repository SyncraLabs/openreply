/**
 * Volcado completo de la base de datos a JSON.
 *
 * No es un pg_dump (no hay cliente de Postgres instalado): recorre TODOS los
 * modelos del schema y los serializa. Se usa antes de mover la base de datos
 * de región, que recrea el volumen y por tanto la borra.
 *
 * El orden de las tablas es el de dependencias, para que el restore pueda
 * insertarlas de arriba abajo sin romper claves foráneas.
 */
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/db/client.js";

// De padres a hijos. No reordenar sin mirar el schema.
const dump = {
  exportedAt: new Date().toISOString(),
  users: await prisma.user.findMany(),
  accounts: await prisma.account.findMany(),
  sessions: await prisma.session.findMany(),
  verificationTokens: await prisma.verificationToken.findMany(),
  workspaces: await prisma.workspace.findMany(),
  workspaceMembers: await prisma.workspaceMember.findMany(),
  workspaceInvitations: await prisma.workspaceInvitation.findMany(),
  instagramAccounts: await prisma.instagramAccount.findMany(),
  // Instagram sólo sirve ~30 días de insights: si esto se pierde, el histórico
  // de seguidores anterior a hoy NO se puede recuperar de ninguna forma.
  followerSnapshots: await prisma.followerSnapshot.findMany(),
  automations: await prisma.automation.findMany(),
  dmLogs: await prisma.dmLog.findMany(),
  processedComments: await prisma.processedComment.findMany(),
  trackedLinks: await prisma.trackedLink.findMany(),
  linkClicks: await prisma.linkClick.findMany(),
  webhookEvents: await prisma.webhookEvent.findMany(),
  operationalEvents: await prisma.operationalEvent.findMany(),
};

const ruta = process.argv[2] ?? "tools/backup.json";
writeFileSync(ruta, JSON.stringify(dump, null, 2));

console.log(`guardado en ${ruta}`);
let total = 0;
for (const [tabla, filas] of Object.entries(dump)) {
  if (!Array.isArray(filas)) continue;
  total += filas.length;
  if (filas.length) console.log(`  ${tabla}: ${filas.length}`);
}
console.log(`  TOTAL: ${total} filas`);
await prisma.$disconnect();
