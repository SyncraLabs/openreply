import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getDMQueue, getRedisConnection } from "@/lib/queue/client";
import { getWorkerHealth } from "@/lib/ops/worker-health";

export const runtime = "nodejs";
// Health must reflect live state (worker heartbeat, queue depth), never a
// cached response, or it reports stale worker start times.
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// A dependency that is *down* fails fast; one that is *unreachable* hangs.
// ioredis retries forever by default and a dead Postgres behind Railway's TCP
// proxy accepts the socket and then says nothing — so without this cap the
// whole endpoint hangs until the platform kills it, and health checks that
// never answer are worse than useless.
const CHECK_TIMEOUT_MS = 5000;

type CheckStatus = "ok" | "error";

interface HealthCheck {
  status: CheckStatus;
  detail?: string;
}

async function withTimeout<T>(
  label: string,
  run: () => Promise<T>,
  onFailure: (detail: string) => T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${CHECK_TIMEOUT_MS}ms`)),
          CHECK_TIMEOUT_MS
        );
      }),
    ]);
  } catch (error) {
    return onFailure(
      error instanceof Error ? error.message : `${label} check failed`
    );
  } finally {
    clearTimeout(timer);
  }
}

async function checkDatabase(): Promise<HealthCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "Database check failed",
    };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  try {
    const pong = await getRedisConnection().ping();
    return { status: pong === "PONG" ? "ok" : "error", detail: pong };
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "Redis check failed",
    };
  }
}

async function checkQueue(): Promise<HealthCheck & { counts?: unknown }> {
  try {
    const counts = await getDMQueue().getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed"
    );
    return { status: "ok", counts };
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "Queue check failed",
    };
  }
}

export async function GET() {
  const [database, redis, queue, worker] = await Promise.all([
    withTimeout("database", checkDatabase, (detail) => ({
      status: "error" as const,
      detail,
    })),
    withTimeout("redis", checkRedis, (detail) => ({
      status: "error" as const,
      detail,
    })),
    withTimeout("queue", checkQueue, (detail) => ({
      status: "error" as const,
      detail,
    })),
    withTimeout("worker", getWorkerHealth, (error) => ({
      healthy: false,
      heartbeat: null,
      ageMs: null,
      error,
    })),
  ]);

  const healthy =
    database.status === "ok" &&
    redis.status === "ok" &&
    queue.status === "ok" &&
    worker.healthy;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: {
        database,
        redis,
        queue,
        worker,
      },
    },
    { status: healthy ? 200 : 503 }
  );
}
