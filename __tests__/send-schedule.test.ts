import { describe, it, expect } from "vitest";
import { computeSendAt, isInSendWindow } from "../lib/queue/send-schedule";

const base = {
  sendDelayMinSeconds: 0,
  sendDelayMaxSeconds: 0,
  sendWindowStart: null,
  sendWindowEnd: null,
  sendWindowTimezone: "Europe/Madrid",
};

// 2026-09-30 is CEST (UTC+2): 12:00 UTC = 14:00 Madrid.
const noonUtc = new Date("2026-09-30T12:00:00Z");

describe("computeSendAt", () => {
  it("sends now with no delay and no window", () => {
    expect(computeSendAt(base, noonUtc).getTime()).toBe(noonUtc.getTime());
  });

  it("uses a fixed delay", () => {
    const at = computeSendAt({ ...base, sendDelayMinSeconds: 300, sendDelayMaxSeconds: 300 }, noonUtc);
    expect(at.getTime() - noonUtc.getTime()).toBe(300_000);
  });

  it("picks inside a random range", () => {
    const t = { ...base, sendDelayMinSeconds: 60, sendDelayMaxSeconds: 600 };
    expect(computeSendAt(t, noonUtc, () => 0).getTime() - noonUtc.getTime()).toBe(60_000);
    expect(computeSendAt(t, noonUtc, () => 1).getTime() - noonUtc.getTime()).toBe(600_000);
  });

  it("waits for the window to open", () => {
    // 23:00 Madrid, window 09:00-22:00 → next 09:00 Madrid = 07:00 UTC.
    const late = new Date("2026-09-30T21:00:00Z");
    const t = { ...base, sendWindowStart: 540, sendWindowEnd: 1320 };
    expect(computeSendAt(t, late, () => 0).toISOString()).toBe("2026-10-01T07:00:00.000Z");
    const spread = computeSendAt(t, late, () => 1).getTime() - Date.parse("2026-10-01T07:00:00Z");
    expect(spread).toBe(15 * 60_000);
  });

  it("sends inside the window without waiting", () => {
    const t = { ...base, sendWindowStart: 540, sendWindowEnd: 1320 };
    expect(computeSendAt(t, noonUtc).getTime()).toBe(noonUtc.getTime());
  });
});

describe("isInSendWindow", () => {
  it("handles windows past midnight", () => {
    const t = { ...base, sendWindowStart: 1320, sendWindowEnd: 120 }; // 22:00-02:00
    expect(isInSendWindow(t, new Date("2026-09-30T21:30:00Z"))).toBe(true); // 23:30
    expect(isInSendWindow(t, new Date("2026-09-30T23:30:00Z"))).toBe(true); // 01:30
    expect(isInSendWindow(t, new Date("2026-09-30T12:00:00Z"))).toBe(false); // 14:00
  });
});
