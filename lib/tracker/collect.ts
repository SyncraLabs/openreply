/**
 * Relleno automático del tracker.
 *
 * Cada plataforma tiene una realidad distinta y conviene tenerla escrita:
 *
 * - Instagram: ya lo tenemos. La app guarda un FollowerSnapshot al día de la
 *   cuenta conectada, así que es gratis y sin credenciales nuevas.
 * - YouTube: API oficial (Data API v3). Gratis, pero necesita una API key de
 *   Google en YOUTUBE_API_KEY. Sin ella se salta.
 * - TikTok: NO hay API pública de seguidores. Requiere scraping, que se rompe
 *   cada pocas semanas. Por eso no se implementa aquí: se deja manual hasta
 *   decidir proveedor, y así el resto del tracker no depende de algo frágil.
 *
 * Regla clave: sólo se sobrescriben los campos listados en `autoFields`. Lo
 * que Rodrigo escriba a mano nunca se pisa, aunque luego haya fuente
 * automática para ese campo.
 */

import { prisma } from "@/lib/db/client";

export interface ResultadoRecogida {
  date: string;
  rellenados: string[];
  saltados: string[];
}

/** Medianoche UTC de hoy: la misma clave de día que usa FollowerSnapshot. */
function hoyUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

async function seguidoresYouTube(): Promise<number | null> {
  const key = process.env.YOUTUBE_API_KEY;
  const handle = process.env.YOUTUBE_HANDLE ?? "rodrigonzalezia";
  if (!key) return null;

  const url =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=statistics&forHandle=${encodeURIComponent(handle)}&key=${key}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`YouTube ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
  const json = (await res.json()) as {
    items?: { statistics?: { subscriberCount?: string } }[];
  };
  const n = json.items?.[0]?.statistics?.subscriberCount;
  return n ? Number(n) : null;
}

export async function recogerHoy(workspaceId: string): Promise<ResultadoRecogida> {
  const date = hoyUTC();
  const rellenados: string[] = [];
  const saltados: string[] = [];

  const datos: Record<string, number> = {};

  // --- Instagram: del snapshot diario que la app ya guarda ---
  const snap = await prisma.followerSnapshot.findFirst({
    where: { date, instagramAccount: { workspaceId } },
    orderBy: { createdAt: "desc" },
    select: { followersCount: true },
  });
  if (snap) {
    datos.instagram = snap.followersCount;
    rellenados.push("instagram");
  } else {
    saltados.push("instagram (aún no hay snapshot de hoy)");
  }

  // --- YouTube: API oficial si hay key ---
  try {
    const yt = await seguidoresYouTube();
    if (yt !== null) {
      datos.youtube = yt;
      rellenados.push("youtube");
    } else {
      saltados.push("youtube (falta YOUTUBE_API_KEY)");
    }
  } catch (e) {
    saltados.push(`youtube (${e instanceof Error ? e.message : "error"})`);
  }

  // --- TikTok: sin API oficial, se queda manual ---
  saltados.push("tiktok (sin API oficial, manual)");

  if (rellenados.length > 0) {
    const existente = await prisma.dailyMetric.findUnique({
      where: { workspaceId_date: { workspaceId, date } },
      select: { autoFields: true },
    });

    // Unión de los campos que ya eran automáticos y los de ahora: si un día
    // falla YouTube, su campo no deja de considerarse automático.
    const autoFields = Array.from(
      new Set([...(existente?.autoFields ?? []), ...rellenados])
    );

    await prisma.dailyMetric.upsert({
      where: { workspaceId_date: { workspaceId, date } },
      create: { workspaceId, date, ...datos, autoFields },
      update: { ...datos, autoFields },
    });
  }

  return { date: date.toISOString().slice(0, 10), rellenados, saltados };
}

/** Recorre todos los workspaces. Lo llama el worker una vez al día. */
export async function recogerTodos(): Promise<ResultadoRecogida[]> {
  const workspaces = await prisma.workspace.findMany({ select: { id: true } });
  const salida: ResultadoRecogida[] = [];
  for (const w of workspaces) {
    try {
      salida.push(await recogerHoy(w.id));
    } catch (e) {
      console.error("[tracker] recogida falló", w.id, e);
    }
  }
  return salida;
}
