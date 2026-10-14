import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockPrisma,
  mockSendPrivateReply,
  mockSendPrivateReplyWithLinkButton,
  mockSendPrivateReplyWithButton,
  mockGetUserFollowStatus,
  mockSendDirectMessageWithButton,
  mockSendDirectMessage,
  mockSendDirectMessageWithLinkButton,
  mockDecryptToken,
  mockMatchKeywords,
  mockReserveDMSlot,
  mockQueueAdd,
  mockReserveWorkspaceDMSend,
  mockReleaseWorkspaceDMReservation,
  mockSendDirectMessageAttachment,
  mockSendDirectMessageWithButtons,
  mockSendCommentReply,
  mockReservePacedSlot,
  mockClaimSend,
  mockReleaseSend,
  mockConvo,
} = vi.hoisted(() => ({
  // In-memory stand-in for the Redis conversation state.
  mockConvo: {
    inbound: new Map<string, number>(),
    waits: new Map<string, Record<string, unknown>>(),
    messages: new Map<string, { at: number; text: string }[]>(),
  },
  mockPrisma: {
    automation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    dmLog: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    instagramAccount: {
      findUnique: vi.fn(),
    },
    operationalEvent: {
      create: vi.fn(),
    },
    sequenceChoice: {
      upsert: vi.fn(),
    },
  },
  mockSendPrivateReply: vi.fn(),
  mockSendPrivateReplyWithLinkButton: vi.fn(),
  mockSendPrivateReplyWithButton: vi.fn(),
  mockGetUserFollowStatus: vi.fn(),
  mockSendDirectMessageWithButton: vi.fn(),
  mockSendDirectMessage: vi.fn(),
  mockSendDirectMessageWithLinkButton: vi.fn(),
  mockDecryptToken: vi.fn(),
  mockMatchKeywords: vi.fn(),
  mockReserveDMSlot: vi.fn(),
  mockQueueAdd: vi.fn(),
  mockReserveWorkspaceDMSend: vi.fn(),
  mockReleaseWorkspaceDMReservation: vi.fn(),
  mockSendDirectMessageAttachment: vi.fn(),
  mockSendDirectMessageWithButtons: vi.fn(),
  mockSendCommentReply: vi.fn(),
  mockReservePacedSlot: vi.fn(),
  mockClaimSend: vi.fn(),
  mockReleaseSend: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/meta/client", () => ({
  sendPrivateReply: mockSendPrivateReply,
  sendPrivateReplyWithLinkButton: mockSendPrivateReplyWithLinkButton,
  sendPrivateReplyWithButton: mockSendPrivateReplyWithButton,
  getUserFollowStatus: mockGetUserFollowStatus,
  sendDirectMessageWithButton: mockSendDirectMessageWithButton,
  sendDirectMessage: mockSendDirectMessage,
  sendDirectMessageWithLinkButton: mockSendDirectMessageWithLinkButton,
  sendDirectMessageAttachment: mockSendDirectMessageAttachment,
  sendDirectMessageWithButtons: mockSendDirectMessageWithButtons,
  sendCommentReply: mockSendCommentReply,
  MetaApiError: class MetaApiError extends Error {
    code: number;
    constructor(
      code: number,
      _subcode: number | undefined,
      _fbTraceId: string | undefined,
      message: string
    ) {
      super(message);
      this.code = code;
      this.name = "MetaApiError";
    }
  },
  TokenExpiredError: class TokenExpiredError extends Error {
    name = "TokenExpiredError";
  },
  RateLimitError: class RateLimitError extends Error {
    name = "RateLimitError";
  },
}));

vi.mock("@/lib/meta/oauth", () => ({
  decryptToken: mockDecryptToken,
}));

vi.mock("@/lib/utils/keyword-matcher", () => ({
  matchKeywords: mockMatchKeywords,
}));

vi.mock("@/lib/utils/rate-limiter", () => ({
  reserveDMSlot: mockReserveDMSlot,
  reservePacedSlot: mockReservePacedSlot,
  claimSend: mockClaimSend,
  releaseSend: mockReleaseSend,
}));

vi.mock("@/lib/billing/usage", () => ({
  reserveWorkspaceDMSend: mockReserveWorkspaceDMSend,
  releaseWorkspaceDMReservation: mockReleaseWorkspaceDMReservation,
}));

vi.mock("../lib/queue/conversation", () => ({
  recordInbound: async (a: string, u: string, at = Date.now(), text = "") => {
    mockConvo.inbound.set(`${a}:${u}`, at);
    if (text) mockConvo.messages.set(`${a}:${u}`, [...(mockConvo.messages.get(`${a}:${u}`) ?? []), { at, text }]);
  },
  getMessagesSince: async (a: string, u: string, since: number) =>
    (mockConvo.messages.get(`${a}:${u}`) ?? []).filter((m) => m.at >= since).map((m) => m.text),
  getLastInbound: async (a: string, u: string) => mockConvo.inbound.get(`${a}:${u}`) ?? null,
  setWait: async (a: string, u: string, w: Record<string, unknown>) => {
    mockConvo.waits.set(`${a}:${u}`, w);
  },
  getWait: async (a: string, u: string) => mockConvo.waits.get(`${a}:${u}`) ?? null,
  takeWait: async (a: string, u: string) => {
    const w = mockConvo.waits.get(`${a}:${u}`) ?? null;
    mockConvo.waits.delete(`${a}:${u}`);
    return w;
  },
}));

vi.mock("@/lib/ops/worker-health", () => ({
  recordWorkerAlert: vi.fn(),
}));

vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({
    add: mockQueueAdd,
  }),
  getRedisConnection: vi.fn(),
  POSTBACK_JOB_NAME: "process-postback",
  FOLLOWUP_JOB_NAME: "process-followup",
  MESSAGE_JOB_NAME: "process-message",
  STEP_JOB_NAME: "process-step",
}));

vi.mock("bullmq", () => {
  function MockWorker(_name: string, processor: unknown) {
    (global as Record<string, unknown>).__dmWorkerProcessor = processor;
    return {
      on: vi.fn(),
      close: vi.fn(),
    };
  }
  return {
    Worker: MockWorker,
  };
});

import { createDMWorker } from "../lib/queue/dm-worker";

const usagePeriodStart = new Date("2026-05-01T00:00:00.000Z");

const mockAutomation = {
  id: "auto_789",
  workspaceId: "workspace_123",
  instagramAccountId: "ig_account_row_1",
  postId: "media_101",
  keywords: ["LINK", "PRICE"],
  dmMessage: "Hey {username}! Here is the link: https://example.com",
  isActive: true,
  wholeWordMatch: true,
  matchAnyPost: false,
  matchAnyWord: false,
  openingDmEnabled: false,
  openingDmMessage: null,
  openingDmButtonLabel: null,
  linkButtonLabel: null,
  publicReplyEnabled: false,
  publicReplyMessage: null,
  publicReplyMessages: [],
  instagramAccount: {
    id: "ig_account_row_1",
    instagramId: "ig_456",
    accessToken: "encrypted_token_abc",
  },
  workspace: {
    id: "workspace_123",
  },
  trackedLinks: [],
};

const mockJobData = {
  instagramAccountId: "ig_456",
  commentId: "comment_555",
  commentText: "I want the LINK!",
  commenterId: "commenter_999",
  commenterName: "commenter_user",
  mediaId: "media_101",
};

