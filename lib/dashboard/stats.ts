/**
 * Consulta de las métricas del panel.
 *
 * Vive aquí y no dentro de la ruta de API para que la página pueda pedirla
 * como server component, sin ida y vuelta HTTP. Desde España cada llamada al
 * API cuesta ~300 ms sólo de red, antes de que Postgres haga nada: pintar el
 * panel en servidor se ahorra ese viaje entero.
 *
 * La ruta `/api/dashboard/stats` sigue existiendo y llama a esta misma
 * función; la usa el cliente al cambiar de cuenta, que sí es interacción.
 */

import { prisma } from "@/lib/db/client";
import {
  calculateCtr,
  normalizeTopKeywords,
  summarizeDmStatuses,
} from "@/lib/tracking/analytics";

export async function getDashboardStats(
  workspaceId: string,
  userId: string | null,
  requestedInstagramAccountId?: string | null
) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const selectedAccountId =
    requestedInstagramAccountId && requestedInstagramAccountId !== "all"
      ? requestedInstagramAccountId
      : null;
  const accountFilter = selectedAccountId
    ? { instagramAccountId: selectedAccountId }
    : {};

  // Los 7 días del gráfico se piden en paralelo con el resto. Antes era un
  // bucle secuencial de 7 count(): siete idas y vueltas a Postgres en fila.
  const dayRanges = Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date(todayStart);
    dayStart.setDate(dayStart.getDate() - (6 - i));
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return { dayStart, dayEnd };
  });

  const [
    workspace,
    instagramAccount,
    instagramAccounts,
    totalAutomations,
    activeAutomations,
    dmsSentToday,
    dmsSentWeek,
    dmsSentMonth,
    totalDMs,
    dmStatusCountsThisMonth,
    clicksThisMonth,
    totalClicks,
    topKeywordRows,
    recentLogs,
    user,
    contactRows,
    dailyCounts,
  ] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, dmsSentThisPeriod: true },
    }),
    prisma.instagramAccount.findFirst({
      where: { workspaceId },
      orderBy: { connectedAt: "desc" },
      select: {
        id: true,
        username: true,
        instagramId: true,
        tokenExpiresAt: true,
        webhookSubscribed: true,
      },
    }),
    prisma.instagramAccount.findMany({
      where: { workspaceId },
      orderBy: { connectedAt: "desc" },
      select: {
        id: true,
        username: true,
        instagramId: true,
        name: true,
        tokenExpiresAt: true,
        webhookSubscribed: true,
      },
    }),
    prisma.automation.count({ where: { workspaceId, ...accountFilter } }),
    prisma.automation.count({
      where: { workspaceId, isActive: true, ...accountFilter },
    }),
    prisma.dmLog.count({
      where: {
        workspaceId,
        status: "SENT",
        createdAt: { gte: todayStart },
        ...accountFilter,
      },
    }),
    prisma.dmLog.count({
      where: {
        workspaceId,
        status: "SENT",
        createdAt: { gte: weekStart },
        ...accountFilter,
      },
    }),
    prisma.dmLog.count({
      where: {
        workspaceId,
        status: "SENT",
        createdAt: { gte: monthStart },
        ...accountFilter,
      },
    }),
    prisma.dmLog.count({
      where: { workspaceId, status: "SENT", ...accountFilter },
    }),
    prisma.dmLog.groupBy({
      by: ["status"],
      where: { workspaceId, createdAt: { gte: monthStart }, ...accountFilter },
      _count: { _all: true },
    }),
    prisma.linkClick.count({
      where: { workspaceId, createdAt: { gte: monthStart }, ...accountFilter },
    }),
    prisma.linkClick.count({ where: { workspaceId, ...accountFilter } }),
    prisma.dmLog.groupBy({
      by: ["matchedKeyword"],
      where: { workspaceId, matchedKeyword: { not: null }, ...accountFilter },
      _count: { _all: true },
    }),
    prisma.dmLog.findMany({
      where: { workspaceId, ...accountFilter },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        automation: { select: { name: true } },
        instagramAccount: { select: { username: true } },
      },
    }),
    userId
      ? prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        })
      : Promise.resolve(null),
    // Personas distintas que han interactuado, contadas como "contactos".
    prisma.dmLog.findMany({
      where: { workspaceId, ...accountFilter },
      distinct: ["commenterId"],
      select: { commenterId: true },
    }),
    Promise.all(
      dayRanges.map(({ dayStart, dayEnd }) =>
        prisma.dmLog.count({
          where: {
            workspaceId,
            status: "SENT",
            createdAt: { gte: dayStart, lt: dayEnd },
            ...accountFilter,
          },
        })
      )
    ),
  ]);

  const dailyDMs = dayRanges.map(({ dayStart }, i) => ({
    date: dayStart.toLocaleDateString("en-US", { weekday: "short" }),
    count: dailyCounts[i],
  }));

  const monthlyStatusSummary = summarizeDmStatuses(
    dmStatusCountsThisMonth.map((row) => ({
      status: row.status,
      _count: row._count._all,
    }))
  );
  const topKeywords = normalizeTopKeywords(
    topKeywordRows.map((row) => ({
      matchedKeyword: row.matchedKeyword,
      _count: row._count._all,
    }))
  );

  const firstName =
    user?.name?.trim().split(/\s+/)[0] || user?.email?.split("@")[0] || null;

  return {
    userName: firstName,
    contactsCount: contactRows.length,
    // Las fechas se serializan aquí y no en el borde: al pasar por JSON la
    // ruta de API ya las convertía a ISO, así que si el server component
    // devolviese `Date` el cliente recibiría dos formas distintas del mismo
    // dato según quién lo pidiera.
    recentLogs: recentLogs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
    workspace,
    instagramAccount,
    instagramAccounts,
    selectedInstagramAccountId: selectedAccountId,
    totalAutomations,
    activeAutomations,
    dmsSentToday,
    dmsSentWeek,
    dmsSentMonth,
    dmsSkippedMonth: monthlyStatusSummary.skipped,
    dmsFailedMonth: monthlyStatusSummary.failed,
    totalDMs,
    clicksThisMonth,
    totalClicks,
    ctrThisMonth: calculateCtr(clicksThisMonth, dmsSentMonth),
    topKeywords,
    dailyDMs,
  };
}

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;
