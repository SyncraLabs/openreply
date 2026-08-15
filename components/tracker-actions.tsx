"use client";

/**
 * Botón de recogida manual del tracker.
 *
 * El worker lo hace solo una vez al día, pero al empezar el día uno quiere
 * ver los números ya, sin esperar al ciclo.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

export default function TrackerActions() {
  const t = useT();
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);

  async function recoger() {
    setCargando(true);
    setDetalle(null);
    try {
      const res = await fetch("/api/tracker", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        const { rellenados, saltados } = json.data as {
          rellenados: string[];
          saltados: string[];
        };
        setDetalle(
          rellenados.length
            ? `Actualizado: ${rellenados.join(", ")}${saltados.length ? ` · pendiente: ${saltados.join(", ")}` : ""}`
            : `Nada que actualizar · ${saltados.join(", ")}`
        );
        router.refresh();
      } else {
        setDetalle(json.error ?? "Error");
      }
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={recoger}
        disabled={cargando}
        className="rounded-[10px] border border-border px-3.5 py-2 text-sm text-muted transition-colors hover:border-border-hover hover:text-foreground disabled:opacity-40"
      >
        {cargando ? t("tracker.collecting") : t("tracker.collect")}
      </button>
      {detalle && <p className="max-w-xs text-right text-xs text-muted">{detalle}</p>}
    </div>
  );
}
