/**
 * Crea el token de la extensión de setting para una cuenta de Instagram. Se imprime una vez; solo se guarda el hash.
 *
 *   ./tools/ops extension-token rodrigov.ia
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";

const username = process.argv[2];
const cuenta = await prisma.instagramAccount.findFirst({ where: { username }, select: { id: true, workspaceId: true } });
if (!cuenta) {
  console.error(`No encuentro la cuenta ${username}`);
  process.exit(1);
}
const token = randomBytes(32).toString("base64url");
await prisma.apiToken.create({
  data: { workspaceId: cuenta.workspaceId, instagramAccountId: cuenta.id, nombre: `extension ${username}`, tokenHash: createHash("sha256").update(token).digest("hex") },
});
console.log(token);
await prisma.$disconnect();
