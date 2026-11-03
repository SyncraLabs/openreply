import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const dmLogFind = vi.fn();
const dmLogCreate = vi.fn();
const choiceFind = vi.fn();
vi.mock("../lib/db/client", () => ({
  prisma: {
    dmLog: { findFirst: (...a: unknown[]) => dmLogFind(...a), create: (...a: unknown[]) => dmLogCreate(...a) },
    sequenceChoice: { findFirst: (...a: unknown[]) => choiceFind(...a) },
  },
}));

const incr = vi.fn();
vi.mock("../lib/queue/client", () => ({
  getRedisConnection: () => ({ incr: (...a: unknown[]) => incr(...a), expire: vi.fn() }),
}));

const lastInbound = vi.fn();
vi.mock("../lib/queue/conversation", () => ({ getLastInbound: (...a: unknown[]) => lastInbound(...a) }));
vi.mock("../lib/meta/oauth", () => ({ decryptToken: () => "token" }));

const sendText = vi.fn();
const sendAttachment = vi.fn();
vi.mock("../lib/meta/client", async () => {
  class MetaApiError extends Error {
    constructor(public code: number, public subcode: number | undefined, public fbTraceId: string | undefined, m: string) {
      super(m);
    }
  }
  return {
    MetaApiError,
    sendDirectMessage: (...a: unknown[]) => sendText(...a),
    sendDirectMessageAttachment: (...a: unknown[]) => sendAttachment(...a),
  };
});

import { windowMode, sendAiOperatorDm, OUT_OF_WINDOW_MESSAGE } from "../lib/aioperator-dm";
import { POST } from "../app/api/aioperator/dm/route";
import { MetaApiError } from "../lib/meta/client";
import { NextRequest } from "next/server";

const NOW = Date.now();
const H = 3600 * 1000;

describe("windowMode", () => {
  it("standard within 24 h, human agent up to 7 days, closed after", () => {
    expect(windowMode(NOW - 2 * H, NOW)).toBe("standard");
    expect(windowMode(NOW - 30 * H, NOW)).toBe("human_agent");
    expect(windowMode(NOW - 8 * 24 * H, NOW)).toBeNull();
    expect(windowMode(null, NOW)).toBeNull();
  });
});

function setup(inboundAgoH: number | null) {
  dmLogFind.mockResolvedValue({
    workspaceId: "w1",
    automationId: "a1",
    commenterName: "ana",
    instagramAccount: { id: "acc1", instagramId: "IG1", workspaceId: "w1", accessToken: "enc" },
  });
  lastInbound.mockResolvedValue(inboundAgoH === null ? null : NOW - inboundAgoH * H);
  choiceFind.mockResolvedValue(null);
  dmLogCreate.mockResolvedValue({ id: "log1" });
  sendText.mockResolvedValue({ recipient_id: "u", message_id: "m" });
  sendAttachment.mockResolvedValue({ recipient_id: "u", message_id: "m" });
}

