import { z } from "zod";

// Messages a campaign sends after the link: a main sequence plus branches that
// a button can jump to. Stored as JSON on Automation.sequence.
//
// Instagram only lets these go out once the person has messaged or tapped a
// button (a private reply to a comment is text-only and one-shot), and within
// 24 hours of that — so the sequence starts after the link is delivered by DM.

export const MAIN_BRANCH = "main";
export const STEP_TYPES = ["text", "image", "audio", "video", "file"] as const;
export type StepType = (typeof STEP_TYPES)[number];

// BullMQ job ids and postback payloads are built from these.
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Invalid id");

const buttonSchema = z.union([
  z.object({
    label: z.string().trim().min(1, "Button needs a label").max(20),
    url: z.string().url("Button link must be a full URL"),
  }),
  z.object({
    label: z.string().trim().min(1, "Button needs a label").max(20),
    branchId: idSchema,
  }),
]);

const stepSchema = z
  .object({
    id: idSchema,
    type: z.enum(STEP_TYPES),
    text: z.string().max(1000).default(""),
    mediaUrl: z.string().url("Media must be a full URL").nullable().default(null),
    // Wait before this message, counted from the previous one.
    delaySeconds: z.number().int().min(0).max(86400).default(0),
    buttons: z.array(buttonSchema).max(3, "Max 3 buttons per message").default([]),
    // Hold this message until the person writes back (text, voice note,
    // anything). The wait above then counts from their reply.
    waitForReply: z.boolean().default(false),
    // Nudges sent while waiting for that reply, timed from the start of the
    // wait. Cancelled as soon as they write. Instagram only delivers them if
    // the person wrote in the last 24 hours.
    reminders: z
      .array(
        z.object({
          afterSeconds: z.number().int().min(60).max(86400),
          text: z.string().trim().min(1, "A reminder can't be empty").max(1000),
        })
      )
      .max(3, "Max 3 reminders per message")
      .default([]),
    // Don't send this message if the person wrote after the previous one, so a
    // follow-up never lands in a conversation that is already going.
    skipIfReplied: z.boolean().default(false),
    // On a message that waits for a reply: when it is due, read everything the
    // person wrote during the wait and, if it contains one of a route's
    // keywords, start that branch instead. First matching route wins; no match
    // sends this message as usual.
    routes: z
      .array(
        z.object({
          keywords: z.array(z.string().trim().min(1)).min(1, "A route needs a keyword").max(50),
          branchId: idSchema,
        })
      )
      .max(10)
      .default([]),
  })
  .refine((s) => s.type !== "text" || s.text.trim().length > 0, {
    message: "A text message can't be empty",
  })
  .refine((s) => s.type === "text" || Boolean(s.mediaUrl), {
    message: "Upload a file or paste its URL",
  })
  .refine((s) => s.type === "text" || s.buttons.length === 0, {
    message: "Only text messages can have buttons",
  })
  .refine((s) => s.waitForReply || s.reminders.length === 0, {
    message: "Reminders only apply to a message that waits for a reply",
  })
  // Instagram's button template caps its text at 640 characters.
  .refine((s) => s.buttons.length === 0 || s.text.length <= 640, {
    message: "A message with buttons can be at most 640 characters",
  });

const branchSchema = z.object({
  id: idSchema.refine((id) => id !== MAIN_BRANCH, "Reserved id"),
  name: z.string().trim().min(1, "Name every branch").max(40),
  // Tapping into this branch marks the person as a qualified lead in Contacts.
  qualified: z.boolean().default(false),
  steps: z.array(stepSchema).min(1, "A branch needs at least one message").max(10),
});

const totalDelay = (steps: { delaySeconds: number }[]) =>
  steps.reduce((sum, s) => sum + s.delaySeconds, 0);

export const sequenceSchema = z
  .object({
    main: z.array(stepSchema).max(10).default([]),
    branches: z.array(branchSchema).max(10).default([]),
  })
  .superRefine((seq, ctx) => {
    const branchIds = new Set(seq.branches.map((b) => b.id));
    if (branchIds.size !== seq.branches.length) {
      ctx.addIssue({ code: "custom", message: "Branch ids must be unique" });
    }
    const chains = [seq.main, ...seq.branches.map((b) => b.steps)];
    for (const steps of chains) {
      if (totalDelay(steps) > 86400) {
        ctx.addIssue({
          code: "custom",
          message:
            "Waits in one sequence add up to more than 24 hours; Instagram closes the conversation before that",
        });
      }
      for (const step of steps) {
        for (const route of step.routes) {
          if (!branchIds.has(route.branchId)) {
            ctx.addIssue({ code: "custom", message: "A reply route points to a branch that doesn't exist" });
          }
        }
        for (const button of step.buttons) {
          if ("branchId" in button && !branchIds.has(button.branchId)) {
            ctx.addIssue({
              code: "custom",
              message: `Button "${button.label}" points to a branch that doesn't exist`,
            });
          }
        }
      }
    }
  });

export type Sequence = z.infer<typeof sequenceSchema>;
export type SequenceStep = Sequence["main"][number];
export type SequenceButton = SequenceStep["buttons"][number];

export const EMPTY_SEQUENCE: Sequence = { main: [], branches: [] };

/** Parse what's stored in the DB; anything malformed reads as no sequence. */
export function parseSequence(value: unknown): Sequence {
  const parsed = sequenceSchema.safeParse(value ?? EMPTY_SEQUENCE);
  return parsed.success ? parsed.data : EMPTY_SEQUENCE;
}

export function isEmptySequence(seq: Sequence): boolean {
  return seq.main.length === 0 && seq.branches.length === 0;
}

export function getBranchSteps(seq: Sequence, branchId: string): SequenceStep[] {
  if (branchId === MAIN_BRANCH) return seq.main;
  return seq.branches.find((b) => b.id === branchId)?.steps ?? [];
}

// Postback payload for a button that jumps to a branch.
export const BRANCH_PAYLOAD_PREFIX = "branch:";

export function branchPayload(automationId: string, branchId: string): string {
  return `${BRANCH_PAYLOAD_PREFIX}${automationId}:${branchId}`;
}

export function parseBranchPayload(
  payload: string
): { automationId: string; branchId: string } | null {
  if (!payload.startsWith(BRANCH_PAYLOAD_PREFIX)) return null;
  const [automationId, branchId] = payload
    .slice(BRANCH_PAYLOAD_PREFIX.length)
    .split(":");
  return automationId && branchId ? { automationId, branchId } : null;
}

/** Lowercase, no accents, words separated by single spaces. */
function normalizeForRoutes(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9$€]+/g, " ")
    .trim()} `;
}

/**
 * The branch a reply routes to: the first route with a keyword (a word or a
 * phrase, accents and case ignored) found as whole words in the text.
 */
export function matchReplyRoute(
  routes: SequenceStep["routes"],
  text: string
): string | null {
  const haystack = normalizeForRoutes(text);
  for (const route of routes) {
    for (const keyword of route.keywords) {
      const needle = normalizeForRoutes(keyword);
      if (needle.trim() && haystack.includes(needle)) return route.branchId;
    }
  }
  return null;
}
