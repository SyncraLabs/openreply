/**
 * Estado de carga del dashboard.
 *
 * Sin esto, navegar a una ruta server-rendered deja la zona de contenido en
 * blanco hasta que resuelve la consulta. Con el skeleton, el cambio de página
 * es inmediato aunque los datos tarden.
 */
export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-4 w-72" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="panel p-4">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton mt-2 h-7 w-14" />
          </div>
        ))}
      </div>

      <div className="panel divide-y divide-border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-4 w-16" />
            <div className="skeleton h-4 flex-1" />
          </div>
        ))}
      </div>

      <span className="sr-only">Cargando…</span>
    </div>
  );
}
