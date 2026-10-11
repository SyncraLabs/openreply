/**
 * Contactos
 *
 * Toda la gente que ha comentado y ha entrado en una campaña, agrupada por
 * persona en vez de por envío (que es lo que ya hace /logs).
 *
 * Nota sobre emails: la API de Instagram NO expone el correo de quien comenta,
 * así que aquí no hay ni puede haber esa columna. Lo que sí identifica a una
 * persona de forma estable es `commenterId` — el @ (`commenterName`) puede
 * cambiar cuando alguien se renombra la cuenta.
 */

import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { LANG_COOKIE, normalizeLang, translator } from "@/lib/i18n";

export const dynamic = "force-dynamic";



interface Contacto {
  commenterId: string;
  nombre: string | null;
  dms: number;
  enviados: number;
  campanas: Set<string>;
  posts: Set<string>;
  primero: Date;
  ultimo: Date;
  ultimoComentario: string;
  // Última respuesta al triaje (botón de rama de una secuencia), si la hay.
  triaje: { respuesta: string; cualificado: boolean } | null;
}

export default async function ContactosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [workspaceId, cookieStore, params] = await Promise.all([
    getCurrentWorkspaceId(),
    cookies(),
    searchParams,
  ]);
  const soloCualificados = params.filtro === "cualificados";
  const lang = normalizeLang(cookieStore.get(LANG_COOKIE)?.value);
  const t = translator(lang);
  const dateFmt = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  if (!workspaceId) {
    return (
      <p className="text-sm text-muted">
        No hay workspace activo. Vuelve a entrar.
      </p>
    );
  }

  // Un contacto puede tener decenas de filas en DmLog (una por comentario), así
  // que agrupamos en memoria. Con el volumen de una cuenta personal sobra; si
  // esto pasa de ~50k filas, hay que mover el group by a SQL.
  const logs = await prisma.dmLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: {
      commenterId: true,
      commenterName: true,
      commentText: true,
      status: true,
      createdAt: true,
      automation: { select: { name: true, postId: true } },
    },
  });

  // La respuesta más reciente de cada persona, en cualquier campaña.
  const respuestas = await prisma.sequenceChoice.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { userId: true, branchName: true, qualified: true },
  });
  const triajePorPersona = new Map<string, Contacto["triaje"]>();
  for (const r of respuestas) {
    if (!triajePorPersona.has(r.userId)) {
      triajePorPersona.set(r.userId, { respuesta: r.branchName, cualificado: r.qualified });
    }
  }

  const porPersona = new Map<string, Contacto>();
  for (const log of logs) {
    const previo = porPersona.get(log.commenterId);
    if (previo) {
      previo.dms += 1;
      if (log.status === "SENT") previo.enviados += 1;
      previo.campanas.add(log.automation.name);
      if (log.automation.postId) previo.posts.add(log.automation.postId);
      if (log.createdAt < previo.primero) previo.primero = log.createdAt;
      previo.nombre ??= log.commenterName;
      continue;
    }
    porPersona.set(log.commenterId, {
      commenterId: log.commenterId,
      nombre: log.commenterName,
      dms: 1,
      enviados: log.status === "SENT" ? 1 : 0,
      campanas: new Set([log.automation.name]),
      posts: new Set(log.automation.postId ? [log.automation.postId] : []),
      primero: log.createdAt,
      // logs viene ordenado desc, así que el primero que vemos es el más reciente.
      ultimo: log.createdAt,
      ultimoComentario: log.commentText,
      triaje: triajePorPersona.get(log.commenterId) ?? null,
    });
  }

  const todos = [...porPersona.values()].sort(
    (a, b) => b.ultimo.getTime() - a.ultimo.getTime()
  );
  const cualificados = todos.filter((c) => c.triaje?.cualificado).length;
  const contactos = soloCualificados
    ? todos.filter((c) => c.triaje?.cualificado)
    : todos;
  const recurrentes = todos.filter((c) => c.dms > 1).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("contacts.title")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t("contacts.subtitle")}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica etiqueta={t("contacts.people")} valor={todos.length} />
        <Metrica
          etiqueta={t("contacts.repeat")}
          valor={recurrentes}
          pie={t("contacts.repeatFoot")}
        />
        <Metrica
          etiqueta={t("contacts.delivered")}
          valor={todos.reduce((n, c) => n + c.enviados, 0)}
        />
        <Metrica
          etiqueta={t("contacts.qualified")}
          valor={cualificados}
          pie={t("contacts.qualifiedFoot")}
        />
      </div>

      <div className="flex gap-2 text-sm">
        <a
          href="/contactos"
          className={`rounded-full border px-3 py-1 ${soloCualificados ? "border-border text-muted hover:text-foreground" : "border-accent text-accent"}`}
        >
          {t("contacts.filterAll")}
        </a>
        <a
          href="/contactos?filtro=cualificados"
          className={`rounded-full border px-3 py-1 ${soloCualificados ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"}`}
        >
          {t("contacts.filterQualified")} ({cualificados})
        </a>
      </div>

      {contactos.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-sm text-muted">
            {soloCualificados ? t("contacts.emptyQualified") : t("contacts.empty")}
          </p>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t("contacts.account")}</th>
                <th className="px-4 py-3 font-medium">{t("contacts.dms")}</th>
                <th className="px-4 py-3 font-medium">{t("contacts.triage")}</th>
                <th className="px-4 py-3 font-medium">{t("contacts.campaigns")}</th>
                <th className="px-4 py-3 font-medium">{t("contacts.lastComment")}</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">{t("contacts.lastSeen")}</th>
              </tr>
            </thead>
            <tbody>
              {contactos.map((c) => (
                <tr
                  key={c.commenterId}
                  className="border-b border-border last:border-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3">
                    {c.nombre ? (
                      <a
                        href={`https://instagram.com/${c.nombre}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-accent hover:underline"
                      >
                        @{c.nombre}
                      </a>
                    ) : (
                      <span className="font-medium text-muted">
                        {t("contacts.noName")}
                      </span>
                    )}
                    <div className="font-mono text-xs text-muted">
                      {c.commenterId}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {c.enviados}
                    {c.dms !== c.enviados && (
                      <span className="text-muted"> / {c.dms}</span>
                    )}
                    {c.dms > 1 && (
                      <span className="ml-2 rounded-full bg-surface-hover px-2 py-0.5 text-xs text-muted">
                        {t("contacts.recurring")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {c.triaje ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${c.triaje.cualificado ? "bg-accent/10 text-accent" : "bg-surface-hover text-muted"}`}
                      >
                        {c.triaje.respuesta}
                      </span>
                    ) : (
                      <span className="text-muted">·</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {[...c.campanas].join(", ")}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-muted">
                    {c.ultimoComentario}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {dateFmt.format(c.ultimo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">
        {t("contacts.noEmail")}
      </p>
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  pie,
}: {
  etiqueta: string;
  valor: number;
  pie?: string;
}) {
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{etiqueta}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{valor}</div>
      {pie && <div className="mt-0.5 text-xs text-muted">{pie}</div>}
    </div>
  );
}
