// When a campaign's reply goes out: an optional wait (fixed or a random range)
// plus an optional daily sending window. Pure so the worker and tests share it.

export interface SendTiming {
  sendDelayMinSeconds: number;
  sendDelayMaxSeconds: number;
  // Minutes from midnight in sendWindowTimezone. Both null = any time.
  sendWindowStart: number | null;
  sendWindowEnd: number | null;
  sendWindowTimezone: string;
}

// Replies held until the window opens are spread over this many minutes, so a
// night's worth of comments doesn't all fire in the same second.
const WINDOW_OPEN_SPREAD_MINUTES = 15;

// How long past its time a parked reply may sit before the polling pass stops
// waiting for its job (lost from Redis) and sends it itself.
export const SCHEDULE_GRACE_MS = 15 * 60_000;

function minuteOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function isInSendWindow(timing: SendTiming, date: Date): boolean {
  const { sendWindowStart: start, sendWindowEnd: end } = timing;
  if (start == null || end == null || start === end) return true;
  const now = minuteOfDay(date, timing.sendWindowTimezone);
  // A window like 22:00-02:00 wraps past midnight.
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export function computeSendAt(
  timing: SendTiming,
  now: Date = new Date(),
  random: () => number = Math.random
): Date {
  const min = Math.max(0, timing.sendDelayMinSeconds || 0);
  const max = Math.max(min, timing.sendDelayMaxSeconds || 0);
  const delaySeconds = min + Math.round(random() * (max - min));
  const sendAt = new Date(now.getTime() + delaySeconds * 1000);

  if (isInSendWindow(timing, sendAt)) return sendAt;

  const current = minuteOfDay(sendAt, timing.sendWindowTimezone);
  const minutesUntilOpen = (timing.sendWindowStart! - current + 1440) % 1440;
  const spread = Math.round(random() * WINDOW_OPEN_SPREAD_MINUTES);
  // Land on the start of the opening minute, then spread.
  const openAt = new Date(sendAt.getTime() + minutesUntilOpen * 60_000);
  openAt.setUTCSeconds(0, 0);
  return new Date(openAt.getTime() + spread * 60_000);
}
