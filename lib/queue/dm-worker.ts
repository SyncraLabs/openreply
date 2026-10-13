import { Worker, type Job } from "bullmq";
import {
  getDMQueue,
  getRedisConnection,
  MESSAGE_JOB_NAME,
  POSTBACK_JOB_NAME,
  FOLLOWUP_JOB_NAME,
  STEP_JOB_NAME,
  type DmQueueJob,
  type ProcessStepJob,
  type ProcessCommentJob,
  type ProcessMessageJob,
  type ProcessPostbackJob,
  type ProcessFollowUpJob,
} from "./client";
import { prisma } from "@/lib/db/client";
import {
  MetaApiError,
  RateLimitError,
  TokenExpiredError,
  getUserFollowStatus,
  sendCommentReply,
  sendDirectMessage,
  sendDirectMessageAttachment,
  sendDirectMessageWithButton,
  sendDirectMessageWithButtons,
  sendDirectMessageWithLinkButton,
  sendPrivateReply,
  sendPrivateReplyWithButton,
  sendPrivateReplyWithLinkButton,
} from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import { matchKeywords } from "@/lib/utils/keyword-matcher";
import {
  claimSend,
  releaseSend,
  reserveDMSlot,
  reservePacedSlot,
} from "@/lib/utils/rate-limiter";
import {
  releaseWorkspaceDMReservation,
  reserveWorkspaceDMSend,
} from "@/lib/billing/usage";
import { recordWorkerAlert } from "@/lib/ops/worker-health";
import { computeSendAt, SCHEDULE_GRACE_MS } from "./send-schedule";
import {
  MAIN_BRANCH,
  branchPayload,
  getBranchSteps,
  parseBranchPayload,
  parseSequence,
  type SequenceStep,
} from "@/lib/sequence";
import {
  getLastInbound,
  getWait,
  recordInbound,
  setWait,
  takeWait,
} from "./conversation";
import {
  buildTrackedUrl,
  renderMessageWithTracking,
  renderMessageWithoutLink,
} from "@/lib/tracking/message";

const BACKOFF_DELAYS = [5 * 60 * 1000, 15 * 60 * 1000, 45 * 60 * 1000];