function getProcessor(): (job: {
  name?: string;
  data: typeof mockJobData | Record<string, unknown>;
  id: string;
  attemptsMade: number;
}) => Promise<void> {
  createDMWorker();
  return (global as Record<string, unknown>).__dmWorkerProcessor as (job: {
    name?: string;
    data: typeof mockJobData | Record<string, unknown>;
    id: string;
    attemptsMade: number;
  }) => Promise<void>;
}

function createMockJob(data = mockJobData) {
  return {
    data,
    id: "job_001",
    attemptsMade: 0,
  };
}

function createMockPostbackJob(
  data: Record<string, unknown> = {
    instagramAccountId: "ig_456",
    userId: "commenter_999",
    payload: "reveal:auto_789",
  }
) {
  return {
    name: "process-postback",
    data,
    id: "postback_job_001",
    attemptsMade: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConvo.inbound.clear();
  mockConvo.waits.clear();
  mockConvo.messages.clear();

  mockPrisma.automation.findMany.mockResolvedValue([mockAutomation]);
  mockPrisma.automation.findFirst.mockResolvedValue(null);
  mockPrisma.dmLog.findUnique.mockResolvedValue(null);
  mockPrisma.dmLog.create.mockResolvedValue({});
  // Two different lookups share findFirst: the cross-campaign private-reply
  // check (the one with an OR of SENT / parked) and the postback's name
  // lookup. Only the latter should resolve by default, or every comment would
  // look like a duplicate of an already-answered one.
  mockPrisma.dmLog.findFirst.mockImplementation(
    async (args: { where?: { OR?: unknown; commentId?: unknown } } = {}) =>
      args.where?.OR || args.where?.commentId ? null : { commenterName: "commenter_user" }
  );
  mockPrisma.dmLog.upsert.mockResolvedValue({});
  mockPrisma.dmLog.update.mockResolvedValue({});
  mockPrisma.instagramAccount.findUnique.mockResolvedValue({
    workspaceId: "workspace_123",
  });
  mockPrisma.operationalEvent.create.mockResolvedValue({});
  mockDecryptToken.mockReturnValue("decrypted_token");
  mockMatchKeywords.mockReturnValue({ matched: true, matchedKeyword: "LINK" });
  mockReserveWorkspaceDMSend.mockResolvedValue({
    allowed: true,
    reserved: true,
    remaining: 100,
    limit: 2000,
    periodStart: usagePeriodStart,
  });
  mockReserveDMSlot.mockResolvedValue({
    allowed: true,
    currentCount: 11,
    remainingDMs: 179,
    shouldRequeue: false,
    requeueDelayMs: 0,
    shouldSkip: false,
    reserved: true,
  });
  mockReleaseWorkspaceDMReservation.mockResolvedValue({ count: 1 });
  mockSendPrivateReply.mockResolvedValue({
    recipient_id: "commenter_999",
    message_id: "msg_001",
  });
  mockSendPrivateReplyWithLinkButton.mockResolvedValue({
    recipient_id: "commenter_999",
    message_id: "msg_002",
  });
  mockSendPrivateReplyWithButton.mockResolvedValue({
    recipient_id: "commenter_999",
    message_id: "msg_003",
  });
  mockSendDirectMessageWithButton.mockResolvedValue({
    recipient_id: "commenter_999",
    message_id: "msg_004",
  });
  mockSendDirectMessage.mockResolvedValue({
    recipient_id: "commenter_999",
    message_id: "msg_005",
  });
  mockSendDirectMessageWithLinkButton.mockResolvedValue({
    recipient_id: "commenter_999",
    message_id: "msg_006",
  });
  mockGetUserFollowStatus.mockResolvedValue(true);
  // No queue by default: the turn is the time the campaign wanted.
  mockReservePacedSlot.mockImplementation(async (_acct: string, wanted: Date) => wanted);
  mockClaimSend.mockResolvedValue(true);
  mockReleaseSend.mockResolvedValue(undefined);
});

