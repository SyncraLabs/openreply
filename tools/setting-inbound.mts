/**
 * Setting INBOUND en @rodrigov.ia: alguien te escribe primero por DM (o responde a una historia) y entra
 * en el mismo triaje que quien comenta una palabra clave.
 *
 *   ey, gracias por escribirme
 *   ¿en qué punto estás?  [empiezo de cero] [ya sé montar cosas] [tengo un negocio]
 *   y de ahí las mismas ramas que setting-fase1 (tools/setting-secuencia.mts)
 *
 *   ./tools/ops setting-inbound                ver qué haría, sin tocar nada
 *   ./tools/ops setting-inbound todos          ver con «cualquier mensaje dispara» (matchAnyWord)
 *   ./tools/ops setting-inbound aplicar        guarda copia en ~/Backups y aplica
 *   ./tools/ops setting-inbound todos aplicar
 *
 * Una sola campaña, «Setting · inbound», sin post (solo la dispara un DM). Si no existe se crea PAUSADA;
 * si existe se actualiza y se deja como esté (activa o pausada). Las palabras son las de la campaña GENERAL,
 * salvo con `todos`. No pausa ni toca ninguna otra campaña.
 */
import fs from "node:fs";
import { prisma } from "@/lib/db/client";
import { sequenceSchema } from "@/lib/sequence";
import { pasoPunto, ramasSetting } from "./setting-secuencia.mjs";

const RODRIGOV_IA = "cmslqda9l000404kv76a8n701";
const NOMBRE = "Setting · inbound";
const GOAL = "Setting inbound: te escriben primero, triaje con botones → llamada (cualificados), curso gratis (ahora no) o Syncra (negocio)";
const args = process.argv.slice(2);
const todos = args.includes("todos");
const aplicar = args.includes("aplicar");

const sequence = sequenceSchema.parse({
  main: [pasoPunto("¿en qué punto estás?")],
  branches: ramasSetting(),
});

const cuenta = await prisma.instagramAccount.findUnique({
  where: { id: RODRIGOV_IA },
  select: { id: true, workspaceId: true, username: true },
});
if (!cuenta) throw new Error(`No encuentro la cuenta ${RODRIGOV_IA}`);

const delCuenta = await prisma.automation.findMany({
  where: { instagramAccountId: RODRIGOV_IA, retiredAt: null },
  select: { id: true, name: true, isActive: true, dmTriggerEnabled: true, matchAnyWord: true, keywords: true },
});
const general = delCuenta.find((c) => c.name === "GENERAL");
if (!general && !todos) throw new Error("No hay campaña GENERAL de la que heredar palabras. Usa `todos` o dime qué palabras.");

const keywords = todos ? [] : general!.keywords;
const data = {
  goal: GOAL,
  postId: null,
  postUrl: null,
  matchAnyPost: false,
  pendingNextReel: false,
  keywords,
  matchAnyWord: todos,
  wholeWordMatch: true,
  dmTriggerEnabled: true,
  dmMessage: "ey, gracias por escribirme",
  requireFollow: false,
  followUpEnabled: false,
  publicReplyEnabled: false,
  sequence,
};

const existente = await prisma.automation.findFirst({ where: { instagramAccountId: RODRIGOV_IA, name: NOMBRE } });

console.log(`@${cuenta.username} · ${existente ? `ya existe «${NOMBRE}» (${existente.id}, ${existente.isActive ? "ACTIVA" : "pausada"}): se actualiza y se deja como está` : `«${NOMBRE}» no existe: se crea PAUSADA (la activas tú)`}`);
console.log(`apertura:   ${data.dmMessage}`);
console.log(`disparo:    ${todos ? "CUALQUIER mensaje (matchAnyWord)" : `palabras de GENERAL ${JSON.stringify(keywords)}, palabra entera`}`);
console.log(`secuencia:  ${sequence.main.length} paso + ramas ${sequence.branches.map((b) => `${b.id}${b.qualified ? "*" : ""}`).join(", ")}`);

// Solo contestan a un DM las campañas con dmTriggerEnabled (lib/queue/dm-worker.ts, processMessage), y todas
// las que coinciden contestan, no solo la más antigua. Dos campañas de DM que coincidan = dos aperturas.
const palabras = (ks: string[]) => new Set(ks.map((k) => k.trim().toLowerCase()).filter(Boolean));
const mias = palabras(keywords);
const otrasDm = delCuenta.filter((c) => c.id !== existente?.id && c.isActive && c.dmTriggerEnabled);
console.log("\nChoques por DM (campañas activas con dmTriggerEnabled):");
let choques = 0;
for (const c of otrasDm) {
  const comunes = todos || c.matchAnyWord ? null : [...palabras(c.keywords)].filter((k) => mias.has(k));
  if (todos || c.matchAnyWord || (comunes && comunes.length)) {
    choques++;
    const por = todos || c.matchAnyWord ? "una de las dos dispara con cualquier mensaje" : `misma palabra ${JSON.stringify(comunes)}`;
    console.log(`  CHOQUE con «${c.name}»: ${por}. Quien lo escriba recibe las dos aperturas.`);
  }
}
if (!choques) console.log(otrasDm.length ? `  ninguno (${otrasDm.map((c) => `«${c.name}»`).join(", ")} no comparten palabra)` : "  ninguna otra campaña de DM activa");
if (general) {
  console.log(
    general.isActive && general.dmTriggerEnabled
      ? `  GENERAL está activa y contesta DMs con las mismas palabras: PISA a la nueva. Propongo pausarla: ./tools/ops pause-general (no lo hago yo).`
      : `  GENERAL (${general.isActive ? "activa" : "pausada"}, dmTriggerEnabled=${general.dmTriggerEnabled}) no contesta DMs: no se pisa con la nueva.`
  );
}
console.log("  Por comentario no choca con nada: sin post y sin matchAnyPost, un comentario nunca la dispara.");

if (!aplicar) {
  console.log("\nNada cambiado. Para aplicar: ./tools/ops setting-inbound" + (todos ? " todos" : "") + " aplicar");
  await prisma.$disconnect();
  process.exit(0);
}

const dir = `${process.env.HOME}/Backups`;
fs.mkdirSync(dir, { recursive: true });
const bk = `${dir}/setting-inbound-antes-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
fs.writeFileSync(bk, JSON.stringify({ existente }, null, 2));
console.log("\ncopia previa:", bk);

const c = existente
  ? await prisma.automation.update({ where: { id: existente.id }, data })
  : await prisma.automation.create({
      data: { ...data, name: NOMBRE, workspaceId: cuenta.workspaceId, instagramAccountId: cuenta.id, isActive: false },
    });
console.log(`${c.isActive ? "ON " : "off"} ${c.name} | ${c.id} | secuencia válida: ${sequenceSchema.safeParse(c.sequence).success}`);
if (!existente) console.log("Creada pausada. Actívala desde el panel cuando quieras.");
await prisma.$disconnect();
