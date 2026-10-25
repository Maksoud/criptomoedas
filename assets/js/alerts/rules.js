// Regras de alerta (docs/ESTRATEGIAS.md §6). Cada regra tem: ligada, limites, escopo, canais, quem vê,
// ação automática e silêncio (cooldown). Este módulo observa preços, ordens, saldos, períodos e os
// eventos do motor, e grava os alertas no store (`adicionarAlerta` → `alert:new`).
//
// O mesmo alerta para a mesma moeda/cliente não repete dentro do silêncio da regra. Ações automáticas
// sempre ficam no log do admin.

import * as store from '../store.js';
import { getState, on, setState } from '../store.js';
import * as persist from '../persist.js';
import { resumoBanca } from '../calc/bank.js';
import { posicoesAbertas, lucroDaVenda } from '../calc/positions.js';
import { diasParaVencer } from '../calc/commission.js';
import { diaISO, MS_MIN } from '../utils/dates.js';
import { usdt, preco as fp, pctSimples, qtd, data, intervalo, plural } from '../utils/format.js';

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export const ACOES = {
  nenhuma: 'Nenhuma',
  'travar-moeda': 'Travar compras da moeda',
  'travar-cliente': 'Travar compras do cliente',
  'pausar-robo': 'Pausar o robô',
};

const base = (r) => ({
  ligada: true,
  limites: {},
  limitesDef: [],
  escopo: { moedas: 'todas', clientes: 'todos' },
  canais: { toast: true, som: false, navegador: false },
  visivel: { admin: true, cliente: false },
  acaoAutomatica: 'nenhuma',
  acoesPossiveis: ['nenhuma'],
  acaoFixa: null,
  cooldownMin: 10,
  ...r,
});

export const REGRAS = [
  base({ id: 'variacao-brusca', nome: 'Variação brusca', severidade: 'atencao',
    descricao: 'Preço varia mais que X% em Y minutos.',
    limites: { pct: 3, minutos: 15 },
    limitesDef: [{ chave: 'pct', rotulo: 'Variação', sufixo: '%' }, { chave: 'minutos', rotulo: 'Em', sufixo: 'min' }],
    canais: { toast: true, som: true, navegador: true },
    acoesPossiveis: ['nenhuma', 'travar-moeda'] }),
  base({ id: 'preco-alvo', nome: 'Preço alvo', severidade: 'info',
    descricao: 'Preço cruza um valor definido pelo admin.',
    limites: { alvos: [] },
    limitesDef: [{ chave: 'alvos', rotulo: 'Alvos', tipo: 'lista' }],
    cooldownMin: 1 }),
  base({ id: 'reserva-banca', nome: 'Reserva de banca atingida', severidade: 'atencao',
    descricao: 'Compra bloqueada por falta de disponível para operar.',
    visivel: { admin: true, cliente: true } }),
  base({ id: 'uso-banca', nome: 'Uso da banca alto', severidade: 'atencao',
    descricao: 'Em operação mais programado ≥ X% do caixa operável.',
    limites: { pct: 80 },
    limitesDef: [{ chave: 'pct', rotulo: 'Uso', sufixo: '%' }],
    acoesPossiveis: ['nenhuma', 'travar-cliente'], cooldownMin: 30 }),
  base({ id: 'posicao-queda', nome: 'Posição em queda', severidade: 'atencao',
    descricao: 'Posição aberta cai X% abaixo do preço de compra.',
    limites: { pct: 5 },
    limitesDef: [{ chave: 'pct', rotulo: 'Queda', sufixo: '%' }],
    visivel: { admin: true, cliente: true }, cooldownMin: 30 }),
  base({ id: 'venda-bloqueada', nome: 'Venda bloqueada por lucro mínimo', severidade: 'info',
    descricao: 'Sinal de venda ignorado porque o lucro mínimo não estava garantido.',
    canais: { toast: false, som: false, navegador: false } }),
  base({ id: 'posicao-sem-alvo', nome: 'Posição sem alvo', severidade: 'atencao',
    descricao: 'Venda programada cancelada e nenhum alvo novo há X minutos.',
    limites: { minutos: 10 },
    limitesDef: [{ chave: 'minutos', rotulo: 'Há', sufixo: 'min' }],
    cooldownMin: 60 }),
  base({ id: 'canal', nome: 'Canal confirmado / rompimento', severidade: 'info',
    descricao: 'A estratégia de canal confirmou um canal ou o preço rompeu as bordas.',
    acaoFixa: 'conforme a estratégia', cooldownMin: 5 }),
  base({ id: 'ordem-executada', nome: 'Ordem executada', severidade: 'info',
    descricao: 'Compra ou venda executada.',
    visivel: { admin: false, cliente: true }, cooldownMin: 0 }),
  base({ id: 'fechamento-periodo', nome: 'Fechamento de período', severidade: 'info',
    descricao: 'Período de apuração foi apurado.',
    visivel: { admin: true, cliente: true }, cooldownMin: 0 }),
  base({ id: 'comissao-a-vencer', nome: 'Comissão a vencer', severidade: 'atencao',
    descricao: 'Faltam X dias para o vencimento e a comissão não foi paga.',
    limites: { dias: 2 },
    limitesDef: [{ chave: 'dias', rotulo: 'Faltando', sufixo: 'dias' }],
    visivel: { admin: true, cliente: true }, cooldownMin: 0 }),
  base({ id: 'comissao-vencida', nome: 'Comissão vencida', severidade: 'critico',
    descricao: 'Prazo de pagamento passou sem pagamento. As novas compras do cliente ficam suspensas.',
    canais: { toast: true, som: true, navegador: true },
    visivel: { admin: true, cliente: true },
    acaoAutomatica: 'travar-cliente', acoesPossiveis: ['travar-cliente'], acaoFixa: 'travar-cliente', cooldownMin: 0 }),
  base({ id: 'conexao', nome: 'Conexão com a Binance', severidade: 'atencao',
    descricao: 'Cotações caíram para o modo simulado ou voltaram ao vivo.',
    acoesPossiveis: ['nenhuma', 'pausar-robo'], cooldownMin: 1 }),
];

