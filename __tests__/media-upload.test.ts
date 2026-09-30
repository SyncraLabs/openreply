import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockContext, mockCreate, mockFindUnique } = vi.hoisted(() => ({
  mockContext: vi.fn(),
  mockCreate: vi.fn(),
  mockFindUnique: vi.fn(),
}));

vi.mock("@/lib/workspace-access", () => ({
  getCurrentWorkspaceContext: mockContext,
  canManageWorkspace: (role: string) => role === "OWNER" || role === "ADMIN",
}));
vi.mock("@/lib/db/client", () => ({
  prisma: { mediaAsset: { create: mockCreate, findUnique: mockFindUnique } },
}));
vi.mock("@/lib/env", () => ({ getBaseUrl: () => "https://chat.test" }));

import { NextRequest } from "next/server";
import { POST } from "../app/api/media/route";
import { GET } from "../app/api/media/[id]/route";

function upload(file: File) {
  const body = new FormData();
  body.append("file", file);
  return POST(new NextRequest("https://chat.test/api/media", { method: "POST", body }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockContext.mockResolvedValue({ workspaceId: "ws1", role: "OWNER" });
  mockCreate.mockResolvedValue({ id: "asset1" });
});

describe("POST /api/media", () => {
  it("stores an allowed file and returns its public URL", async () => {
    const res = await upload(new File([new Uint8Array(10)], "nota.m4a", { type: "audio/x-m4a" }));
    expect(res.status).toBe(201);
    expect((await res.json()).data.url).toBe("https://chat.test/api/media/asset1.m4a");
    expect(mockCreate.mock.calls[0][0].data).toMatchObject({ workspaceId: "ws1", size: 10 });
  });

  it("requires a session and an admin role", async () => {
    mockContext.mockResolvedValueOnce(null);
    expect((await upload(new File(["x"], "a.png", { type: "image/png" }))).status).toBe(401);
    mockContext.mockResolvedValueOnce({ workspaceId: "ws1", role: "MEMBER" });
    expect((await upload(new File(["x"], "a.png", { type: "image/png" }))).status).toBe(403);
  });

  it("rejects other file types and files over 4 MB", async () => {
    expect((await upload(new File(["<html>"], "a.html", { type: "text/html" }))).status).toBe(400);
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "v.mp4", { type: "video/mp4" });
    expect((await upload(big)).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/media/[id]", () => {
  it("serves the file with safe headers", async () => {
    mockFindUnique.mockResolvedValue({ data: Buffer.from("abc"), contentType: "image/png", size: 3 });
    const res = await GET(new NextRequest("https://chat.test/api/media/asset1.png"), {
      params: Promise.resolve({ id: "asset1.png" }),
    });
    expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "asset1" } }));
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("abc");
  });

  it("404s for an unknown id", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await GET(new NextRequest("https://chat.test/api/media/x"), {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(404);
  });
});
