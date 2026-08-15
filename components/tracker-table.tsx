"use client";

/**
 * Tabla del tracker diario, editable celda a celda.
 *
 * Se comporta como una hoja de cálculo: clic en la celda, escribes, Enter o
 * Tab y se guarda. Sin botón de guardar, sin modales.
 *
 * Las celdas rellenadas por una fuente automática salen marcadas. Editar una
 * a mano la desmarca en el servidor, para que la siguiente recogida no pise
 * lo que has escrito.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface FilaTracker {
  date: string;
  youtube: number | null;
  instagram: number | null;
  tiktok: number | null;
  igSyncra: number | null;
  contenido: number | null;
  leads: number | null;
  llamadasReservadas: number | null;
  llamadasHechas: number | null;
  clientes: number | null;
  ingresos: number | null;
  mrr: number | null;
  gastoAds: number | null;
  autoFields: string[];
  youtubePct: number | null;
  instagramPct: number | null;
  tiktokPct: number | null;
  igSyncraPct: number | null;
  cpl: number | null;
  roas: number | null;
}

type Campo = keyof Omit<
  FilaTracker,
  "date" | "autoFields" | "youtubePct" | "instagramPct" | "tiktokPct" | "igSyncraPct" | "cpl" | "roas"
>;

const REDES: { campo: Campo; label: string; pct: keyof FilaTracker }[] = [
  { campo: "youtube", label: "YouTube", pct: "youtubePct" },
  { campo: "instagram", label: "Instagram", pct: "instagramPct" },
  { campo: "tiktok", label: "TikTok", pct: "tiktokPct" },
  { campo: "igSyncra", label: "Ig Syncra", pct: "igSyncraPct" },
];

const NEGOCIO: { campo: Campo; label: string; decimal?: boolean }[] = [
  { campo: "contenido", label: "Contenido" },
  { campo: "leads", label: "Leads" },
  { campo: "llamadasReservadas", label: "Reservadas" },
  { campo: "llamadasHechas", label: "Hechas" },
  { campo: "clientes", label: "Clientes" },
  { campo: "ingresos", label: "Ingresos €", decimal: true },
  { campo: "mrr", label: "MRR €", decimal: true },
  { campo: "gastoAds", label: "Ads €", decimal: true },
];

function Pct({ v }: { v: number | null }) {
  if (v === null) return <span className="text-muted">·</span>;
  if (v === 0) return <span className="text-muted">0%</span>;
  return (
    <span className={v > 0 ? "text-success" : "text-error"}>
      {v > 0 ? "+" : ""}
      {v}%
    </span>
  );
}

export default function TrackerTable({ filas }: { filas: FilaTracker[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  async function guardar(date: string, campo: Campo, texto: string) {
    setEditando(null);
    const limpio = texto.trim().replace(",", ".");
    const valor = limpio === "" ? null : Number(limpio);
    if (valor !== null && !Number.isFinite(valor)) return;

    const clave = `${date}:${campo}`;
    setGuardando(clave);
    try {
      await fetch("/api/tracker", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, [campo]: valor }),
      });
      router.refresh();
    } finally {
      setGuardando(null);
    }
  }

  function Celda({
    fila,
    campo,
    decimal,
  }: {
    fila: FilaTracker;
    campo: Campo;
    decimal?: boolean;
  }) {
    const clave = `${fila.date}:${campo}`;
    const valor = fila[campo];
    const auto = fila.autoFields.includes(campo);

    if (editando === clave) {
      return (
        <td className="px-2 py-1.5">
          <input
            autoFocus
            defaultValue={valor === null ? "" : String(valor)}
            inputMode={decimal ? "decimal" : "numeric"}
            onBlur={(e) => guardar(fila.date, campo, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditando(null);
            }}
            className="w-20 rounded border border-accent/50 bg-background px-1.5 py-0.5 text-right text-sm outline-none"
          />
        </td>
      );
    }

    return (
      <td
        onClick={() => setEditando(clave)}
        title={auto ? "Rellenado automáticamente. Si lo editas, deja de actualizarse solo." : "Clic para editar"}
        className={`cursor-text px-2 py-1.5 text-right tabular hover:bg-surface-hover ${
          guardando === clave ? "opacity-40" : ""
        }`}
      >
        {valor === null ? (
          <span className="text-muted">—</span>
        ) : (
          <>
            {typeof valor === "number" && !Number.isInteger(valor)
              ? valor.toFixed(2)
              : valor.toLocaleString("es-ES")}
            {auto && <span className="ml-1 text-[10px] text-accent">•</span>}
          </>
        )}
      </td>
    );
  }

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-2 text-left font-medium">Fecha</th>
            {REDES.map((r) => (
              <th key={r.campo} colSpan={2} className="px-2 py-2 text-right font-medium">
                {r.label}
              </th>
            ))}
            {NEGOCIO.map((n) => (
              <th key={n.campo} className="px-2 py-2 text-right font-medium">
                {n.label}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-medium">CPL</th>
            <th className="px-2 py-2 text-right font-medium">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.date} className="border-b border-border last:border-0">
              <td className="whitespace-nowrap px-3 py-1.5 text-muted">
                {new Date(`${f.date}T00:00:00Z`).toLocaleDateString("es-ES", {
                  day: "2-digit",
                  month: "short",
                  timeZone: "UTC",
                })}
              </td>
              {REDES.map((r) => (
                <>
                  <Celda key={r.campo} fila={f} campo={r.campo} />
                  <td key={`${r.campo}-pct`} className="px-1 py-1.5 text-right text-xs">
                    <Pct v={f[r.pct] as number | null} />
                  </td>
                </>
              ))}
              {NEGOCIO.map((n) => (
                <Celda key={n.campo} fila={f} campo={n.campo} decimal={n.decimal} />
              ))}
              <td className="px-2 py-1.5 text-right text-muted tabular">
                {f.cpl === null ? "—" : `${f.cpl.toFixed(2)}€`}
              </td>
              <td className="px-2 py-1.5 text-right tabular">
                {f.roas === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  <span className={f.roas >= 1 ? "text-success" : "text-error"}>
                    {f.roas.toFixed(2)}×
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
