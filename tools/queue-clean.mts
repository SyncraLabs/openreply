import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const q = new Queue("dm-processing", { connection });

console.log("antes:", await q.getJobCounts());

// Los fallidos y los retrasados de este comentario no se pueden recuperar:
// Meta ya dijo que el private reply es invalido, y eso no cambia esperando.
let borrados = 0;
for (const j of [...(await q.getFailed(0, 99)), ...(await q.getDelayed(0, 99))]) {
  const razon = `${j.failedReason ?? ""}`.toLowerCase();
  const pendiente = j.failedReason == null;
  if (razon.includes("invalid for a private reply") || pendiente) {
    await j.remove();
    borrados += 1;
  }
}
console.log(`jobs eliminados: ${borrados}`);
console.log("después:", await q.getJobCounts());

await q.close();
await connection.quit();
