import { describe, expect, it } from "vitest";
import { median, outlierScore } from "@/lib/radar/refresh";

describe("median", () => {
  it("devuelve el central en longitud impar", () => {
    expect(median([100, 300, 200])).toBe(200);
  });

  it("promedia los dos centrales en longitud par", () => {
    expect(median([100, 200, 300, 400])).toBe(250);
  });

  it("ignora ceros y nulos: una foto sin views falsearía la mediana", () => {
    expect(median([0, 100, 200, 300])).toBe(200);
  });

  it("aguanta un viral que dispararía la media", () => {
    // Media = 20.400. Mediana = 300. La mediana es la que describe la cuenta.
    expect(median([200, 300, 400, 100_000, 1_500])).toBe(400);
  });

  it("sin valores útiles devuelve null en vez de 0", () => {
    expect(median([])).toBeNull();
    expect(median([0, 0])).toBeNull();
  });
});

describe("outlierScore", () => {
  it("mide cuántas veces se superó lo normal de la cuenta", () => {
    expect(outlierScore(40_000, 10_000)).toBe(4);
  });

  it("redondea a dos decimales", () => {
    expect(outlierScore(3_500, 3_000)).toBe(1.17);
  });

  it("un post por debajo de lo normal baja de 1", () => {
    expect(outlierScore(500, 2_000)).toBe(0.25);
  });

  it("una cuenta pequeña puede puntuar más alto que una grande", () => {
    const pequena = outlierScore(40_000, 3_000)!; // 13.33
    const grande = outlierScore(800_000, 2_000_000)!; // 0.4
    expect(pequena).toBeGreaterThan(grande);
  });

  it("sin views o sin mediana devuelve null, no 0", () => {
    expect(outlierScore(null, 1_000)).toBeNull();
    expect(outlierScore(1_000, null)).toBeNull();
    expect(outlierScore(1_000, 0)).toBeNull();
  });
});