describe("DM Worker — Full Pipeline", () => {
  it("should send a private reply for a matching comment", async () => {
    const processor = getProcessor();

    await processor(createMockJob());

    expect(mockPrisma.automation.findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ postId: "media_101" }, { matchAnyPost: true }],
        isActive: true,
        retiredAt: null,
        instagramAccount: { instagramId: "ig_456" },
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
    expect(mockMatchKeywords).toHaveBeenCalledWith(
      "I want the LINK!",
      ["LINK", "PRICE"],
      true
    );
    expect(mockReserveWorkspaceDMSend).toHaveBeenCalledWith("workspace_123");
    expect(mockReserveDMSlot).toHaveBeenCalledWith("ig_456", 0);
    expect(mockDecryptToken).toHaveBeenCalledWith("encrypted_token_abc");
    expect(mockSendPrivateReply).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "comment_555",
      "Hey commenter_user! Here is the link: https://example.com"
    );
    expect(mockReleaseWorkspaceDMReservation).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith({
      where: {
        automationId_commentId: {
          automationId: "auto_789",
          commentId: "comment_555",
        },
      },
      data: expect.objectContaining({ status: "SENT" }),
    });
  });

  it("should skip when no automations match the media", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([]);
    const processor = getProcessor();

    await processor(createMockJob());

    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.upsert).not.toHaveBeenCalled();
  });

  it("should skip when keywords do not match", async () => {
    mockMatchKeywords.mockReturnValue({ matched: false, matchedKeyword: null });
    const processor = getProcessor();

    await processor(createMockJob());

    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockReserveWorkspaceDMSend).not.toHaveBeenCalled();
  });

  it("should skip duplicate comments already sent", async () => {
    mockPrisma.dmLog.findUnique.mockResolvedValue({
      id: "existing_log",
      status: "SENT",
    });
    const processor = getProcessor();

    await processor(createMockJob());

    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockReserveWorkspaceDMSend).not.toHaveBeenCalled();
  });

  it("should skip when monthly plan limit is reached", async () => {
    mockReserveWorkspaceDMSend.mockResolvedValue({
      allowed: false,
      reserved: false,
      remaining: 0,
      limit: 100,
      periodStart: usagePeriodStart,
    });

    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockReserveDMSlot).not.toHaveBeenCalled();
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SKIPPED_PLAN_LIMIT" }),
      })
    );
  });

  it("should requeue and release monthly usage when rate limited", async () => {
    mockReserveDMSlot.mockResolvedValue({
      allowed: false,
      currentCount: 190,
      remainingDMs: 0,
      shouldRequeue: true,
      requeueDelayMs: 1800000,
      shouldSkip: false,
      reserved: false,
    });

    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockReleaseWorkspaceDMReservation).toHaveBeenCalledWith(
      "workspace_123",
      usagePeriodStart
    );
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-comment",
      expect.objectContaining({
        commentId: "comment_555",
        requeueAttempt: 1,
      }),
      expect.objectContaining({
        delay: 1800000,
        jobId: "comment_ig_456_comment_555_retry_1",
      })
    );
  });

  it("should skip with SKIPPED_RATE_LIMIT after max requeue attempts", async () => {
    mockReserveDMSlot.mockResolvedValue({
      allowed: false,
      currentCount: 190,
      remainingDMs: 0,
      shouldRequeue: false,
      requeueDelayMs: 0,
      shouldSkip: true,
      reserved: false,
    });

    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockReleaseWorkspaceDMReservation).toHaveBeenCalledWith(
      "workspace_123",
      usagePeriodStart
    );
    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SKIPPED_RATE_LIMIT" }),
      })
    );
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
  });

  it("should log FAILED, release usage, and re-throw when private reply sending fails", async () => {
    const error = new Error("API Error");
    mockSendPrivateReply.mockRejectedValue(error);

    const processor = getProcessor();

    await expect(processor(createMockJob())).rejects.toThrow("API Error");
    expect(mockReleaseWorkspaceDMReservation).toHaveBeenCalledWith(
      "workspace_123",
      usagePeriodStart
    );
    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith({
      where: {
        automationId_commentId: {
          automationId: "auto_789",
          commentId: "comment_555",
        },
      },
      data: expect.objectContaining({
        status: "FAILED",
        errorMessage: "API Error",
      }),
    });
  });

  it("should handle missing access token", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        ...mockAutomation,
        instagramAccount: {
          ...mockAutomation.instagramAccount,
          accessToken: null,
        },
      },
    ]);

    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockPrisma.dmLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "FAILED",
          errorMessage: "No Instagram access token available",
        }),
      })
    );
    expect(mockReserveWorkspaceDMSend).not.toHaveBeenCalled();
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
  });

  it("should use 'there' when commenter name is not available", async () => {
    const processor = getProcessor();
    const jobDataWithoutName = {
      instagramAccountId: mockJobData.instagramAccountId,
      commentId: mockJobData.commentId,
      commentText: mockJobData.commentText,
      commenterId: mockJobData.commenterId,
      mediaId: mockJobData.mediaId,
    };

    await processor(createMockJob(jobDataWithoutName as typeof mockJobData));

    expect(mockSendPrivateReply).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "comment_555",
      "Hey there! Here is the link: https://example.com"
    );
  });

  it("should deliver tracked links as web_url buttons (one or two)", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        ...mockAutomation,
        dmMessage: "Hey {username}! Here is the offer: {link}",
        linkButtonLabel: "Get offer",
        trackedLinks: [
          {
            slug: "abc123",
            label: "Primary campaign link",
            destinationUrl: "https://example.com",
          },
          {
            slug: "def456",
            label: "Book a call",
            destinationUrl: "https://example.com/book",
          },
        ],
      },
    ]);

    const processor = getProcessor();
    await processor(createMockJob());

    // Primary button title comes from linkButtonLabel; the second from its
    // own stored label. Both point at their tracked /r/<slug> URLs.
    expect(mockSendPrivateReplyWithLinkButton).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "comment_555",
      "Hey commenter_user! Here is the offer:",
      [
        { title: "Get offer", url: "http://localhost:3000/r/abc123" },
        { title: "Book a call", url: "http://localhost:3000/r/def456" },
      ]
    );
  });

  it("should send a follow-gate prompt when a non-follower comments", async () => {
    mockGetUserFollowStatus.mockResolvedValue(false); // not following yet
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        ...mockAutomation,
        requireFollow: true,
        followPromptMessage: "Follow me first {username}, then tap 👇",
        followPromptButtonLabel: "I'm following ✅",
        trackedLinks: [
          {
            slug: "abc123",
            label: "Primary campaign link",
            destinationUrl: "https://example.com",
          },
        ],
      },
    ]);

    const processor = getProcessor();
    await processor(createMockJob());

    // The follow prompt goes out with a `followcheck:` postback button; the
    // link is NOT delivered yet.
    expect(mockSendPrivateReplyWithButton).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "comment_555",
      "Follow me first commenter_user, then tap 👇",
      "I'm following ✅",
      "followcheck:auto_789"
    );
    expect(mockSendPrivateReplyWithLinkButton).not.toHaveBeenCalled();
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
  });

  it("should skip the prompt and send the link when the commenter already follows", async () => {
    mockGetUserFollowStatus.mockResolvedValue(true); // already following
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        ...mockAutomation,
        requireFollow: true,
        followPromptMessage: "Follow me first, then tap 👇",
        followPromptButtonLabel: "I'm following ✅",
        dmMessage: "Hey {username}! Here is the offer: {link}",
        linkButtonLabel: "Get offer",
        trackedLinks: [
          {
            slug: "abc123",
            label: "Primary campaign link",
            destinationUrl: "https://example.com",
          },
        ],
      },
    ]);

    const processor = getProcessor();
    await processor(createMockJob());

    // Confirmed follower: no prompt, link delivered right away.
    expect(mockSendPrivateReplyWithButton).not.toHaveBeenCalled();
    expect(mockSendPrivateReplyWithLinkButton).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "comment_555",
      "Hey commenter_user! Here is the offer:",
      [{ title: "Get offer", url: "http://localhost:3000/r/abc123" }]
    );
  });

  it("should send the opening DM first (routing to the follow check) when both opening DM and follow-gate are on", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        ...mockAutomation,
        openingDmEnabled: true,
        openingDmMessage: "Hey {username}, welcome!",
        openingDmButtonLabel: "Get the link",
        requireFollow: true,
        followPromptButtonLabel: "I'm following ✅",
        trackedLinks: [
          {
            slug: "abc123",
            label: "Primary campaign link",
            destinationUrl: "https://example.com",
          },
        ],
      },
    ]);

    const processor = getProcessor();
    await processor(createMockJob());

    // Opening DM goes out first; its button routes into the follow check.
    expect(mockSendPrivateReplyWithButton).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "comment_555",
      "Hey commenter_user, welcome!",
      "Get the link",
      "followcheck:auto_789"
    );
    // Follow status is verified on the tap, not at comment time.
    expect(mockGetUserFollowStatus).not.toHaveBeenCalled();
    expect(mockSendPrivateReplyWithLinkButton).not.toHaveBeenCalled();
  });

  it("should deliver the next DM from a read fallback when no button tap has sent it yet", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([]);
    mockPrisma.automation.findFirst.mockResolvedValue({
      ...mockAutomation,
      trackedLinks: [],
    });

    const processor = getProcessor();
    await processor(
      createMockPostbackJob({
        instagramAccountId: "ig_456",
        userId: "commenter_999",
        payload: "reveal:auto_789",
        fallback: true,
      })
    );

    expect(mockPrisma.dmLog.findUnique).toHaveBeenCalledWith({
      where: {
        automationId_commentId: {
          automationId: "auto_789",
          commentId: "reveal:commenter_999",
        },
      },
    });
    expect(mockSendDirectMessage).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "commenter_999",
      "Hey commenter_user! Here is the link: https://example.com"
    );
  });

  it("should not deliver a read fallback when the button tap already sent the reveal", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([]);
    mockPrisma.automation.findFirst.mockResolvedValue({
      ...mockAutomation,
      trackedLinks: [],
    });
    mockPrisma.dmLog.findUnique.mockResolvedValue({
      id: "existing_reveal",
      status: "SENT",
    });

    const processor = getProcessor();
    await processor(
      createMockPostbackJob({
        instagramAccountId: "ig_456",
        userId: "commenter_999",
        payload: "reveal:auto_789",
        fallback: true,
      })
    );

    expect(mockSendDirectMessage).not.toHaveBeenCalled();
    expect(mockReserveWorkspaceDMSend).not.toHaveBeenCalled();
  });

  it("should not let a read fallback bypass the follow gate", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([]);
    mockPrisma.automation.findFirst.mockResolvedValue({
      ...mockAutomation,
      requireFollow: true,
      trackedLinks: [],
    });
    mockGetUserFollowStatus.mockResolvedValue(false); // still not following

    const processor = getProcessor();
    await processor(
      createMockPostbackJob({
        instagramAccountId: "ig_456",
        userId: "commenter_999",
        payload: "reveal:auto_789",
        fallback: true,
      })
    );

    // Non-follower on a read fallback: no link, and no re-prompt spam either.
    expect(mockSendDirectMessage).not.toHaveBeenCalled();
    expect(mockSendDirectMessageWithButton).not.toHaveBeenCalled();
    expect(mockReserveWorkspaceDMSend).not.toHaveBeenCalled();
  });

  it("should deliver a follow-gated read fallback once the user follows", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([]);
    mockPrisma.automation.findFirst.mockResolvedValue({
      ...mockAutomation,
      requireFollow: true,
      trackedLinks: [],
    });
    mockGetUserFollowStatus.mockResolvedValue(true);

    const processor = getProcessor();
    await processor(
      createMockPostbackJob({
        instagramAccountId: "ig_456",
        userId: "commenter_999",
        payload: "reveal:auto_789",
        fallback: true,
      })
    );

    expect(mockSendDirectMessage).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "commenter_999",
      "Hey commenter_user! Here is the link: https://example.com"
    );
  });

  it("should not log a failure when a read fallback hits a closed messaging window", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([]);
    mockPrisma.automation.findFirst.mockResolvedValue({
      ...mockAutomation,
      trackedLinks: [],
    });
    mockSendDirectMessage.mockRejectedValue(
      new Error("This message is sent outside of allowed window.")
    );

    const processor = getProcessor();
    // The window cannot reopen on its own, so this must not throw (no retries)
    // and must not leave a FAILED row the user can do nothing about.
    await expect(
      processor(
        createMockPostbackJob({
          instagramAccountId: "ig_456",
          userId: "commenter_999",
          payload: "reveal:auto_789",
          fallback: true,
        })
      )
    ).resolves.toBeUndefined();

    expect(mockPrisma.dmLog.upsert).not.toHaveBeenCalled();
    expect(mockReleaseWorkspaceDMReservation).toHaveBeenCalled();
  });

  it("should still log a failure for a real button tap that fails", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([]);
    mockPrisma.automation.findFirst.mockResolvedValue({
      ...mockAutomation,
      trackedLinks: [],
    });
    mockSendDirectMessage.mockRejectedValue(new Error("boom"));

    const processor = getProcessor();
    await expect(
      processor(
        createMockPostbackJob({
          instagramAccountId: "ig_456",
          userId: "commenter_999",
          payload: "reveal:auto_789",
        })
      )
    ).rejects.toThrow("boom");

    expect(mockPrisma.dmLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "FAILED" }),
      })
    );
  });
});