/** Regras com os valores padrão (cópia nova). `salvas` sobrescreve campos por regra. */
export function regrasPadrao(salvas = {}) {
  const regras = {};
  for (const r of REGRAS) {
    const copia = structuredClone(r);
    const s = salvas?.[r.id];
    if (s) {
      for (const [k, v] of Object.entries(s)) {
        copia[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...copia[k], ...v } : v;
      }
      if (r.acaoFixa && r.acaoFixa !== 'conforme a estratégia') copia.acaoAutomatica = r.acaoFixa;
    }
    regras[r.id] = copia;
  }
  return regras;
}

// ---------------------------------------------------------------------------
// Peças puras (testáveis)
// ---------------------------------------------------------------------------

/** A regra vale para esta moeda e este cliente? */
export function noEscopo(regra, { moeda = null, clienteId = null } = {}) {
  const { moedas, clientes } = regra.escopo ?? {};
  if (moeda && Array.isArray(moedas) && !moedas.includes(moeda)) return false;
  if (clienteId && Array.isArray(clientes) && !clientes.includes(clienteId)) return false;
  return true;
}

/** Silêncio por chave: `pode(chave, minutos, em)` responde e já registra. */
export function criarSilencio() {
  const ultimo = new Map();
  return {
    pode(chave, minutos, em) {
      const t = ultimo.get(chave);
      if (t != null && minutos > 0 && em - t < minutos * MS_MIN) return false;
      if (t != null && minutos <= 0 && t === em) return false;
      ultimo.set(chave, em);
      return true;
    },
    limpar() { ultimo.clear(); },
  };
}

/**
 * Maior variação dentro da janela: compara o preço atual com a mínima e a máxima das amostras.
 * @returns { pct, direcao: 'alta' | 'queda', referencia } | null
 */
