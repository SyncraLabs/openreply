import { NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { refreshRadar } from "@/lib/radar/refresh";

export const dynamic = "force-dynamic";
// Bajar 24 posts de varias cuentas contra un proveedor externo no cabe en el
// límite por defecto de una función serverless.
export const maxDuration = 60;

/** Refresco manual desde la UI. El worker lo hace solo cada pocas horas. */
export async function POST() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ success: false, error: "No workspace" }, { status: 401 });
  }

  try {
    const data = await refreshRadar(workspaceId);
    if (data.skipped) {
      return NextResponse.json(
        { success: false, error: "Falta APIFY_TOKEN en el entorno" },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ success: false, error: mensaje }, { status: 500 });
  }
}
