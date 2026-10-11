/**
 * Reintenta los DMs fallidos de una campaña (comentarios de menos de 7 días).
 *   ./tools/ops reintentar "<campaña>"        enseña cuántos y cuáles, sin tocar nada
 *   ./tools/ops reintentar "<campaña>" --go   los mete en la cola
 * La cola de turnos del worker los espacia (30-90 s entre DMs), así que salen
 * poco a poco aunque se encolen todos a la vez. La campaña tiene que estar activa.
 */
import { prisma } from "@/lib/db/client";
import { getDMQueue } from "@/lib/queue/client";
import { PERMANENT_FAILURE_WHERE } from "@/lib/queue/permanent-errors";

const [nombre, flag] = process.argv.slice(2);
if (!nombre) {
  console.error('Uso: ./tools/ops reintentar "<campaña>" [--go]');
  process.exit(1);
}

const a = await prisma.automation.findFirst({
  where: { OR: [{ id: nombre }, { name: nombre }] },
  include: { instagramAccount: { select: { instagramId: true } } },
});
if (!a) throw new Error(`No existe la campaña "${nombre}"`);
if (!a.postId) throw new Error("Solo vale para campañas de un post concreto (necesito el media id)");

// Instagram deja responder en privado hasta 7 días después del comentario;
// dejo medio día de margen.
const limite = new Date(Date.now() - 6.5 * 864e5);
const fallidos = await prisma.dmLog.findMany({
  where: {
    automationId: a.id,
    status: "FAILED",
    createdAt: { gt: limite },
    NOT: PERMANENT_FAILURE_WHERE,
    commentId: { not: { contains: ":" } }, // solo comentarios, no toques ni DMs
  },
  orderBy: { createdAt: "asc" },
});

console.log(`${a.name} (${a.isActive ? "ACTIVA" : "PAUSADA"}): ${fallidos.length} fallidos reintentables`);
for (const l of fallidos.slice(0, 10)) console.log(`  @${l.commenterName ?? "?"}: ${l.commentText.slice(0, 30)} | ${l.errorMessage?.slice(0, 60)}`);
if (fallidos.length > 10) console.log(`  … y ${fallidos.length - 10} más`);

if (flag !== "--go") {
  console.log('\nNo he encolado nada. Añade --go para hacerlo.');
} else if (!a.isActive) {
  console.log("\nLa campaña está pausada: actívala primero o el worker los descartará.");
} else {
  const queue = getDMQueue();
  for (const l of fallidos) {
    await queue.add(
      "process-comment",
      {
        instagramAccountId: a.instagramAccount.instagramId,
        commentId: l.commentId,
        commentText: l.commentText,
        commenterId: l.commenterId,
        commenterName: l.commenterName ?? undefined,
        mediaId: a.postId,
        source: "POLLING",
      },
      { jobId: `retry_${l.commentId}_${Date.now()}` }
    );
  }
  console.log(`\nEncolados ${fallidos.length}. Salen espaciados por la cola de turnos.`);
  await queue.close();
}
await prisma.$disconnect();
process.exit(0);
