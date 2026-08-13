import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const q = new Queue("dm-processing", { connection });

const fallidos = await q.getFailed(0, 9);
console.log(`jobs fallidos: ${fallidos.length}`);
for (const j of fallidos) {
  console.log(`\n job ${j.id}  intentos=${j.attemptsMade}`);
  console.log(`   data: ${JSON.stringify(j.data).slice(0, 220)}`);
  console.log(`   razón: ${(j.failedReason ?? "").slice(0, 80)}`);
}

const counts = await q.getJobCounts();
console.log("\nestado de la cola:", counts);

await q.close();
await connection.quit();
