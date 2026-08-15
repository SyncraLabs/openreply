/**
 * Gestión de campañas desde la terminal — listar, pausar, activar, borrar.
 *
 *   ./tools/ops campaign list
 *   ./tools/ops campaign show "SKILL LIBRERIA"
 *   ./tools/ops campaign pause GENERAL
 *   ./tools/ops campaign activate "PRUEBA — próximo reel"
 *   ./tools/ops campaign conflicts
 *
 * `conflicts` es el importante: avisa de campañas que se pisan. Meta concede
 * UN private reply por comentario y gana la más ANTIGUA, no la más
 * específica, así que una campaña global vieja tapa toda campaña por vídeo
 * creada después. Es el fallo que más cuesta ver a ojo.
 */
import { prisma } from "../lib/db/client.js";

type Cmd = "list" | "show" | "pause" | "activate" | "delete" | "conflicts";

const [cmd, ...resto] = process.argv.slice(2) as [Cmd, ...string[]];
const nombre = resto.join(" ").trim();

function alcance(a: {
  matchAnyPost: boolean;
  pendingNextReel: boolean;
  postId: string | null;
}): string {
  if (a.matchAnyPost) return "TODOS los posts";
  if (a.pendingNextReel) return "próximo reel";
  return `post ${a.postId ?? "—"}`;
}

async function buscar(n: string) {
  const a = await prisma.automation.findFirst({ where: { name: n } });
  if (!a) {
    console.error(`No existe la campaña "${n}". Usa: ./tools/ops campaign list`);
    process.exit(1);
  }
  return a;
}

switch (cmd) {
  case "list": {
    const todas = await prisma.automation.findMany({
      orderBy: { createdAt: "asc" },
    });
    console.log("(orden de creación — en un empate gana la de arriba)\n");
    for (const a of todas) {
      const estado = a.isActive ? "ACTIVA " : "pausada";
      const palabras = a.matchAnyWord ? "cualquier palabra" : a.keywords.join(", ");
      console.log(`${estado}  ${a.name}`);
      console.log(`         ${alcance(a)} · ${palabras}`);
    }
    break;
  }

  case "show": {
    const a = await buscar(nombre);
    console.log(JSON.stringify(a, null, 2));
    break;
  }

  case "pause":
  case "activate": {
    const a = await buscar(nombre);
    const isActive = cmd === "activate";
    await prisma.automation.update({ where: { id: a.id }, data: { isActive } });
    console.log(`${a.name} → ${isActive ? "ACTIVA" : "pausada"}`);
    break;
  }

  case "delete": {
    const a = await buscar(nombre);
    await prisma.automation.delete({ where: { id: a.id } });
    console.log(`${a.name} borrada (sus DmLog se van con ella)`);
    break;
  }

  case "conflicts": {
    // Incluye las pausadas: una campaña recién creada suele estar en pausa y es
    // justo cuando hay que saber si al activarla la va a tapar una global.
    const activas = await prisma.automation.findMany({
      orderBy: { createdAt: "asc" },
    });
    const globales = activas.filter((a) => a.matchAnyPost);
    const especificas = activas.filter((a) => !a.matchAnyPost);

    if (globales.length === 0) {
      console.log("✅ Sin campañas globales activas: nada se pisa.");
      break;
    }

    for (const g of globales) {
      console.log(`⚠️  "${g.name}" cubre TODOS los posts (creada ${g.createdAt.toISOString().slice(0, 10)})`);
      const tapadas = especificas.filter((e) => e.createdAt > g.createdAt);
      if (tapadas.length === 0) {
        console.log("    no tapa a ninguna campaña actual");
        continue;
      }
      console.log("    le gana el DM a estas, por ser más antigua:");
      for (const e of tapadas) {
        // El matcher del worker es case-insensitive (lib/utils/keyword-matcher.ts),
        // así que aquí hay que comparar igual. Con `includes` a secas, "CLAUDE" no
        // casaba con "claude" y el detector daba luz verde a un choque real.
        const palabrasGlobal = g.keywords.map((k) => k.toLowerCase());
        const solapa =
          g.matchAnyWord ||
          e.matchAnyWord ||
          e.keywords.some((k) => palabrasGlobal.includes(k.toLowerCase()));
        console.log(`      - ${e.name}${solapa ? "  ← palabras solapadas" : ""}`);
      }
      if (g.publicReplyEnabled) {
        console.log("    además duplica la respuesta pública (eso NO está deduplicado)");
      }
    }
    break;
  }

  default:
    console.log(`uso: ./tools/ops campaign <list|show|pause|activate|delete|conflicts> [nombre]`);
}

await prisma.$disconnect();