describe("DM Worker — one private reply per comment", () => {
  it("should skip a campaign when another already used the comment's private reply", async () => {
    mockPrisma.dmLog.findFirst.mockImplementation(
      async (args: { where?: { OR?: unknown; commenterId?: unknown } } = {}) =>
        args.where?.commenterId
          ? null
          : args.where?.OR
          ? { automation: { name: "openreply 1" } }
          : { commenterName: "commenter_user" }
    );

    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockReserveWorkspaceDMSend).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "SKIPPED_DEDUP",
          errorMessage: expect.stringContaining("openreply 1"),
        }),
      })
    );
  });

  it("should not fall back to a plain-text private reply when the window is the problem", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        ...mockAutomation,
        trackedLinks: [
          { slug: "abc123", label: null, destinationUrl: "https://example.com" },
        ],
      },
    ]);
    mockSendPrivateReplyWithLinkButton.mockRejectedValue(
      new Error("The comment is invalid for a private reply")
    );

    const processor = getProcessor();
    await expect(processor(createMockJob())).rejects.toThrow(
      "The comment is invalid for a private reply"
    );

    // A text retry on the same comment would fail identically and overwrite the
    // real reason, so it must not be attempted.
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          errorMessage: "The comment is invalid for a private reply",
        }),
      })
    );
  });

  it("should still fall back to plain text when the button template itself is rejected", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        ...mockAutomation,
        trackedLinks: [
          { slug: "abc123", label: null, destinationUrl: "https://example.com" },
        ],
      },
    ]);
    mockSendPrivateReplyWithLinkButton.mockRejectedValue(
      new Error("Unsupported message template")
    );

    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockSendPrivateReply).toHaveBeenCalled();
    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENT" }),
      })
    );
  });
});

describe("DM Worker — DM keyword trigger", () => {
  const dmTriggerAutomation = {
    ...mockAutomation,
    dmTriggerEnabled: true,
    requireFollow: false,
    followPromptMessage: null,
    followPromptButtonLabel: null,
  };

  function createMockMessageJob(data: Record<string, unknown> = {}) {
    return {
      name: "process-message",
      data: {
        instagramAccountId: "ig_456",
        messageId: "mid_abc",
        messageText: "can I get the LINK?",
        senderId: "commenter_999",
        ...data,
      },
      id: "message_job_001",
      attemptsMade: 0,
    };
  }

  beforeEach(() => {
    mockPrisma.automation.findMany.mockResolvedValue([dmTriggerAutomation]);
  });

  it("should reply to a DM whose text matches the campaign keywords", async () => {
    const processor = getProcessor();
    await processor(createMockMessageJob());

    expect(mockPrisma.automation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          dmTriggerEnabled: true,
          isActive: true,
        }),
      })
    );
    expect(mockSendDirectMessage).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "commenter_999",
      "Hey commenter_user! Here is the link: https://example.com"
    );
    // Never a private reply — there is no comment to reply to.
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
  });

  it("should not reply when the DM text matches no keyword", async () => {
    mockMatchKeywords.mockReturnValue({ matched: false, matchedKeyword: null });

    const processor = getProcessor();
    await processor(createMockMessageJob({ messageText: "hello there" }));

    expect(mockSendDirectMessage).not.toHaveBeenCalled();
    expect(mockSendDirectMessageWithLinkButton).not.toHaveBeenCalled();
  });

  it("should log the reply against the inbound message id for dedup", async () => {
    const processor = getProcessor();
    await processor(createMockMessageJob());

    expect(mockPrisma.dmLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          automationId_commentId: {
            automationId: "auto_789",
            commentId: "dm:mid_abc",
          },
        },
        create: expect.objectContaining({
          commenterId: "commenter_999",
          commentText: "can I get the LINK?",
          matchedKeyword: "LINK",
          status: "SENT",
        }),
      })
    );
  });

  it("should not re-send when this message was already answered", async () => {
    mockPrisma.dmLog.findUnique.mockResolvedValue({ status: "SENT" });

    const processor = getProcessor();
    await processor(createMockMessageJob());

    expect(mockSendDirectMessage).not.toHaveBeenCalled();
    expect(mockReserveWorkspaceDMSend).not.toHaveBeenCalled();
  });

  it("should send the link as buttons when the campaign has tracked links", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        ...dmTriggerAutomation,
        linkButtonLabel: "Get it",
        trackedLinks: [
          {
            slug: "abc123",
            label: "Get it",
            destinationUrl: "https://example.com/offer",
          },
        ],
      },
    ]);

    const processor = getProcessor();
    await processor(createMockMessageJob());

    expect(mockSendDirectMessageWithLinkButton).toHaveBeenCalled();
    expect(mockSendDirectMessage).not.toHaveBeenCalled();
  });

  it("should send the follow prompt instead of the link to a non-follower", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      { ...dmTriggerAutomation, requireFollow: true },
    ]);
    mockGetUserFollowStatus.mockResolvedValue(false);

    const processor = getProcessor();
    await processor(createMockMessageJob());

    expect(mockSendDirectMessageWithButton).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "commenter_999",
      expect.any(String),
      "I'm following ✅",
      "followcheck:auto_789"
    );
    expect(mockSendDirectMessage).not.toHaveBeenCalled();
  });

  // First contact, so the gate is fail-closed like processComment: an
  // unverifiable status must not hand out the link.
  it("should send the follow prompt when follow status cannot be verified", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      { ...dmTriggerAutomation, requireFollow: true },
    ]);
    mockGetUserFollowStatus.mockResolvedValue(null);

    const processor = getProcessor();
    await processor(createMockMessageJob());

    expect(mockSendDirectMessageWithButton).toHaveBeenCalled();
    expect(mockSendDirectMessage).not.toHaveBeenCalled();
  });

  it("should skip and log when the workspace is over its monthly limit", async () => {
    mockReserveWorkspaceDMSend.mockResolvedValue({
      allowed: false,
      reserved: false,
      remaining: 0,
      limit: 2000,
      periodStart: usagePeriodStart,
    });

    const processor = getProcessor();
    await processor(createMockMessageJob());

    expect(mockSendDirectMessage).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "SKIPPED_PLAN_LIMIT" }),
      })
    );
  });

  it("should release the usage reservation and rethrow when the send fails", async () => {
    mockSendDirectMessage.mockRejectedValue(new Error("Meta is down"));

    const processor = getProcessor();
    await expect(processor(createMockMessageJob())).rejects.toThrow(
      "Meta is down"
    );

    expect(mockReleaseWorkspaceDMReservation).toHaveBeenCalledWith(
      "workspace_123",
      usagePeriodStart
    );
    expect(mockPrisma.dmLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "FAILED" }),
      })
    );
  });
});