function formatError(error: unknown): string {
  if (error instanceof MetaApiError) {
    return `Meta API Error ${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

// Meta rejections that a plain-text retry cannot fix: the send was refused for
// the conversation, not for the button template. Retrying as text just burns
// the attempt and — worse — overwrites the real error with a misleading one
// ("invalid for a private reply", because the first attempt already used up the
// comment's single allowed private reply).
const NON_TEMPLATE_REJECTIONS = [
  /outside of allowed window/i,
  /invalid for a private reply/i,
  /requested user cannot be found/i,
];

function isTemplateRejection(error: unknown): boolean {
  if (error instanceof TokenExpiredError || error instanceof RateLimitError) {
    return false;
  }
  const message = error instanceof Error ? error.message : "";
  return !NON_TEMPLATE_REJECTIONS.some((pattern) => pattern.test(message));
}

type WorkerTrackedLink = {
  slug: string;
  label: string | null;
  destinationUrl: string;
};

/**
 * Build the tappable link buttons for a DM. The first link uses the campaign's
 * `linkButtonLabel`; each additional link uses its own stored `label`. Capped at
 * Meta's 3-button limit for a button template.
 */
function buildLinkButtons(
  trackedLinks: WorkerTrackedLink[],
  primaryLabel: string | null
): { title: string; url: string }[] {
  return trackedLinks.slice(0, 3).map((link, index) => ({
    url: buildTrackedUrl(link.slug),
    title: (index === 0 ? primaryLabel : link.label) || link.label || "Open link",
  }));
}

/**
 * Fallback text when Meta rejects the button template: render the primary link
 * inline, then append any extra tracked URLs on their own lines so no link is
 * lost.
 */
function buildInlineLinkFallback(
  message: string,
  commenterName: string | null | undefined,
  trackedLinks: WorkerTrackedLink[],
  bodyText: string
): string {
  const base =
    renderMessageWithTracking({ message, commenterName, trackedLinks }) ||
    bodyText;
  const extraUrls = trackedLinks.slice(1).map((link) => buildTrackedUrl(link.slug));
  return extraUrls.length > 0 ? `${base}\n${extraUrls.join("\n")}` : base;
}

type RevealAutomation = {
  dmMessage: string;
  linkButtonLabel: string | null;
  trackedLinks: WorkerTrackedLink[];
  instagramAccount: { instagramId: string };
};

/**
 * Deliver a campaign's reveal message as a direct message. Shared by the
 * button-tap (postback) path and the DM keyword-trigger path — both already
 * have an open conversation with the user, so neither uses a private reply.
 */
async function sendRevealDirectMessage(
  accessToken: string,
  automation: RevealAutomation,
  userId: string,
  commenterName: string | null,
  context: string
): Promise<void> {
  if (automation.trackedLinks.length === 0) {
    await sendDirectMessage(
      accessToken,
      automation.instagramAccount.instagramId,
      userId,
      renderMessageWithTracking({
        message: automation.dmMessage,
        commenterName,
        trackedLinks: automation.trackedLinks,
      })
    );
    return;
  }

  // Try button template first; if Meta rejects it, fall back to inline links.
  const bodyText =
    renderMessageWithoutLink({
      message: automation.dmMessage,
      commenterName,
    }) || "Here's your link:";
  const buttons = buildLinkButtons(
    automation.trackedLinks,
    automation.linkButtonLabel
  );

  try {
    await sendDirectMessageWithLinkButton(
      accessToken,
      automation.instagramAccount.instagramId,
      userId,
      bodyText,
      buttons
    );
  } catch (buttonError) {
    // A closed messaging window rejects the text retry too, so don't let it
    // overwrite the original error with a misleading one.
    if (!isTemplateRejection(buttonError)) throw buttonError;

    console.log(
      `[DM Worker] Button template rejected in ${context}, falling back to inline link:`,
      formatError(buttonError)
    );
    try {
      await sendDirectMessage(
        accessToken,
        automation.instagramAccount.instagramId,
        userId,
        buildInlineLinkFallback(
          automation.dmMessage,
          commenterName,
          automation.trackedLinks,
          bodyText
        )
      );
    } catch {
      throw buttonError;
    }
  }
}

async function processComment(job: Job<ProcessCommentJob>): Promise<void> {
  const {
    instagramAccountId,
    commentId,
    commentText,
    commenterId,
    commenterName,
    mediaId,
  } = job.data;
  const requeueAttempt = job.data.requeueAttempt ?? 0;
  const { scheduledAutomationId } = job.data;

  const automations = await prisma.automation.findMany({
    where: {
      // Match campaigns bound to this specific post, plus any-post campaigns.
      OR: [{ postId: mediaId }, { matchAnyPost: true }],
      ...(scheduledAutomationId ? { id: scheduledAutomationId } : {}),
      isActive: true,
      retiredAt: null,
      instagramAccount: {
        instagramId: instagramAccountId,
      },
    },
    include: {
      instagramAccount: true,
      workspace: true,
      trackedLinks: {
        select: {
          slug: true,
          label: true,
          destinationUrl: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const automation of automations) {
    // "Any word" campaigns fire on every comment; otherwise require a keyword hit.
    const matchResult = automation.matchAnyWord
      ? { matched: true, matchedKeyword: null }
      : matchKeywords(
          commentText,
          automation.keywords,
          automation.wholeWordMatch
        );

    if (!matchResult.matched) {
      continue;
    }

    const existingLog = await prisma.dmLog.findUnique({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId,
        },
      },
    });

    const alreadyDmd = existingLog?.status === "SENT";
    const alreadyPublicReplied = Boolean(existingLog?.publicReplySentAt);
    const needsDm = !alreadyDmd;

    // A delayed reply is already waiting on its own job; the webhook/polling
    // pass must not send it early. Only once it's well overdue (its job was
    // lost) does this pass send it instead.
    const isScheduledRun = scheduledAutomationId === automation.id;
    const scheduledAt =
      existingLog?.status === "PENDING" ? existingLog.scheduledAt : null;
    if (
      !isScheduledRun &&
      scheduledAt &&
      scheduledAt.getTime() > Date.now() - SCHEDULE_GRACE_MS
    ) {
      continue;
    }

    // Skip only when there is genuinely nothing left to do. A comment whose DM
    // already sent but whose public reply never posted (e.g. it hit a rate
    // limit) must still come back so the public reply can be retried.
    if (existingLog?.status === "SKIPPED_PLAN_LIMIT") continue;
    if (existingLog?.status === "SKIPPED_DEDUP") continue;
    if (alreadyDmd && (alreadyPublicReplied || !automation.publicReplyEnabled)) {
      continue;
    }

    if (!automation.instagramAccount.accessToken) {
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        create: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
          instagramAccountId: automation.instagramAccountId,
          commenterId,
          commenterName,
          commentText,
          commentId,
          matchedKeyword: matchResult.matchedKeyword,
          status: "FAILED",
          errorMessage: "No Instagram access token available",
        },
        update: {
          status: "FAILED",
          errorMessage: "No Instagram access token available",
        },
      });
      continue;
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(automation.instagramAccount.accessToken);
    } catch {
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        create: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
          instagramAccountId: automation.instagramAccountId,
          commenterId,
          commenterName,
          commentText,
          commentId,
          matchedKeyword: matchResult.matchedKeyword,
          status: "FAILED",
          errorMessage: "Failed to decrypt Instagram access token",
        },
        update: {
          status: "FAILED",
          errorMessage: "Failed to decrypt Instagram access token",
        },
      });
      continue;
    }

    // Ensure a log row exists before the public reply leg (which updates it).
    // Only (re)set PENDING when the DM will actually be attempted, so a prior
    // SENT is never clobbered while we come back just to retry the public reply.
    if (!existingLog) {
      await prisma.dmLog.create({
        data: {
          workspaceId: automation.workspaceId,
          automationId: automation.id,
          instagramAccountId: automation.instagramAccountId,
          commenterId,
          commenterName,
          commentText,
          commentId,
          matchedKeyword: matchResult.matchedKeyword,
          status: "PENDING",
          attempts: job.attemptsMade + 1,
        },
      });
    } else if (needsDm) {
      await prisma.dmLog.update({
        where: {
          automationId_commentId: { automationId: automation.id, commentId },
        },
        data: {
          status: "PENDING",
          attempts: job.attemptsMade + 1,
          matchedKeyword: matchResult.matchedKeyword,
          errorMessage: null,
        },
      });
    }

    // One DM per person per campaign: someone who comments three times gets one
    // message (and one public reply), not three. Before parking, a reply already
    // parked for another of their comments counts too; at send time only a
    // delivered one does, so two parked replies can't cancel each other out.
    if (needsDm) {
      const parking = !isScheduledRun && !scheduledAt;
      // Every campaign this account has had on this post, retired ones too:
      // whoever got a DM there before doesn't get another from a new one.
      const samePostIds = (
        await prisma.automation.findMany({
          where: { instagramAccountId: automation.instagramAccountId, postId: mediaId },
          select: { id: true },
        })
      ).map((a) => a.id);
      const samePerson = await prisma.dmLog.findFirst({
        where: {
          automationId: { in: [...new Set([automation.id, ...samePostIds])] },
          commenterId,
          commentId: { not: commentId },
          OR: parking
            ? [{ status: "SENT" }, { status: "PENDING", scheduledAt: { not: null } }]
            : [{ status: "SENT" }],
        },
        select: { id: true },
      });
      if (samePerson) {
        await prisma.dmLog.update({
          where: {
            automationId_commentId: { automationId: automation.id, commentId },
          },
          data: {
            status: "SKIPPED_DEDUP",
            errorMessage: "This person already got a DM for another comment on this post or campaign",
          },
        });
        continue;
      }
    }

    // Send delay / window, then pacing: park the whole reply (public + DM) on a
    // delayed job at the account's next free turn. Everything that hasn't got a
    // turn takes one: a new comment, a reply whose delayed job was lost, and a
    // retry of the delayed run (BullMQ retries would otherwise fire in a burst).
    const isRetry = isScheduledRun && job.attemptsMade > 0;
    if (needsDm && (!isScheduledRun || isRetry)) {
      const fresh = !isScheduledRun && !scheduledAt;
      const sendAt = await reservePacedSlot(
        instagramAccountId,
        fresh ? computeSendAt(automation) : new Date()
      );
      const delay = sendAt.getTime() - Date.now();
      if (delay > 1000) {
        await prisma.dmLog.update({
          where: {
            automationId_commentId: { automationId: automation.id, commentId },
          },
          data: { status: "PENDING", scheduledAt: sendAt },
        });
        await getDMQueue().add(
          "process-comment",
          { ...job.data, scheduledAutomationId: automation.id },
          {
            delay,
            // Unique per park: a fixed id collides with an earlier delayed job
            // BullMQ still keeps as completed, and the add is silently dropped
            // (the reply then sits PENDING with nothing queued). Duplicates are
            // stopped at send time by claimSend, not here.
            jobId: `comment_${instagramAccountId}_${commentId}_sched_${automation.id}_${sendAt.getTime()}`,
          }
        );
        continue;
      }
    }

    // Public reply leg. It goes out only after this campaign's DM is delivered:
    // the replies say "te he escrito", so posting one for a DM that failed (or
    // that another campaign sent) tells people something that isn't true.
    // Idempotent across retries via publicReplySentAt.
    const postPublicReply = async () => {
      const replyPool =
        automation.publicReplyMessages.length > 0
          ? automation.publicReplyMessages
          : automation.publicReplyMessage
            ? [automation.publicReplyMessage]
            : [];
      if (
        automation.publicReplyEnabled &&
        replyPool.length > 0 &&
        !existingLog?.publicReplySentAt
      ) {
        try {
          const chosen = replyPool[Math.floor(Math.random() * replyPool.length)];
          const publicReply = renderMessageWithTracking({
            message: chosen,
            commenterName,
            trackedLinks: automation.trackedLinks,
          });
          await sendCommentReply(accessToken, commentId, publicReply);
          await prisma.dmLog.update({
            where: {
              automationId_commentId: { automationId: automation.id, commentId },
            },
            data: { publicReplySentAt: new Date(), publicReplyError: null },
          });
        } catch (error) {
          console.error(
            "[DM Worker] Public comment reply failed:",
            formatError(error)
          );
          await prisma.dmLog
            .update({
              where: {
                automationId_commentId: { automationId: automation.id, commentId },
              },
              data: { publicReplyError: formatError(error) },
            })
            .catch(() => {});
        }
      }
    };

    // DM already sent on an earlier pass: only the public reply can be missing.
    if (!needsDm) {
      await postPublicReply();
      continue;
    }

    // Meta allows exactly ONE private reply per comment, ever — across every
    // campaign. When several campaigns match the same comment (duplicated
    // campaigns, or an any-post campaign overlapping a post-specific one), only
    // the first can deliver; the rest would fail with "The comment is invalid
    // for a private reply". Skip them explicitly instead of burning an API call
    // and logging a failure the user can do nothing about. The campaign that
    // does send posts the public reply. An older campaign still waiting on its send delay has claimed it too.
    const privateReplyUsedBy = await prisma.dmLog.findFirst({
      where: {
        commentId,
        automationId: { not: automation.id },
        OR: [
          { status: "SENT" },
          {
            status: "PENDING",
            scheduledAt: { not: null },
            automation: { createdAt: { lt: automation.createdAt } },
          },
        ],
      },
      select: { automation: { select: { name: true } } },
    });
    if (privateReplyUsedBy) {
      await prisma.dmLog.update({
        where: {
          automationId_commentId: { automationId: automation.id, commentId },
        },
        data: {
          status: "SKIPPED_DEDUP",
          matchedKeyword: matchResult.matchedKeyword,
          errorMessage: `Another campaign (${privateReplyUsedBy.automation?.name ?? "unknown"}) already took the one private reply Instagram allows for this comment`,
        },
      });
      continue;
    }

    // Only one worker sends a given comment, and one DM per person at a time.
    const claim = [
      `send:comment:${commentId}`,
      `send:person:${automation.id}:${commenterId}`,
    ];
    if (!(await claimSend(claim))) continue;

    const usage = await reserveWorkspaceDMSend(automation.workspaceId);
    if (!usage.allowed) {
      await releaseSend(claim);
      await prisma.dmLog.update({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        data: {
          status: "SKIPPED_PLAN_LIMIT",
          matchedKeyword: matchResult.matchedKeyword,
          errorMessage: `Monthly DM limit reached (${usage.limit})`,
        },
      });
      continue;
    }

    let rateLimit;
    try {
      rateLimit = await reserveDMSlot(instagramAccountId, requeueAttempt);
    } catch (error) {
      await releaseWorkspaceDMReservation(
        automation.workspaceId,
        usage.periodStart
      );
      await releaseSend(claim);
      await prisma.dmLog.update({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        data: {
          status: "FAILED",
          attempts: job.attemptsMade + 1,
          errorMessage: formatError(error),
        },
      });
      throw error;
    }

    if (!rateLimit.allowed) {
      await releaseWorkspaceDMReservation(
        automation.workspaceId,
        usage.periodStart
      );
      await releaseSend(claim);

      if (rateLimit.shouldSkip) {
        await prisma.dmLog.update({
          where: {
            automationId_commentId: {
              automationId: automation.id,
              commentId,
            },
          },
          data: {
            status: "SKIPPED_RATE_LIMIT",
            matchedKeyword: matchResult.matchedKeyword,
            errorMessage: "Hourly Instagram DM rate limit reached",
          },
        });
        continue;
      }

      if (rateLimit.shouldRequeue) {
        await prisma.dmLog.update({
          where: {
            automationId_commentId: {
              automationId: automation.id,
              commentId,
            },
          },
          data: {
            status: "PENDING",
            matchedKeyword: matchResult.matchedKeyword,
            errorMessage: "Hourly rate limit hit; retry scheduled",
          },
        });

        await getDMQueue().add(
          "process-comment",
          {
            ...job.data,
            requeueAttempt: requeueAttempt + 1,
          },
          {
            delay: rateLimit.requeueDelayMs,
            jobId: `comment_${instagramAccountId}_${commentId}_retry_${requeueAttempt + 1}`,
          }
        );
        continue;
      }
    }

    // With an opening DM, the private reply is a button message; tapping it
    // fires a postback that delivers the reveal (see processPostback). Without
    // one, we send the reveal text directly as today.
    const useOpeningDm =
      automation.openingDmEnabled &&
      Boolean(automation.openingDmMessage) &&
      Boolean(automation.openingDmButtonLabel);

    // Follow-gating: the link is revealed only after a follow. When an opening
    // DM is enabled it comes FIRST, and its button routes into the follow check
    // (opening DM → follow gate → link). Without an opening DM, we check follow
    // status at comment time: confirmed followers get the link now, everyone
    // else gets the "follow me first" prompt (re-verified on tap).
    let sendFollowPrompt = false;
    if (automation.requireFollow && !useOpeningDm) {
      const alreadyFollows = await getUserFollowStatus(accessToken, commenterId);
      sendFollowPrompt = alreadyFollows !== true;
    }

    try {
      if (useOpeningDm) {
        const openingText = renderMessageWithTracking({
          message: automation.openingDmMessage as string,
          commenterName,
          trackedLinks: [],
        });
        await sendPrivateReplyWithButton(
          accessToken,
          automation.instagramAccount.instagramId,
          commentId,
          openingText,
          automation.openingDmButtonLabel as string,
          automation.requireFollow
            ? `followcheck:${automation.id}`
            : `reveal:${automation.id}`
        );
      } else if (sendFollowPrompt) {
        const promptText = renderMessageWithoutLink({
          message:
            automation.followPromptMessage ||
            "quick favor before i send your link. i don't make any money from this, it's free. if you want to support me, just don't unfollow after, and star the repo on github if it helps you. tap the button once you're following and i'll send it over",
          commenterName,
        });
        await sendPrivateReplyWithButton(
          accessToken,
          automation.instagramAccount.instagramId,
          commentId,
          promptText,
          automation.followPromptButtonLabel || "i'm following",
          `followcheck:${automation.id}`
        );
      } else if (automation.trackedLinks.length > 0) {
        // Try button template first; if Meta rejects it, fall back to inline links.
        const bodyText =
          renderMessageWithoutLink({
            message: automation.dmMessage,
            commenterName,
          }) || "Here's your link:";
        const buttons = buildLinkButtons(
          automation.trackedLinks,
          automation.linkButtonLabel
        );

        try {
          await sendPrivateReplyWithLinkButton(
            accessToken,
            automation.instagramAccount.instagramId,
            commentId,
            bodyText,
            buttons
          );
        } catch (buttonError) {
          // Only a template rejection is worth retrying as text. Anything else
          // (closed window, comment already replied to) fails the same way and
          // would replace the real error with a misleading one.
          if (!isTemplateRejection(buttonError)) throw buttonError;

          console.log(
            "[DM Worker] Button template rejected, falling back to inline link:",
            formatError(buttonError)
          );
          const fallbackMessage = buildInlineLinkFallback(
            automation.dmMessage,
            commenterName,
            automation.trackedLinks,
            bodyText
          );
          try {
            await sendPrivateReply(
              accessToken,
              automation.instagramAccount.instagramId,
              commentId,
              fallbackMessage
            );
          } catch {
            // The first attempt consumed the comment's single private reply, so
            // this one reports "invalid for a private reply" no matter what the
            // underlying problem was. Surface the original rejection instead.
            throw buttonError;
          }
        }
      } else {
        const dmMessage = renderMessageWithTracking({
          message: automation.dmMessage,
          commenterName,
          trackedLinks: automation.trackedLinks,
        });
        await sendPrivateReply(
          accessToken,
          automation.instagramAccount.instagramId,
          commentId,
          dmMessage
        );
      }

      await prisma.dmLog.update({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        data: {
          status: "SENT",
          dmSentAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      await releaseWorkspaceDMReservation(
        automation.workspaceId,
        usage.periodStart
      );
      await releaseSend(claim);

      await prisma.dmLog.update({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId,
          },
        },
        data: {
          status: "FAILED",
          attempts: job.attemptsMade + 1,
          errorMessage: formatError(error),
        },
      });
      throw error;
    }

    // A sequence that opens by waiting for a reply can start from the private
    // reply: nothing more goes out until the person writes back, which is what
    // opens Instagram's window. Any other sequence still starts once a link is
    // delivered by DM, as before.
    if (!useOpeningDm && !sendFollowPrompt) {
      const first = getBranchSteps(parseSequence(automation.sequence), MAIN_BRANCH)[0];
      if (first?.waitForReply) {
        await startSequence(automation, commenterId, commenterName ?? null);
      }
    }

    await postPublicReply();
  }
}

/**
 * Buttons from the tool this account used before (ManyChat). Its opening DMs
 * are still sitting in people's inboxes, and their buttons fire postbacks
 * with `ACT::<id>` payloads that nobody answers any more: the person taps
 * "VER" and gets silence. Meta allows a reply because the tap is a user
 * action, so answer with the library, or with the exact resource when the
 * legacy id is known.
 */
const LEGACY_BUTTON_PREFIX = "ACT::";

const LEGACY_BUTTON_LIBRARY = {
  text: "ese botón es de mi sistema antiguo y ya no funciona 🙏 todo lo que he compartido está en la biblioteca, gratis:",
  label: "abrir la biblioteca",
  url: "https://archivo.syncralabs.es/v/ig-boton-antiguo",
};

/** Legacy ids whose resource is known, by the hex after `ACT::`. */
const LEGACY_BUTTON_RESOURCES: Record<string, typeof LEGACY_BUTTON_LIBRARY> = {
  // "VER 🙏" — la guía de webs animadas con IA.
  cd538496a2b44507653be194305e958f: {
    text: "aquí tienes la guía completa para hacer webs animadas con IA 🚀",
    label: "ver la guía",
    url: "https://www.youtube.com/watch?v=c6eyWs2uBkE",
  },
};

async function answerLegacyButton(
  instagramAccountId: string,
  userId: string,
  payload: string
): Promise<void> {
  const account = await prisma.instagramAccount.findFirst({
    where: { instagramId: instagramAccountId },
    select: { instagramId: true, accessToken: true },
  });
  if (!account?.accessToken) return;

  let accessToken: string;
  try {
    accessToken = decryptToken(account.accessToken);
  } catch {
    return;
  }

  const legacyId = payload.slice(LEGACY_BUTTON_PREFIX.length);
  const answer = LEGACY_BUTTON_RESOURCES[legacyId] ?? LEGACY_BUTTON_LIBRARY;

  try {
    await sendDirectMessageWithLinkButton(
      accessToken,
      account.instagramId,
      userId,
      answer.text,
      [{ title: answer.label, url: answer.url }]
    );
    console.log(`[DM Worker] Answered legacy button ${legacyId} for ${userId}`);
  } catch (error) {
    console.log(
      "[DM Worker] Failed to answer legacy button:",
      formatError(error)
    );
  }
}

/**
 * Deliver the reveal message after a user taps an opening DM's button.
 * The postback payload is `reveal:<automationId>`; the sender is the user's
 * IGSID (same id as their comment author id), which we DM directly.
 */
async function processPostback(job: Job<ProcessPostbackJob>): Promise<void> {
  const { instagramAccountId, userId, payload, fallback } = job.data;

  if (payload.startsWith(LEGACY_BUTTON_PREFIX)) {
    await answerLegacyButton(instagramAccountId, userId, payload);
    return;
  }

  const branch = parseBranchPayload(payload);
  if (branch) {
    const target = await prisma.automation.findFirst({
      where: { id: branch.automationId, isActive: true },
      include: { instagramAccount: true },
    });
    if (!target || target.instagramAccount.instagramId !== instagramAccountId) {
      return;
    }
    const nameLog = await prisma.dmLog.findFirst({
      where: { automationId: target.id, commenterId: userId },
      select: { commenterName: true },
    });
    // Record the answer (the triage) before sending anything, so it shows in
    // Contacts even if the branch's messages fail to go out.
    const chosen = parseSequence(target.sequence).branches.find(
      (b) => b.id === branch.branchId
    );
    if (chosen) {
      const answer = {
        branchId: chosen.id,
        branchName: chosen.name,
        qualified: chosen.qualified,
      };
      await prisma.sequenceChoice.upsert({
        where: { automationId_userId: { automationId: target.id, userId } },
        create: { workspaceId: target.workspaceId, automationId: target.id, userId, ...answer },
        update: answer,
      });
    }
    await startSequence(target, userId, nameLog?.commenterName ?? null, branch.branchId);
    return;
  }

  const isFollowCheck = payload.startsWith("followcheck:");
  if (!isFollowCheck && !payload.startsWith("reveal:")) return;
  const automationId = payload.slice(
    isFollowCheck ? "followcheck:".length : "reveal:".length
  );

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, isActive: true },
    include: {
      instagramAccount: true,
      workspace: true,
      trackedLinks: {
        select: { slug: true, label: true, destinationUrl: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (
    !automation ||
    automation.instagramAccount.instagramId !== instagramAccountId ||
    !automation.instagramAccount.accessToken
  ) {
    return;
  }

  // Duplicate sends are enabled: every button tap re-sends the reveal
  // instead of only firing once per person.
  const dedupeId = `reveal:${userId}`;

  if (fallback) {
    const existingReveal = await prisma.dmLog.findUnique({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId: dedupeId,
        },
      },
    });
    if (existingReveal?.status === "SENT") return;
  }

  // Personalize {username} from the opening DM log for this user, if present.
  const openingLog = await prisma.dmLog.findFirst({
    where: { automationId: automation.id, commenterId: userId },
    select: { commenterName: true },
  });
  const commenterName = openingLog?.commenterName ?? null;

  let accessToken: string;
  try {
    accessToken = decryptToken(automation.instagramAccount.accessToken);
  } catch {
    return;
  }

  // Follow-gate: before revealing the link, verify the user follows. On a
  // `followcheck:` tap a non-follower gets the prompt again (no quota spent);
  // on a read fallback a non-follower is silently skipped — the gate must not
  // be bypassable by just reading the DM and waiting. Following, or
  // unverifiable (null), falls through and delivers the link — fail-open so a
  // real follower is never trapped.
  if ((isFollowCheck || fallback) && automation.requireFollow) {
    const follows = await getUserFollowStatus(accessToken, userId);
    if (follows === false) {
      if (fallback) return;
      const promptText = renderMessageWithoutLink({
        message:
          automation.followPromptMessage ||
          "quick favor before i send your link. i don't make any money from this, it's free. if you want to support me, just don't unfollow after, and star the repo on github if it helps you. tap the button once you're following and i'll send it over",
        commenterName,
      });
      try {
        await sendDirectMessageWithButton(
          accessToken,
          automation.instagramAccount.instagramId,
          userId,
          promptText,
          automation.followPromptButtonLabel || "i'm following",
          `followcheck:${automation.id}`
        );
      } catch (error) {
        console.log(
          "[DM Worker] Failed to re-send follow prompt:",
          formatError(error)
        );
      }
      return;
    }
  }

  const usage = await reserveWorkspaceDMSend(automation.workspaceId);
  if (!usage.allowed) {
    await prisma.dmLog.upsert({
      where: {
        automationId_commentId: { automationId: automation.id, commentId: dedupeId },
      },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        instagramAccountId: automation.instagramAccountId,
        commenterId: userId,
        commenterName,
        commentText: "(button tap)",
        commentId: dedupeId,
        status: "SKIPPED_PLAN_LIMIT",
        errorMessage: `Monthly DM limit reached (${usage.limit})`,
      },
      update: { status: "SKIPPED_PLAN_LIMIT" },
    });
    return;
  }

  try {
    await sendRevealDirectMessage(
      accessToken,
      automation,
      userId,
      commenterName,
      "postback"
    );
    await startSequence(automation, userId, commenterName);
    // Optional appreciation follow-up: once the link has been delivered, send a
    // short thank-you. It is scheduled as its own delayed job so it can go out
    // some minutes later (followUpDelayMinutes) rather than immediately. The
    // deterministic job id dedupes repeat button taps to one follow-up per user.
    if (automation.followUpEnabled && automation.followUpMessage?.trim()) {
      const delayMs =
        Math.max(0, automation.followUpDelayMinutes ?? 0) * 60_000;
      await getDMQueue().add(
        FOLLOWUP_JOB_NAME,
        {
          instagramAccountId: automation.instagramAccount.instagramId,
          userId,
          automationId: automation.id,
          commenterName,
        },
        {
          delay: delayMs,
          jobId: `followup_${automation.id}_${userId}`,
        }
      );
    }
    await prisma.dmLog.upsert({
      where: {
        automationId_commentId: { automationId: automation.id, commentId: dedupeId },
      },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        instagramAccountId: automation.instagramAccountId,
        commenterId: userId,
        commenterName,
        commentText: "(button tap)",
        commentId: dedupeId,
        status: "SENT",
        dmSentAt: new Date(),
      },
      update: { status: "SENT", dmSentAt: new Date(), errorMessage: null },
    });
  } catch (error) {
    await releaseWorkspaceDMReservation(automation.workspaceId, usage.periodStart);

    // The read fallback is speculative: it only runs when the user read the
    // opening DM and never tapped the button, which means they never messaged
    // us, which means the 24-hour window is closed and Meta rejects the send
    // ("outside of allowed window"). That is the expected outcome here, not a
    // failure the user can act on — so don't log it as FAILED and don't retry
    // it against a window that cannot reopen on its own. It still delivers in
    // the case that does work: the user replied by typing instead of tapping.
    if (fallback) {
      console.log(
        "[DM Worker] Read fallback not delivered (messaging window closed):",
        formatError(error)
      );
      return;
    }

    await prisma.dmLog.upsert({
      where: {
        automationId_commentId: { automationId: automation.id, commentId: dedupeId },
      },
      create: {
        workspaceId: automation.workspaceId,
        automationId: automation.id,
        instagramAccountId: automation.instagramAccountId,
        commenterId: userId,
        commenterName,
        commentText: "(button tap)",
        commentId: dedupeId,
        status: "FAILED",
        errorMessage: formatError(error),
      },
      update: { status: "FAILED", errorMessage: formatError(error) },
    });
    throw error;
  }
}

/**
 * Queue the first message of a sequence branch for this user. The main
 * sequence uses a fixed run id, so tapping through to the link again doesn't
 * start it twice; each branch tap is its own run.
 */
async function startSequence(
  automation: { id: string; sequence: unknown; instagramAccount: { instagramId: string } },
  userId: string,
  commenterName: string | null,
  branchId: string = MAIN_BRANCH
): Promise<void> {
  const steps = getBranchSteps(parseSequence(automation.sequence), branchId);
  if (steps.length === 0) return;
  // Called right after the link went out: a queue error here must not mark
  // that delivered link as failed (and re-send it on retry).
  try {
    await scheduleStep(
      {
        instagramAccountId: automation.instagramAccount.instagramId,
        userId,
        automationId: automation.id,
        branchId,
        index: 0,
        runId: branchId === MAIN_BRANCH ? "1" : Date.now().toString(36),
        commenterName,
        prevSentAt: Date.now(),
      },
      steps[0]
    );
  } catch (error) {
    console.error("[DM Worker] Could not start sequence:", formatError(error));
  }
}

/**
 * Queue a step, or park it until the person writes back when it waits for a
 * reply (processMessage resumes it). Reminders are queued with the wait and
 * stay quiet once it is gone.
 */
async function scheduleStep(data: ProcessStepJob, step: SequenceStep) {
  if (!step.waitForReply) {
    await enqueueStep(data, step.delaySeconds);
    return;
  }
  const waitId = `${data.runId}-${data.index}-${Date.now().toString(36)}`;
  await setWait(data.instagramAccountId, data.userId, {
    automationId: data.automationId,
    branchId: data.branchId,
    index: data.index,
    runId: data.runId,
    commenterName: data.commenterName ?? null,
    waitId,
  });
  for (const [i, reminder] of step.reminders.entries()) {
    await getDMQueue().add(
      STEP_JOB_NAME,
      { ...data, reminder: { index: i, waitId } },
      {
        delay: reminder.afterSeconds * 1000,
        jobId: `reminder_${data.automationId}_${data.userId}_${waitId}_${i}`,
      }
    );
  }
}

/**
 * An inbound message from someone whose sequence is waiting on them: queue the
 * held step, counting its wait from now. Returns whether one was resumed, in
 * which case the message is their answer and no keyword campaign reacts to it.
 */
async function resumeWaitingSequence(instagramAccountId: string, userId: string): Promise<boolean> {
  const wait = await takeWait(instagramAccountId, userId);
  if (!wait) return false;

  const automation = await prisma.automation.findFirst({
    where: { id: wait.automationId, isActive: true },
    include: { instagramAccount: true },
  });
  if (!automation || automation.instagramAccount.instagramId !== instagramAccountId) {
    return false;
  }
  const step = getBranchSteps(parseSequence(automation.sequence), wait.branchId)[wait.index];
  if (!step) return false;

  await enqueueStep(
    {
      instagramAccountId,
      userId,
      automationId: wait.automationId,
      branchId: wait.branchId,
      index: wait.index,
      runId: wait.runId,
      commenterName: wait.commenterName,
      prevSentAt: Date.now(),
    },
    step.delaySeconds
  );
  return true;
}

async function enqueueStep(data: ProcessStepJob, delaySeconds: number) {
  await getDMQueue().add(STEP_JOB_NAME, data, {
    delay: delaySeconds * 1000,
    jobId: `step_${data.automationId}_${data.userId}_${data.branchId}_${data.runId}_${data.index}`,
  });
}

/**
 * Send one sequence message, then queue the next. Best-effort like the
 * follow-up: a send Instagram refuses (usually a closed 24-hour window) is
 * logged and ends the sequence for this user instead of retrying.
 */
async function processStep(job: Job<ProcessStepJob>): Promise<void> {
  const { instagramAccountId, userId, automationId, branchId, index } = job.data;
  const commenterName = job.data.commenterName ?? null;

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, isActive: true },
    include: { instagramAccount: true },
  });
  if (
    !automation ||
    automation.instagramAccount.instagramId !== instagramAccountId ||
    !automation.instagramAccount.accessToken
  ) {
    return;
  }

  // Read the sequence as it is now, so edits apply to people mid-way.
  const steps = getBranchSteps(parseSequence(automation.sequence), branchId);
  const step = steps[index];
  if (!step) return;

  let accessToken: string;
  try {
    accessToken = decryptToken(automation.instagramAccount.accessToken);
  } catch {
    return;
  }

  const { reminder } = job.data;
  if (reminder) {
    // Only while that same wait is still open: they haven't written yet.
    const wait = await getWait(instagramAccountId, userId);
    const nudge = step.reminders[reminder.index];
    if (!wait || wait.waitId !== reminder.waitId || !nudge) return;
    try {
      await sendDirectMessage(
        accessToken,
        instagramAccountId,
        userId,
        renderMessageWithoutLink({ message: nudge.text, commenterName })
      );
    } catch (error) {
      console.log("[DM Worker] Reminder not delivered:", formatError(error));
    }
    return;
  }

  // A follow-up for someone who already wrote back: the conversation is going,
  // so leave it to the account owner and move on.
  let skipped = false;
  if (step.skipIfReplied && job.data.prevSentAt) {
    const lastInbound = await getLastInbound(instagramAccountId, userId);
    skipped = lastInbound !== null && lastInbound > job.data.prevSentAt;
  }

  if (!skipped) try {
    if (step.type !== "text") {
      await sendDirectMessageAttachment(
        accessToken,
        instagramAccountId,
        userId,
        step.type,
        step.mediaUrl as string
      );
    } else {
      const text = renderMessageWithoutLink({ message: step.text, commenterName });
      if (step.buttons.length === 0) {
        await sendDirectMessage(accessToken, instagramAccountId, userId, text);
      } else {
        await sendDirectMessageWithButtons(
          accessToken,
          instagramAccountId,
          userId,
          text,
          step.buttons.map((b) =>
            "url" in b
              ? { type: "web_url" as const, title: b.label, url: b.url }
              : {
                  type: "postback" as const,
                  title: b.label,
                  payload: branchPayload(automation.id, b.branchId),
                }
          )
        );
      }
    }
  } catch (error) {
    console.log(
      `[DM Worker] Sequence message ${branchId}#${index + 1} not delivered:`,
      formatError(error)
    );
    return;
  }

  // This message already went out; a throw here would retry the job and send
  // it twice.
  const next = steps[index + 1];
  if (next) {
    try {
      await scheduleStep(
        {
          ...job.data,
          index: index + 1,
          prevSentAt: skipped ? job.data.prevSentAt : Date.now(),
        },
        next
      );
    } catch (error) {
      console.error("[DM Worker] Could not queue next sequence message:", formatError(error));
    }
  }
}

