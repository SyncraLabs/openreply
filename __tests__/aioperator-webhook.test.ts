import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const automationFind = vi.fn();
const dmLogFind = vi.fn();
vi.mock("../lib/db/client", () => ({
  prisma: {
    automation: { findUnique: (...a: unknown[]) => automationFind(...a) },
    dmLog: { findFirst: (...a: unknown[]) => dmLogFind(...a) },
  },
}));

import { buildAiOperatorPayload, notifyAiOperator } from "../lib/aioperator-webhook";

describe("buildAiOperatorPayload", () => {
  it("fills the contract and drops empty fields", () => {
    const body = buildAiOperatorPayload(
      { evento: "boton", userId: "17841", automationId: "a1", buttonKey: "b1", buttonText: "empiezo de cero", qualified: false },
      { campaign: "Skool r15", keyword: "YO", postId: "999", username: "@rodri_x" },
      new Date("2026-11-03T10:00:00Z")
    );
    expect(body).toMatchObject({
      evento: "boton",
      instagram_id: "17841",
      instagram: "rodri_x",
      campana: "Skool r15",
      palabra_clave: "YO",
      post_id: "999",
      boton_clave: "b1",
      boton_texto: "empiezo de cero",
      cualificado: false,
      fecha: "2026-11-03T10:00:00.000Z",
    });
    const sparse = buildAiOperatorPayload({ evento: "texto", userId: "1", automationId: "a", text: "hola" }, {});
    expect(sparse.instagram).toBeUndefined();
    expect(sparse.texto).toBe("hola");
  });
});

describe("notifyAiOperator", () => {
  beforeEach(() => {
    automationFind.mockReset().mockResolvedValue({ name: "Camp", keywords: ["YO"], postId: "p1" });
    dmLogFind.mockReset().mockResolvedValue({ commenterName: "ana", matchedKeyword: "YO" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does nothing without the env vars", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    notifyAiOperator({ evento: "enlace", userId: "1", automationId: "a" });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts with the bearer secret and returns without waiting", async () => {
    vi.stubEnv("AIOPERATOR_WEBHOOK_URL", "https://ao.test/api/leads/rodrichat");
    vi.stubEnv("AIOPERATOR_WEBHOOK_SECRET", "s3cret");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const out = notifyAiOperator({ evento: "texto", userId: "1", automationId: "a", text: "quiero montar" });
    expect(out).toBeUndefined();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://ao.test/api/leads/rodrichat");
    expect(init.headers.Authorization).toBe("Bearer s3cret");
    expect(JSON.parse(init.body)).toMatchObject({ evento: "texto", instagram: "ana", campana: "Camp", texto: "quiero montar" });
  });

  it("swallows a network failure", async () => {
    vi.stubEnv("AIOPERATOR_WEBHOOK_URL", "https://ao.test/x");
    vi.stubEnv("AIOPERATOR_WEBHOOK_SECRET", "s");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    expect(() => notifyAiOperator({ evento: "enlace", userId: "1", automationId: "a" })).not.toThrow();
    await vi.waitFor(() => expect(err).toHaveBeenCalled());
    err.mockRestore();
  });
});