describe("DM Worker — send delay", () => {
  const delayedAutomation = {
    ...mockAutomation,
    sendDelayMinSeconds: 120,
    sendDelayMaxSeconds: 120,
    sendWindowStart: null,
    sendWindowEnd: null,
    sendWindowTimezone: "Europe/Madrid",
  };

  beforeEach(() => {
    mockPrisma.automation.findMany.mockResolvedValue([delayedAutomation]);
  });

  it("should park the reply on a delayed job instead of sending it", async () => {
    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockReserveWorkspaceDMSend).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          scheduledAt: expect.any(Date),
        }),
      })
    );
    const [name, data, opts] = mockQueueAdd.mock.calls[0];
    expect(name).toBe("process-comment");
    expect(data).toMatchObject({ scheduledAutomationId: "auto_789" });
    expect(opts.delay).toBeGreaterThan(115_000);
    expect(opts.delay).toBeLessThanOrEqual(120_000);
  });

  it("should send on the delayed run", async () => {
    mockPrisma.dmLog.findUnique.mockResolvedValue({
      status: "PENDING",
      scheduledAt: new Date(),
      publicReplySentAt: null,
    });
    const processor = getProcessor();
    await processor(
      createMockJob({ ...mockJobData, scheduledAutomationId: "auto_789" } as typeof mockJobData)
    );

    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockSendPrivateReply).toHaveBeenCalled();
  });

  it("should not send early when the comment comes back before its time", async () => {
    mockPrisma.dmLog.findUnique.mockResolvedValue({
      status: "PENDING",
      scheduledAt: new Date(Date.now() + 60_000),
      publicReplySentAt: null,
    });
    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
  });

  it("should send itself when the delayed job is long overdue", async () => {
    mockPrisma.dmLog.findUnique.mockResolvedValue({
      status: "PENDING",
      scheduledAt: new Date(Date.now() - 60 * 60_000),
      publicReplySentAt: null,
    });
    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockSendPrivateReply).toHaveBeenCalled();
  });

  it("should park a DM-triggered reply too", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      { ...delayedAutomation, dmTriggerEnabled: true, requireFollow: false },
    ]);
    const processor = getProcessor();
    await processor({
      name: "process-message",
      data: {
        instagramAccountId: "ig_456",
        messageId: "mid_abc",
        messageText: "LINK",
        senderId: "commenter_999",
      },
      id: "message_job_001",
      attemptsMade: 0,
    });

    expect(mockSendDirectMessage).not.toHaveBeenCalled();
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-message",
      expect.objectContaining({ scheduledAutomationId: "auto_789" }),
      expect.objectContaining({ delay: expect.any(Number) })
    );
  });
});

