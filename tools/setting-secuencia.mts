/**
 * Piezas comunes de la secuencia de setting de @rodrigov.ia: los constructores de mensajes, el paso
 * «¿en qué punto estás?» y las ramas (cualificar, invertir, llamada / gratis, Syncra).
 * Las usan setting-fase1 (CTA, comentario en un reel) y setting-inbound (te escriben primero).
 * No toca la base de datos.
 */
// Redirige a /agendar con el origen puesto (next.config.ts de ai-operator).
export const AGENDAR = "https://aioperator.syncralabs.es/reserva";
export const CURSO = "https://yt.openinapp.co/mqvqb";
const HORA = 3600;

export const text = (id: string, t: string, extra: Record<string, unknown> = {}) =>
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

// El paso que reparte en las tres ramas. Cambia solo el texto con el que se pregunta.
export const pasoPunto = (texto: string) =>
  text("punto", texto, {
    delaySeconds: 10,
    waitForReply: true,
    buttons: [
      { label: "empiezo de cero", branchId: "cero" },
      { label: "ya sé montar cosas", branchId: "monta" },
      { label: "tengo un negocio", branchId: "negocio" },
    ],
  });

export const ramasSetting = () => [
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
]
