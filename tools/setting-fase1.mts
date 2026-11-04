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

const RODRIGOV_IA = "cmslqda9l000404kv76a8n701";
// Redirige a /agendar con el origen puesto (next.config.ts de ai-operator).
const AGENDAR = "https://aioperator.syncralabs.es/reserva";
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
    "perfecto, por lo que me cuentas creo que te puedo ayudar\n\nlo mejor es que hagamos una llamada de 30 min, vemos tu caso y te digo cómo lo haría yo. y si veo que no encaja te lo digo también",
    { delaySeconds: 10 }
  ),
  // El enlace en su propio mensaje: la vista previa de Instagram sale debajo de él y nada más.
  text(`${r}-si2`, `coge aquí el hueco que te venga bien:\n\n${AGENDAR}`, { delaySeconds: 6 }),
  text(`${r}-si3`, "¿pudiste coger hueco? si no te cuadra ninguno dime y lo movemos", {
    delaySeconds: 4 * HORA,
    skipIfReplied: true,
  }),
];

const gratis = (r: string) => [
  text(
    `${r}-no1`,
    `te soy sincero: para tu punto ahora mismo lo que más te sirve es empezar por la base\n\naquí tienes el curso completo gratis, son más de 7 horas: ${CURSO}\n\ncuando lo tengas más rodado me escribes y hablamos`,
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
    { id: "cero_no", name: "De cero · ahora no", qualified: false, steps: gratis("cero") },
    { id: "monta_no", name: "Sabe montar · ahora no", qualified: false, steps: gratis("monta") },
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
      data: { sequence, goal: "Setting fase 1: triaje con botones → llamada (cualificados), curso gratis (ahora no) o Syncra (negocio)" },
    })
  )
);
for (const c of await prisma.automation.findMany({ where: { id: { in: camps.map((c) => c.id) } } })) {
  console.log(`${c.isActive ? "ON " : "off"} ${c.name} | secuencia válida: ${sequenceSchema.safeParse(c.sequence).success}`);
}
await prisma.$disconnect();
