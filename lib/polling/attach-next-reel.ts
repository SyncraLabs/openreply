/**
 * Ata las campañas "próximo reel" a un post real.
 *
 * Instagram no manda webhook cuando se publica algo nuevo, así que hay que
 * preguntar: por cada campaña esperando, se busca el reel más antiguo
 * publicado después de crearla y se le engancha.
 *
 * Vive aquí (y no sólo en la ruta de cron) porque el cron de Vercel en plan
 * gratis corre UNA vez al día: un reel podía tardar horas en activarse, justo
 * las horas en las que más tráfico tiene. El worker la llama cada pocos
 * minutos. La ruta de cron se mantiene como red de seguridad por si el worker
 * está caído.
 */

import { prisma } from "@/lib/db/client";
import { getUserMedia, type InstagramMedia } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";

export interface AttachResult {
  checked: number;
  bound: number;
  failedAccounts: number;
}

function isReel(media: InstagramMedia): boolean {
  return media.media_product_type === "REELS";
}

export async function attachPendingReels(): Promise<AttachResult> {
  const pending = await prisma.automation.findMany({
    where: { pendingNextReel: true },
    include: { instagramAccount: true },
  });

  if (pending.length === 0) {
    return { checked: 0, bound: 0, failedAccounts: 0 };
  }

  // Agrupado por cuenta para pedir el media de cada una una sola vez.
  const byAccount = new Map<
    string,
    {
      account: (typeof pending)[number]["instagramAccount"];
      automations: typeof pending;
    }
  >();
  for (const automation of pending) {
    const key = automation.instagramAccountId;
    const entry = byAccount.get(key);
    if (entry) entry.automations.push(automation);
    else
      byAccount.set(key, {
        account: automation.instagramAccount,
        automations: [automation],
      });
  }

  let bound = 0;
  let checked = 0;
  let failedAccounts = 0;

  for (const { account, automations } of byAccount.values()) {
    checked += automations.length;
    if (!account?.accessToken) continue;

    let reels: InstagramMedia[];
    try {
      const token = decryptToken(account.accessToken);
      const media = await getUserMedia(token, 25);
      reels = media
        .filter(isReel)
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
    } catch (err) {
      failedAccounts += 1;
      console.error("[attach-next-reel] media fetch failed", account.id, err);
      continue;
    }

    for (const automation of automations) {
      // El "próximo" reel = el más antiguo publicado después de crear la campaña.
      const nextReel = reels.find(
        (reel) => new Date(reel.timestamp) > automation.createdAt
      );
      if (!nextReel) continue;

      await prisma.automation.update({
        where: { id: automation.id },
        data: {
          postId: nextReel.id,
          postUrl: nextReel.permalink ?? null,
          pendingNextReel: false,
        },
      });
      bound += 1;
    }
  }

  return { checked, bound, failedAccounts };
}
