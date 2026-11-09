import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { autenticarExtension, ESTADOS, usuarioValido } from "@/lib/extension/auth";

const noAutorizado = () => NextResponse.json({ error: "Token no válido" }, { status: 401 });

/** Ficha del lead más lo que RodriChat sabe de él por los comentarios. */
export async function GET(req: Request) {
  const ctx = await autenticarExtension(req);
  if (!ctx) return noAutorizado();
  const usuario = new URL(req.url).searchParams.get("usuario")?.toLowerCase() ?? "";
  if (!usuarioValido(usuario)) return NextResponse.json({ error: "Usuario no válido" }, { status: 400 });

  const [ficha, logs] = await Promise.all([
    prisma.leadCrm.findUnique({ where: { instagramAccountId_usuario: { instagramAccountId: ctx.instagramAccountId, usuario } } }),
    prisma.dmLog.findMany({
      where: { instagramAccountId: ctx.instagramAccountId, commenterName: { equals: usuario, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { commenterId: true, commentText: true, createdAt: true, status: true, automation: { select: { name: true } } },
    }),
  ]);
  const ids = [...new Set(logs.map((l) => l.commenterId))];
  const botones = ids.length
    ? await prisma.sequenceChoice.findMany({ where: { userId: { in: ids } }, orderBy: { updatedAt: "desc" }, take: 5, select: { branchName: true, qualified: true } })
    : [];
  return NextResponse.json({
    ficha,
    rodrichat: {
      comentarios: logs.map((l) => ({ campana: l.automation.name, comentario: l.commentText.slice(0, 140), fecha: l.createdAt, estado: l.status })),
      botones: botones.map((b) => ({ respuesta: b.branchName, cualificado: b.qualified })),
    },
  });
}

const cuerpo = z.object({
  usuario: z.string().trim().toLowerCase().refine(usuarioValido),
  nombre: z.string().trim().max(80).optional(),
  estado: z.enum(ESTADOS),
  etiquetas: z.array(z.string().trim().min(1).max(24)).max(8),
  nota: z.string().max(2000),
  seguimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export async function PUT(req: Request) {
  const ctx = await autenticarExtension(req);
  if (!ctx) return noAutorizado();
  const datos = cuerpo.safeParse(await req.json().catch(() => null));
  if (!datos.success) return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  const { usuario, seguimiento, ...resto } = datos.data;
  const valores = { ...resto, seguimiento: seguimiento ? new Date(`${seguimiento}T12:00:00Z`) : null };
  const ficha = await prisma.leadCrm.upsert({
    where: { instagramAccountId_usuario: { instagramAccountId: ctx.instagramAccountId, usuario } },
    create: { workspaceId: ctx.workspaceId, instagramAccountId: ctx.instagramAccountId, usuario, ...valores },
    update: valores,
  });
  return NextResponse.json({ ficha });
}
