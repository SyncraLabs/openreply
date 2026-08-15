import { describe, expect, it } from "vitest";
import { calcular, cpl, resumir, roas, type FilaCruda } from "@/lib/tracker/metrics";

function fila(over: Partial<FilaCruda> & { date: Date }): FilaCruda {
  return {
    youtube: null, instagram: null, tiktok: null, igSyncra: null,
    contenido: null, leads: null, llamadasReservadas: null,
    llamadasHechas: null, clientes: null, ingresos: null, mrr: null,
    gastoAds: null, autoFields: [],
    ...over,
  };
}
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("cpl y roas", () => {
  it("cpl = gasto / leads", () => {
    expect(cpl(100, 8)).toBe(12.5);
  });

  it("gasto sin leads es null, no infinito", () => {
    expect(cpl(100, 0)).toBeNull();
    expect(cpl(100, null)).toBeNull();
  });

  it("roas = ingresos / gasto", () => {
    expect(roas(3000, 1000)).toBe(3);
  });

  it("sin gasto no hay roas", () => {
    expect(roas(3000, 0)).toBeNull();
  });
});

describe("calcular variaciones", () => {
  it("compara con el día anterior", () => {
    const r = calcular([
      fila({ date: d("2026-07-01"), instagram: 2000 }),
      fila({ date: d("2026-07-02"), instagram: 2020 }),
    ]);
    expect(r[0].instagramPct).toBeNull(); // sin previo
    expect(r[1].instagramPct).toBe(1); // +1%
  });

  it("un hueco no rompe la serie: compara con el último dato real", () => {
    // Si el día 2 no se registró, el día 3 debe medirse contra el día 1,
    // no contra un null que daría una variación falsa.
    const r = calcular([
      fila({ date: d("2026-07-01"), instagram: 1000 }),
      fila({ date: d("2026-07-02"), leads: 3 }),
      fila({ date: d("2026-07-03"), instagram: 1100 }),
    ]);
    expect(r[2].instagramPct).toBe(10);
  });

  it("detecta caídas de seguidores", () => {
    const r = calcular([
      fila({ date: d("2026-07-01"), tiktok: 1600 }),
      fila({ date: d("2026-07-02"), tiktok: 1584 }),
    ]);
    expect(r[1].tiktokPct).toBe(-1);
  });
});

describe("resumir el periodo", () => {
  const filas = [
    fila({ date: d("2026-07-01"), instagram: 2000, leads: 10, gastoAds: 100,
           llamadasReservadas: 4, llamadasHechas: 2, clientes: 1, ingresos: 500 }),
    fila({ date: d("2026-07-02"), instagram: 2100, leads: 10, gastoAds: 100,
           llamadasReservadas: 6, llamadasHechas: 3, clientes: 1, ingresos: 700 }),
  ];

  it("crecimiento neto = último menos primero", () => {
    expect(resumir(filas).crecimiento.instagram).toBe(100);
  });

  it("los ratios van sobre el total, no promediando días", () => {
    const r = resumir(filas);
    expect(r.cpl).toBe(10); // 200 / 20
    expect(r.roas).toBe(6); // 1200 / 200
  });

  it("tasa de asistencia y de cierre", () => {
    const r = resumir(filas);
    expect(r.tasaAsistencia).toBe(50); // 5 de 10 reservadas
    expect(r.tasaCierre).toBe(40); // 2 de 5 hechas
  });

  it("sin datos no revienta", () => {
    const r = resumir([]);
    expect(r.dias).toBe(0);
    expect(r.cpl).toBeNull();
    expect(r.crecimiento.youtube).toBeNull();
  });
});
