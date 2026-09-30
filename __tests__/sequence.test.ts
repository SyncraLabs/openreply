import { describe, it, expect } from "vitest";
import {
  branchPayload,
  getBranchSteps,
  parseBranchPayload,
  parseSequence,
  sequenceSchema,
} from "../lib/sequence";

const text = (id: string, extra: Record<string, unknown> = {}) => ({
  id, type: "text", text: "hola", delaySeconds: 0, ...extra,
});

describe("sequenceSchema", () => {
  it("accepts a sequence with a branch button", () => {
    const r = sequenceSchema.safeParse({
      main: [text("a", { buttons: [{ label: "Precios", branchId: "b1" }] })],
      branches: [{ id: "b1", name: "Precios", steps: [text("c")] }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a button pointing to a missing branch", () => {
    const r = sequenceSchema.safeParse({
      main: [text("a", { buttons: [{ label: "X", branchId: "nope" }] })],
    });
    expect(r.success).toBe(false);
  });

  it("rejects media without a file and empty text", () => {
    expect(sequenceSchema.safeParse({ main: [{ id: "a", type: "audio" }] }).success).toBe(false);
    expect(sequenceSchema.safeParse({ main: [text("a", { text: " " })] }).success).toBe(false);
  });

  it("rejects buttons on media and waits over 24 hours", () => {
    expect(
      sequenceSchema.safeParse({
        main: [{ id: "a", type: "image", mediaUrl: "https://x.test/a.png", buttons: [{ label: "x", url: "https://x.test" }] }],
      }).success
    ).toBe(false);
    expect(
      sequenceSchema.safeParse({
        main: [text("a", { delaySeconds: 50000 }), text("b", { delaySeconds: 50000 })],
      }).success
    ).toBe(false);
  });

  it("rejects ids that would break job ids or payloads", () => {
    expect(sequenceSchema.safeParse({ main: [text("a:b")] }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("reads malformed JSON as no sequence", () => {
    expect(parseSequence({ main: "nope" })).toEqual({ main: [], branches: [] });
    expect(parseSequence(null)).toEqual({ main: [], branches: [] });
  });

  it("round-trips branch payloads", () => {
    expect(parseBranchPayload(branchPayload("auto1", "b1"))).toEqual({ automationId: "auto1", branchId: "b1" });
    expect(parseBranchPayload("reveal:auto1")).toBeNull();
  });

  it("finds branch steps", () => {
    const seq = parseSequence({ main: [text("a")], branches: [{ id: "b", name: "B", steps: [text("c")] }] });
    expect(getBranchSteps(seq, "main")).toHaveLength(1);
    expect(getBranchSteps(seq, "b")[0].id).toBe("c");
    expect(getBranchSteps(seq, "zzz")).toEqual([]);
  });
});