export function variacaoNaJanela(amostras, atual) {
  if (!amostras.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const a of amostras) {
    if (a.p < min) min = a.p;
    if (a.p > max) max = a.p;
  }
  const alta = (atual / min - 1) * 100;
  const queda = (1 - atual / max) * 100;
  return alta >= queda ? { pct: alta, direcao: 'alta', referencia: min } : { pct: queda, direcao: 'queda', referencia: max };
}

/** O preço cruzou o alvo entre `anterior` e `atual`? */
export function cruzou(anterior, atual, alvo) {
  if (!(anterior > 0) || anterior === atual) return null;
  if (anterior < alvo && atual >= alvo) return 'subindo';
  if (anterior > alvo && atual <= alvo) return 'descendo';
  return null;
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

const nomeCliente = (id) => getState().clientes[id]?.nome ?? id;

const TEXTO_ROMPIMENTO = {
  'vender-pausar': 'vender e pausar', pausar: 'só pausar', manter: 'manter', 'manter-pausar': 'manter e pausar', vender: 'vender',
};

export const MONTAR = {
  'variacao-brusca': ({ moeda, dados: d, regra }) => ({
    titulo: `Variação brusca em ${moeda}`,
    texto: `${moeda} ${d.direcao === 'alta' ? 'subiu' : 'caiu'} ${pctSimples(d.pct)} em até ${regra.limites.minutos} min (de ${fp(d.referencia)} para ${fp(d.atual)}).`,
  }),
  'preco-alvo': ({ moeda, dados: d }) => ({
    titulo: `${moeda} cruzou ${fp(d.alvo)}`,
    texto: `Cotação ${d.sentido}: ${fp(d.atual)} USDT.`,
  }),
  'reserva-banca': ({ moeda, clienteId, dados: d, nome = nomeCliente }) => ({
    titulo: 'Reserva de banca atingida',
    texto: `Compra de ${moeda} para ${nome(clienteId)} bloqueada: a ordem de ${usdt(d.valor)} não cabe no disponível (${usdt(Math.max(0, d.disponivel))}). A reserva de banca fica protegida.`,
  }),
  'uso-banca': ({ clienteId, dados: d, regra, nome = nomeCliente }) => ({
    titulo: 'Uso da banca alto',
    texto: `${nome(clienteId)} está com ${pctSimples(d.uso, { casas: 0 })} do caixa operável em uso (limite de ${regra.limites.pct}%).`,
  }),
  'posicao-queda': ({ moeda, clienteId, dados: d, nome = nomeCliente }) => ({
    titulo: `Posição de ${moeda} em queda`,
    texto: `${plural(d.n, 'posição', 'posições')} de ${nome(clienteId)} em ${moeda} ${d.n === 1 ? 'está' : 'estão'} até ${pctSimples(d.pior)} abaixo do preço de compra.`,
  }),
  'venda-bloqueada': ({ moeda, clienteId, dados: d, nome = nomeCliente }) => ({
    titulo: 'Venda bloqueada por lucro mínimo',
    texto: `Sinal de venda de ${moeda} (${nome(clienteId)}, ${d.motivo ?? 'sinal'}) ignorado: ${fp(d.preco)} está abaixo do mínimo de ${fp(d.minimo)}.`,
  }),
  'posicao-sem-alvo': ({ moeda, clienteId, dados: d, nome = nomeCliente }) => ({
    titulo: 'Posição sem alvo',
    texto: `${nome(clienteId)}: ${qtd(d.quantidade, moeda)} comprados a ${fp(d.precoCompra)} estão sem venda programada há ${d.minutos} min.`,
  }),
  'canal-confirmado': ({ moeda, dados: d }) => ({
    titulo: `Canal confirmado em ${moeda}`,
    texto: `Suporte ${fp(d.suporte)} · resistência ${fp(d.resistencia)} (largura de ${pctSimples(d.largura)}). O robô passa a operar dentro do canal.`,
  }),
  'canal-rompido': ({ moeda, dados: d }) => ({
    titulo: `Rompimento de canal em ${moeda}`,
    texto: `A vela fechou ${d.direcao === 'baixa' ? 'abaixo do suporte' : 'acima da resistência'} (${fp(d.preco)}). Ação da estratégia: ${TEXTO_ROMPIMENTO[d.acao] ?? d.acao}.`,
  }),
  'ordem-executada': ({ moeda, dados: { ordem: o, lucro } }) => ({
    titulo: `${o.lado === 'compra' ? 'Compra' : 'Venda'} de ${moeda} executada`,
    texto: `${qtd(o.quantidade, moeda)} a ${fp(o.preco)} · ${usdt(o.total)}` + (lucro != null ? ` · resultado ${usdt(lucro, { sinal: true })}` : ''),
  }),
  'fechamento-periodo': ({ clienteId, dados: { periodo: p }, nome = nomeCliente }) => ({
    titulo: 'Período apurado',
    texto: `${nome(clienteId)}: período de ${intervalo(p.inicio, p.fim)} fechado com resultado de ${usdt(p.resultado, { sinal: true })} e comissão de ${usdt(p.comissao)}${p.comissao > 0 ? `, com vencimento em ${data(p.vencimento)}` : ''}.`,
  }),
  'comissao-a-vencer': ({ clienteId, dados: { periodo: p, dias }, nome = nomeCliente }) => ({
    titulo: 'Comissão a vencer',
    texto: `${nome(clienteId)}: a comissão de ${usdt(p.comissao)} vence em ${data(p.vencimento)} (${dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`}).`,
  }),
  'comissao-vencida': ({ clienteId, dados: { periodo: p }, nome = nomeCliente }) => ({
    titulo: 'Comissão vencida',
    texto: `${nome(clienteId)}: a comissão de ${usdt(p.comissao)} do período de ${intervalo(p.inicio, p.fim)} venceu em ${data(p.vencimento)}. Novas compras suspensas até o pagamento.`,
  }),
  'conexao-caiu': () => ({
    titulo: 'Sem conexão com a Binance',
    texto: 'As cotações passaram para o modo simulado, a partir dos últimos preços reais.',
  }),
  'conexao-voltou': () => ({
    titulo: 'Conexão com a Binance restabelecida',
    texto: 'As cotações voltaram a ser as reais, ao vivo.',
  }),
};

// ---------------------------------------------------------------------------
// Disparo e ações automáticas
// ---------------------------------------------------------------------------

const silencio = criarSilencio();
const disparar = (...args) => dispararRegra(...args); // atalho interno
const jaDisparados = new Set(); // alertas de período: uma vez por período

function executarAcao(acao, regra, { moeda, clienteId }) {
  const s = getState();
  if (acao === 'travar-moeda' && moeda && s.moedas[moeda]) {
    if (!s.moedas[moeda].travaCompras) {
      store.atualizarMoeda(moeda, { travaCompras: true });
      store.registrarLog(`Compras de ${moeda} travadas automaticamente por ${regra.nome}`, 'automatico');
    }
    return `Compras de ${moeda} travadas`;
  }
  if (acao === 'travar-cliente' && clienteId && s.clientes[clienteId]) {
    if (regra.id === 'comissao-vencida') return 'Novas compras do cliente suspensas';
    if (!s.clientes[clienteId].travaCompras) {
      store.atualizarCliente(clienteId, { travaCompras: true }, { registrar: false });
      store.registrarLog(`Compras de ${nomeCliente(clienteId)} travadas automaticamente por ${regra.nome}`, 'automatico');
    }
    return `Compras de ${nomeCliente(clienteId)} travadas`;
  }
  if (acao === 'pausar-robo') {
    if (s.robo !== 'pausado') {
      setState({ robo: 'pausado' });
      persist.set('robo', 'pausado');
      store.registrarLog(`Robô pausado automaticamente por ${regra.nome}`, 'automatico');
    }
    return 'Robô pausado';
  }
  return null;
}

/**
 * Dispara um alerta se a regra estiver ligada, no escopo e fora do silêncio.
 * @param regraId  id da regra
 * @param tipo     chave de MONTAR (padrão: regraId)
 * @param chave    identifica "o mesmo alerta" para o silêncio (padrão: moeda + cliente)
 */
export function dispararRegra(regraId, { tipo = regraId, moeda = null, clienteId = null, dados = {}, chave = null, em = Date.now(), severidade = null, tom = null, umaVez = false, soSilenciar = false } = {}) {
  const regra = getState().regrasAlerta?.[regraId];
  if (!regra?.ligada) return null;
  if (!noEscopo(regra, { moeda, clienteId })) return null;
  const id = chave ?? `${moeda ?? ''}:${clienteId ?? ''}`;
  const k = `${tipo}:${id}`;
  if (umaVez) {
    if (jaDisparados.has(k)) return null;
    jaDisparados.add(k);
  } else if (!silencio.pode(k, regra.cooldownMin, em)) return null;
  if (soSilenciar) return null;

  const { titulo, texto } = MONTAR[tipo]({ moeda, clienteId, dados, regra });
  const acao = regra.acaoFixa && regra.acaoFixa !== 'conforme a estratégia' ? regra.acaoFixa : regra.acaoAutomatica;
  const acaoTexto = acao && acao !== 'nenhuma' ? executarAcao(acao, regra, { moeda, clienteId }) : null;
  return store.adicionarAlerta({
    regraId,
    tipo,
    chave: id,
    severidade: severidade ?? regra.severidade,
    tom,
    titulo,
    texto,
    moeda,
    clienteId,
    data: new Date(em),
    paraAdmin: !!regra.visivel?.admin,
    paraCliente: !!regra.visivel?.cliente && !!clienteId,
    acaoAutomatica: acaoTexto,
  });
}

// ---------------------------------------------------------------------------
// Observadores
// ---------------------------------------------------------------------------

const amostras = new Map(); // moeda → [{ t, p }]

function aoPreco({ moeda, atual, anterior }) {
  const s = getState();
  if (s.carregando) return;
  const agora = Date.now();
  const regra = s.regrasAlerta['variacao-brusca'];
  if (regra?.ligada) {
    const janela = (Number(regra.limites.minutos) || 15) * MS_MIN;
    const lista = amostras.get(moeda) ?? [];
    while (lista.length && agora - lista[0].t > janela) lista.shift();
    const v = variacaoNaJanela(lista, atual);
    if (v && v.pct >= Number(regra.limites.pct)) {
      disparar('variacao-brusca', { moeda, dados: { ...v, atual }, em: agora });
    }
    if (!lista.length || agora - lista.at(-1).t >= 2000) lista.push({ t: agora, p: atual });
    amostras.set(moeda, lista);
  }
  const alvos = s.regrasAlerta['preco-alvo']?.limites?.alvos ?? [];
  for (const a of alvos) {
    if (a.moeda !== moeda) continue;
    const sentido = cruzou(anterior, atual, Number(a.preco));
    if (sentido) disparar('preco-alvo', { moeda, dados: { alvo: Number(a.preco), atual, sentido }, chave: `${moeda}:${a.preco}`, em: agora });
  }
}

function aoEventoMotor({ alerta, moeda, clienteId, dados, em }) {
  const t = +em || Date.now();
  // Reserva: um silêncio por cliente (o texto cita a moeda que tentou comprar).
  if (alerta === 'reserva-banca') disparar('reserva-banca', { moeda, clienteId, dados, chave: clienteId, em: t });
  else if (alerta === 'venda-bloqueada') disparar('venda-bloqueada', { moeda, clienteId, dados, em: t });
  else if (alerta === 'canal-confirmado') disparar('canal', { tipo: 'canal-confirmado', moeda, dados, chave: moeda, em: t });
  else if (alerta === 'canal-rompido') disparar('canal', { tipo: 'canal-rompido', moeda, dados, chave: moeda, em: t, severidade: 'atencao' });
}

function aoExecutar(o) {
  if (o.origem !== 'ao-vivo') return;
  let lucro = null;
  if (o.lado === 'venda') {
    const compra = store.ordemPorId(o.compraId);
    if (compra) lucro = lucroDaVenda(o, compra).liquido;
  }
  const tom = o.lado === 'compra' ? 'info' : lucro >= 0 ? 'up' : 'down';
  disparar('ordem-executada', { moeda: o.moeda, clienteId: o.clienteId, dados: { ordem: o, lucro }, chave: o.id, em: +o.executadaEm, tom });
}

let fonteAnterior = null;
function aoMercado(mercado) {
  const s = getState();
  const anterior = fonteAnterior;
  fonteAnterior = mercado.fonte;
  if (s.carregando || mercado.historicoFonte === 'simulado' || !anterior || anterior === mercado.fonte) return;
  if (mercado.fonte === 'simulado') disparar('conexao', { tipo: 'conexao-caiu', chave: 'conexao' });
  else if (mercado.fonte === 'binance' && mercado.estado === 'aovivo') {
    disparar('conexao', { tipo: 'conexao-voltou', chave: 'conexao-voltou', severidade: 'info' });
  }
}

/** Verificações periódicas: uso da banca, posições em queda, posições sem alvo, comissão a vencer. */
export function verificarPeriodicas(agora = Date.now(), { soSilenciar = false } = {}) {
  const s = getState();
  const disparar = (id, campos) => dispararRegra(id, { ...campos, soSilenciar });
  if (s.carregando) return;
  const r = s.regrasAlerta;
  const hoje = diaISO(agora);

  if (r['uso-banca']?.ligada) {
    for (const c of Object.values(s.clientes)) {
      if (c.status !== 'ativo') continue;
      const b = resumoBanca(c, s.ordens, s.movimentos, s.precos);
      if (b.usoBancaPct >= Number(r['uso-banca'].limites.pct)) disparar('uso-banca', { clienteId: c.id, dados: { uso: b.usoBancaPct }, chave: c.id, em: agora });
    }
  }

  const posicoes = (r['posicao-queda']?.ligada || r['posicao-sem-alvo']?.ligada) ? posicoesAbertas(s.ordens) : [];
  if (r['posicao-queda']?.ligada) {
    const limite = Number(r['posicao-queda'].limites.pct);
    const grupos = new Map();
    for (const p of posicoes) {
      const atual = s.precos[p.moeda]?.atual;
      if (!atual) continue;
      const queda = (1 - atual / p.precoCompra) * 100;
      if (queda < limite) continue;
      const k = `${p.clienteId}:${p.moeda}`;
      const g = grupos.get(k) ?? { clienteId: p.clienteId, moeda: p.moeda, n: 0, pior: 0 };
      g.n++;
      g.pior = Math.max(g.pior, queda);
      grupos.set(k, g);
    }
    for (const g of grupos.values()) {
      if (s.clientes[g.clienteId]?.status === 'inativo') continue;
      disparar('posicao-queda', { moeda: g.moeda, clienteId: g.clienteId, dados: g, em: agora });
    }
  }

  if (r['posicao-sem-alvo']?.ligada) {
    const minutos = Number(r['posicao-sem-alvo'].limites.minutos);
    const canceladas = new Map();
    for (const o of s.ordens) {
      if (o.lado === 'venda' && o.canceladaEm && o.compraId) {
        canceladas.set(o.compraId, Math.max(canceladas.get(o.compraId) ?? 0, +o.canceladaEm));
      }
    }
    for (const p of posicoes) {
      if (!p.semAlvo) continue;
      const desde = canceladas.get(p.compra.id) ?? +p.compra.executadaEm;
      const passou = Math.floor((agora - desde) / MS_MIN);
      if (passou < minutos) continue;
      disparar('posicao-sem-alvo', {
        moeda: p.moeda, clienteId: p.clienteId, chave: p.compra.id, em: agora,
        dados: { quantidade: p.quantidade, precoCompra: p.precoCompra, minutos: passou },
      });
    }
  }

  if (r['comissao-a-vencer']?.ligada) {
    const limite = Number(r['comissao-a-vencer'].limites.dias);
    for (const p of s.periodos) {
      if (p.status !== 'apurado' || !(p.comissao > 0)) continue;
      const dias = diasParaVencer(p, hoje);
      if (dias < 0 || dias > limite) continue;
      disparar('comissao-a-vencer', { clienteId: p.clienteId, dados: { periodo: p, dias }, chave: p.id, em: agora, umaVez: true });
    }
  }
}

/** Alertas que já existiam ao carregar (gerados por alertasIniciais) não se repetem. */
function lembrarIniciais() {
  jaDisparados.clear();
  silencio.limpar();
  for (const a of getState().alertas) {
    if (a.tipo === 'comissao-a-vencer' || a.tipo === 'comissao-vencida' || a.tipo === 'fechamento-periodo') {
      jaDisparados.add(`${a.tipo}:${a.chave}`);
    }
  }
}

let iniciado = false;
export function iniciarRegras() {
  if (iniciado) return;
  iniciado = true;
  // Ao carregar, a situação atual (uso da banca, posições em queda) já está resumida nos alertas
  // iniciais: a primeira verificação só arma o silêncio, para não repetir tudo em toasts.
  on('data:ready', () => {
    amostras.clear();
    lembrarIniciais();
    fonteAnterior = getState().mercado.fonte;
    verificarPeriodicas(Date.now(), { soSilenciar: true });
  });
  on('prices:update', aoPreco);
  on('engine:event', aoEventoMotor);
  on('order:executed', aoExecutar);
  on('state:mercado', aoMercado);
  on('commission:closed', (p) => disparar('fechamento-periodo', { clienteId: p.clienteId, dados: { periodo: p }, chave: p.id, umaVez: true }));
  on('commission:overdue', (p) => disparar('comissao-vencida', { clienteId: p.clienteId, dados: { periodo: p }, chave: p.id, umaVez: true }));
  setInterval(() => verificarPeriodicas(), 30_000);
}

// ---------------------------------------------------------------------------
// Alertas do histórico (para a central não começar vazia)
// ---------------------------------------------------------------------------

/**
 * ~20 alertas das últimas 48 h, refeitos a partir dos dados gerados: períodos apurados e vencidos,
 * comissões a vencer, variações bruscas nas velas de 15 min e as últimas vendas executadas.
 * Todos já lidos, menos os críticos (ficam fixos até serem lidos).
 */
export function alertasIniciais({ agora, clientes, periodos, ordens, movimentos = [], precos, regras }) {
  const fim = +new Date(agora);
  const inicio = fim - 48 * 3_600_000;
  const hoje = diaISO(fim);
  const lista = [];
  const nome = (id) => clientes[id]?.nome ?? id;
  const novo = (regraId, campos) => {
    const r = regras[regraId];
    if (!r?.ligada) return;
    const tipo = campos.tipo ?? regraId;
    const { titulo, texto } = MONTAR[tipo]({ ...campos, regra: r, nome });
    lista.push({
      regraId, tipo, chave: campos.chave ?? null, severidade: campos.severidade ?? r.severidade, tom: campos.tom ?? null,
      titulo, texto, moeda: campos.moeda ?? null, clienteId: campos.clienteId ?? null, data: new Date(campos.em),
      lido: r.severidade !== 'critico', lidoCliente: r.severidade !== 'critico',
      paraAdmin: !!r.visivel.admin, paraCliente: !!r.visivel.cliente && !!campos.clienteId,
      acaoAutomatica: r.id === 'comissao-vencida' ? 'Novas compras do cliente suspensas' : null, origem: 'historico',
    });
  };

  for (const p of periodos) {
    if (p.apuradoEm && +p.apuradoEm >= inicio && +p.apuradoEm <= fim) {
      novo('fechamento-periodo', { clienteId: p.clienteId, dados: { periodo: p }, chave: p.id, em: +p.apuradoEm });
    }
    if (p.status === 'vencido') {
      novo('comissao-vencida', { clienteId: p.clienteId, dados: { periodo: p }, chave: p.id, em: Math.max(inicio, fim - 6 * 3_600_000) });
    }
    if (p.status === 'apurado' && p.comissao > 0) {
      const dias = diasParaVencer(p, hoje);
      if (dias >= 0 && dias <= regras['comissao-a-vencer'].limites.dias) {
        novo('comissao-a-vencer', { clienteId: p.clienteId, dados: { periodo: p, dias }, chave: p.id, em: fim - 3 * 3_600_000 });
      }
    }
  }

  const vb = regras['variacao-brusca'];
  for (const [moeda, pr] of Object.entries(precos)) {
    let ultimo = 0;
    for (const v of pr.velas15m ?? []) {
      if (v.t < inicio || v.t > fim) continue;
      const pct = (v.maxima / v.minima - 1) * 100;
      if (pct < vb.limites.pct || v.t - ultimo < vb.cooldownMin * MS_MIN) continue;
      ultimo = v.t;
      const direcao = v.fechamento >= v.abertura ? 'alta' : 'queda';
      novo('variacao-brusca', { moeda, em: v.t + 15 * MS_MIN, dados: { pct, direcao, referencia: direcao === 'alta' ? v.minima : v.maxima, atual: v.fechamento } });
    }
  }

  const porId = new Map(ordens.map((o) => [o.id, o]));
  const vendas = ordens
    .filter((o) => o.lado === 'venda' && o.status === 'executada' && +o.executadaEm >= inicio && +o.executadaEm <= fim)
    .sort((a, b) => b.executadaEm - a.executadaEm)
    .slice(0, 12);
  for (const o of vendas) {
    const compra = porId.get(o.compraId);
    const lucro = compra ? lucroDaVenda(o, compra).liquido : null;
    novo('ordem-executada', { moeda: o.moeda, clienteId: o.clienteId, dados: { ordem: o, lucro }, chave: o.id, em: +o.executadaEm, tom: lucro >= 0 ? 'up' : 'down' });
  }

  // Situação atual: clientes com a banca quase toda em uso e posições bem abaixo do preço de compra.
  const atual = Object.fromEntries(Object.entries(precos).map(([m, p]) => [m, { atual: p.atual }]));
  for (const c of Object.values(clientes)) {
    if (c.status !== 'ativo') continue;
    const b = resumoBanca(c, ordens, movimentos, atual);
    if (b.usoBancaPct >= regras['uso-banca'].limites.pct) {
      novo('uso-banca', { clienteId: c.id, dados: { uso: b.usoBancaPct }, chave: c.id, em: fim - 40 * MS_MIN });
    }
  }
  const quedas = new Map();
  for (const p of posicoesAbertas(ordens)) {
    const cot = atual[p.moeda]?.atual;
    if (!cot || clientes[p.clienteId]?.status === 'inativo') continue;
    const queda = (1 - cot / p.precoCompra) * 100;
    if (queda < regras['posicao-queda'].limites.pct) continue;
    const k = `${p.clienteId}:${p.moeda}`;
    const g = quedas.get(k) ?? { clienteId: p.clienteId, moeda: p.moeda, n: 0, pior: 0 };
    g.n++;
    g.pior = Math.max(g.pior, queda);
    quedas.set(k, g);
  }
  const piores = [...quedas.values()].sort((a, b) => b.pior - a.pior).slice(0, 6);
  for (const g of piores) novo('posicao-queda', { moeda: g.moeda, clienteId: g.clienteId, dados: g, em: fim - 25 * MS_MIN });

  lista.sort((a, b) => a.data - b.data);
  lista.forEach((a, i) => { a.id = 'a' + String(i + 1).padStart(5, '0'); });
  return lista;
}
