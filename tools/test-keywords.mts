/**
 * Comprueba contra qué comentarios reales dispara un juego de palabras clave.
 *
 *   cd ~/openreply && ./tools/ops test-keywords
 *
 * Existe por una trampa con los acentos: `stripSpecialCharacters` convierte cualquier
 * carácter fuera de [A-Za-z0-9_] en espacio, y lo hace tanto en el comentario como en
 * la palabra clave. Así que "código" acaba siendo "c digo" en ambos lados y casan entre
 * sí, pero NO casan con "codigo" sin tilde, que es como escribe la mayoría.
 *
 * Regla: toda palabra clave con acento se guarda en las DOS formas.
 * Solo lectura, no toca la base.
 */
import { matchKeywords } from "../lib/utils/keyword-matcher.js";
const casos = ["código", "codigo", "CODIGO", "quiero el codigo", "código porfa", "Codigoo"];
for (const kws of [["CÓDIGO"], ["CODIGO"], ["CODIGO", "CÓDIGO"]]) {
  console.log(`\nkeywords = ${JSON.stringify(kws)}`);
  for (const c of casos) {
    const r = matchKeywords(c, kws, true);
    console.log(`   "${c}"  ->  ${r.matched ? "SÍ" : "no"}`);
  }
}