/**
 * Send the scheduled appreciation follow-up. Runs after its delay elapses.
 * Best-effort: if the message can't be delivered (e.g. the 24-hour messaging
 * window closed because the delay was long), it is logged, not retried forever.
 */
async function processFollowUp(job: Job<ProcessFollowUpJob>): Promise<void> {
  const { instagramAccountId, userId, automationId, commenterName } = job.data;

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, isActive: true },
    include: { instagramAccount: true },
  });

  if (
    !automation ||
    !automation.followUpEnabled ||
    !automation.followUpMessage?.trim() ||
    automation.instagramAccount.instagramId !== instagramAccountId ||
    !automation.instagramAccount.accessToken
  ) {
    return;
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(automation.instagramAccount.accessToken);
  } catch {
    return;
  }

  try {
    await sendDirectMessage(
      accessToken,
      automation.instagramAccount.instagramId,
      userId,
      renderMessageWithoutLink({
        message: automation.followUpMessage,
        commenterName: commenterName ?? null,
      })
    );
  } catch (error) {
    console.log(
      "[DM Worker] Failed to send follow-up message:",
      formatError(error)
    );
  }
}

/**
 * Reply to an inbound DM whose text matches a campaign's keywords.
 *
 * The user has messaged us, so the conversation is already open: this path
 * skips the opening DM (which exists to work around private-reply limits from
 * comments) and delivers the reveal directly, honouring the follow gate.
 * Dedup is per inbound message id, so each message triggers at most one reply.
 */
