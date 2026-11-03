/**
 * Solo lectura: exporta todos los contactos (uno por usuario de Instagram) en JSON para el CRM de AI Operator.
 *
 *   ./tools/ops contactos-export > contactos.json
 *
 * Junta DmLog (campañas), SequenceChoice (botones) y las respuestas libres que
 * aún estén en Redis (se borran a las 48 h). ProcessedComment no lleva usuario,
 * solo el id del comentario, y el comentario ya está en DmLog. El resumen sale por
 * stderr, el JSON por stdout. El fichero lleva datos personales: no va a git.
 */
import { prisma } from "@/lib/db/client";
import { getRedisConnection } from "@/lib/queue/client";

interface Contacto {
  instagram_id: string;
  instagram: string | null;
  nombre: string | null;
  campanas: { campana: string; palabra_clave: string | null; post_id: string | null; fecha: string }[];
  botones: { clave: string; texto: string; cualificado: boolean; fecha: string }[];
  textos: { texto: string; fecha: string }[];
  primer_contacto: string;
  ultimo_contacto: string;
}

const AIOPERATOR_ORIGIN = "aioperator:";
const contactos = new Map<string, Contacto>();
const vacio = (id: string): Contacto => ({
  instagram_id: id, instagram: null, nombre: null, campanas: [], botones: [], textos: [],
  primer_contacto: "", ultimo_contacto: "",
});
const get = (id: string) => {
  let c = contactos.get(id);
  if (!c) contactos.set(id, (c = vacio(id)));
  return c;
};

// DmLog: una fila por comentario. Los DMs mandados desde AI Operator no son campaña.
const logs = await prisma.dmLog.findMany({
  orderBy: { createdAt: "asc" },
  select: {
    commenterId: true, commenterName: true, matchedKeyword: true, commentId: true, createdAt: true,
    automation: { select: { name: true, postId: true } },
  },
});
for (const l of logs) {
  const c = get(l.commenterId);
  c.instagram ??= l.commenterName?.replace(/^@/, "") || null;
  if (l.commentId.startsWith(AIOPERATOR_ORIGIN)) continue;
  c.campanas.push({
    campana: l.automation.name,
    palabra_clave: l.matchedKeyword,
    post_id: l.automation.postId,
    fecha: l.createdAt.toISOString(),
  });
}

// SequenceChoice: el último botón pulsado por campaña (clave = id de la rama).
const botones = await prisma.sequenceChoice.findMany({
  orderBy: { updatedAt: "asc" },
  select: { userId: true, branchId: true, branchName: true, qualified: true, updatedAt: true },
});
for (const b of botones) {
  get(b.userId).botones.push({
    clave: b.branchId, texto: b.branchName, cualificado: b.qualified, fecha: b.updatedAt.toISOString(),
  });
}

// Redis: respuestas libres de las últimas 48 h (solo lectura: SCAN + LRANGE).
const redis = getRedisConnection();
let textosRedis = 0;
let redisOk = true;
try {
  const claves: string[] = [];
  for (const patron of ["convo:msgs:*", "setter:turns:*"]) {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", patron, "COUNT", 500);
      cursor = next;
      claves.push(...keys);
    } while (cursor !== "0");
  }
  for (const clave of claves) {
    const [prefijo, , , usuario] = clave.split(":");
    const c = contactos.get(usuario);
    if (!c) continue; // solo gente que ya conocemos por DmLog/SequenceChoice
    for (const raw of await redis.lrange(clave, 0, -1)) {
      let m: { at: number; text: string; from?: string };
      try { m = JSON.parse(raw); } catch { continue; }
      if (!m.text) continue;
      if (prefijo === "setter" && m.from !== "lead") continue; // lo nuestro no es respuesta suya
      const fecha = new Date(m.at).toISOString();
      if (c.textos.some((t) => t.texto === m.text && Math.abs(Date.parse(t.fecha) - m.at) < 5000)) continue;
      c.textos.push({ texto: m.text, fecha });
      textosRedis++;
    }
  }
} catch (error) {
  redisOk = false;
  console.error("Redis no se pudo leer, sale sin respuestas libres:", error instanceof Error ? error.message : error);
}

for (const c of contactos.values()) {
  c.nombre = c.instagram;
  c.textos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const fechas = [...c.campanas, ...c.botones, ...c.textos].map((x) => x.fecha).sort();
  c.primer_contacto = fechas[0] ?? "";
  c.ultimo_contacto = fechas[fechas.length - 1] ?? "";
}
const lista = [...contactos.values()].sort((a, b) => a.primer_contacto.localeCompare(b.primer_contacto));
process.stdout.write(JSON.stringify(lista, null, 2) + "\n");

const conBoton = lista.filter((c) => c.botones.length > 0).length;
const cualificados = lista.filter((c) => c.botones.some((b) => b.cualificado)).length;
console.error(
  `contactos: ${lista.length} | con botón: ${conBoton} | cualificados: ${cualificados} | con texto: ${lista.filter((c) => c.textos.length).length} (${textosRedis} mensajes, redis ${redisOk ? "ok" : "no leído"}) | ` +
    `primer contacto: ${lista[0]?.primer_contacto} | último: ${lista.map((c) => c.ultimo_contacto).sort().pop()}`
);
await prisma.$disconnect();
redis.disconnect();
