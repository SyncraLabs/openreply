import { NextRequest, NextResponse } from "next/server";
import { attachPendingReels } from "@/lib/polling/attach-next-reel";

/**
 * Red de seguridad diaria del enganche "próximo reel".
 *
 * La lógica vive en lib/polling/attach-next-reel y la ejecuta el worker cada
 * pocos minutos, que es lo que hace falta para que un reel se active mientras
 * todavía tiene tráfico. Esta ruta se mantiene para el cron de Vercel: si el
 * worker está caído, al menos las campañas se enganchan una vez al día.
 */

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const data = await attachPendingReels();
  return NextResponse.json({ success: true, data });
}
