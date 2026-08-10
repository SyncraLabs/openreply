"use client";

/**
 * Selector de idioma ES / EN.
 *
 * Guarda en cookie (no localStorage) porque hay texto que se pinta en
 * servidor, y refresca la ruta para que el servidor vuelva a renderizar con
 * el idioma nuevo sin recargar la página entera.
 */

import { useRouter } from "next/navigation";
import { LANG_COOKIE } from "@/lib/i18n";
import { useLang } from "@/components/lang-provider";

const OPCIONES = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
] as const;

/** 1 año, raíz del sitio. SameSite=Lax basta: no se lee desde terceros. */
function guardarIdioma(code: string) {
  document.cookie = `${LANG_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
}

export default function LangToggle() {
  const lang = useLang();
  const router = useRouter();

  function elegir(code: string) {
    if (code === lang) return;
    guardarIdioma(code);
    router.refresh();
  }

  return (
    <div
      className="flex items-center gap-1 rounded-[10px] bg-surface-hover p-1"
      role="group"
      aria-label="Idioma"
    >
      {OPCIONES.map((o) => {
        const activo = o.code === lang;
        return (
          <button
            key={o.code}
            type="button"
            onClick={() => elegir(o.code)}
            aria-pressed={activo}
            className={`flex-1 rounded-[7px] px-2 py-1 text-xs font-medium transition-colors ${
              activo
                ? "bg-surface text-foreground shadow-soft"
                : "text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
