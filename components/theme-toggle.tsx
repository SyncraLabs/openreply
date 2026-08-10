"use client";

/**
 * Toggle de tema — claro / oscuro, persistido en localStorage.
 *
 * Sin estado de React a propósito: el tema vive en `document.documentElement
 * .dataset.theme`, lo fija un script inline antes del primer paint, y las dos
 * etiquetas se muestran/ocultan por CSS según ese atributo. Así no hay
 * mismatch de hidratación, ni parpadeo, ni un render extra al montar.
 */
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const siguiente = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = siguiente;
    try {
      localStorage.setItem("theme", siguiente);
    } catch {
      // Safari en privado tira al escribir. El tema aplica igual esta sesión.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema"
      className="flex h-9 w-full items-center gap-2.5 rounded-[10px] px-3 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <span className="theme-when-light contents">
        <span aria-hidden className="text-base leading-none">
          ◑
        </span>
        Tema oscuro
      </span>
      <span className="theme-when-dark contents">
        <span aria-hidden className="text-base leading-none">
          ◐
        </span>
        Tema claro
      </span>
    </button>
  );
}
