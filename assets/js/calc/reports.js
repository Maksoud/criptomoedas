// Relatório de resultados (tela C4 / A5). Só operações fechadas entram no resultado:
// cada venda executada no intervalo, com o custo e a taxa proporcional da compra de origem.
//
//   lucro bruto = Σ (venda − custo da compra)
//   taxas       = Σ (taxa da venda + taxa proporcional da compra)
//   resultado   = lucro bruto − taxas

import { lucroDaVenda } from './positions.js';
import { diaISO, paraDiaISO } from '../utils/dates.js';

function noIntervalo(dia, inicio, fim) {
  return (!inicio || dia >= inicio) && (!fim || dia <= fim);
}

function blocoVazio() {
  return {
    compras: 0, volumeComprado: 0,
    vendas: 0, volumeVendido: 0,
    lucroBruto: 0, taxas: 0, resultado: 0,
  };
}

function somarLinha(bloco, l) {
  bloco.vendas++;
  bloco.volumeVendido += l.venda.total;
  bloco.lucroBruto += l.bruto;
  bloco.taxas += l.taxas;
  bloco.resultado += l.liquido;
}

/**
 * @param ordens  todas as ordens (precisa das compras de origem, mesmo fora do intervalo)
 * @param filtro  { clienteId, inicio, fim (Date ou 'AAAA-MM-DD', inclusive), moedas: [] }
 */
export function relatorio(ordens, { clienteId = null, inicio = null, fim = null, moedas = null } = {}) {
  const ini = inicio ? paraDiaISO(inicio) : null;
  const fi = fim ? paraDiaISO(fim) : null;
  const filtroMoedas = moedas && moedas.length ? new Set(moedas) : null;

  const porId = new Map();
  for (const o of ordens) porId.set(o.id, o);

  const total = blocoVazio();
  const porMoeda = {};
  const porDia = new Map();
  const linhas = [];
  let taxasPagas = 0;

  const bloco = (mapa, chave) => (mapa[chave] ??= blocoVazio());

  for (const o of ordens) {
    if (o.status !== 'executada') continue;
    if (clienteId && o.clienteId !== clienteId) continue;
    if (filtroMoedas && !filtroMoedas.has(o.moeda)) continue;
    const dia = diaISO(o.executadaEm);
    if (!noIntervalo(dia, ini, fi)) continue;

    taxasPagas += o.taxa ?? 0;

    if (o.lado === 'compra') {
      total.compras++;
      total.volumeComprado += o.total;
      const m = bloco(porMoeda, o.moeda);
      m.compras++;
      m.volumeComprado += o.total;
      continue;
    }

    const compra = porId.get(o.compraId);
    if (!compra) continue;
    const { custo, bruto, taxas, liquido } = lucroDaVenda(o, compra);
    const linha = { venda: o, compra, moeda: o.moeda, clienteId: o.clienteId, dia, custo, bruto, taxas, liquido };
    linhas.push(linha);
    somarLinha(total, linha);
    somarLinha(bloco(porMoeda, o.moeda), linha);
    if (!porDia.has(dia)) porDia.set(dia, { dia, ...blocoVazio() });
    somarLinha(porDia.get(dia), linha);
  }

  return {
    filtro: { clienteId, inicio: ini, fim: fi, moedas: filtroMoedas ? [...filtroMoedas] : null },
    ...total,
    taxasPagas,
    margemPct: total.volumeVendido > 0 ? (total.resultado / (total.volumeVendido - total.lucroBruto)) * 100 : 0,
    porMoeda,
    porDia: [...porDia.values()].sort((a, b) => (a.dia < b.dia ? -1 : 1)),
    linhas,
  };
}

/** Linhas do relatório em CSV (separador ;, decimal com vírgula, para abrir no Excel em pt-BR). */
export function relatorioCSV(rel) {
  const n = (v, c = 2) => v.toFixed(c).replace('.', ',');
  const cab = ['Data venda', 'Cliente', 'Moeda', 'Quantidade', 'Preço compra', 'Preço venda', 'Custo', 'Venda', 'Lucro bruto', 'Taxas', 'Resultado'];
  const linhas = rel.linhas.map((l) => [
    l.dia, l.clienteId, l.moeda, n(l.venda.quantidade, 8), n(l.compra.preco, 8), n(l.venda.preco, 8),
    n(l.custo), n(l.venda.total), n(l.bruto), n(l.taxas), n(l.liquido),
  ]);
  return [cab, ...linhas].map((cols) => cols.join(';')).join('\r\n');
}
