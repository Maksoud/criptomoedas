// Ajustes e ações do admin salvos no navegador (localStorage, com fallback em memória).
//
// - Ajustes (sempre reaplicados): campos das moedas e dos clientes que o admin mudou. Só a diferença
//   para o que o gerador produziu fica salva, então um ajuste desfeito some da lista.
// - Ações (reaplicadas só no mesmo dia do histórico, porque os ids das ordens e dos períodos gerados
//   mudam de um dia para outro): depósitos e saques, comissões pagas, ordens canceladas e o log.
// Apurações manuais e vencimentos forçados não são refeitos: a apuração automática cuida das datas.
// Configuração geral e regras de alerta já são salvas pelo store (chaves 'config' e 'regrasAlerta').

import { getState, on } from '../store.js';
import * as persist from '../persist.js';
import { diaISO } from '../utils/dates.js';
import { estaProgramada } from '../calc/positions.js';

export const CAMPOS_MOEDA = ['ativa', 'travaCompras', 'estrategia', 'params', 'confirmacao'];
export const CAMPOS_CLIENTE = ['status', 'travaCompras', 'reservaPct', 'valorOrdem', 'comissaoPct', 'diaFechamentoProximo', 'prazoPagamentoDias', 'moedas'];
const MAX_LOG = 300;

let base = null;   // campos como o gerador produziu
let dia = null;    // dia do histórico (as ações só valem nele)
let acoes = { dia: null, movimentos: [], pagos: [], canceladas: [], log: [] };
let ligado = false;

const copiar = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const mesmo = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function fotografar(colecao, campos) {
  const saida = {};
  for (const [id, item] of Object.entries(colecao)) {
    saida[id] = {};
    for (const c of campos) saida[id][c] = copiar(item[c]);
  }
  return saida;
}

function diferenca(colecao, campos) {
  const saida = {};
  for (const [id, item] of Object.entries(colecao)) {
    const b = base?.[campos === CAMPOS_MOEDA ? 'moedas' : 'clientes']?.[id];
    if (!b) continue;
    const dif = {};
    for (const c of campos) if (!mesmo(item[c], b[c])) dif[c] = copiar(item[c]);
    if (Object.keys(dif).length) saida[id] = dif;
  }
  return saida;
}

function salvarAjustes() {
  if (!ligado || !base) return;
  const s = getState();
  persist.set('ajustes', { moedas: diferenca(s.moedas, CAMPOS_MOEDA), clientes: diferenca(s.clientes, CAMPOS_CLIENTE) });
}

function salvarAcoes() {
  if (!ligado) return;
  persist.set('acoesAdmin', acoes);
}

/**
 * Antes de carregar no store: guarda a base, reaplica os ajustes e as ações do mesmo dia.
 * @param dados saída de gerarDados (é alterada no lugar)
 */
export function aplicarAjustes(dados) {
  ligado = false;
  base = { moedas: fotografar(dados.moedas, CAMPOS_MOEDA), clientes: fotografar(dados.clientes, CAMPOS_CLIENTE) };
  dia = diaISO(dados.agora ?? new Date());

  const ajustes = persist.get('ajustes') ?? {};
  for (const [simbolo, campos] of Object.entries(ajustes.moedas ?? {})) {
    const m = dados.moedas[simbolo];
    if (!m) continue;
    for (const c of CAMPOS_MOEDA) if (c in campos) m[c] = copiar(campos[c]);
  }
  for (const [id, campos] of Object.entries(ajustes.clientes ?? {})) {
    const cl = dados.clientes[id];
    if (!cl) continue;
    for (const c of CAMPOS_CLIENTE) if (c in campos) cl[c] = copiar(campos[c]);
    cl.moedas = (cl.moedas ?? []).filter((x) => dados.moedas[x]);
  }

  const salvas = persist.get('acoesAdmin');
  acoes = salvas?.dia === dia
    ? { dia, movimentos: salvas.movimentos ?? [], pagos: salvas.pagos ?? [], canceladas: salvas.canceladas ?? [], log: salvas.log ?? [] }
    : { dia, movimentos: [], pagos: [], canceladas: [], log: [] };

  for (const m of acoes.movimentos) {
    if (!dados.clientes[m.clienteId] || dados.movimentos.some((x) => x.id === m.id)) continue;
    dados.movimentos.push({ ...m, data: new Date(m.data) });
  }

  const porId = new Map(dados.ordens.map((o) => [o.id, o]));
  for (const c of acoes.canceladas) {
    const o = porId.get(c.ordemId);
    if (!o || !estaProgramada(o)) continue;
    Object.assign(o, { status: 'cancelada', canceladaPor: 'admin', canceladaEm: new Date(c.em), motivoCancelamento: c.motivo ?? null });
    if (o.lado === 'venda') {
      const compra = porId.get(o.compraId);
      if (compra) compra.alvo = null;
    }
  }

  for (const pg of acoes.pagos) {
    const p = dados.periodos.find((x) => x.id === pg.periodoId);
    if (!p || (p.status !== 'apurado' && p.status !== 'vencido')) continue;
    p.status = 'pago';
    p.pagoEm = new Date(pg.em);
    const cl = dados.clientes[p.clienteId];
    if (cl && !dados.periodos.some((x) => x.clienteId === cl.id && x.status === 'vencido')) cl.travaPorComissao = false;
  }

  if (acoes.log.length) {
    dados.logAdmin = [...(dados.logAdmin ?? []), ...acoes.log.map((l) => ({ ...l, data: new Date(l.data) }))]
      .sort((a, b) => a.data - b.data);
  }
}

/** Liga a gravação (depois do data:ready). Chamado uma vez, pelo main.js. */
export function iniciarAjustes() {
  on('data:ready', () => { ligado = true; });
  on('coin:change', salvarAjustes);
  on('client:change', salvarAjustes);
  on('cash:new', (m) => {
    acoes.movimentos.push({ ...m });
    salvarAcoes();
  });
  on('commission:paid', (p) => {
    acoes.pagos.push({ periodoId: p.id, em: p.pagoEm });
    salvarAcoes();
  });
  on('order:canceled', (o) => {
    if (o.canceladaPor !== 'admin' || o.origem !== 'historico') return;
    acoes.canceladas.push({ ordemId: o.id, em: o.canceladaEm, motivo: o.motivoCancelamento });
    salvarAcoes();
  });
  on('log:new', (l) => {
    if (!ligado) return;
    acoes.log.push({ ...l });
    if (acoes.log.length > MAX_LOG) acoes.log.splice(0, acoes.log.length - MAX_LOG);
    salvarAcoes();
  });
}

/** "Restaurar dados": esquece ajustes e ações. */
export function esquecerAjustes() {
  ligado = false;
  persist.remove('ajustes');
  persist.remove('acoesAdmin');
  acoes = { dia, movimentos: [], pagos: [], canceladas: [], log: [] };
}