describe("sendAiOperatorDm", () => {
  beforeEach(() => {
    for (const m of [dmLogFind, dmLogCreate, choiceFind, lastInbound, sendText, sendAttachment]) m.mockReset();
  });

  it("sends inside 24 h without a tag and logs origin aioperator", async () => {
    setup(1);
    const r = await sendAiOperatorDm({ instagramId: "123", texto: "hola" });
    expect(r).toEqual({ ok: true, dmLogId: "log1" });
    expect(sendText).toHaveBeenCalledWith("token", "IG1", "123", "hola", undefined);
    const data = dmLogCreate.mock.calls[0][0].data;
    expect(data.matchedKeyword).toBe("aioperator");
    expect(data.commentId).toMatch(/^aioperator:/);
    expect(data.status).toBe("SENT");
  });

  it("uses HUMAN_AGENT between 24 h and 7 days", async () => {
    setup(30);
    await sendAiOperatorDm({ instagramId: "123", texto: "hola", audioUrl: "https://x.test/a.mp3" });
    expect(sendText).toHaveBeenCalledWith("token", "IG1", "123", "hola", "HUMAN_AGENT");
    expect(sendAttachment).toHaveBeenCalledWith("token", "IG1", "123", "audio", "https://x.test/a.mp3", "HUMAN_AGENT");
  });

  it("refuses with 409 past 7 days or with no known inbound, and sends nothing", async () => {
    setup(9 * 24);
    expect(await sendAiOperatorDm({ instagramId: "123", texto: "hola" })).toEqual({ ok: false, status: 409, error: OUT_OF_WINDOW_MESSAGE });
    setup(null);
    expect((await sendAiOperatorDm({ instagramId: "123", texto: "hola" }))).toMatchObject({ status: 409 });
    expect(sendText).not.toHaveBeenCalled();
  });

  it("uses a button press from the database as the last inbound", async () => {
    setup(null);
    choiceFind.mockResolvedValue({ updatedAt: new Date(NOW - 3 * H) });
    expect(await sendAiOperatorDm({ instagramId: "123", texto: "hola" })).toMatchObject({ ok: true });
  });

  it("404 for an unknown contact", async () => {
    dmLogFind.mockResolvedValue(null);
    expect(await sendAiOperatorDm({ instagramId: "1", texto: "x" })).toMatchObject({ status: 404 });
  });

  it("maps Meta's closed-window error to 409 and other errors to 500, logging FAILED", async () => {
    setup(1);
    sendText.mockRejectedValueOnce(new MetaApiError(10, 2534022, undefined, "outside window"));
    expect(await sendAiOperatorDm({ instagramId: "123", texto: "hola" })).toMatchObject({ status: 409 });
    expect(dmLogCreate.mock.calls[0][0].data.status).toBe("FAILED");
    sendText.mockRejectedValueOnce(new Error("boom"));
    expect(await sendAiOperatorDm({ instagramId: "123", texto: "hola" })).toEqual({ ok: false, status: 500, error: "no se pudo enviar" });
  });
});

describe("POST /api/aioperator/dm", () => {
  const req = (body: unknown, auth?: string) =>
    new NextRequest("http://localhost/api/aioperator/dm", {
      method: "POST",
      headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  beforeEach(() => {
    vi.stubEnv("AIOPERATOR_WEBHOOK_SECRET", "s3cret");
    for (const m of [dmLogFind, dmLogCreate, choiceFind, lastInbound, sendText, sendAttachment, incr]) m.mockReset();
    incr.mockResolvedValue(1);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("401 without or with a wrong token", async () => {
    expect((await POST(req({ instagram_id: "1", texto: "x" }))).status).toBe(401);
    expect((await POST(req({ instagram_id: "1", texto: "x" }, "Bearer nope"))).status).toBe(401);
  });

  it("401 when the secret is not configured", async () => {
    vi.stubEnv("AIOPERATOR_WEBHOOK_SECRET", "");
    expect((await POST(req({ instagram_id: "1", texto: "x" }, "Bearer "))).status).toBe(401);
  });

  it("400 for bad bodies", async () => {
    const auth = "Bearer s3cret";
    expect((await POST(req("{no", auth))).status).toBe(400);
    expect((await POST(req({ instagram_id: "1" }, auth))).status).toBe(400);
    expect((await POST(req({ instagram_id: "abc", texto: "x" }, auth))).status).toBe(400);
    expect((await POST(req({ instagram_id: "1", audio_url: "http://x.test/a.mp3" }, auth))).status).toBe(400);
  });

  it("429 over the rate limit", async () => {
    incr.mockResolvedValue(21);
    expect((await POST(req({ instagram_id: "1", texto: "x" }, "Bearer s3cret"))).status).toBe(429);
  });

  it("200 with dmLogId, 409 out of window, 500 generic on a crash", async () => {
    const auth = "Bearer s3cret";
    setup(1);
    const ok = await POST(req({ instagram_id: "123", texto: "hola" }, auth));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, dmLogId: "log1" });
    setup(null);
    const late = await POST(req({ instagram_id: "123", texto: "hola" }, auth));
    expect(late.status).toBe(409);
    expect((await late.json()).error).toContain("fuera de ventana");
    dmLogFind.mockRejectedValue(new Error("db down"));
    const bad = await POST(req({ instagram_id: "123", texto: "hola" }, auth));
    expect(bad.status).toBe(500);
    expect(JSON.stringify(await bad.json())).not.toContain("db down");
  });
});
