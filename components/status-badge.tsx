"use client";

/**
 * Estado de un envío de DM. Píldora con color de fondo suave: en una tabla
 * larga el color plano de texto no se lee de un vistazo, el fondo sí.
 */

import { useT } from "@/components/lang-provider";
import type { TranslationKey } from "@/lib/i18n";

const statusConfig: Record<string, { className: string; key: TranslationKey }> =
  {
    SENT: {
      className: "bg-success/10 text-success",
      key: "status.SENT",
    },
    FAILED: {
      className: "bg-error/10 text-error",
      key: "status.FAILED",
    },
    PENDING: {
      className: "bg-warning/10 text-warning",
      key: "status.PENDING",
    },
    SKIPPED_DEDUP: {
      className: "bg-surface-hover text-muted",
      key: "status.SKIPPED_DEDUP",
    },
    SKIPPED_RATE_LIMIT: {
      className: "bg-warning/10 text-warning",
      key: "status.SKIPPED_RATE_LIMIT",
    },
    SKIPPED_PLAN_LIMIT: {
      className: "bg-warning/10 text-warning",
      key: "status.SKIPPED_PLAN_LIMIT",
    },
    SKIPPED_NO_MATCH: {
      className: "bg-surface-hover text-muted",
      key: "status.SKIPPED_NO_MATCH",
    },
  };

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const t = useT();
  const config = statusConfig[status] ?? statusConfig.PENDING;

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${config.className}`}
    >
      {t(config.key)}
    </span>
  );
}
