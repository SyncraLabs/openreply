import { createDMWorker } from "@/lib/queue/dm-worker";
import { recordWorkerHeartbeat } from "@/lib/ops/worker-health";
import { attachPendingReels } from "@/lib/polling/attach-next-reel";
import { reconcileComments } from "@/lib/polling/comment-reconciler";
import { refreshRadar } from "@/lib/radar/refresh";
import { recogerTodos } from "@/lib/tracker/collect";
import os from "node:os";

const worker = createDMWorker();
const startedAt = new Date().toISOString();
const HEARTBEAT_INTERVAL_MS = 30_000;
// Polling safety net for comments that webhooks miss. Runs in the worker because
// it must fire every few minutes and Vercel's free crons only run once a day.
const POLL_INTERVAL_MS = Number(
  process.env.COMMENT_POLL_INTERVAL_MS ?? 5 * 60_000
);

console.log("[DM Worker] Started");

async function heartbeat() {
  try {
    await recordWorkerHeartbeat({
      pid: process.pid,
      hostname: os.hostname(),
      startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] Heartbeat failed:", message);
  }
}

void heartbeat();
const heartbeatTimer = setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);

async function poll() {
  try {
    await reconcileComments();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] Comment reconciliation failed:", message);
  }

  // Engancha las campañas "próximo reel" en el mismo ciclo. El cron de Vercel
  // corre una vez al día, y un reel recién publicado no puede esperar horas a
  // que su campaña se active: las primeras horas son las que traen tráfico.
  try {
    const { bound } = await attachPendingReels();
    if (bound > 0) {
      console.log(`[DM Worker] ${bound} campaña(s) enganchadas a su reel`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] Attach next reel failed:", message);
  }
}

// Kick off one sweep shortly after boot, then on a fixed interval.
setTimeout(() => void poll(), 10_000);
const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);

// El Radar pega contra un proveedor de pago que cobra por resultado, así que
// la frecuencia ES presupuesto. Una vez al día: con 12 posts por cuenta caben
// 5 cuentas dentro del plan gratis de Apify (5 USD/mes). Las métricas de un
// post no se mueven lo bastante en unas horas como para pagar por mirarlas.
const RADAR_INTERVAL_MS = Number(
  process.env.RADAR_REFRESH_INTERVAL_MS ?? 24 * 60 * 60_000
);

async function radar() {
  try {
    const { skipped, accounts, posts, failed } = await refreshRadar();
    if (skipped) return; // Sin APIFY_TOKEN no hay nada que hacer; no es un error.
    console.log(
      `[Radar] ${accounts} cuenta(s), ${posts} post(s), ${failed} fallo(s)`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Radar] Refresh failed:", message);
  }
}

setTimeout(() => void radar(), 60_000);
const radarTimer = setInterval(() => void radar(), RADAR_INTERVAL_MS);

// Tracker diario. Cada 3 h y no una vez al día: si la recogida cae en un
// momento en que Instagram aún no ha dejado el snapshot del día, el siguiente
// ciclo la completa sin esperar 24 horas.
const TRACKER_INTERVAL_MS = Number(
  process.env.TRACKER_INTERVAL_MS ?? 3 * 60 * 60_000
);

async function tracker() {
  try {
    for (const r of await recogerTodos()) {
      if (r.rellenados.length > 0) {
        console.log(`[Tracker] ${r.date}: ${r.rellenados.join(", ")}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Tracker] Recogida fallida:", message);
  }
}

setTimeout(() => void tracker(), 90_000);
const trackerTimer = setInterval(() => void tracker(), TRACKER_INTERVAL_MS);

async function shutdown(signal: string) {
  console.log(`[DM Worker] ${signal} received, closing worker`);
  clearInterval(heartbeatTimer);
  clearInterval(pollTimer);
  clearInterval(radarTimer);
  clearInterval(trackerTimer);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
