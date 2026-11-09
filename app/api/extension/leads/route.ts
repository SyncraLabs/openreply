import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { autenticarExtension } from "@/lib/extension/auth";

/** Lista para los filtros del panel: por estado, por etiqueta o con seguimiento para hoy. */
export async function GET(req: Request) {
  const ctx = await autenticarExtension(req);
  if (!ctx) return NextResponse.json({ error: "Token no válido" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const filtro = (p.get("filtro") ?? "").slice(0, 40);
  const valor = (p.get("valor") ?? "").slice(0, 40);
  const finHoy = new Date();
  finHoy.setUTCHours(23, 59, 59, 999);
  const where =
    filtro === "estado" ? { estado: valor }
    : filtro === "etiqueta" ? { etiquetas: { has: valor } }
    : filtro === "hoy" ? { seguimiento: { lte: finHoy }, estado: { notIn: ["Cliente", "Perdido", "Curso"] } }
    : {};
  const leads = await prisma.leadCrm.findMany({
    where: { instagramAccountId: ctx.instagramAccountId, ...where },
    orderBy: filtro === "hoy" ? { seguimiento: "asc" } : { updatedAt: "desc" },
    take: 60,
    select: { usuario: true, nombre: true, estado: true, etiquetas: true, seguimiento: true, nota: true },
  });
  const etiquetas = await prisma.$queryRaw<{ etiqueta: string; n: bigint }[]>`
    SELECT unnest("etiquetas") AS etiqueta, COUNT(*) AS n FROM "LeadCrm"
    WHERE "instagramAccountId" = ${ctx.instagramAccountId} GROUP BY 1 ORDER BY 2 DESC LIMIT 20`;
  return NextResponse.json({ leads, etiquetas: etiquetas.map((e) => e.etiqueta) });
}
