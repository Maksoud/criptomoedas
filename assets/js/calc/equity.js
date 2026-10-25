// Patrimônio e sua evolução por dia (gráfico da C1 e cards da A1).
// Evolução = saldo livre no fim de cada dia + quantidade de cada moeda × fechamento real do dia.

import { diaISO, somarDias } from '../utils/dates.js';
import { resumoBanca } from './bank.js';

/** Fechamento de cada dia (fuso local) a partir de velas: [{ dia, fechamento }]. */
export function serieDiaria(velas) {
  const porDia = new Map();
  for (const v of velas) porDia.set(diaISO(v.t), v.fechamento);
  return [...porDia.entries()].map(([dia, fechamento]) => ({ dia, fechamento }));
}

/** Patrimônio a mercado agora. */
export function patrimonioAtual(cliente, ordens, movimentos, precos) {
  return resumoBanca(cliente, ordens, movimentos, precos).patrimonio;
}

/**
 * Série diária do patrimônio de um cliente.
 * @param diarios { BTC: [{ dia, fechamento }], ... } (precos[moeda].diario)
 * @param de, ate 'AAAA-MM-DD'
 */
export function evolucaoPatrimonio({ clienteId, ordens, movimentos, diarios, de, ate }) {
  const eventos = [];
  for (const m of movimentos) {
    if (m.clienteId !== clienteId) continue;
    eventos.push({ t: +m.data, caixa: m.tipo === 'deposito' ? m.valor : -m.valor, aporte: m.tipo === 'deposito' ? m.valor : -m.valor });
  }
  for (const o of ordens) {
    if (o.clienteId !== clienteId || o.status !== 'executada') continue;
    const sinal = o.lado === 'compra' ? 1 : -1;
    eventos.push({
      t: +o.executadaEm,
      caixa: o.lado === 'compra' ? -(o.total + o.taxa) : o.total - o.taxa,
      moeda: o.moeda,
      qtd: sinal * o.quantidade,
      aporte: 0,
    });
  }
  eventos.sort((a, b) => a.t - b.t);

  const fechamento = {};
  for (const [moeda, serie] of Object.entries(diarios)) {
    fechamento[moeda] = new Map(serie.map((p) => [p.dia, p.fechamento]));
  }
  const ultimo = {};

  const serie = [];
  let saldo = 0;
  let aportado = 0;
  const qtd = {};
  let i = 0;
  for (let dia = de; dia <= ate; dia = somarDias(dia, 1)) {
    while (i < eventos.length && diaISO(eventos[i].t) <= dia) {
      const e = eventos[i++];
      saldo += e.caixa;
      aportado += e.aporte;
      if (e.moeda) qtd[e.moeda] = (qtd[e.moeda] ?? 0) + e.qtd;
    }
    for (const [moeda, mapa] of Object.entries(fechamento)) {
      const p = mapa.get(dia);
      if (p != null) ultimo[moeda] = p;
    }
    let emOperacao = 0;
    for (const [moeda, q] of Object.entries(qtd)) {
      if (Math.abs(q) < 1e-12 || ultimo[moeda] == null) continue;
      emOperacao += q * ultimo[moeda];
    }
    serie.push({ dia, saldoLivre: saldo, emOperacao, patrimonio: saldo + emOperacao, aportado });
  }
  return serie;
}