async function processMessage(job: Job<ProcessMessageJob>): Promise<void> {
  const { instagramAccountId, messageId, messageText, senderId } = job.data;
  const { scheduledAutomationId } = job.data;

  // The first run of a message (not a delayed re-run of a trigger): note that
  // they wrote, and let it answer a sequence that is waiting on them.
  if (!scheduledAutomationId) {
    try {
      await recordInbound(instagramAccountId, senderId);
      if (await resumeWaitingSequence(instagramAccountId, senderId)) return;
    } catch (error) {
      console.error("[DM Worker] Could not check a waiting sequence:", formatError(error));
    }
  }

  // A voice note or photo answers a waiting sequence but triggers nothing else.
  if (!messageText) return;

  const automations = await prisma.automation.findMany({
    where: {
      dmTriggerEnabled: true,
      ...(scheduledAutomationId ? { id: scheduledAutomationId } : {}),
      isActive: true,
      retiredAt: null,
      instagramAccount: { instagramId: instagramAccountId },
    },
    include: {
      instagramAccount: true,
      workspace: true,
      trackedLinks: {
        select: { slug: true, label: true, destinationUrl: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const dedupeId = `dm:${messageId}`;

  for (const automation of automations) {
    const matchResult = automation.matchAnyWord
      ? { matched: true, matchedKeyword: null }
      : matchKeywords(
          messageText,
          automation.keywords,
          automation.wholeWordMatch
        );

    if (!matchResult.matched) continue;

    const existingLog = await prisma.dmLog.findUnique({
      where: {
        automationId_commentId: {
          automationId: automation.id,
          commentId: dedupeId,
        },
      },
    });

    // Already replied to this message (or deliberately skipped it) — a retry
    // of the job must not send a second DM.
    if (
      existingLog?.status === "SENT" ||
      existingLog?.status === "SKIPPED_PLAN_LIMIT"
    ) {
      continue;
    }

    // One answer per person per campaign: writing the keyword again, or having
    // already got it from a comment, doesn't send it twice.
    const alreadyAnswered = await prisma.dmLog.findFirst({
      where: {
        automationId: automation.id,
        commenterId: senderId,
        commentId: { not: dedupeId },
        status: "SENT",
      },
      select: { id: true },
    });
    if (alreadyAnswered) continue;

    const logBase = {
      workspaceId: automation.workspaceId,
      automationId: automation.id,
      instagramAccountId: automation.instagramAccountId,
      commenterId: senderId,
      commentText: messageText,
      commentId: dedupeId,
      matchedKeyword: matchResult.matchedKeyword,
    };

    // Send delay / window, then pacing: reply later from a delayed copy of this
    // job. A retry of that delayed copy takes a new turn too.
    const isScheduledRun = scheduledAutomationId === automation.id;
    const isRetry = isScheduledRun && job.attemptsMade > 0;
    if (!isScheduledRun || isRetry) {
      if (!isScheduledRun && existingLog?.status === "PENDING" && existingLog.scheduledAt) continue;
      const sendAt = await reservePacedSlot(
        instagramAccountId,
        isRetry ? new Date() : computeSendAt(automation)
      );
      const delay = sendAt.getTime() - Date.now();
      if (delay > 1000) {
        await prisma.dmLog.upsert({
          where: {
            automationId_commentId: {
              automationId: automation.id,
              commentId: dedupeId,
            },
          },
          create: { ...logBase, status: "PENDING", scheduledAt: sendAt },
          update: { status: "PENDING", scheduledAt: sendAt },
        });
        await getDMQueue().add(
          MESSAGE_JOB_NAME,
          { ...job.data, scheduledAutomationId: automation.id },
          {
            delay,
            // Unique per park, for the same reason as comments.
            jobId: `message_${Buffer.from(messageId).toString("base64url")}_sched_${automation.id}_${sendAt.getTime()}`,
          }
        );
        continue;
      }
    }

    if (!automation.instagramAccount.accessToken) {
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId: dedupeId,
          },
        },
        create: {
          ...logBase,
          status: "FAILED",
          errorMessage: "No Instagram access token available",
        },
        update: {
          status: "FAILED",
          errorMessage: "No Instagram access token available",
        },
      });
      continue;
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(automation.instagramAccount.accessToken);
    } catch {
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId: dedupeId,
          },
        },
        create: {
          ...logBase,
          status: "FAILED",
          errorMessage: "Failed to decrypt Instagram access token",
        },
        update: {
          status: "FAILED",
          errorMessage: "Failed to decrypt Instagram access token",
        },
      });
      continue;
    }

    // Reuse a name captured on an earlier interaction so {username} still
    // renders — the messages webhook carries only the sender's IGSID.
    const priorLog = await prisma.dmLog.findFirst({
      where: { automationId: automation.id, commenterId: senderId },
      select: { commenterName: true },
    });
    const commenterName = priorLog?.commenterName ?? null;

    // Follow gate: anyone not confirmed as a follower gets the prompt instead of
    // the link, with the same `followcheck:` button that re-verifies on tap.
    // `null` (unverifiable) prompts too — this is first contact, exactly like a
    // comment, so it follows processComment's fail-closed rule rather than the
    // postback path's fail-open one. Fail-open is only safe after a tap, where
    // the user has already claimed to follow; here it would hand the link to
    // anyone whose status the API happens not to resolve.
    let sendFollowPrompt = false;
    if (automation.requireFollow) {
      const follows = await getUserFollowStatus(accessToken, senderId);
      sendFollowPrompt = follows !== true;
    }

    const claim = [
      `send:dm:${automation.id}:${dedupeId}`,
      `send:person:${automation.id}:${senderId}`,
    ];
    if (!(await claimSend(claim))) continue;

    const usage = await reserveWorkspaceDMSend(automation.workspaceId);
    if (!usage.allowed) {
      await releaseSend(claim);
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId: dedupeId,
          },
        },
        create: {
          ...logBase,
          status: "SKIPPED_PLAN_LIMIT",
          errorMessage: `Monthly DM limit reached (${usage.limit})`,
        },
        update: {
          status: "SKIPPED_PLAN_LIMIT",
          errorMessage: `Monthly DM limit reached (${usage.limit})`,
        },
      });
      continue;
    }

    try {
      if (sendFollowPrompt) {
        const promptText = renderMessageWithoutLink({
          message:
            automation.followPromptMessage ||
            "Almost there! Follow me and tap the button below to grab your link 💛",
          commenterName,
        });
        await sendDirectMessageWithButton(
          accessToken,
          automation.instagramAccount.instagramId,
          senderId,
          promptText,
          automation.followPromptButtonLabel || "I'm following ✅",
          `followcheck:${automation.id}`
        );
      } else {
        await sendRevealDirectMessage(
          accessToken,
          automation,
          senderId,
          commenterName,
          "message trigger"
        );
        await startSequence(automation, senderId, commenterName);

        // The link has been delivered, so the appreciation follow-up applies
        // here exactly as it does after a button tap. Not scheduled behind the
        // follow prompt — no link went out yet in that branch.
        if (automation.followUpEnabled && automation.followUpMessage?.trim()) {
          await getDMQueue().add(
            FOLLOWUP_JOB_NAME,
            {
              instagramAccountId: automation.instagramAccount.instagramId,
              userId: senderId,
              automationId: automation.id,
              commenterName,
            },
            {
              delay: Math.max(0, automation.followUpDelayMinutes ?? 0) * 60_000,
              jobId: `followup_${automation.id}_${senderId}`,
            }
          );
        }
      }

      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId: dedupeId,
          },
        },
        create: {
          ...logBase,
          commenterName,
          status: "SENT",
          dmSentAt: new Date(),
        },
        update: {
          status: "SENT",
          dmSentAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      await releaseWorkspaceDMReservation(
        automation.workspaceId,
        usage.periodStart
      );
      await releaseSend(claim);
      await prisma.dmLog.upsert({
        where: {
          automationId_commentId: {
            automationId: automation.id,
            commentId: dedupeId,
          },
        },
        create: {
          ...logBase,
          commenterName,
          status: "FAILED",
          attempts: job.attemptsMade + 1,
          errorMessage: formatError(error),
        },
        update: {
          status: "FAILED",
          attempts: job.attemptsMade + 1,
          errorMessage: formatError(error),
        },
      });
      throw error;
    }
  }
}

