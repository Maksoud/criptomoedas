// Períodos de apuração e comissão (PLANO_MVP.md §8.3).
//
// - O cliente fecha no dia 10, 20 ou 30. Em mês sem dia 30 (fevereiro), fecha no último dia.
// - Um período vai do dia seguinte ao fechamento anterior até o fechamento (inclusive).
//   O primeiro começa no início do contrato.
// - Resultado = lucro líquido das vendas executadas no período. Comissão = max(resultado, 0) × % / 100.
// - Vence `prazoPagamentoDias` depois do fechamento. Comissão 0,00 já nasce paga.

import { iso, partes, somarDias, ultimoDiaDoMes, proximoMes, mesAnterior, paraDiaISO, fimDoDia } from '../utils/dates.js';
import { arredondar } from '../utils/env.js';
import { relatorio } from './reports.js';

export const DIAS_FECHAMENTO = [10, 20, 30];
export const PRAZO_PADRAO = 5;

/** Dia de fechamento efetivo no mês (30 vira 28/29 em fevereiro). */
export function diaEfetivo(ano, mes, diaFechamento) {
  return Math.min(diaFechamento, ultimoDiaDoMes(ano, mes));
}

/** Data de fechamento do mês (AAAA-MM-DD). */
export function fechamentoDoMes(ano, mes, diaFechamento) {
  return iso(ano, mes, diaEfetivo(ano, mes, diaFechamento));
}

/** Fim do período que contém a data: se o dia ≤ fechamento, fecha neste mês; senão, no próximo. */
export function fimDoPeriodo(data, diaFechamento) {
  const [a, m, d] = partes(paraDiaISO(data));
  if (d <= diaEfetivo(a, m, diaFechamento)) return fechamentoDoMes(a, m, diaFechamento);
  const [a2, m2] = proximoMes(a, m);
  return fechamentoDoMes(a2, m2, diaFechamento);
}

/** Início natural do período que termina em `fim`: dia seguinte ao fechamento do mês anterior. */
export function inicioDoPeriodo(fim, diaFechamento) {
  const [a, m] = partes(fim);
  const [a0, m0] = mesAnterior(a, m);
  return somarDias(fechamentoDoMes(a0, m0, diaFechamento), 1);
}

/** Período (datas) que contém a data. `inicioContrato` limita o começo do primeiro. */
export function periodoDaData(data, diaFechamento, inicioContrato = null) {
  const fim = fimDoPeriodo(data, diaFechamento);
  let inicio = inicioDoPeriodo(fim, diaFechamento);
  if (inicioContrato && inicio < inicioContrato) inicio = inicioContrato;
  return { inicio, fim };
}

/**
 * Datas de todos os períodos desde o início do contrato até o período que contém `ate`.
 * `trocas` (opcional): [{ aPartirDe: 'AAAA-MM-DD', dia }] — troca de dia aplicada ao abrir o período seguinte.
 */
export function datasDosPeriodos({ inicioContrato, diaFechamento, ate, trocas = [] }) {
  const lista = [];
  let inicio = inicioContrato;
  let dia = diaFechamento;
  const limite = paraDiaISO(ate);
  while (inicio <= limite) {
    const troca = trocas.find((t) => t.aPartirDe === inicio);
    if (troca) dia = troca.dia;
    const fim = fimDoPeriodo(inicio, dia);
    lista.push({ inicio, fim, diaFechamento: dia });
    inicio = somarDias(fim, 1);
  }
  return lista;
}

export function vencimentoDe(fim, prazoDias = PRAZO_PADRAO) {
  return somarDias(fim, prazoDias);
}

export function calcularComissao(resultado, comissaoPct) {
  return arredondar((Math.max(resultado, 0) * comissaoPct) / 100);
}

/** Resultado (só operações fechadas) de um cliente entre duas datas, inclusive. */
export function resultadoDoPeriodo(ordens, clienteId, inicio, fim) {
  const rel = relatorio(ordens, { clienteId, inicio, fim });
  return { resultado: rel.resultado, operacoes: rel.vendas, lucroBruto: rel.lucroBruto, taxas: rel.taxas };
}

/** Números de um período: congelados se apurado; calculados ao vivo se aberto. */
export function numerosDoPeriodo(periodo, ordens, cliente) {
  if (periodo.status !== 'aberto') return periodo;
  const { resultado, operacoes } = resultadoDoPeriodo(ordens, periodo.clienteId, periodo.inicio, periodo.fim);
  const pct = cliente?.comissaoPct ?? periodo.comissaoPct ?? 0;
  return { ...periodo, resultado, operacoes, comissaoPct: pct, comissao: calcularComissao(resultado, pct), previsto: true };
}

/**
 * Apura (congela) um período. Devolve uma cópia com status 'apurado' — ou 'pago' se a comissão for 0.
 */
export function apurar(periodo, ordens, cliente, agora = new Date()) {
  const { resultado, operacoes } = resultadoDoPeriodo(ordens, periodo.clienteId, periodo.inicio, periodo.fim);
  const comissaoPct = cliente.comissaoPct;
  const comissao = calcularComissao(resultado, comissaoPct);
  const apuradoEm = new Date(agora);
  return {
    ...periodo,
    status: comissao === 0 ? 'pago' : 'apurado',
    resultado: arredondar(resultado),
    comissaoPct,
    comissao,
    operacoes,
    vencimento: vencimentoDe(periodo.fim, cliente.prazoPagamentoDias ?? PRAZO_PADRAO),
    apuradoEm,
    pagoEm: comissao === 0 ? apuradoEm : null,
  };
}

/** Um período apurado vence no fim do dia do vencimento. */
export function estaVencido(periodo, agora = new Date()) {
  return periodo.status === 'apurado' && agora > fimDoDia(periodo.vencimento);
}

/** Dias até o vencimento (negativo = atrasado). */
export function diasParaVencer(periodo, hoje) {
  const [a, m, d] = partes(periodo.vencimento);
  const [a2, m2, d2] = partes(paraDiaISO(hoje));
  return Math.round((new Date(a, m - 1, d) - new Date(a2, m2 - 1, d2)) / 86_400_000);
}
