/**
 * seed-dividas.ts
 * Sincroniza dívidas da MATRIZ (identity-matrix.ts) para BD (fracoes.obras_divida, etc.)
 * Só actualiza frações com dívida > 0 na Matriz.
 * Idempotente: pode correr múltiplas vezes sem efeitos secundários.
 *
 * Usage:
 *   bun scripts/seed-dividas.ts            — aplica (dry-run=false)
 *   bun scripts/seed-dividas.ts --dry-run  — mostra o que faria sem alterar BD
 */

import { db } from "../src/api/database";
import { sql } from "drizzle-orm";
import { MATRIZ_PROPRIEDADES } from "../src/api/lib/identity-matrix";

type DividasRow = {
  obras_divida: number | null;
  incendio_divida: number | null;
  indaqua_divida: number | null;
  motor_divida: number | null;
};

const isDryRun = process.argv.includes("--dry-run");

console.log("\n\x1b[35m╔══════════════════════════════════════════════════╗");
console.log("║   Seed Dívidas — Condomínio 7663               ║");
console.log("╚══════════════════════════════════════════════════╝\x1b[0m");
if (isDryRun) console.log("  \x1b[33m[DRY-RUN] Nenhuma alteração será feita.\x1b[0m\n");

// Frações com pelo menos uma dívida > 0 na Matriz
const comDividas = MATRIZ_PROPRIEDADES.filter(
  (f) =>
    f.dividasAtuais.obras > 0 ||
    f.dividasAtuais.incendio > 0 ||
    f.dividasAtuais.indaqua > 0 ||
    f.dividasAtuais.motor > 0
);

if (comDividas.length === 0) {
  console.log("  \x1b[32m✓ Nenhuma fração com dívidas na Matriz — BD já está actualizada.\x1b[0m\n");
  process.exit(0);
}

console.log(`  \x1b[36m→ ${comDividas.length} fração(ões) com dívidas na Matriz:\x1b[0m`);

async function main() {
  let updated = 0;
  let skipped = 0;

  for (const f of comDividas) {
    const { idFracao, dividasAtuais: d } = f;

    // Ler valores actuais em BD via raw SQL (await — libsql é async)
    // A coluna de identificação na BD é "numero" (ex: "L"), não "id_fracao"
    const bdRow = await db.get<DividasRow>(sql`
      SELECT obras_divida, incendio_divida, indaqua_divida, motor_divida
      FROM fracoes
      WHERE numero = ${idFracao}
      LIMIT 1
    `);

    if (!bdRow) {
      console.log(`  \x1b[31m✗ Fração ${idFracao} não encontrada na BD — ignorado\x1b[0m`);
      skipped++;
      continue;
    }

    const obras_bd    = parseFloat((bdRow.obras_divida    as any) ?? 0) || 0;
    const incendio_bd = parseFloat((bdRow.incendio_divida as any) ?? 0) || 0;
    const indaqua_bd  = parseFloat((bdRow.indaqua_divida  as any) ?? 0) || 0;
    const motor_bd    = parseFloat((bdRow.motor_divida    as any) ?? 0) || 0;

    const jaIgual =
      obras_bd    === d.obras    &&
      incendio_bd === d.incendio &&
      indaqua_bd  === d.indaqua  &&
      motor_bd    === d.motor;

    const linhaInfo = `obras=${d.obras} | incendio=${d.incendio} | indaqua=${d.indaqua} | motor=${d.motor}`;

    if (jaIgual) {
      console.log(`  \x1b[90m~ ${idFracao.padEnd(4)} já sincronizado — ${linhaInfo}\x1b[0m`);
      skipped++;
      continue;
    }

    console.log(`  \x1b[32m✓ ${idFracao.padEnd(4)} → ${linhaInfo}\x1b[0m`);
    console.log(`  \x1b[90m       BD antes: obras=${obras_bd} | incendio=${incendio_bd} | indaqua=${indaqua_bd} | motor=${motor_bd}\x1b[0m`);

    if (!isDryRun) {
      await db.run(sql`
        UPDATE fracoes
        SET obras_divida    = ${d.obras},
            incendio_divida = ${d.incendio},
            indaqua_divida  = ${d.indaqua},
            motor_divida    = ${d.motor}
        WHERE numero = ${idFracao}
      `);
    }

    updated++;
  }

  console.log(`\n\x1b[36m────────────────────────────────────────────────────\x1b[0m`);
  if (isDryRun) {
    console.log(`  \x1b[33m[DRY-RUN] ${updated} fração(ões) seriam actualizadas | ${skipped} já OK / não encontradas\x1b[0m`);
  } else {
    console.log(`  \x1b[32m✓ ${updated} fração(ões) actualizadas | ${skipped} já OK / não encontradas\x1b[0m`);
  }
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