async function processJob(job: Job<DmQueueJob>): Promise<void> {
  if (job.name === POSTBACK_JOB_NAME) {
    return processPostback(job as Job<ProcessPostbackJob>);
  }
  if (job.name === FOLLOWUP_JOB_NAME) {
    return processFollowUp(job as Job<ProcessFollowUpJob>);
  }
  if (job.name === MESSAGE_JOB_NAME) {
    return processMessage(job as Job<ProcessMessageJob>);
  }
  if (job.name === STEP_JOB_NAME) {
    return processStep(job as Job<ProcessStepJob>);
  }
  return processComment(job as Job<ProcessCommentJob>);
}

async function recordWorkerFailure(
  job: Job<DmQueueJob> | undefined,
  error: Error
) {
  try {
    const instagramAccountId = job?.data.instagramAccountId;
    const commentId =
      job && "commentId" in job.data ? job.data.commentId : null;
    const account = instagramAccountId
      ? await prisma.instagramAccount.findUnique({
          where: { instagramId: instagramAccountId },
          select: { workspaceId: true },
        })
      : null;

    await prisma.operationalEvent.create({
      data: {
        workspaceId: account?.workspaceId ?? null,
        source: "WORKER",
        level: "ERROR",
        message: `DM worker job ${job?.id ?? "unknown"} failed: ${error.message}`,
        payload: {
          jobId: job?.id ?? null,
          attemptsMade: job?.attemptsMade ?? null,
          instagramAccountId: instagramAccountId ?? null,
          commentId,
        },
      },
    });

    await recordWorkerAlert({
      level: "error",
      message: error.message,
      jobId: job?.id,
      instagramAccountId,
      commentId: commentId ?? undefined,
    });
  } catch (recordError) {
    console.error(
      "[DM Worker] Failed to record worker failure:",
      formatError(recordError)
    );
  }
}

export function createDMWorker(): Worker<DmQueueJob> {
  const worker = new Worker<DmQueueJob>(
    "dm-processing",
    processJob,
    {
      connection: getRedisConnection(),
      concurrency: 5,
      settings: {
        backoffStrategy: (attemptsMade: number) =>
          BACKOFF_DELAYS[Math.min(attemptsMade - 1, BACKOFF_DELAYS.length - 1)],
      },
    }
  );

  worker.on("completed", (job) => {
    console.log(`[DM Worker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[DM Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`,
      err.message
    );
    void recordWorkerFailure(job, err);
  });

  worker.on("error", (err) => {
    console.error("[DM Worker] Worker error:", err.message);
    void prisma.operationalEvent
      .create({
        data: {
          source: "WORKER",
          level: "ERROR",
          message: `DM worker process error: ${err.message}`,
          payload: { name: err.name },
        },
      })
      .catch((recordError) => {
        console.error(
          "[DM Worker] Failed to record worker process error:",
          formatError(recordError)
        );
      });
  });

  return worker;
}

