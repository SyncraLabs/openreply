/**
 * Setting fase 1 en @rodrigov.ia: las campañas «Skool» dejan de mandar a todos el mismo audio y el
 * curso gratis, y pasan a cualificar con botones.
 *
 *   comentario → (privada, la de siempre) «acabo de ver que has comentado…»
 *   responde   → ¿en qué punto estás?  [empiezo de cero] [ya sé montar cosas] [tengo un negocio]
 *   cero/monta → qué quiere en 6 meses → ¿podría invertir?  [sí, si tiene sentido] [ahora no]
 *     sí       → cualificado: enlace a /agendar + «ahora te escribo yo»
 *     no       → Skool + curso gratis
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

const RODRIGOV_IA = "cmslqda9l000404kv76a8n701";
const AGENDAR = "https://aioperator.syncralabs.es/agendar?utm_source=instagram&utm_medium=dm&campana=dm-setting";
const SKOOL = "https://aioperator.syncralabs.es/comunidad?utm_source=instagram&utm_medium=dm&campana=dm-setting";
const CURSO = "https://yt.openinapp.co/mqvqb";
const HORA = 3600;

const text = (id: string, t: string, extra: Record<string, unknown> = {}) =>
  ({ id, type: "text", text: t, mediaUrl: null, delaySeconds: 0, buttons: [], ...extra });

// Las dos ramas de quien quiere montar su agencia piden lo mismo; cambia solo la rama a la que saltan.
const cualificar = (r: string) => [
  text(`${r}-meta`, "vale, te entiendo\n\ncuéntame en una frase qué te gustaría tener dentro de 6 meses con esto", {
    delaySeconds: 5,
  }),
  text(
    `${r}-inv`,
    "última y te digo cómo te puedo ayudar\n\nyo trabajo con muy poca gente y en serio. si vemos que encaja, ¿estarías en posición de invertir en montarlo ahora, o ahora mismo no es el momento?",
    {
      delaySeconds: 20,
      waitForReply: true,
      reminders: [{ afterSeconds: 4 * HORA, text: "ey, ¿me cuentas? así te digo por dónde tirar" }],
      buttons: [
        { label: "sí, si tiene sentido", branchId: `${r}_si` },
        { label: "ahora no", branchId: `${r}_no` },
      ],
    }
  ),
];

const llamada = (r: string) => [
  text(
    `${r}-si1`,
    `perfecto, con lo que me cuentas creo que te puedo ayudar de verdad\n\nte dejo aquí mi agenda para que cojas hueco cuando te venga bien. son 30 min, vemos tu caso y te digo si te puedo ayudar o no\n\n${AGENDAR}\n\nahora te escribo yo personalmente`,
    { delaySeconds: 10 }
  ),
  text(`${r}-si2`, "¿pudiste coger hueco? si no te cuadra ninguno dime y lo movemos", {
    delaySeconds: 4 * HORA,
    skipIfReplied: true,
  }),
];

const skool = (r: string) => [
  text(
    `${r}-no1`,
    `te soy sincero: para tu punto ahora mismo lo que más te sirve es empezar por la base\n\ntengo una comunidad donde está todo paso a paso y hago un directo al mes:\n${SKOOL}\n\ny si quieres ir viéndolo gratis, aquí el curso completo: ${CURSO}`,
    { delaySeconds: 10 }
  ),
];

const sequence = sequenceSchema.parse({
  main: [
    text("punto", "para no mandarte lo mismo que a todos: ¿en qué punto estás?", {
      delaySeconds: 10,
      waitForReply: true,
      buttons: [
        { label: "empiezo de cero", branchId: "cero" },
        { label: "ya sé montar cosas", branchId: "monta" },
        { label: "tengo un negocio", branchId: "negocio" },
      ],
    }),
  ],
  branches: [
    { id: "cero", name: "Empieza de cero", qualified: false, steps: cualificar("cero") },
    { id: "monta", name: "Sabe montar, no vende", qualified: false, steps: cualificar("monta") },
    { id: "cero_si", name: "De cero · puede invertir", qualified: true, steps: llamada("cero") },
    { id: "monta_si", name: "Sabe montar · puede invertir", qualified: true, steps: llamada("monta") },
    { id: "cero_no", name: "De cero · ahora no", qualified: false, steps: skool("cero") },
    { id: "monta_no", name: "Sabe montar · ahora no", qualified: false, steps: skool("monta") },
    {
      id: "negocio",
      name: "Tiene negocio (Syncra)",
      qualified: true,
      steps: [
        text(
          "negocio1",
          "ah, que tienes negocio. entonces lo tuyo es meter IA en lo que ya tienes, y eso lo hacemos desde Syncra\n\n¿a qué te dedicas exactamente y qué es lo que más tiempo te come ahora?",
          { delaySeconds: 5 }
        ),
      ],
    },
  ],
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
      data: { sequence, goal: "Setting fase 1: triaje con botones → llamada (cualificados), Skool (ahora no) o Syncra (negocio)" },
    })
  )
);
for (const c of await prisma.automation.findMany({ where: { id: { in: camps.map((c) => c.id) } } })) {
  console.log(`${c.isActive ? "ON " : "off"} ${c.name} | secuencia válida: ${sequenceSchema.safeParse(c.sequence).success}`);
}
await prisma.$disconnect();
