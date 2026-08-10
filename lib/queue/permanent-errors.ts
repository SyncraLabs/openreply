/**
 * Fallos de Meta que NO tiene sentido reintentar.
 *
 * El reconciliador vuelve a encolar cada comentario del periodo de lookback
 * (72 h por defecto) en cada barrido. Si un envío falló por algo permanente,
 * eso significa reintentarlo cada 5 minutos durante tres días: cientos de
 * errores idénticos en Diagnóstico y llamadas quemadas contra la API.
 *
 * Un private reply puede ser inválido de forma definitiva porque el
 * comentario es respuesta a otro comentario (Meta sólo permite responder en
 * privado a comentarios de primer nivel), porque ya se gastó el único private
 * reply que Meta concede por comentario, porque el comentario se borró, o
 * porque pasó la ventana de 7 días. Ninguna de esas cambia esperando.
 */

const PERMANENT_PATTERNS = [
  "invalid for a private reply",
  "comment is not available",
  "does not exist",
  "unsupported request",
  "outside the allowed window",
];

export function isPermanentSendFailure(
  errorMessage: string | null | undefined
): boolean {
  if (!errorMessage) return false;
  const normalizado = errorMessage.toLowerCase();
  return PERMANENT_PATTERNS.some((p) => normalizado.includes(p));
}

/**
 * Fragmento de `where` de Prisma que reconoce esos fallos en DmLog.
 * Se combina con la condición de "ya completado" del reconciliador.
 */
export const PERMANENT_FAILURE_WHERE = {
  status: "FAILED" as const,
  OR: PERMANENT_PATTERNS.map((p) => ({
    errorMessage: { contains: p, mode: "insensitive" as const },
  })),
};
