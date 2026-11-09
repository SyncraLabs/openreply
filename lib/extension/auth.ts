import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/client";

export type ExtensionContext = { workspaceId: string; instagramAccountId: string };

/** La extensión manda `Authorization: Bearer <token>`. Solo se guarda el hash del token. */
export async function autenticarExtension(req: Request): Promise<ExtensionContext | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,80})$/)?.[1];
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const fila = await prisma.apiToken.findUnique({ where: { tokenHash }, select: { workspaceId: true, instagramAccountId: true } });
  return fila;
}

export const ESTADOS = ["Hablando", "Potencial", "Llamada propuesta", "Agendado", "Cliente", "Curso", "Syncra", "Perdido"] as const;

export const usuarioValido = (u: string) => /^[a-z0-9._]{1,30}$/.test(u);
