import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  // Se acepta tanto "@rodrigov.ia" como una URL de perfil pegada tal cual:
  // es lo que la gente copia del navegador.
  username: z.string().min(1).max(100),
  niche: z.string().max(60).optional().nullable(),
});

/** "@x", "instagram.com/x/", "https://www.instagram.com/x?hl=es" -> "x" */
export function normalizeUsername(entrada: string): string {
  let v = entrada.trim();
  const m = v.match(/instagram\.com\/([^/?#]+)/i);
  if (m) v = m[1];
  return v.replace(/^@/, "").replace(/\/+$/, "").toLowerCase();
}

export async function GET() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "No workspace" }, { status: 401 });
  }

  const accounts = await prisma.radarAccount.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { posts: true } } },
  });

  return NextResponse.json({ success: true, data: accounts });
}

export async function POST(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "No workspace" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Datos inválidos" }, { status: 400 });
  }

  const username = normalizeUsername(parsed.data.username);
  if (!username) {
    return NextResponse.json({ success: false, error: "Usuario vacío" }, { status: 400 });
  }

  const account = await prisma.radarAccount.upsert({
    where: { workspaceId_username: { workspaceId, username } },
    create: { workspaceId, username, niche: parsed.data.niche ?? null },
    update: { isActive: true, niche: parsed.data.niche ?? undefined },
  });

  return NextResponse.json({ success: true, data: account });
}

export async function DELETE(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "No workspace" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Falta id" }, { status: 400 });
  }

  // deleteMany y no delete: filtra por workspace, así un id de otro workspace
  // no borra nada en vez de lanzar.
  const { count } = await prisma.radarAccount.deleteMany({ where: { id, workspaceId } });
  return NextResponse.json({ success: count > 0 });
}
