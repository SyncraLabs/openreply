import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const dmGroup = vi.fn();
const choiceGroup = vi.fn();
vi.mock("../lib/db/client", () => ({
  prisma: {
    automation: { findMany: (...a: unknown[]) => findMany(...a) },
    dmLog: { groupBy: (...a: unknown[]) => dmGroup(...a) },
    sequenceChoice: { groupBy: (...a: unknown[]) => choiceGroup(...a) },
  },
}));

const get = vi.fn();
const set = vi.fn();
vi.mock("../lib/queue/client", () => ({
  getRedisConnection: () => ({ get: (...a: unknown[]) => get(...a), set: (...a: unknown[]) => set(...a) }),
}));

import { botonesDe, estadoDe, listarCampanas } from "../lib/aioperator-campanas";
import { GET } from "../app/api/aioperator/campanas/route";
import { NextRequest } from "next/server";

const SECRET = "secreto-de-prueba";

const SEQUENCE = {
  main: [
    {
      id: "m1",
      type: "text",
      text: "¿en qué punto estás?",
      buttons: [
        { label: "empiezo de cero", branchId: "cero" },
        { label: "tengo un negocio", branchId: "negocio" },
      ],
    },
  ],
  branches: [
    { id: "cero", name: "Cero", qualified: true, steps: [{ id: "c1", type: "text", text: "vale" }] },
    { id: "negocio", name: "Negocio", qualified: false, steps: [{ id: "n1", type: "text", text: "ok" }] },
  ],
};

const AUTOMATION = {
  id: "a1",
  name: "Reel agencia",
  keywords: ["agencia", "ia"],
  postId: "123",
  postUrl: "https://instagram.com/p/x",
  dmMessage: "aquí tienes el enlace",
  openingDmEnabled: true,
  openingDmMessage: "ey, ¿lo quieres?",
  sequence: SEQUENCE,
  isActive: true,
  retiredAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AIOPERATOR_WEBHOOK_SECRET = SECRET;
  findMany.mockResolvedValue([AUTOMATION]);
  dmGroup.mockResolvedValue([
    { automationId: "a1", status: "SENT", _count: { _all: 40 } },
    { automationId: "a1", status: "FAILED", _count: { _all: 3 } },
    { automationId: "otra", status: "SENT", _count: { _all: 99 } },
  ]);
  choiceGroup.mockResolvedValue([
    { automationId: "a1", branchName: "Cero", qualified: true, _count: { _all: 12 } },
    { automationId: "a1", branchName: "Negocio", qualified: false, _count: { _all: 5 } },
  ]);
  get.mockResolvedValue(null);
});

describe("estadoDe y botonesDe", () => {
  it("retirada manda sobre activa", () => {
    expect(estadoDe({ isActive: true, retiredAt: new Date() })).toBe("retirada");
    expect(estadoDe({ isActive: false, retiredAt: null })).toBe("pausada");
    expect(estadoDe({ isActive: true, retiredAt: null })).toBe("activa");
  });
  it("saca las etiquetas de los botones sin repetir, y [] si la secuencia no vale", () => {
    expect(botonesDe(SEQUENCE)).toEqual(["empiezo de cero", "tengo un negocio"]);
    expect(botonesDe(null)).toEqual([]);
    expect(botonesDe({ main: "mal" })).toEqual([]);
  });
});

describe("listarCampanas", () => {
  it("junta la campaña con sus contadores de 30 días", async () => {
    const [c] = await listarCampanas(Date.UTC(2026, 10, 3));
    expect(c).toMatchObject({
      id: "a1",
      nombre: "Reel agencia",
      estado: "activa",
      keyword: "agencia, ia",
      postId: "123",
      dmTexto: "ey, ¿lo quieres?",
      botones: ["empiezo de cero", "tengo un negocio"],
      enviados: 40,
      fallidos: 3,
      botonesPulsados: 17,
      cualificados: 12,
    });
    expect(c.porBoton).toEqual([
      { nombre: "Cero", pulsados: 12 },
      { nombre: "Negocio", pulsados: 5 },
    ]);
    const filtro = dmGroup.mock.calls[0][0].where.createdAt.gte as Date;
    expect(filtro.toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });

  it("sin apertura usa el dmMessage", async () => {
    findMany.mockResolvedValue([{ ...AUTOMATION, openingDmEnabled: false }]);
    const [c] = await listarCampanas();
    expect(c.dmTexto).toBe("aquí tienes el enlace");
  });

  it("una campaña sin actividad sale con ceros", async () => {
    dmGroup.mockResolvedValue([]);
    choiceGroup.mockResolvedValue([]);
    const [c] = await listarCampanas();
    expect([c.enviados, c.fallidos, c.botonesPulsados, c.cualificados, c.porBoton]).toEqual([0, 0, 0, 0, []]);
  });
});

describe("GET /api/aioperator/campanas", () => {
  const pedir = (auth?: string) =>
    GET(new NextRequest("http://localhost/api/aioperator/campanas", { headers: auth ? { authorization: auth } : {} }));

  it("401 sin Bearer o con otro secreto", async () => {
    expect((await pedir()).status).toBe(401);
    expect((await pedir("Bearer otro")).status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("401 si el secreto no está configurado", async () => {
    delete process.env.AIOPERATOR_WEBHOOK_SECRET;
    expect((await pedir("Bearer ")).status).toBe(401);
  });

  it("200 con las campañas y las guarda 60 s en Redis", async () => {
    const r = await pedir(`Bearer ${SECRET}`);
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.campanas).toHaveLength(1);
    expect(set).toHaveBeenCalledWith("aioperator:campanas:v1", expect.any(String), "EX", 60);
  });

  it("si Redis tiene la lista, no toca la base", async () => {
    get.mockResolvedValue(JSON.stringify([{ id: "cacheada" }]));
    const cuerpo = await (await pedir(`Bearer ${SECRET}`)).json();
    expect(cuerpo.campanas).toEqual([{ id: "cacheada" }]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("si Redis falla, responde desde la base", async () => {
    get.mockRejectedValue(new Error("redis caído"));
    const r = await pedir(`Bearer ${SECRET}`);
    expect(r.status).toBe(200);
    expect(findMany).toHaveBeenCalled();
  });

  it("500 genérico si la base falla", async () => {
    findMany.mockRejectedValue(new Error("db"));
    const r = await pedir(`Bearer ${SECRET}`);
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: "error interno" });
  });
});
