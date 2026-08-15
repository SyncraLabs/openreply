import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { recogerHoy } from "@/lib/tracker/collect";

export const dynamic = "force-dynamic";

/** Todo opcional: se edita celda a celda, y null borra el valor. */
const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  youtube: z.number().int().nonnegative().nullable().optional(),
  instagram: z.number().int().nonnegative().nullable().optional(),
  tiktok: z.number().int().nonnegative().nullable().optional(),
  igSyncra: z.number().int().nonnegative().nullable().optional(),
  contenido: z.number().int().nonnegative().nullable().optional(),
  leads: z.number().int().nonnegative().nullable().optional(),
  llamadasReservadas: z.number().int().nonnegative().nullable().optional(),
  llamadasHechas: z.number().int().nonnegative().nullable().optional(),
  clientes: z.number().int().nonnegative().nullable().optional(),
  ingresos: z.number().nonnegative().nullable().optional(),
  mrr: z.number().nonnegative().nullable().optional(),
  gastoAds: z.number().nonnegative().nullable().optional(),
  notas: z.string().max(500).nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Datos inválidos", detail: parsed.error.issues },
      { status: 400 }
    );
  }

  const { date: fechaTexto, ...campos } = parsed.data;
  const date = new Date(`${fechaTexto}T00:00:00Z`);

  // Un campo escrito a mano deja de ser automático: si no, la siguiente
  // recogida lo pisaría y parecería que la edición no se guardó.
  const existente = await prisma.dailyMetric.findUnique({
    where: { workspaceId_date: { workspaceId, date } },
    select: { autoFields: true },
  });
  const tocados = Object.keys(campos);
  const autoFields = (existente?.autoFields ?? []).filter(
    (f) => !tocados.includes(f)
  );

  const fila = await prisma.dailyMetric.upsert({
    where: { workspaceId_date: { workspaceId, date } },
    create: { workspaceId, date, ...campos, autoFields: [] },
    update: { ...campos, autoFields },
  });

  return NextResponse.json({ success: true, data: fila });
}

/** Dispara la recogida automática a mano, desde el botón de la UI. */
export async function POST() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    return NextResponse.json({ success: true, data: await recogerHoy(workspaceId) });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error" },
      { status: 500 }
    );
  }
}
