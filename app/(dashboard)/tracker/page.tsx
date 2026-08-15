/**
 * Tracker diario — redes y negocio.
 *
 * Réplica del Sheets "NEGOCIO & VIDA RODRI", con la diferencia de que las
 * cifras de redes se rellenan solas cuando hay fuente y las de negocio se
 * escriben a mano en la propia tabla.
 *
 * Server component: los datos vienen dentro del HTML, sin cascada de fetch.
 */

import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { LANG_COOKIE, normalizeLang, translator } from "@/lib/i18n";
import { calcular, resumir, type FilaCruda } from "@/lib/tracker/metrics";
import TrackerTable, { type FilaTracker } from "@/components/tracker-table";
import TrackerActions from "@/components/tracker-actions";

export const dynamic = "force-dynamic";

/** Prisma devuelve Decimal en los campos de dinero; la UI quiere números. */
function dec(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

export default async function TrackerPage() {
  const [workspaceId, cookieStore] = await Promise.all([
    getCurrentWorkspaceId(),
    cookies(),
  ]);
  const t = translator(normalizeLang(cookieStore.get(LANG_COOKIE)?.value));

  if (!workspaceId) {
    return <p className="text-sm text-muted">No hay workspace activo.</p>;
  }

  const registros = await prisma.dailyMetric.findMany({
    where: { workspaceId },
    orderBy: { date: "asc" },
    take: 400,
  });

  const crudas: FilaCruda[] = registros.map((r) => ({
    date: r.date,
    youtube: r.youtube,
    instagram: r.instagram,
    tiktok: r.tiktok,
    igSyncra: r.igSyncra,
    contenido: r.contenido,
    leads: r.leads,
    llamadasReservadas: r.llamadasReservadas,
    llamadasHechas: r.llamadasHechas,
    clientes: r.clientes,
    ingresos: dec(r.ingresos),
    mrr: dec(r.mrr),
    gastoAds: dec(r.gastoAds),
    autoFields: r.autoFields,
  }));

  const calculadas = calcular(crudas);

  // El resumen de arriba mira los últimos 30 días, que es el horizonte con el
  // que se toman decisiones; la tabla de abajo enseña todo el histórico.
  const ultimos30 = crudas.slice(-30);
  const resumen = resumir(ultimos30);

  // Más recientes primero en pantalla: lo de hoy es lo que se mira.
  const filas: FilaTracker[] = calculadas
    .map((f) => ({ ...f, date: f.date.toISOString().slice(0, 10) }))
    .reverse();

  const hoy = filas[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("tracker.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("tracker.subtitle")}</p>
        </div>
        <TrackerActions />
      </header>

      {/* Resumen del día */}
      {hoy && (
        <div className="panel p-4">
          <div className="text-xs uppercase tracking-wide text-muted">
            {t("tracker.today")} ·{" "}
            {new Date(`${hoy.date}T00:00:00Z`).toLocaleDateString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            <Dato etiqueta="YouTube" valor={hoy.youtube} pct={hoy.youtubePct} />
            <Dato etiqueta="Instagram" valor={hoy.instagram} pct={hoy.instagramPct} />
            <Dato etiqueta="TikTok" valor={hoy.tiktok} pct={hoy.tiktokPct} />
            <Dato etiqueta="Ig Syncra" valor={hoy.igSyncra} pct={hoy.igSyncraPct} />
            <Dato etiqueta="Leads" valor={hoy.leads} />
            <Dato etiqueta="Clientes" valor={hoy.clientes} />
          </div>
        </div>
      )}

      {/* Resumen de 30 días */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metrica
          etiqueta={t("tracker.igGrowth")}
          valor={
            resumen.crecimiento.instagram === null
              ? "—"
              : `${resumen.crecimiento.instagram > 0 ? "+" : ""}${resumen.crecimiento.instagram}`
          }
          pie="30 días"
        />
        <Metrica etiqueta="Leads" valor={resumen.leads} pie="30 días" />
        <Metrica
          etiqueta={t("tracker.showRate")}
          valor={resumen.tasaAsistencia === null ? "—" : `${resumen.tasaAsistencia}%`}
          pie={`${resumen.llamadasHechas}/${resumen.llamadasReservadas}`}
        />
        <Metrica
          etiqueta={t("tracker.closeRate")}
          valor={resumen.tasaCierre === null ? "—" : `${resumen.tasaCierre}%`}
          pie={`${resumen.clientes} clientes`}
        />
        <Metrica
          etiqueta="CPL"
          valor={resumen.cpl === null ? "—" : `${resumen.cpl}€`}
          pie={`${resumen.gastoAds}€ en ads`}
        />
        <Metrica
          etiqueta="ROAS"
          valor={resumen.roas === null ? "—" : `${resumen.roas}×`}
          pie={`${resumen.ingresos}€`}
        />
      </div>

      {filas.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-muted">{t("tracker.empty")}</p>
        </div>
      ) : (
        <TrackerTable filas={filas} />
      )}

      <p className="text-xs text-muted">{t("tracker.footnote")}</p>
    </div>
  );
}

function Dato({
  etiqueta,
  valor,
  pct,
}: {
  etiqueta: string;
  valor: number | null;
  pct?: number | null;
}) {
  return (
    <div>
      <div className="text-xs text-muted">{etiqueta}</div>
      <div className="mt-0.5 text-lg font-semibold tabular">
        {valor === null ? "—" : valor.toLocaleString("es-ES")}
      </div>
      {pct !== undefined && pct !== null && (
        <div className={`text-xs ${pct >= 0 ? "text-success" : "text-error"}`}>
          {pct > 0 ? "+" : ""}
          {pct}%
        </div>
      )}
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  pie,
}: {
  etiqueta: string;
  valor: string | number;
  pie?: string;
}) {
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{etiqueta}</div>
      <div className="mt-1 text-2xl font-semibold tabular">{valor}</div>
      {pie && <div className="mt-0.5 text-xs text-muted">{pie}</div>}
    </div>
  );
}
