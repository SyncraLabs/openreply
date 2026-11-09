import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { autenticarExtension } from "@/lib/extension/auth";
import { getRedisConnection } from "@/lib/queue/client";

const MODEL = "claude-sonnet-5-5";
const TOPE_DIARIO = 150;
const ENLACES: Record<string, string> = {
  agenda: "https://aioperator.syncralabs.es/agendar",
  curso: "https://yt.openinapp.co/mqvqb",
};

const METODO = `Eres el asistente de setting de Rodrigo (@rodrigov.ia). Rodrigo responde él mismo los DMs de Instagram; tú le sugieres qué escribir. No envías nada.

Lo que vende: AI Operator, un programa para montar tu agencia de IA y aprender a vender. El objetivo del chat es agendar una llamada con quien encaje. El precio y la oferta se cuentan en la llamada, nunca por chat.

El método, en orden:
1. Su situación: a qué se dedica, cuánto lleva, de dónde es, qué edad tiene, qué ha intentado.
2. Qué quiere y por qué: «y por qué quieres montar tu agencia exactamente?», una cifra al mes, y el motivo real (por qué es importante, qué cambiaría, por qué ahora, qué pasa si en 6 meses sigue igual). Si responde en plano, vuelve a preguntar por qué.
3. Qué hace y qué le frena: qué hace ahora, cuánto lleva, si ha salido a vender, cuántos negocios ha contactado, qué cree que le frena, si sabe vender.
4. Decirle por qué no lo consigue, con sus palabras: casi siempre persigue cursos gratis, tiene parálisis por análisis, salta de una cosa a otra o sabe montar pero no vende. Lo que tiene que hacer es aprender a vender y salir a hablar con negocios. Rodrigo puede contar que a él le cambió salir a hablar con negocios sin sentirse preparado.
5. Si podría invertir («si vemos que encaja, tendrías capacidad de invertir en un programa para montarlo?») y proponer la llamada sin compromiso, con día y hora o con el enlace {agenda}.
Si está muy caliente (pregunta cómo entrar o dice que tiene el dinero), directo a la llamada.
Si no puede invertir o empieza de cero sin dinero: el curso gratis {curso}, sin presionar.
Si es menor de edad: el curso {curso}, sin llamada ni venta.
Si tiene un negocio y quiere meter IA en él: es para Syncra, la consultora de Rodrigo; pregúntale qué hace su negocio y propón reunirse.

Reglas: una pregunta por mensaje. Nunca preguntes lo que ya ha contado. Responde a lo que dijo antes de preguntar. Nunca prometas ingresos, resultados ni plazos. Nunca digas precios. No metas prisa falsa. Casos que puedes citar solo así: César empezó desde cero y cerró su primer cliente en menos de un mes; Sara entró en marzo y cerró un cliente de 450 € al mes en junio.

Cómo escribe Rodrigo: en minúscula, corto, sin signos de apertura, con «tio», «buah», «dale», «??». Cada mensaje es una línea corta. Ejemplos: «bien tio», «y a qué te dedicas ahora?», «ya veo», «mira tio, te voy a ser sincero», «pues si quieres nos metemos a una llamada y vemos si te puedo ayudar».
Los enlaces solo con su marcador: {agenda} o {curso}. Nunca escribas una URL.`;

const respuestaSchema = z.object({
  fase: z.enum(["situacion", "que-quiere", "que-le-frena", "valor", "llamada", "cita", "curso", "syncra", "menor", "seguimiento", "objecion"]),
  falta: z.array(z.string()).max(3),
  motivo: z.string(),
  mensajes: z.array(z.string()).min(1).max(3),
  estadoSugerido: z.enum(["Hablando", "Potencial", "Llamada propuesta", "Agendado", "Curso", "Syncra", "Perdido"]),
});

const entrada = z.object({
  usuario: z.string().max(40).optional(),
  nombre: z.string().max(80).optional(),
  nota: z.string().max(2000).optional(),
  mensajes: z.array(z.object({ texto: z.string().max(1000), mio: z.boolean() })).min(1).max(30),
});

let client: Anthropic | null = null;

export async function POST(req: Request) {
  const ctx = await autenticarExtension(req);
  if (!ctx) return NextResponse.json({ error: "Token no válido" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "La IA no está configurada en el servidor" }, { status: 503 });
  const datos = entrada.safeParse(await req.json().catch(() => null));
  if (!datos.success) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });

  const clave = `ext:ia:${ctx.workspaceId}:${new Date().toISOString().slice(0, 10)}`;
  const usados = await getRedisConnection().incr(clave);
  if (usados === 1) await getRedisConnection().expire(clave, 60 * 60 * 48);
  if (usados > TOPE_DIARIO) return NextResponse.json({ error: `Has llegado al tope de ${TOPE_DIARIO} sugerencias de hoy` }, { status: 429 });

  const { nombre, usuario, nota, mensajes } = datos.data;
  const chat = mensajes.map((m) => `[${m.mio ? "rodrigo" : "lead"}] ${m.texto}`).join("\n");
  try {
    client ??= new Anthropic();
    const r = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 1200,
      system: METODO,
      messages: [{
        role: "user",
        content: `Lead: ${nombre || "sin nombre"}${usuario ? ` (@${usuario})` : ""}.${nota ? `\nNota de Rodrigo: ${nota}` : ""}\n\nÚltimos mensajes, del más antiguo al más reciente:\n${chat}\n\nDi en qué fase está, qué falta saber (máximo 3 cosas cortas), por qué en una frase, los 1 a 3 mensajes siguientes que mandaría Rodrigo y el estado que le pondrías.`,
      }],
      output_config: { effort: "low", format: betaZodOutputFormat(respuestaSchema) },
    });
    const salida = r.parsed_output;
    if (r.stop_reason === "refusal" || !salida) return NextResponse.json({ error: "La IA no ha podido sugerir nada" }, { status: 502 });
    const conEnlaces = salida.mensajes.map((m) => m.replace(/\{(agenda|curso)\}/g, (_, k) => ENLACES[k]));
    if (conEnlaces.some((m) => /\{[^}]*\}/.test(m) || /https?:\/\/(?!aioperator\.syncralabs\.es|yt\.openinapp\.co)/.test(m))) {
      return NextResponse.json({ error: "La IA propuso un enlace que no es tuyo; vuelve a pedirla" }, { status: 502 });
    }
    return NextResponse.json({ ...salida, mensajes: conEnlaces, usados });
  } catch (error) {
    console.error("[extension] sugerir", error);
    return NextResponse.json({ error: "No se ha podido hablar con la IA" }, { status: 502 });
  }
}
