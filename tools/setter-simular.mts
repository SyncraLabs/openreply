/**
 * Conversaciones de prueba del setter: Claude hace de lead (con una persona inventada y marcada como
 * tal) y el setter de verdad le contesta. No toca Instagram ni la base de datos.
 *
 *   ./tools/ops setter-simular [salida.json]
 */
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { askSetter, renderSetterMessages, type SetterTurn } from "@/lib/queue/setter";
import type { SetterConfig } from "@/lib/sequence";
import { AUDIOS, BRIEF, LINKS } from "./setter-rodrigov-config.mjs";

// Para simular, todos los audios propuestos cuentan como subidos.
const config: SetterConfig = {
  maxReplies: 20,
  links: LINKS,
  audios: Object.fromEntries(Object.entries(AUDIOS).map(([k, a]) => [k, { url: `https://audio.test/${k}`, cuando: a.cuando }])),
  brief: BRIEF,
};

const PERSONAS = [
  {
    id: "agenda",
    titulo: "Quiere montarlo en serio y puede invertir",
    perfil: { profileName: "Laura Gómez", username: "laura.gmz" },
    persona:
      "Laura, 31 años, de Valencia. Administrativa en una gestoría desde hace 6 años, quemada. Lleva unos meses viendo vídeos de IA y ha montado un par de automatizaciones de prueba con Make. Quiere dejar el trabajo en un año y vivir de esto. Puede dedicarle 2 horas al día. Tiene ahorros y si ve que tiene sentido invertiría ya.",
  },
  {
    id: "skool",
    titulo: "Empieza de cero y ahora no puede invertir",
    perfil: { profileName: null, username: "jdavid_99" },
    persona:
      "Juan David, 19 años, de Medellín. Estudia ingeniería y trabaja los findes en un bar. No sabe casi nada de IA, solo usa ChatGPT. Quiere ganar dinero extra. No tiene ahorros: ahora mismo no podría invertir nada.",
  },
  {
    id: "syncra",
    titulo: "Tiene un negocio y quiere meterle IA",
    perfil: { profileName: "Clínica Dental Sonríe", username: "clinicasonrie" },
    persona:
      "Marta, dueña de una clínica dental en Sevilla con 6 empleados. Escribe desde la cuenta de la clínica. No quiere montar una agencia: quiere que la IA le quite trabajo, sobre todo las citas por WhatsApp y las llamadas que no da tiempo a coger.",
  },
  {
    id: "humano",
    titulo: "Pregunta el precio y si eres un bot",
    perfil: { profileName: "Andrés", username: "andres_rmz" },
    persona:
      "Andrés, 40 años, de Ciudad de México, comercial. Desconfiado. Contesta a lo primero, pero en cuanto puede pregunta cuánto cuesta, y si no le dan el precio pregunta si está hablando con un bot.",
  },
];

const anthropic = new Anthropic();
const OPENER = "acabo de ver que has comentado en mi video para montar tu agencia, es así?";

async function leadSays(persona: string, turns: SetterTurn[]): Promise<string> {
  const transcript = turns.map((t) => `[${t.from === "tu" ? "rodrigo" : "tú"}] ${t.text}`).join("\n");
  const r = await anthropic.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    output_config: { effort: "low" },
    system: `Haces de persona real en una prueba: un chico o chica que ha comentado en un vídeo de Instagram de Rodrigo sobre montar un negocio de IA y ahora le contesta por DM. Esta es la persona: ${persona}\n\nContestas solo con el texto de tu siguiente mensaje: corto, como se escribe por Instagram, a veces sin tildes. Contestas a lo que te preguntan, sin contar toda tu vida de golpe.`,
    messages: [{ role: "user", content: `Conversación hasta ahora:\n${transcript}\n\nTu siguiente mensaje:` }],
  });
  const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  return text.replace(/^\[tú\]\s*/, "");
}

const out = [];
for (const p of PERSONAS) {
  const turns: SetterTurn[] = [{ from: "tu", text: OPENER, at: 0 }];
  const mensajes: { de: "tu" | "lead"; tipo: "texto" | "audio"; texto: string }[] = [{ de: "tu", tipo: "texto", texto: OPENER }];
  let final = "seguir";
  let motivo = "";
  for (let i = 0; i < 14 && final === "seguir"; i++) {
    const lead = await leadSays(p.persona, turns);
    turns.push({ from: "lead", text: lead, at: 0 });
    mensajes.push({ de: "lead", tipo: "texto", texto: lead });
    const reply = await askSetter(config, turns, p.perfil);
    if (!reply) { final = "sin respuesta"; break; }
    final = reply.siguiente;
    motivo = reply.motivo;
    const rendered = renderSetterMessages(reply.mensajes, config);
    if (!rendered) { final = "humano (enlace o audio desconocido)"; break; }
    for (const m of rendered) {
      const texto = m.type === "audio" ? m.key : m.text;
      turns.push({ from: "tu", text: m.type === "audio" ? `{audio:${m.key}}` : m.text, at: 0 });
      mensajes.push({ de: "tu", tipo: m.type === "audio" ? "audio" : "texto", texto });
    }
    process.stdout.write(".");
  }
  console.log(`\n${p.id}: ${final} (${mensajes.length} mensajes)`);
  out.push({ ...p, final, motivo, mensajes });
}

const file = process.argv[2] ?? "setter-simulacion.json";
fs.writeFileSync(file, JSON.stringify({ audios: AUDIOS, conversaciones: out }, null, 2));
console.log("guardado en", file);
