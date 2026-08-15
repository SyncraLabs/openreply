/**
 * Carga del editor de campaña.
 *
 * Imita la forma real del editor —barra de acciones arriba, columna de
 * controles a la izquierda, vista previa a la derecha— para que al abrir una
 * campaña el layout aparezca al instante y solo se rellene el contenido, en
 * vez de saltar de una pantalla en blanco a la definitiva.
 */
export default function EditorLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="skeleton h-6 w-56" />
        <div className="skeleton h-5 w-14 rounded-full" />
        <div className="ml-auto flex gap-2">
          <div className="skeleton h-9 w-24" />
          <div className="skeleton h-9 w-28" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr] lg:gap-8">
        <div className="space-y-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-4 w-28" />
              <div className="skeleton h-10 w-full" />
            </div>
          ))}
        </div>
        <div className="panel h-96" />
      </div>

      <span className="sr-only">Cargando…</span>
    </div>
  );
}
