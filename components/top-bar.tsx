"use client";

/**
 * Barra superior — título de página, hamburguesa en móvil y estado de conexión.
 */

import { usePathname } from "next/navigation";
import { useT } from "@/components/lang-provider";
import type { TranslationKey } from "@/lib/i18n";

const pageTitles: Record<string, TranslationKey> = {
  "/dashboard": "nav.dashboard",
  "/overview": "nav.overview",
  "/contactos": "nav.contacts",
  "/radar": "nav.radar",
  "/tracker": "nav.tracker",
  "/inbox": "nav.inbox",
  "/campaigns": "nav.campaigns",
  "/automations": "nav.campaigns",
  "/logs": "nav.logs",
  "/settings": "nav.settings",
  "/diagnostics": "nav.diagnostics",
};

interface TopBarProps {
  onMenuClick: () => void;
  instagramUsername: string | null;
  instagramAccountCount: number;
}

export default function TopBar({
  onMenuClick,
  instagramUsername,
  instagramAccountCount,
}: TopBarProps) {
  const pathname = usePathname();
  const t = useT();

  // Las rutas hijas (/campaigns/new, /campaigns/<id>) heredan el título del
  // padre en vez de caer al genérico.
  const key =
    pageTitles[pathname] ??
    pageTitles[`/${pathname.split("/")[1] ?? ""}`] ??
    "nav.dashboard";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl lg:px-8">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <button
          onClick={onMenuClick}
          className="shrink-0 rounded-[10px] border border-border px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-border-hover hover:text-foreground lg:hidden"
          aria-label={t("shell.menu")}
        >
          {t("shell.menu")}
        </button>
        <h1 className="truncate text-base font-medium sm:text-lg">{t(key)}</h1>
      </div>

      {instagramAccountCount > 0 ? (
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5">
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-success"
            style={{ boxShadow: "0 0 0 3px color-mix(in oklab, #16a34a 18%, transparent)" }}
          />
          <span className="truncate text-sm text-muted">
            {instagramAccountCount > 1
              ? `${instagramAccountCount} ${t("shell.accounts")}`
              : `@${instagramUsername}`}
          </span>
        </div>
      ) : (
        <a
          href="/api/instagram/connect"
          className="shrink-0 whitespace-nowrap rounded-[10px] px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #5b5bff 0%, #8a5cf6 100%)",
            boxShadow: "0 10px 24px -12px rgba(91, 91, 255, 0.8)",
          }}
        >
          <span className="sm:hidden">{t("shell.connectShort")}</span>
          <span className="hidden sm:inline">{t("shell.connect")}</span>
        </a>
      )}
    </header>
  );
}
