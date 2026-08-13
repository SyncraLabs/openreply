/**
 * db-ping — diagnostica la conexión a Postgres y Redis sin imprimir credenciales.
 *
 * Dice a qué host se está intentando conectar, si el TCP abre, y qué contesta
 * Postgres. Sirve para distinguir "está caído" de "la URL es la interna de
 * Railway" de "las credenciales han cambiado".
 */
import net from "node:net";

function partes(nombre: string) {
  const bruta = process.env[nombre];
  if (!bruta) return null;
  try {
    const u = new URL(bruta);
    return {
      host: u.hostname,
      port: Number(u.port) || (u.protocol === "postgresql:" ? 5432 : 6379),
      db: u.pathname.replace(/^\//, "") || "(sin db)",
      user: u.username || "(sin usuario)",
      interna: u.hostname.endsWith(".railway.internal"),
    };
  } catch {
    return { host: "(URL ilegible)", port: 0, db: "", user: "", interna: false };
  }
}

function tcp(host: string, port: number, ms = 8000): Promise<string> {
  return new Promise((resolve) => {
    const s = new net.Socket();
    const fin = (r: string) => {
      s.destroy();
      resolve(r);
    };
    s.setTimeout(ms);
    s.once("connect", () => fin("abre"));
    s.once("timeout", () => fin(`timeout (${ms} ms)`));
    s.once("error", (e: NodeJS.ErrnoException) => fin(`${e.code ?? e.message}`));
    s.connect(port, host);
  });
}

for (const nombre of ["DATABASE_URL", "REDIS_URL"]) {
  const p = partes(nombre);
  console.log("─".repeat(60));
  if (!p) {
    console.log(`${nombre}  ✗ no está definida en .env.ops`);
    continue;
  }
  console.log(`${nombre}  ${p.host}:${p.port}  db=${p.db}  user=${p.user}`);
  if (p.interna) {
    console.log("  ⚠ es la URL INTERNA de Railway. Solo resuelve dentro de Railway.");
    console.log("    Usa la pública (*.proxy.rlwy.net) en .env.ops.");
    continue;
  }
  console.log(`  tcp   ${await tcp(p.host, p.port)}`);
}

console.log("─".repeat(60));

// Conexión cruda con `pg`: da el error del servidor tal cual, sin que Prisma
// lo traduzca a un código genérico.
try {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await c.connect();
  const r = await c.query("select current_user, current_database()");
  console.log(`pg crudo  conecta  ${JSON.stringify(r.rows[0])}`);
  await c.end();
} catch (e: unknown) {
  const err = e as { code?: string; severity?: string; message?: string };
  console.log(`pg crudo  ✗ code=${err.code ?? "-"} severity=${err.severity ?? "-"} ${err.message ?? String(e)}`);
}

console.log("─".repeat(60));

// Consulta real a Postgres: distingue "el puerto abre" de "la base responde".
try {
  const { prisma } = await import("../lib/db/client.js");
  const r = await prisma.$queryRawUnsafe<Array<{ ok: number }>>("SELECT 1 as ok");
  console.log(`postgres  responde  (SELECT 1 -> ${r[0]?.ok})`);
  await prisma.$disconnect();
} catch (e: unknown) {
  const err = e as { code?: string; message?: string; meta?: unknown };
  console.log(`postgres  ✗ ${err.code ?? ""} ${String(err.message ?? e).split("\n").filter(Boolean).slice(-3).join(" | ")}`);
  if (err.meta) console.log(`  meta  ${JSON.stringify(err.meta)}`);
  if (err.code === "P1017") {
    console.log("          El servidor cerró la conexión. Normalmente el servicio de");
    console.log("          Postgres en Railway está parado, dormido o sin créditos.");
  }
  if (err.code === "P1001") {
    console.log("          No se llega al host. Servicio caído o URL equivocada.");
  }
  if (err.code === "P1000") {
    console.log("          Credenciales rechazadas. Railway ha rotado la contraseña:");
    console.log("          cópiala otra vez a .env.ops desde el panel del servicio.");
  }
}