describe("DM Worker — sequences and branches", () => {
  const sequence = {
    main: [
      { id: "s1", type: "text", text: "Hi {username}", mediaUrl: null, delaySeconds: 30, buttons: [
        { label: "Prices", branchId: "prices" },
        { label: "Web", url: "https://example.com" },
      ] },
      { id: "s2", type: "audio", text: "", mediaUrl: "https://cdn.test/a.m4a", delaySeconds: 600, buttons: [] },
    ],
    branches: [
      { id: "prices", name: "Prices", qualified: true, steps: [
        { id: "p1", type: "image", text: "", mediaUrl: "https://cdn.test/p.png", delaySeconds: 0, buttons: [] },
      ] },
    ],
  };
  const seqAutomation = { ...mockAutomation, sequence, requireFollow: false };

  function stepJob(data: Record<string, unknown>) {
    return {
      name: "process-step",
      data: {
        instagramAccountId: "ig_456",
        userId: "commenter_999",
        automationId: "auto_789",
        runId: "1",
        commenterName: "commenter_user",
        ...data,
      },
      id: "step_job",
      attemptsMade: 0,
    };
  }

  beforeEach(() => {
    mockPrisma.automation.findFirst.mockResolvedValue(seqAutomation);
    mockSendDirectMessageWithButtons.mockResolvedValue({});
    mockSendDirectMessageAttachment.mockResolvedValue({});
  });

  it("should start the main sequence after the link goes out on a button tap", async () => {
    const processor = getProcessor();
    await processor(createMockPostbackJob());

    expect(mockSendDirectMessage).toHaveBeenCalled();
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-step",
      expect.objectContaining({ branchId: "main", index: 0, runId: "1" }),
      { delay: 30_000, jobId: "step_auto_789_commenter_999_main_1_0" }
    );
  });

  it("should send a text step with link and branch buttons, then queue the next", async () => {
    const processor = getProcessor();
    await processor(stepJob({ branchId: "main", index: 0 }));

    expect(mockSendDirectMessageWithButtons).toHaveBeenCalledWith(
      "decrypted_token",
      "ig_456",
      "commenter_999",
      "Hi commenter_user",
      [
        { type: "postback", title: "Prices", payload: "branch:auto_789:prices" },
        { type: "web_url", title: "Web", url: "https://example.com" },
      ]
    );
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-step",
      expect.objectContaining({ branchId: "main", index: 1 }),
      { delay: 600_000, jobId: "step_auto_789_commenter_999_main_1_1" }
    );
  });

  it("should send an attachment step and stop at the end", async () => {
    const processor = getProcessor();
    await processor(stepJob({ branchId: "main", index: 1 }));

    expect(mockSendDirectMessageAttachment).toHaveBeenCalledWith(
      "decrypted_token", "ig_456", "commenter_999", "audio", "https://cdn.test/a.m4a"
    );
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("should stop the sequence when Instagram refuses a message", async () => {
    mockSendDirectMessageWithButtons.mockRejectedValue(new Error("outside of allowed window"));
    const processor = getProcessor();
    await expect(processor(stepJob({ branchId: "main", index: 0 }))).resolves.toBeUndefined();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("should do nothing when the campaign was paused", async () => {
    mockPrisma.automation.findFirst.mockResolvedValue(null);
    const processor = getProcessor();
    await processor(stepJob({ branchId: "main", index: 0 }));
    expect(mockSendDirectMessageWithButtons).not.toHaveBeenCalled();
  });

  it("should start a branch when its button is tapped", async () => {
    const processor = getProcessor();
    await processor(createMockPostbackJob({
      instagramAccountId: "ig_456",
      userId: "commenter_999",
      payload: "branch:auto_789:prices",
    }));

    expect(mockSendDirectMessage).not.toHaveBeenCalled();
    const [name, data, opts] = mockQueueAdd.mock.calls[0];
    expect(name).toBe("process-step");
    expect(data).toMatchObject({ branchId: "prices", index: 0 });
    expect(data.runId).not.toBe("1");
    expect(opts.delay).toBe(0);
  });

  it("should record the tapped branch as the person's triage answer", async () => {
    const processor = getProcessor();
    await processor(createMockPostbackJob({
      instagramAccountId: "ig_456",
      userId: "commenter_999",
      payload: "branch:auto_789:prices",
    }));

    expect(mockPrisma.sequenceChoice.upsert).toHaveBeenCalledWith({
      where: { automationId_userId: { automationId: "auto_789", userId: "commenter_999" } },
      create: {
        workspaceId: "workspace_123",
        automationId: "auto_789",
        userId: "commenter_999",
        branchId: "prices",
        branchName: "Prices",
        qualified: true,
      },
      update: { branchId: "prices", branchName: "Prices", qualified: true },
    });
  });

  it("should not record an answer for a branch that no longer exists", async () => {
    const processor = getProcessor();
    await processor(createMockPostbackJob({
      instagramAccountId: "ig_456",
      userId: "commenter_999",
      payload: "branch:auto_789:deleted",
    }));
    expect(mockPrisma.sequenceChoice.upsert).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("should ignore a branch button from another account", async () => {
    const processor = getProcessor();
    await processor(createMockPostbackJob({
      instagramAccountId: "someone_else",
      userId: "commenter_999",
      payload: "branch:auto_789:prices",
    }));
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockPrisma.sequenceChoice.upsert).not.toHaveBeenCalled();
  });

  it("should start the sequence after a DM keyword trigger", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([{ ...seqAutomation, dmTriggerEnabled: true }]);
    const processor = getProcessor();
    await processor({
      name: "process-message",
      data: { instagramAccountId: "ig_456", messageId: "mid_x", messageText: "LINK", senderId: "commenter_999" },
      id: "m",
      attemptsMade: 0,
    });
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-step",
      expect.objectContaining({ branchId: "main", index: 0 }),
      expect.anything()
    );
  });

  it("should not start a sequence from a comment's private reply", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([seqAutomation]);
    const processor = getProcessor();
    await processor(createMockJob());
    expect(mockSendPrivateReply).toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });
});

describe("DM Worker — no repeated DMs or public replies", () => {
  const withReply = {
    ...mockAutomation,
    publicReplyEnabled: true,
    publicReplyMessages: ["te he escrito!"],
  };

  // findFirst serves several lookups; route each by the shape of its where.
  function routeFindFirst(opts: { samePerson?: boolean; otherCampaign?: boolean }) {
    mockPrisma.dmLog.findFirst.mockImplementation(
      async (args: { where?: { OR?: unknown; commentId?: unknown; commenterId?: unknown } } = {}) => {
        const w = args.where ?? {};
        if (w.commenterId && w.commentId) return opts.samePerson ? { id: "other" } : null;
        if (w.OR) return opts.otherCampaign ? { automation: { name: "otra" } } : null;
        return { commenterName: "commenter_user" };
      }
    );
  }

  beforeEach(() => {
    mockPrisma.automation.findMany.mockResolvedValue([withReply]);
    mockSendCommentReply.mockResolvedValue({});
  });

  it("should post the public reply only after the DM goes out", async () => {
    routeFindFirst({});
    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockSendPrivateReply).toHaveBeenCalled();
    expect(mockSendCommentReply).toHaveBeenCalledWith("decrypted_token", "comment_555", "te he escrito!");
    expect(mockSendPrivateReply.mock.invocationCallOrder[0]).toBeLessThan(
      mockSendCommentReply.mock.invocationCallOrder[0]
    );
  });

  it("should not post the public reply when the DM fails", async () => {
    routeFindFirst({});
    mockSendPrivateReply.mockRejectedValue(new Error("The account owner has disabled access to Instagram Direct Messaging."));
    const processor = getProcessor();
    await expect(processor(createMockJob())).rejects.toThrow();
    expect(mockSendCommentReply).not.toHaveBeenCalled();
  });

  it("should check earlier DMs from every campaign on the same post, retired ones too", async () => {
    routeFindFirst({});
    mockPrisma.automation.findMany.mockImplementation(async (args: { where?: { postId?: string } } = {}) =>
      args.where?.postId === "media_101" && !("OR" in (args.where ?? {}))
        ? [{ id: "auto_789" }, { id: "old_retired" }]
        : [withReply]
    );
    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockPrisma.automation.findMany).toHaveBeenCalledWith({
      where: { instagramAccountId: "ig_account_row_1", postId: "media_101" },
      select: { id: true },
    });
    expect(mockPrisma.dmLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          automationId: { in: ["auto_789", "old_retired"] },
          commenterId: "commenter_999",
        }),
      })
    );
  });

  it("should not take new comments or DMs into a retired campaign", async () => {
    const processor = getProcessor();
    await processor(createMockJob());
    await processor({
      name: "process-message",
      data: { instagramAccountId: "ig_456", messageId: "mid_1", messageText: "LINK", senderId: "commenter_999" },
      id: "m",
      attemptsMade: 0,
    });
    expect(mockPrisma.automation.findMany.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const [args] of mockPrisma.automation.findMany.mock.calls) {
      if ("isActive" in (args.where ?? {})) expect(args.where.retiredAt).toBeNull();
    }
  });

  it("should skip a person's second comment on the same campaign", async () => {
    routeFindFirst({ samePerson: true });
    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockSendCommentReply).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED_DEDUP" }) })
    );
  });

  it("should not post a public reply when another campaign took the comment", async () => {
    routeFindFirst({ otherCampaign: true });
    const processor = getProcessor();
    await processor(createMockJob());
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockSendCommentReply).not.toHaveBeenCalled();
  });

  it("should never come back to a comment it deliberately skipped", async () => {
    routeFindFirst({});
    mockPrisma.dmLog.findUnique.mockResolvedValue({ status: "SKIPPED_DEDUP", publicReplySentAt: null, scheduledAt: null });
    const processor = getProcessor();
    await processor(createMockJob());
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockSendCommentReply).not.toHaveBeenCalled();
  });

  it("should only retry the public reply when the DM already went out", async () => {
    routeFindFirst({});
    mockPrisma.dmLog.findUnique.mockResolvedValue({ status: "SENT", publicReplySentAt: null, scheduledAt: null });
    const processor = getProcessor();
    await processor(createMockJob());
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockSendCommentReply).toHaveBeenCalledTimes(1);
  });

  it("should answer a DM keyword only once per person", async () => {
    routeFindFirst({ samePerson: true });
    mockPrisma.automation.findMany.mockResolvedValue([{ ...mockAutomation, dmTriggerEnabled: true, requireFollow: false }]);
    const processor = getProcessor();
    await processor({
      name: "process-message",
      data: { instagramAccountId: "ig_456", messageId: "mid_2", messageText: "LINK", senderId: "commenter_999" },
      id: "m2",
      attemptsMade: 0,
    });
    expect(mockSendDirectMessage).not.toHaveBeenCalled();
  });
});

