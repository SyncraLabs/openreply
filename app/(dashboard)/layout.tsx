import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard-shell";
import { LangProvider } from "@/components/lang-provider";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { LANG_COOKIE, normalizeLang } from "@/lib/i18n";
import { getRadarProvider } from "@/lib/radar/provider";
import { ensureWorkspaceForUser } from "@/lib/workspace";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const workspace = await ensureWorkspaceForUser(
    session.user.id,
    session.user.email
  );
  const [accounts, cookieStore] = await Promise.all([
    prisma.instagramAccount.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { connectedAt: "desc" },
      select: { username: true },
    }),
    cookies(),
  ]);
  const lang = normalizeLang(cookieStore.get(LANG_COOKIE)?.value);

  return (
    <LangProvider lang={lang}>
      <DashboardShell
        radarEnabled={getRadarProvider() !== null}
        workspaceName={workspace.name}
        instagramUsername={accounts[0]?.username ?? null}
        instagramAccountCount={accounts.length}
      >
        {children}
      </DashboardShell>
    </LangProvider>
  );
}
