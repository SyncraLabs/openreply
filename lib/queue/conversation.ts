import { getRedisConnection } from "./client";

// Per-person conversation state for sequences that wait for a reply
// (lib/sequence.ts `waitForReply`, `skipIfReplied`). Lives in Redis next to the
// queue: it only matters inside Instagram's 24-hour window, so it expires.

const TTL_SECONDS = 48 * 60 * 60;

export interface SequenceWait {
  automationId: string;
  branchId: string;
  index: number;
  runId: string;
  commenterName: string | null;
  // Tells this wait apart from a later one, so a stale reminder stays quiet.
  waitId: string;
}

const inboundKey = (account: string, user: string) => `convo:in:${account}:${user}`;
const waitKey = (account: string, user: string) => `convo:wait:${account}:${user}`;

/** Remember when this person last wrote to the account. */
export async function recordInbound(account: string, user: string, at = Date.now()) {
  await getRedisConnection().set(inboundKey(account, user), String(at), "EX", TTL_SECONDS);
}

export async function getLastInbound(account: string, user: string): Promise<number | null> {
  const raw = await getRedisConnection().get(inboundKey(account, user));
  return raw ? Number(raw) : null;
}

/** Park a sequence until the person writes. One wait per person and account. */
export async function setWait(account: string, user: string, wait: SequenceWait) {
  await getRedisConnection().set(waitKey(account, user), JSON.stringify(wait), "EX", TTL_SECONDS);
}

export async function getWait(account: string, user: string): Promise<SequenceWait | null> {
  const raw = await getRedisConnection().get(waitKey(account, user));
  return raw ? (JSON.parse(raw) as SequenceWait) : null;
}

/** Take the wait so only one of several quick messages resumes it. */
export async function takeWait(account: string, user: string): Promise<SequenceWait | null> {
  const raw = await getRedisConnection().getdel(waitKey(account, user));
  return raw ? (JSON.parse(raw) as SequenceWait) : null;
}
