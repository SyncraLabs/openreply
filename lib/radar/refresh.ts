/**
 * Refresco del Radar: baja los posts recientes de cada cuenta vigilada y
 * recalcula su outlier score.
 *
 * Por qué outlier score y no views brutas: ordenar por views te devuelve
 * siempre a las cuentas grandes, y eso no enseña nada. Lo que enseña es qué
 * post rompió LA NORMA DE SU PROPIA CUENTA. Un reel con 40k de una cuenta de
 * 3k es una señal mucho más fuerte que uno con 800k de una cuenta de 2M.
 *
 *   outlierScore = views del post ÷ mediana de views de esa cuenta
 *
 * Mediana y no media: un solo viral dispara la media y aplana todo lo demás.
 * La mediana aguanta.
 */

import { prisma } from "@/lib/db/client";
import { getRadarProvider, type RadarProviderPost } from "@/lib/radar/provider";

/** Posts por cuenta que se piden en cada refresco. */
const POSTS_PER_ACCOUNT = 24;

/** Con menos posts con views, la mediana no significa nada todavía. */
const MIN_POSTS_FOR_MEDIAN = 4;

export function median(values: number[]): number | null {
  const limpios = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (limpios.length === 0) return null;
  const mitad = Math.floor(limpios.length / 2);
  return limpios.length % 2 === 0
    ? Math.round((limpios[mitad - 1] + limpios[mitad]) / 2)
    : limpios[mitad];
}

export function outlierScore(
  views: number | null,
  medianViews: number | null
): number | null {
  if (!views || !medianViews || medianViews <= 0) return null;
  return Math.round((views / medianViews) * 100) / 100;
}

export interface RefreshResult {
  accounts: number;
  posts: number;
  failed: number;
  skipped: boolean;
}

export async function refreshRadar(workspaceId?: string): Promise<RefreshResult> {
  const provider = getRadarProvider();
  if (!provider) return { accounts: 0, posts: 0, failed: 0, skipped: true };

  const cuentas = await prisma.radarAccount.findMany({
    where: { isActive: true, ...(workspaceId ? { workspaceId } : {}) },
  });

  let posts = 0;
  let failed = 0;

  for (const cuenta of cuentas) {
    try {
      const perfil = await provider.fetchProfile(cuenta.username, POSTS_PER_ACCOUNT);

      // La mediana se calcula sobre lo que acaba de llegar más lo ya guardado,
      // para que no baile cuando un refresco trae pocos posts con views.
      const previos = await prisma.radarPost.findMany({
        where: { radarAccountId: cuenta.id },
        select: { externalId: true, views: true },
      });
      const vistasPrevias = new Map(previos.map((p) => [p.externalId, p.views]));
      for (const p of perfil.posts) vistasPrevias.set(p.externalId, p.views);

      const conViews = [...vistasPrevias.values()].filter(
        (v): v is number => typeof v === "number" && v > 0
      );
      const medianViews =
        conViews.length >= MIN_POSTS_FOR_MEDIAN ? median(conViews) : null;

      await guardarPosts(cuenta.id, cuenta.workspaceId, perfil.posts, medianViews);

      // Los posts que no venían en este refresco también cambian de score si
      // la mediana se movió, así que se recalculan todos de una pasada.
      if (medianViews) {
        await recalcularScores(cuenta.id, medianViews);
      }

      await prisma.radarAccount.update({
        where: { id: cuenta.id },
        data: {
          displayName: perfil.displayName ?? cuenta.displayName,
          followers: perfil.followers ?? cuenta.followers,
          medianViews,
          lastFetchedAt: new Date(),
          lastError: null,
        },
      });
      posts += perfil.posts.length;
    } catch (error) {
      failed += 1;
      const mensaje = error instanceof Error ? error.message : "Error desconocido";
      await prisma.radarAccount
        .update({
          where: { id: cuenta.id },
          data: { lastFetchedAt: new Date(), lastError: mensaje.slice(0, 300) },
        })
        .catch(() => {});
      console.error(`[radar] ${cuenta.username}:`, mensaje);
    }
  }

  return { accounts: cuentas.length, posts, failed, skipped: false };
}

async function guardarPosts(
  radarAccountId: string,
  workspaceId: string,
  posts: RadarProviderPost[],
  medianViews: number | null
): Promise<void> {
  for (const post of posts) {
    const datos = {
      url: post.url,
      caption: post.caption,
      thumbnailUrl: post.thumbnailUrl,
      mediaType: post.mediaType,
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      outlierScore: outlierScore(post.views, medianViews),
      postedAt: post.postedAt,
      fetchedAt: new Date(),
    };

    await prisma.radarPost.upsert({
      where: {
        radarAccountId_externalId: { radarAccountId, externalId: post.externalId },
      },
      create: { radarAccountId, workspaceId, externalId: post.externalId, ...datos },
      update: datos,
    });
  }
}

async function recalcularScores(
  radarAccountId: string,
  medianViews: number
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "RadarPost"
    SET "outlierScore" = ROUND(("views"::numeric / ${medianViews}) * 100) / 100
    WHERE "radarAccountId" = ${radarAccountId}
      AND "views" IS NOT NULL
      AND "views" > 0
  `;
}
