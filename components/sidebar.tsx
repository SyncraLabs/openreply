"use client";

/**
 * Sidebar Navigation
 *
 * Text-only nav with active state and workspace section.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/theme-toggle";

const navItems = [
  { label: "Panel", href: "/dashboard" },
  { label: "Rendimiento", href: "/overview" },
  { label: "Contactos", href: "/contactos" },
  { label: "Bandeja", href: "/inbox" },
  { label: "Campañas", href: "/campaigns" },
  { label: "Envíos", href: "/logs" },
  { label: "Ajustes", href: "/settings" },
  { label: "Diagnóstico", href: "/diagnostics" },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName: string;
}

export default function Sidebar({
  isOpen,
  onClose,
  workspaceName,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-dvh w-64 max-w-[85vw] shrink-0 bg-surface border-r border-border flex flex-col
          transition-transform duration-200 ease-out
          lg:h-full lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="px-6 py-5 border-b border-border">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 text-base font-semibold tracking-tight"
          >
            <span
              aria-hidden
              className="relative grid size-7 shrink-0 place-items-center rounded-[9px]"
              style={{
                background: "linear-gradient(135deg, #5b5bff 0%, #8a5cf6 100%)",
                boxShadow: "0 6px 16px -8px rgba(91, 91, 255, 0.8)",
              }}
            >
              {/* Los dos círculos del icono de Rodri OS. */}
              <span className="flex items-center gap-[3px]">
                <span className="block size-[5px] rounded-full bg-white" />
                <span className="block size-[9px] rounded-full bg-white" />
              </span>
            </span>
            AI Operator
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={isActive ? "page" : undefined}
                prefetch
                className={`
                  block rounded-[10px] px-3 py-2.5 text-sm transition-colors
                  ${
                    isActive
                      ? "bg-accent-muted font-medium text-accent"
                      : "text-muted hover:bg-surface-hover hover:text-foreground"
                  }
                `}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-border px-3 py-3">
          <ThemeToggle />
          <div className="px-3 pt-2">
            <p className="truncate text-sm text-foreground">{workspaceName}</p>
            <p className="text-xs text-muted">Rodri OS · self-hosted</p>
          </div>
        </div>
      </aside>
    </>
  );
}
