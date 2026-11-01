/**
 * Setter con IA en las campañas «Skool» de @rodrigov.ia: en vez de botones, Claude lee la
 * conversación y contesta como Rodrigo (lib/queue/setter.ts).
 *
 *   ./tools/ops setter-rodrigov            muestra qué cambiaría, sin tocar nada
 *   ./tools/ops setter-rodrigov probar     prueba el brief con conversaciones de ejemplo (llama a Claude, no escribe nada)
 *   ./tools/ops setter-rodrigov aplicar    guarda copia en ~/Backups y lo activa
 *   ./tools/ops setter-rodrigov quitar     vuelve a los botones (borra solo `setter`)
 *
 * Deja la secuencia de botones dentro: quien estaba a mitad la termina. Lo nuevo entra por la IA.
 */
import fs from "node:fs";
import { prisma } from "@/lib/db/client";
import { sequenceSchema, type SetterConfig } from "@/lib/sequence";
import { askSetter, renderSetterMessages, type SetterTurn } from "@/lib/queue/setter";

const RODRIGOV_IA = "cmslqda9l000404kv76a8n701";

const setter: SetterConfig = {
  maxReplies: 12,
  links: {
    agenda: "https://aioperator.syncralabs.es/agendar?utm_source=instagram&utm_medium=dm&campana=dm-setting",
    skool: "https://aioperator.syncralabs.es/comunidad?utm_source=instagram&utm_medium=dm&campana=dm-setting",
    curso: "https://yt.openinapp.co/mqvqb",
  },
  brief: `Soy Rodrigo (@rodrigov.ia). Hago vídeos sobre cómo montar un negocio de IA: montar automatizaciones y agentes de IA para negocios y cobrarles por ello. Quien te escribe ha comentado en uno de mis vídeos y le ha llegado este primer mensaje: «acabo de ver que has comentado en mi video para montar tu agencia, es así?».

Lo que ofrezco:
- AI Operator: un programa de 90 días para montar tu agencia de IA hasta el primer cliente que paga. Reviso el trabajo de cada alumno en vídeo cada semana. Se entra después de una llamada de 30 min conmigo ({agenda}) en la que le pregunto dónde está, qué sabe hacer y cuánto tiempo tiene de verdad, y si veo que no le sirve se lo digo. El precio no se da por aquí: se habla en la llamada.
- Mi comunidad de Skool ({skool}): para quien está empezando o ahora no puede invertir.
- Mi curso completo gratis en YouTube ({curso}), de más de 7 horas.
- Syncra, mi consultora de IA: para dueños de negocio que quieren meter IA en su propio negocio.

A quién le paso la agenda: a quien quiere montar su negocio de IA en serio y estaría en posición de invertir ahora si ve que encaja. Si no lo tiene claro o no puede, Skool y el curso, sin presionar.

Cómo escribo por DM cuando contesto yo a mano: «a que te dedicas??», «lo viste tio??», «qué tal?? lo viste?».

Una conversación como la quiero:
[tú] acabo de ver que has comentado en mi video para montar tu agencia, es así?
[lead] sii
[tú] top
[tú] y tú a qué te dedicas ahora??
[lead] soy enfermera, pero quiero salir de eso y la IA me llama mucho. he visto vídeos pero no sé por dónde empezar
[tú] vale te entiendo, yo estuve igual meses viendo vídeos sin montar nada
[tú] y esto lo quieres como algo serio para dejar lo de enfermera o más para sacar algo extra?
[lead] serio, quiero dejarlo este año
[tú] dale. yo trabajo con poca gente y en serio, así que te pregunto directo: si vemos que encaja, ¿podrías invertir en ello ahora o ahora mismo no es el momento?
[lead] si tiene sentido sí
[tú] perfecto, pues coge hueco aquí y lo vemos 30 min: {agenda}
[tú] y si no te cuadra ninguno me dices`,
};

const mode = process.argv[2];

if (mode === "probar") {
  const opener = "acabo de ver que has comentado en mi video para montar tu agencia, es así?";
  const casos: string[][] = [
    ["sii"],
    ["si, quiero aprender a montar una agencia", "trabajo en un almacén y estoy harto"],
    ["sí", "soy diseñador freelance, ya hago webs y quiero meter IA", "quiero facturar 3000 al mes en 6 meses"],
    ["sí", "estudio, tengo 19 años", "quiero hacer dinero con esto pero ahora mismo no tengo nada ahorrado"],
    ["tengo una clínica dental y quiero automatizar las citas"],
    ["cuánto cuesta?"],
    ["eres un bot?"],
  ];
  for (const lead of casos) {
    const turns: SetterTurn[] = [{ from: "tu", text: opener, at: 0 }];
    for (const t of lead) turns.push({ from: "lead", text: t, at: 0 });
    const r = await askSetter(setter, turns, null);
    const out = r ? renderSetterMessages(r.mensajes, setter.links) : null;
    console.log("\n─ lead:", lead.join(" / "));
    console.log(r ? `  → ${r.siguiente} (${r.motivo})` : "  → sin respuesta");
    for (const m of out ?? []) console.log("  [tú]", m);
  }
  process.exit(0);
}

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
