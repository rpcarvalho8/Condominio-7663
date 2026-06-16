/**
 * Bank Movements Route — /api/bank-movements
 * Parses Santander CSV exports and exposes auto-categorised movements.
 */

import { Hono } from "hono";
import { requireAdmin } from "../middleware/auth";
import { getCSVResults, getFracaoPaymentHistory, FRACOES_INFO, parseCSV } from "../lib/csv-bank-parser";
import { PORTAO_AMOUNTS } from "../lib/reconciliation-engine";

export const bankMovementsRoutes = new Hono()

  // GET /api/bank-movements — full parse result (with stats)
  .get("/", requireAdmin, async (c) => {
    try {
      const force = c.req.query("force") === "1";
      const { condominio, obras } = getCSVResults(force);

      const csvDisponivel = !!(condominio || obras);

      return c.json({
        ok: true,
        csvDisponivel,
        condominio: condominio ? {
          ficheiro: condominio.ficheiro,
          totalMovimentos: condominio.totalMovimentos,
          estatisticas: condominio.estatisticas,
        } : null,
        obras: obras ? {
          ficheiro: obras.ficheiro,
          totalMovimentos: obras.totalMovimentos,
          estatisticas: obras.estatisticas,
        } : null,
      });
    } catch (e: any) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  })

  // GET /api/bank-movements/condominio — all condomínio movements
  .get("/condominio", requireAdmin, async (c) => {
    try {
      const { condominio } = getCSVResults();
      if (!condominio) return c.json({ ok: false, error: "CSV condomínio não encontrado" }, 404);

      const categoria    = c.req.query("categoria");
      const fracao       = c.req.query("fracao");
      const source       = c.req.query("source"); // "csv" | "auto" | "unmatched"
      const tipo         = c.req.query("tipo");   // "Entrada" | "Saída"
      const page         = parseInt(c.req.query("page") ?? "1");
      const pageSize     = parseInt(c.req.query("pageSize") ?? "100");

      let movs = condominio.movimentos;
      if (categoria) movs = movs.filter(m => m.categoria === categoria);
      if (fracao)    movs = movs.filter(m => m.subCategoria === fracao || m.fracaoIdentificada === fracao);
      if (source)    movs = movs.filter(m => m.categoriaSource === source);
      if (tipo)      movs = movs.filter(m => m.tipo === tipo);

      const total = movs.length;
      const start = (page - 1) * pageSize;
      const paged = movs.slice(start, start + pageSize);

      return c.json({
        ok: true,
        total,
        page,
        pageSize,
        pages: Math.ceil(total / pageSize),
        movimentos: paged,
        estatisticas: condominio.estatisticas,
      });
    } catch (e: any) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  })

  // GET /api/bank-movements/obras — all obras movements
  .get("/obras", requireAdmin, async (c) => {
    try {
      const { obras } = getCSVResults();
      if (!obras) return c.json({ ok: false, error: "CSV obras não encontrado" }, 404);

      return c.json({
        ok: true,
        totalMovimentos: obras.totalMovimentos,
        movimentos: obras.movimentos,
        estatisticas: obras.estatisticas,
      });
    } catch (e: any) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  })

  // GET /api/bank-movements/nao-categorizados — unmatched payments only
  .get("/nao-categorizados", requireAdmin, async (c) => {
    try {
      const { condominio, obras } = getCSVResults();

      const condNaoCat = condominio?.estatisticas.pagamentosNaoIdentificados ?? [];
      const obrasNaoCat = obras?.estatisticas.pagamentosNaoIdentificados ?? [];

      const totalMontante = condNaoCat.reduce((s, m) => s + Math.abs(m.montante), 0);

      return c.json({
        ok: true,
        total: condNaoCat.length + obrasNaoCat.length,
        totalMontante: parseFloat(totalMontante.toFixed(2)),
        condominio: condNaoCat,
        obras: obrasNaoCat,
      });
    } catch (e: any) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  })

  // GET /api/bank-movements/fracao/:id — payment history for a specific fração
  .get("/fracao/:id", requireAdmin, async (c) => {
    try {
      const id = c.req.param("id").toUpperCase();
      const result = getFracaoPaymentHistory(id);
      return c.json({ ok: true, ...result });
    } catch (e: any) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  })

  // GET /api/bank-movements/resumo-fracoes — payment totals for all frações
  .get("/resumo-fracoes", requireAdmin, async (c) => {
    try {
      const { condominio } = getCSVResults();
      if (!condominio) return c.json({ ok: false, error: "CSV não encontrado" }, 404);

      const { porFracao } = condominio.estatisticas;

      const resumo = Object.entries(FRACOES_INFO).map(([fracao, info]) => ({
        fracao,
        nome: info.nome,
        tipo: info.tipo,
        permilage: info.permilage,
        totalPago: parseFloat((porFracao[fracao]?.total ?? 0).toFixed(2)),
        numPagamentos: porFracao[fracao]?.count ?? 0,
        identificadoNoBanco: !!(porFracao[fracao]?.count),
      })).sort((a, b) => b.totalPago - a.totalPago);

      return c.json({ ok: true, resumo });
    } catch (e: any) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  })

  // GET /api/bank-movements/categorias — expense summary by category
  .get("/categorias", requireAdmin, async (c) => {
    try {
      const { condominio, obras } = getCSVResults();

      const merge = (a: Record<string, { count: number; total: number }>, b: Record<string, { count: number; total: number }>) => {
        const res = { ...a };
        for (const [k, v] of Object.entries(b)) {
          if (res[k]) { res[k].count += v.count; res[k].total += v.total; }
          else res[k] = { ...v };
        }
        return res;
      };

      const condCat  = condominio?.estatisticas.porCategoria ?? {};
      const obrasCat = obras?.estatisticas.porCategoria ?? {};
      const merged   = merge(condCat, obrasCat);

      const categorias = Object.entries(merged)
        .map(([cat, s]) => ({ categoria: cat, count: s.count, total: parseFloat(s.total.toFixed(2)) }))
        .sort((a, b) => b.total - a.total);

      return c.json({ ok: true, categorias });
    } catch (e: any) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  })

  // GET /api/bank-movements/reconciliacao — reconciliation engine results
  // Shows which CSV movements were resolved and their confidence
  .get("/reconciliacao", requireAdmin, async (c) => {
    try {
      const { condominio } = getCSVResults();
      if (!condominio) return c.json({ ok: false, error: "CSV não encontrado" }, 404);

      const { movimentos, estatisticas } = condominio;

      // Categorisation source breakdown
      const bySource = { csv: 0, auto: 0, unmatched: 0 };
      for (const m of movimentos) {
        bySource[m.categoriaSource as "csv" | "auto" | "unmatched"] = (bySource[m.categoriaSource as "csv" | "auto" | "unmatched"] || 0) + 1;
      }

      // Per-fração payment totals from bank
      const bancoPorFracao = estatisticas.porFracao;

      // Portão payment status per fração
      const PORTAO_PAID: Record<string, boolean> = { AH: true, AI: true };
      const portaoStatus = Object.entries(PORTAO_AMOUNTS).map(([fracao, amount]) => {
        const isPaid = !!PORTAO_PAID[fracao];
        const pagamentos = movimentos.filter(m =>
          (m.subCategoria === fracao || m.fracaoIdentificada === fracao) &&
          m.categoria === "Quota-Extra" &&
          Math.abs(m.montante - amount) <= 0.05
        );
        return {
          fracao,
          nome: FRACOES_INFO[fracao]?.nome ?? fracao,
          amount,
          pago: isPaid || pagamentos.length > 0,
          pagamentos: pagamentos.map(p => ({ data: p.dataOperacao, montante: p.montante, desc: p.descritivo })),
        };
      }).sort((a, b) => (b.pago ? 1 : 0) - (a.pago ? 1 : 0) || a.amount - b.amount);

      // Auto-categorised entries summary
      const autoCatEntradas = movimentos
        .filter(m => m.categoriaSource === "auto" && m.tipo === "Entrada")
        .map(m => ({
          data: m.dataOperacao,
          descritivo: m.descritivo,
          montante: m.montante,
          categoria: m.categoria,
          subCategoria: m.subCategoria,
          nota: m.notaCategorizacao,
          fracao: m.fracaoIdentificada,
        }));

      return c.json({
        ok: true,
        resumo: {
          totalMovimentos: movimentos.length,
          porSource: bySource,
          percentagemCategorizado: parseFloat(
            (((bySource.csv + bySource.auto) / movimentos.length) * 100).toFixed(1)
          ),
          totalEntradas: estatisticas.entradas,
          categorizadosAuto: autoCatEntradas.length,
        },
        portaoStatus,
        autoCatEntradas: autoCatEntradas.slice(0, 200),
      });
    } catch (e: any) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  });
