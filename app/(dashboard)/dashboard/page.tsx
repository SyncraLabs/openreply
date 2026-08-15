/**
 * Panel — server component.
 *
 * Los datos se resuelven aquí, junto a la base de datos, y viajan dentro del
 * HTML. Antes era un componente cliente que pedía `/api/dashboard/stats` al
 * montar: HTML → descargar JS → hidratar → fetch → pintar. Desde España ese
 * fetch cuesta ~300 ms sólo de red, y era tiempo con la pantalla vacía.
 */

import { redirect } from "next/navigation";
import DashboardClient from "@/components/dashboard-client";
import { getCurrentUserId, getCurrentWorkspaceId } from "@/lib/auth";
import { getDashboardStats } from "@/lib/dashboard/stats";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) redirect("/login");

  const userId = await getCurrentUserId();
  const stats = await getDashboardStats(workspaceId, userId);

  return <DashboardClient initialStats={stats} />;
}
