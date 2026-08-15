"use client";

/**
 * Renombrar una campaña desde la propia lista.
 *
 * Antes había que entrar a la campaña, buscar el campo de nombre, cambiarlo y
 * guardar. Aquí se hace en el sitio: doble clic (o el lápiz) y Enter.
 *
 * Guarda con un PATCH parcial: no toca ningún otro campo de la campaña, así
 * que renombrar nunca puede alterar keywords, mensajes ni el estado.
 */

import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/lang-provider";

export default function InlineRename({
  id,
  value,
  onRenamed,
}: {
  id: string;
  value: string;
  onRenamed: (nuevo: string) => void;
}) {
  const t = useT();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(value);
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) inputRef.current?.select();
  }, [editando]);

  async function guardar() {
    const nuevo = borrador.trim();
    setEditando(false);
    if (!nuevo || nuevo === value) {
      setBorrador(value);
      return;
    }

    // Optimista: el nombre cambia ya. Si el PATCH falla se revierte, que es
    // mejor que un spinner por algo que tarda 200 ms y casi nunca falla.
    onRenamed(nuevo);
    setGuardando(true);
    try {
      // El id va en query, no en la ruta: el endpoint es /api/automations?id=…
      const res = await fetch(`/api/automations?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nuevo }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      onRenamed(value);
      setBorrador(value);
    } finally {
      setGuardando(false);
    }
  }

  if (editando) {
    return (
      <input
        ref={inputRef}
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === "Enter") guardar();
          if (e.key === "Escape") {
            setBorrador(value);
            setEditando(false);
          }
        }}
        // El contenedor de la fila navega al hacer clic: sin esto, tocar el
        // input abriría la campaña.
        onClick={(e) => e.stopPropagation()}
        maxLength={100}
        autoFocus
        className="min-w-0 flex-1 rounded-md border border-accent/40 bg-background px-2 py-0.5 text-sm font-semibold outline-none"
      />
    );
  }

  return (
    <span className="group/name flex min-w-0 items-center gap-1.5">
      <h3
        className="truncate text-sm font-semibold"
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditando(true);
        }}
        title={value}
      >
        {value || t("camp.untitled")}
      </h3>
      <button
        type="button"
        aria-label={t("camp.rename")}
        title={t("camp.rename")}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setEditando(true);
        }}
        className="shrink-0 text-xs text-muted opacity-0 transition-opacity hover:text-foreground group-hover/name:opacity-100 focus-visible:opacity-100"
      >
        ✎
      </button>
      {guardando && <span className="text-xs text-muted">·</span>}
    </span>
  );
}
