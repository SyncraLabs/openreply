"use client";

/**
 * Contexto de idioma para los componentes cliente del shell.
 *
 * El valor lo inyecta el layout de servidor leyendo la cookie, así que el
 * primer render del cliente coincide con el HTML que llegó del servidor.
 */

import { createContext, useContext, useMemo } from "react";
import {
  DEFAULT_LANG,
  translator,
  type Lang,
  type TranslationKey,
} from "@/lib/i18n";

const LangContext = createContext<Lang>(DEFAULT_LANG);

export function LangProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useT(): (key: TranslationKey) => string {
  const lang = useLang();
  return useMemo(() => translator(lang), [lang]);
}
