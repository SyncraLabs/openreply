"use client";

/**
 * Alta, baja y refresco de las cuentas vigiladas por el Radar.
 *
 * Cliente porque son formularios; la tabla de posts va aparte en la página,
 * que es server component y se refresca sola con router.refresh().
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";

export interface RadarAccountRow {
  id: string;
  username: string;
  followers: number | null;
  medianViews: number | null;
  postCount: number;
  lastError: string | null;
  lastFetchedAt: string | null;
}

export default function RadarAccountManager({
  initialAccounts,
  canRefresh,
}: {
  initialAccounts: RadarAccountRow[];
  canRefresh: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setError(null);

    const res = await fetch("/api/radar/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const json = await res.json();
    if (!json.success) {
      setError(json.error ?? "Error");
      return;
    }
    setUsername("");
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    await fetch(`/api/radar/accounts?id=${id}`, { method: "DELETE" });
    startTransition(() => router.refresh());
  }

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/radar/refresh", { method: "POST" });
      const json = await res.json();
      if (!json.success) setError(json.error ?? "Error");
      startTransition(() => router.refresh());
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="panel p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={add} className="flex flex-1 gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("radar.addPlaceholder")}
            className="min-w-0 flex-1 rounded-[10px] border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={pending || !username.trim()}
            className="shrink-0 rounded-[10px] px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #5b5bff 0%, #8a5cf6 100%)" }}
          >
            {t("radar.add")}
          </button>
        </form>

        <button
          type="button"
          onClick={refresh}
          disabled={!canRefresh || refreshing}
          title={canRefresh ? undefined : t("radar.noProvider")}
          className="shrink-0 rounded-[10px] border border-border px-3.5 py-2 text-sm text-muted transition-colors hover:border-border-hover hover:text-foreground disabled:opacity-40"
        >
          {refreshing ? t("radar.refreshing") : t("radar.refresh")}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-error">{error}</p>}

      {initialAccounts.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {initialAccounts.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-full border border-border bg-surface-hover px-3 py-1.5 text-sm"
            >
              <span className="font-medium">@{a.username}</span>
              <span className="text-xs text-muted">
                {a.postCount} · {t("radar.median")}{" "}
                {a.medianViews ? a.medianViews.toLocaleString("es-ES") : "—"}
              </span>
              {a.lastError && (
                <span className="text-xs text-error" title={a.lastError}>
                  ⚠
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(a.id)}
                aria-label={`${t("radar.remove")} @${a.username}`}
                className="text-muted transition-colors hover:text-error"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
