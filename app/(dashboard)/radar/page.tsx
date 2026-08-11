/**
 * Radar — competencia y nichos.
 *
 * Ordenado por outlier score, no por reproducciones. Ordenar por views brutas
 * te devuelve siempre las cuentas grandes y eso no enseña nada: lo que enseña
 * es qué post rompió la norma de su propia cuenta.
 *
 * Server component: consulta Postgres directo, sin cascada de fetch en cliente.
 */

import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { LANG_COOKIE, normalizeLang, translator } from "@/lib/i18n";
import { getRadarProvider } from "@/lib/radar/provider";
import RadarAccountManager from "@/components/radar-account-manager";

export const dynamic = "force-dynamic";

function formatNumber(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default async function RadarPage() {
  const [workspaceId, cookieStore] = await Promise.all([
    getCurrentWorkspaceId(),
    cookies(),
  ]);
  const t = translator(normalizeLang(cookieStore.get(LANG_COOKIE)?.value));

  if (!workspaceId) {
    return <p className="text-sm text-muted">No hay workspace activo.</p>;
  }

  const [accounts, posts] = await Promise.all([
    prisma.radarAccount.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { posts: true } } },
    }),
    prisma.radarPost.findMany({
      where: { workspaceId, outlierScore: { not: null } },
      orderBy: { outlierScore: "desc" },
      take: 60,
      include: { account: { select: { username: true, medianViews: true } } },
    }),
  ]);

  const hayProveedor = getRadarProvider() !== null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("radar.title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("radar.subtitle")}</p>
      </header>

      {!hayProveedor && (
        <div className="panel border-l-2 border-l-warning p-4">
          <p className="text-sm font-medium">{t("radar.noProvider")}</p>
          <p className="mt-1 text-sm text-muted">{t("radar.noProviderHelp")}</p>
        </div>
      )}

      <RadarAccountManager
        initialAccounts={accounts.map((a) => ({
          id: a.id,
          username: a.username,
          followers: a.followers,
          medianViews: a.medianViews,
          postCount: a._count.posts,
          lastError: a.lastError,
          lastFetchedAt: a.lastFetchedAt?.toISOString() ?? null,
        }))}
        canRefresh={hayProveedor}
      />

      {posts.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-muted">{t("radar.empty")}</p>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t("radar.score")}</th>
                <th className="px-4 py-3 font-medium">{t("radar.post")}</th>
                <th className="px-4 py-3 font-medium">{t("radar.account")}</th>
                <th className="px-4 py-3 font-medium">{t("radar.views")}</th>
                <th className="px-4 py-3 font-medium">{t("radar.engagement")}</th>
                <th className="px-4 py-3 font-medium">{t("radar.date")}</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => {
                const score = p.outlierScore ?? 0;
                // 3× la mediana de su cuenta es el umbral a partir del cual
                // merece la pena mirarlo: por debajo es su día normal.
                const destacado = score >= 3;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-border last:border-0 hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tabular ${
                          destacado
                            ? "bg-accent-muted text-accent"
                            : "bg-surface-hover text-muted"
                        }`}
                      >
                        {score.toFixed(1)}×
                      </span>
                    </td>
                    <td className="max-w-sm px-4 py-3">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-2 text-foreground hover:text-accent hover:underline"
                      >
                        {p.caption?.slice(0, 120) || t("radar.noCaption")}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://instagram.com/${p.account.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        @{p.account.username}
                      </a>
                      <div className="text-xs text-muted">
                        {t("radar.median")} {formatNumber(p.account.medianViews)}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular">{formatNumber(p.views)}</td>
                    <td className="px-4 py-3 text-muted tabular">
                      {formatNumber(p.likes)} · {formatNumber(p.comments)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {p.postedAt.toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">{t("radar.footnote")}</p>
    </div>
  );
}
