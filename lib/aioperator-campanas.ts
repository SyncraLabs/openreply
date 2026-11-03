import { prisma } from "@/lib/db/client";
import { getRedisConnection } from "@/lib/queue/client";
import { parseSequence } from "@/lib/sequence";

// Read-only list of campaigns for AI Operator's /panel/sistema tree.
// Served by GET /api/aioperator/campanas (same Bearer secret as the other
// AI Operator endpoints). Counters cover the last 30 days.

export const DAYS = 30;
export const CACHE_KEY = "aioperator:campanas:v1";
export const CACHE_SECONDS = 60;

export type CampanaEstado = "activa" | "pausada" | "retirada";

export interface CampanaBoton {
  nombre: string;
  pulsados: number;
}

export interface Campana {
  id: string;
  nombre: string;
  estado: CampanaEstado;
  keyword: string;
  postId: string | null;
  postUrl: string | null;
  /** First message the person receives. */
  dmTexto: string;
  /** Labels of the buttons in the sequence (empty if it has none). */
  botones: string[];
  enviados: number;
  fallidos: number;
  botonesPulsados: number;
  cualificados: number;
  /** Taps per button name. */
  porBoton: CampanaBoton[];
}

export function estadoDe(a: { isActive: boolean; retiredAt: Date | null }): CampanaEstado {
  if (a.retiredAt) return "retirada";
  return a.isActive ? "activa" : "pausada";
}

export function botonesDe(sequence: unknown): string[] {
  let seq;
  try {
    seq = parseSequence(sequence);
  } catch {
    return [];
  }
  const etiquetas = [...seq.main, ...seq.branches.flatMap((b) => b.steps)]
    .flatMap((s) => s.buttons)
    .map((b) => b.label);
  return [...new Set(etiquetas)];
}

export async function listarCampanas(now = Date.now()): Promise<Campana[]> {
  const desde = new Date(now - DAYS * 86_400_000);

  const [automations, logs, choices] = await Promise.all([
    prisma.automation.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keywords: true,
        postId: true,
        postUrl: true,
        dmMessage: true,
        openingDmEnabled: true,
        openingDmMessage: true,
        sequence: true,
        isActive: true,
        retiredAt: true,
      },
    }),
    prisma.dmLog.groupBy({
      by: ["automationId", "status"],
      where: { createdAt: { gte: desde }, status: { in: ["SENT", "FAILED"] } },
      _count: { _all: true },
    }),
    prisma.sequenceChoice.groupBy({
      by: ["automationId", "branchName", "qualified"],
      where: { createdAt: { gte: desde } },
      _count: { _all: true },
    }),
  ]);

  return automations.map((a) => {
    const mios = logs.filter((l) => l.automationId === a.id);
    const pulsaciones = choices.filter((c) => c.automationId === a.id);
    const porNombre = new Map<string, number>();
    for (const c of pulsaciones) {
      porNombre.set(c.branchName, (porNombre.get(c.branchName) ?? 0) + c._count._all);
    }
    return {
      id: a.id,
      nombre: a.name,
      estado: estadoDe(a),
      keyword: a.keywords.join(", "),
      postId: a.postId,
      postUrl: a.postUrl,
      dmTexto: a.openingDmEnabled && a.openingDmMessage ? a.openingDmMessage : a.dmMessage,
      botones: botonesDe(a.sequence),
      enviados: mios.find((l) => l.status === "SENT")?._count._all ?? 0,
      fallidos: mios.find((l) => l.status === "FAILED")?._count._all ?? 0,
      botonesPulsados: pulsaciones.reduce((n, c) => n + c._count._all, 0),
      cualificados: pulsaciones.filter((c) => c.qualified).reduce((n, c) => n + c._count._all, 0),
      porBoton: [...porNombre].map(([nombre, pulsados]) => ({ nombre, pulsados })),
    };
  });
}

/** Same list with a 60 s Redis cache. Redis down = straight to the database. */
export async function listarCampanasConCache(): Promise<Campana[]> {
  try {
    const redis = getRedisConnection();
    const guardado = await redis.get(CACHE_KEY);
    if (guardado) return JSON.parse(guardado) as Campana[];
    const fresco = await listarCampanas();
    await redis.set(CACHE_KEY, JSON.stringify(fresco), "EX", CACHE_SECONDS);
    return fresco;
  } catch (error) {
    console.error("[AI Operator campanas] cache:", error instanceof Error ? error.message : error);
    return listarCampanas();
  }
}