describe("DM Worker — pacing", () => {
  it("should wait for the account's next turn even on an instant campaign", async () => {
    mockReservePacedSlot.mockResolvedValue(new Date(Date.now() + 75_000));
    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockReservePacedSlot).toHaveBeenCalledWith("ig_456", expect.any(Date));
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    const [name, data, opts] = mockQueueAdd.mock.calls[0];
    expect(name).toBe("process-comment");
    expect(data).toMatchObject({ scheduledAutomationId: "auto_789" });
    expect(opts.delay).toBeGreaterThan(70_000);
    // Unique id: a fixed one collides with a completed job and is dropped.
    expect(opts.jobId).toMatch(/^comment_ig_456_comment_555_sched_auto_789_\d+$/);
  });

  it("should send right away when nothing is queued", async () => {
    const processor = getProcessor();
    await processor(createMockJob());
    expect(mockSendPrivateReply).toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("should not take a new turn on the delayed run itself", async () => {
    mockPrisma.dmLog.findUnique.mockResolvedValue({ status: "PENDING", scheduledAt: new Date(), publicReplySentAt: null });
    const processor = getProcessor();
    await processor(createMockJob({ ...mockJobData, scheduledAutomationId: "auto_789" } as typeof mockJobData));
    expect(mockReservePacedSlot).not.toHaveBeenCalled();
    expect(mockSendPrivateReply).toHaveBeenCalled();
  });
});

describe("DM Worker — one sender at a time", () => {
  it("should not send when another worker already claimed the comment", async () => {
    mockClaimSend.mockResolvedValue(false);
    const processor = getProcessor();
    await processor(createMockJob());
    expect(mockClaimSend).toHaveBeenCalledWith([
      "send:comment:comment_555",
      "send:person:auto_789:commenter_999",
    ]);
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    expect(mockReserveWorkspaceDMSend).not.toHaveBeenCalled();
  });

  it("should keep the claim after a successful send", async () => {
    const processor = getProcessor();
    await processor(createMockJob());
    expect(mockSendPrivateReply).toHaveBeenCalled();
    expect(mockReleaseSend).not.toHaveBeenCalled();
  });

  it("should release the claim when the send fails, so a retry can go", async () => {
    mockSendPrivateReply.mockRejectedValue(new Error("boom"));
    const processor = getProcessor();
    await expect(processor(createMockJob())).rejects.toThrow("boom");
    expect(mockReleaseSend).toHaveBeenCalledWith([
      "send:comment:comment_555",
      "send:person:auto_789:commenter_999",
    ]);
  });

  it("should give a retry of a delayed reply a new turn instead of sending at once", async () => {
    mockPrisma.dmLog.findUnique.mockResolvedValue({ status: "FAILED", scheduledAt: new Date(Date.now() - 60_000), publicReplySentAt: null });
    mockReservePacedSlot.mockResolvedValue(new Date(Date.now() + 90_000));
    const processor = getProcessor();
    await processor({
      ...createMockJob({ ...mockJobData, scheduledAutomationId: "auto_789" } as typeof mockJobData),
      attemptsMade: 2,
    });
    expect(mockSendPrivateReply).not.toHaveBeenCalled();
    const [, , opts] = mockQueueAdd.mock.calls[0];
    expect(opts.delay).toBeGreaterThan(80_000);
    expect(opts.jobId).toMatch(/_sched_auto_789_\d+$/);
  });

  it("should not let two DM triggers from the same person both send", async () => {
    mockClaimSend.mockResolvedValue(false);
    mockPrisma.automation.findMany.mockResolvedValue([{ ...mockAutomation, dmTriggerEnabled: true, requireFollow: false }]);
    const processor = getProcessor();
    await processor({
      name: "process-message",
      data: { instagramAccountId: "ig_456", messageId: "mid_9", messageText: "LINK", senderId: "commenter_999" },
      id: "m9",
      attemptsMade: 0,
    });
    expect(mockSendDirectMessage).not.toHaveBeenCalled();
  });
});

describe("DM Worker — sequences that wait for a reply", () => {
  const step = (id: string, extra: Record<string, unknown> = {}) => ({
    id, type: "text", text: `msg ${id}`, mediaUrl: null, delaySeconds: 0, buttons: [],
    waitForReply: false, reminders: [], skipIfReplied: false, ...extra,
  });
  const sequence = {
    main: [
      step("a1", { type: "audio", text: "", mediaUrl: "https://cdn.test/1.m4a", delaySeconds: 60, waitForReply: true }),
      step("a2", {
        type: "audio", text: "", mediaUrl: "https://cdn.test/2.m4a", delaySeconds: 900, waitForReply: true,
        reminders: [{ afterSeconds: 7200, text: "ey, ¿pudiste escucharlo?" }],
      }),
      step("link", { delaySeconds: 80 }),
      step("seg", { delaySeconds: 7200, skipIfReplied: true }),
    ],
    branches: [],
  };
  const convoAutomation = { ...mockAutomation, sequence, requireFollow: false };

  function stepJob(data: Record<string, unknown>) {
    return {
      name: "process-step",
      data: {
        instagramAccountId: "ig_456", userId: "commenter_999", automationId: "auto_789",
        branchId: "main", runId: "1", commenterName: "commenter_user", ...data,
      },
      id: "step_job",
      attemptsMade: 0,
    };
  }
  function messageJob(text: string) {
    return {
      name: "process-message",
      data: { instagramAccountId: "ig_456", messageId: "mid_r", messageText: text, senderId: "commenter_999" },
      id: "m",
      attemptsMade: 0,
    };
  }

  beforeEach(() => {
    mockPrisma.automation.findMany.mockResolvedValue([convoAutomation]);
    mockPrisma.automation.findFirst.mockResolvedValue(convoAutomation);
    mockSendDirectMessageAttachment.mockResolvedValue({});
  });

  it("parks the sequence after the comment's private reply instead of sending", async () => {
    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockSendPrivateReply).toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockConvo.waits.get("ig_456:commenter_999")).toMatchObject({
      automationId: "auto_789", branchId: "main", index: 0,
    });
  });

  it("resumes on their reply, counting the step's wait from now, and triggers nothing else", async () => {
    mockConvo.waits.set("ig_456:commenter_999", {
      automationId: "auto_789", branchId: "main", index: 0, runId: "1", commenterName: "commenter_user", waitId: "w",
    });
    mockPrisma.automation.findMany.mockClear();
    const processor = getProcessor();
    await processor(messageJob("hola, me interesa"));

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-step",
      expect.objectContaining({ index: 0, runId: "1" }),
      { delay: 60_000, jobId: "step_auto_789_commenter_999_main_1_0" }
    );
    expect(mockConvo.waits.size).toBe(0);
    expect(mockPrisma.automation.findMany).not.toHaveBeenCalled();
    expect(mockSendDirectMessage).not.toHaveBeenCalled();
  });

  it("counts a voice note as a reply", async () => {
    mockConvo.waits.set("ig_456:commenter_999", {
      automationId: "auto_789", branchId: "main", index: 1, runId: "1", commenterName: null, waitId: "w",
    });
    const processor = getProcessor();
    await processor(messageJob(""));

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-step", expect.objectContaining({ index: 1 }), expect.objectContaining({ delay: 900_000 })
    );
  });

  it("does nothing with a voice note when no sequence is waiting", async () => {
    const processor = getProcessor();
    await processor(messageJob(""));

    expect(mockPrisma.automation.findMany).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
    expect(mockConvo.inbound.has("ig_456:commenter_999")).toBe(true);
  });

  it("falls back to keyword campaigns when the waiting campaign was paused", async () => {
    mockConvo.waits.set("ig_456:commenter_999", {
      automationId: "auto_789", branchId: "main", index: 0, runId: "1", commenterName: null, waitId: "w",
    });
    mockPrisma.automation.findFirst.mockResolvedValue(null);
    const processor = getProcessor();
    await processor(messageJob("hola"));

    expect(mockPrisma.automation.findMany).toHaveBeenCalled();
  });

  it("after sending, parks the next step and queues its reminders", async () => {
    const processor = getProcessor();
    await processor(stepJob({ index: 0 }));

    expect(mockSendDirectMessageAttachment).toHaveBeenCalledWith(
      "decrypted_token", "ig_456", "commenter_999", "audio", "https://cdn.test/1.m4a"
    );
    const wait = mockConvo.waits.get("ig_456:commenter_999") as { index: number; waitId: string };
    expect(wait.index).toBe(1);
    expect(mockQueueAdd).toHaveBeenCalledTimes(1);
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-step",
      expect.objectContaining({ index: 1, reminder: { index: 0, waitId: wait.waitId } }),
      expect.objectContaining({ delay: 7_200_000 })
    );
  });

  it("sends a reminder only while that wait is still open", async () => {
    mockConvo.waits.set("ig_456:commenter_999", {
      automationId: "auto_789", branchId: "main", index: 1, runId: "1", commenterName: null, waitId: "w1",
    });
    const processor = getProcessor();
    await processor(stepJob({ index: 1, reminder: { index: 0, waitId: "w1" } }));
    expect(mockSendDirectMessage).toHaveBeenCalledWith(
      "decrypted_token", "ig_456", "commenter_999", "ey, ¿pudiste escucharlo?"
    );
    expect(mockSendDirectMessageAttachment).not.toHaveBeenCalled();

    mockSendDirectMessage.mockClear();
    mockConvo.waits.clear();
    await processor(stepJob({ index: 1, reminder: { index: 0, waitId: "w1" } }));
    expect(mockSendDirectMessage).not.toHaveBeenCalled();
  });

  it("skips a follow-up when they wrote after the previous message", async () => {
    mockConvo.inbound.set("ig_456:commenter_999", 2_000);
    const processor = getProcessor();
    await processor(stepJob({ index: 3, prevSentAt: 1_000 }));
    expect(mockSendDirectMessage).not.toHaveBeenCalled();
  });

  it("sends the follow-up when they haven't written since", async () => {
    mockConvo.inbound.set("ig_456:commenter_999", 500);
    const processor = getProcessor();
    await processor(stepJob({ index: 3, prevSentAt: 1_000 }));
    expect(mockSendDirectMessage).toHaveBeenCalledWith(
      "decrypted_token", "ig_456", "commenter_999", "msg seg"
    );
  });
});

