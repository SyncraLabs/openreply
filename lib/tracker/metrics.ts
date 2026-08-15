/**
 * Cálculos del tracker diario.
 *
 * Los porcentajes de variación, el CPL y el ROAS NO se guardan en la base: se
 * derivan al leer. Así, corregir el dato de un día recalcula automáticamente
 * todo lo que dependa de él, que es justo lo que hacía el Sheets con fórmulas.
 */

export interface FilaCruda {
  date: Date;
  youtube: number | null;
  instagram: number | null;
  tiktok: number | null;
  igSyncra: number | null;
  contenido: number | null;
  leads: number | null;
  llamadasReservadas: number | null;
  llamadasHechas: number | null;
  clientes: number | null;
  ingresos: number | null;
  mrr: number | null;
  gastoAds: number | null;
  autoFields: string[];
}

export interface FilaCalculada extends FilaCruda {
  /** Variación frente al día anterior CON dato, no frente a la fila anterior. */
  youtubePct: number | null;
  instagramPct: number | null;
  tiktokPct: number | null;
  igSyncraPct: number | null;
  /** Coste por lead: gasto ÷ leads. */
  cpl: number | null;
  /** Ingresos ÷ gasto en ads. */
  roas: number | null;
}

const REDES = ["youtube", "instagram", "tiktok", "igSyncra"] as const;
type Red = (typeof REDES)[number];

function pct(hoy: number | null, previo: number | null): number | null {
  if (hoy === null || previo === null || previo === 0) return null;
  return Math.round(((hoy - previo) / previo) * 1000) / 10;
}

export function cpl(gasto: number | null, leads: number | null): number | null {
  // Gasto sin leads no es CPL infinito: es que aún no hay dato útil.
  if (gasto === null || !leads) return null;
  return Math.round((gasto / leads) * 100) / 100;
}

export function roas(
  ingresos: number | null,
  gasto: number | null
): number | null {
  if (ingresos === null || !gasto) return null;
  return Math.round((ingresos / gasto) * 100) / 100;
}

/**
 * Añade variaciones y ratios. Espera las filas en orden ascendente de fecha.
 *
 * La variación se compara con el último día que TENGA dato en esa red, no con
 * la fila inmediatamente anterior: si un día no se registró Instagram, el
 * siguiente debe medirse contra el último valor real, no contra un hueco.
 */
export function calcular(filas: FilaCruda[]): FilaCalculada[] {
  const ultimo: Record<Red, number | null> = {
    youtube: null,
    instagram: null,
    tiktok: null,
    igSyncra: null,
  };

  return filas.map((f) => {
    const salida: FilaCalculada = {
      ...f,
      youtubePct: pct(f.youtube, ultimo.youtube),
      instagramPct: pct(f.instagram, ultimo.instagram),
      tiktokPct: pct(f.tiktok, ultimo.tiktok),
      igSyncraPct: pct(f.igSyncra, ultimo.igSyncra),
      cpl: cpl(f.gastoAds, f.leads),
      roas: roas(f.ingresos, f.gastoAds),
    };
    for (const red of REDES) {
      if (f[red] !== null) ultimo[red] = f[red];
    }
    return salida;
  });
}

export interface Resumen {
  dias: number;
  /** Crecimiento neto de cada red en el periodo. */
  crecimiento: Record<Red, number | null>;
  leads: number;
  llamadasReservadas: number;
  llamadasHechas: number;
  clientes: number;
  ingresos: number;
  gastoAds: number;
  cpl: number | null;
  roas: number | null;
  /** Reservadas → hechas, en %. Dice si las llamadas se caen. */
  tasaAsistencia: number | null;
  /** Hechas → clientes, en %. */
  tasaCierre: number | null;
}

/** Agregado del periodo. Suma lo acumulable y calcula ratios sobre el total. */
export function resumir(filas: FilaCruda[]): Resumen {
  const suma = (k: keyof FilaCruda) =>
    filas.reduce((n, f) => n + (Number(f[k]) || 0), 0);

  const crecimiento = {} as Record<Red, number | null>;
  for (const red of REDES) {
    const conDato = filas.filter((f) => f[red] !== null);
    crecimiento[red] =
      conDato.length >= 2
        ? (conDato[conDato.length - 1][red] as number) -
          (conDato[0][red] as number)
        : null;
  }

  const leads = suma("leads");
  const reservadas = suma("llamadasReservadas");
  const hechas = suma("llamadasHechas");
  const clientes = suma("clientes");
  const ingresos = suma("ingresos");
  const gastoAds = suma("gastoAds");

  return {
    dias: filas.length,
    crecimiento,
    leads,
    llamadasReservadas: reservadas,
    llamadasHechas: hechas,
    clientes,
    ingresos,
    gastoAds,
    // Los ratios se calculan sobre los totales del periodo, no promediando los
    // de cada día: un día con 1 lead pesaría igual que uno con 50.
    cpl: cpl(gastoAds, leads),
    roas: roas(ingresos, gastoAds),
    tasaAsistencia: reservadas ? Math.round((hechas / reservadas) * 1000) / 10 : null,
    tasaCierre: hechas ? Math.round((clientes / hechas) * 1000) / 10 : null,
  };
}
