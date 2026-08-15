import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, getCurrentWorkspaceId } from "@/lib/auth";
import { getDashboardStats } from "@/lib/dashboard/stats";

/**
 * Métricas del panel para el cliente.
 *
 * La consulta vive en lib/dashboard/stats para que la página pueda pintarse en
 * servidor sin pasar por HTTP. Esta ruta la usa el cliente al cambiar de
 * cuenta, que sí es una interacción y no la carga inicial.
 */
export async function GET(request: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const userId = await getCurrentUserId();
  const data = await getDashboardStats(
    workspaceId,
    userId,
    request.nextUrl.searchParams.get("instagramAccountId")
  );

  return NextResponse.json({ success: true, data });
}