describe("DM Worker — reply routes", () => {
  const step = (id: string, extra: Record<string, unknown> = {}) => ({
    id, type: "text", text: `msg ${id}`, mediaUrl: null, delaySeconds: 0, buttons: [],
    waitForReply: false, reminders: [], skipIfReplied: false, routes: [], ...extra,
  });
  const sequence = {
    main: [
      step("offer", {
        type: "audio", text: "", mediaUrl: "https://cdn.test/offer.m4a", delaySeconds: 900, waitForReply: true,
        routes: [
          { keywords: ["no tengo dinero", "no puedo pagar"], branchId: "broke" },
          { keywords: ["precio", "cuanto cuesta"], branchId: "price" },
        ],
      }),
      step("link"),
    ],
    branches: [
      { id: "broke", name: "Sin dinero", qualified: false, steps: [step("b1", { delaySeconds: 5 })] },
      { id: "price", name: "Precio", qualified: true, steps: [step("p1", { delaySeconds: 5 })] },
    ],
  };
  const routed = { ...mockAutomation, sequence, requireFollow: false };

  function dueStep(repliesSince?: number) {
    return {
      name: "process-step",
      data: {
        instagramAccountId: "ig_456", userId: "commenter_999", automationId: "auto_789",
        branchId: "main", index: 0, runId: "1", commenterName: null, prevSentAt: 2_000, repliesSince,
      },
      id: "s",
      attemptsMade: 0,
    };
  }

  beforeEach(() => {
    mockPrisma.automation.findFirst.mockResolvedValue(routed);
    mockSendDirectMessageAttachment.mockResolvedValue({});
  });

  it("starts the branch whose keyword they wrote during the wait, across messages and accents", async () => {
    mockConvo.messages.set("ig_456:commenter_999", [
      { at: 500, text: "¿Cuánto cuesta?" }, // before the wait: ignored
      { at: 1_500, text: "Si" },
      { at: 1_600, text: "Me interesa, pero ¿CUÁNTO cuesta?" },
    ]);
    const processor = getProcessor();
    await processor(dueStep(1_000));

    expect(mockSendDirectMessageAttachment).not.toHaveBeenCalled();
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-step",
      expect.objectContaining({ branchId: "price", index: 0 }),
      expect.objectContaining({ delay: 5_000 })
    );
  });

  it("uses the first route that matches", async () => {
    mockConvo.messages.set("ig_456:commenter_999", [
      { at: 1_500, text: "cuanto cuesta? es que no tengo dinero" },
    ]);
    const processor = getProcessor();
    await processor(dueStep(1_000));
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-step", expect.objectContaining({ branchId: "broke" }), expect.anything()
    );
  });

  it("sends the message as usual when nothing matches or they sent a voice note", async () => {
    mockConvo.messages.set("ig_456:commenter_999", [{ at: 1_500, text: "tengo 20 años y quiero empezar" }]);
    const processor = getProcessor();
    await processor(dueStep(1_000));
    expect(mockSendDirectMessageAttachment).toHaveBeenCalledWith(
      "decrypted_token", "ig_456", "commenter_999", "audio", "https://cdn.test/offer.m4a"
    );
  });

  it("keeps the wait's start so routes read the reply that resumed it", async () => {
    mockConvo.waits.set("ig_456:commenter_999", {
      automationId: "auto_789", branchId: "main", index: 0, runId: "1", commenterName: null, waitId: "w", startedAt: 1_000,
    });
    const processor = getProcessor();
    await processor({
      name: "process-message",
      data: { instagramAccountId: "ig_456", messageId: "mid_p", messageText: "precio?", senderId: "commenter_999" },
      id: "m",
      attemptsMade: 0,
    });
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-step", expect.objectContaining({ index: 0, repliesSince: 1_000 }), expect.anything()
    );
    expect(mockConvo.messages.get("ig_456:commenter_999")?.[0].text).toBe("precio?");
  });
});
