// Feed de cotações: escolhe a fonte (Binance ao vivo ou simulado), mantém `store.precos` em dia,
// monta as velas e publica `prices:update` e `candle:close`. Telas e motor não sabem de onde veio o preço.
//
// Binance cai → "Reconectando…" (espera 1, 2, 5, 10 s) → após 3 falhas seguidas, o simulador continua
// dos últimos preços reais. A conexão segue tentando em segundo plano; quando volta, a Binance reassume.
// Se o próprio histórico foi simulado (abriu sem internet), fica no simulado até recarregar a página,
// para os preços ao vivo não saltarem dos valores simulados para os reais.

import { getState, setState, emit, on, registrarLog } from '../store.js';
import * as binance from './binance.js';
import { criarSimuladorAoVivo } from './simulated.js';
import { criarMontador } from './candles.js';

let fluxo = null;
let simulador = null;
let montador = null;
let iniciado = false;
let somenteSimulado = false;
let porPar = new Map();      // 'BTCUSDT' → 'BTC'
const ultimos = {};          // último preço ao vivo por moeda, reaplicado após "Restaurar dados"
let bloqueadoAte = 0;        // simularQueda(): conexões recusadas até este instante

// WebSocket que recusa conexões durante uma queda simulada pelo console.
const WebSocketDoFeed = typeof WebSocket === 'undefined' ? null : class extends WebSocket {
  constructor(url) {
    if (Date.now() < bloqueadoAte) throw new Error('queda simulada');
    super(url);
  }
};

function moedasAtivas() {
  return Object.values(getState().moedas).filter((m) => m.ativa);
}

function mudarMercado(parcial) {
  const atual = getState().mercado;
  if (Object.entries(parcial).every(([k, v]) => atual[k] === v)) return;
  setState({ mercado: { ...atual, ...parcial } });
}

/** Garante a entrada de preço da moeda e liga as séries de velas ao vivo a ela. */
function entradaDePreco(simbolo) {
  const precos = getState().precos;
  if (!precos[simbolo]) {
    precos[simbolo] = { atual: null, anterior: null, abertura24h: null, variacao24h: null, velas15m: [], velas4h: [], diario: [] };
  }
  const p = precos[simbolo];
  p.velas1m = montador.serie(simbolo, '1m');
  p.velas15s = montador.serie(simbolo, '15s');
  if (ultimos[simbolo]) Object.assign(p, ultimos[simbolo]);
  return p;
}

function aoPreco(fonte, tick) {
  if (fonte !== getState().mercado.fonte) return;
  const simbolo = porPar.get(tick.par);
  if (!simbolo) return;
  const p = getState().precos[simbolo] ?? entradaDePreco(simbolo);
  const anterior = p.atual ?? tick.atual;
  p.anterior = anterior;
  p.atual = tick.atual;
  p.abertura24h = tick.abertura24h;
  p.variacao24h = tick.variacao24h;
  p.atualizadoEm = tick.em;
  ultimos[simbolo] = { atual: tick.atual, anterior, abertura24h: tick.abertura24h, variacao24h: tick.variacao24h };
  getState().mercado.ultimaMensagem = new Date(tick.em); // sem evento: muda toda hora
  montador.registrar(simbolo, tick.atual, tick.em, tick.volume24h);
  emit('prices:update', { moeda: simbolo, atual: tick.atual, anterior, variacao24h: tick.variacao24h });
}

function entrarNoSimulado(motivo, { avisar = true } = {}) {
  if (simulador.ativo) return;
  simulador.iniciar(moedasAtivas(), getState().precos);
  mudarMercado({ fonte: 'simulado', estado: 'simulado', conectado: false, erro: motivo, desde: new Date() });
  if (avisar) {
    console.warn(`[feed] ${motivo}: cotações simuladas a partir dos últimos preços`);
    registrarLog('Sem conexão com a Binance: cotações simuladas a partir dos últimos preços', 'automatico');
  }
}

function aoEstadoBinance({ estado, motivo }) {
  const simulando = simulador.ativo;
  if (estado === 'conectando' && !simulando) {
    mudarMercado({ fonte: 'binance', estado: 'conectando', conectado: false });
  } else if (estado === 'reconectando' && !simulando) {
    console.info(`[feed] Binance: ${motivo}, reconectando…`);
    mudarMercado({ fonte: 'binance', estado: 'reconectando', conectado: false });
  } else if (estado === 'falhou') {
    entrarNoSimulado(`Sem conexão com a Binance (${motivo})`);
  } else if (estado === 'aovivo') {
    simulador.parar();
    mudarMercado({ fonte: 'binance', estado: 'aovivo', conectado: true, erro: null, desde: new Date() });
    if (simulando) {
      console.info('[feed] Binance de volta: cotações ao vivo');
      registrarLog('Conexão com a Binance restabelecida: cotações ao vivo de novo', 'automatico');
    }
  }
}

/** Preço inicial das moedas recém-ligadas que ainda não têm cotação (melhor esforço). */
async function buscarPrecosQueFaltam(ativas) {
  const faltam = ativas.filter((m) => getState().precos[m.simbolo]?.atual == null);
  if (!faltam.length || somenteSimulado) return;
  try {
    const tk = await binance.ticker24h(faltam.map((m) => m.par));
    for (const m of faltam) {
      const t = tk[m.par];
      const p = getState().precos[m.simbolo];
      if (!t || !p || p.atual != null) continue;
      Object.assign(p, { atual: t.atual, anterior: t.atual, abertura24h: t.abertura, variacao24h: t.variacaoPct });
      emit('prices:update', { moeda: m.simbolo, atual: t.atual, anterior: t.atual, variacao24h: t.variacaoPct });
    }
  } catch (erro) {
    console.warn('[feed] não foi possível buscar o preço inicial das moedas novas:', erro.message);
  }
}

/** Abre (ou reabre) a conexão com as moedas ativas. */
function sincronizar() {
  const ativas = moedasAtivas();
  porPar = new Map(ativas.map((m) => [m.par, m.simbolo]));
  for (const m of ativas) entradaDePreco(m.simbolo);
  if (simulador.ativo) simulador.atualizarMoedas(ativas, getState().precos);
  if (!somenteSimulado) fluxo.abrir(ativas.map((m) => m.par));
  buscarPrecosQueFaltam(ativas);
}

function aoCarregar() {
  somenteSimulado = getState().mercado.historicoFonte === 'simulado';
  if (somenteSimulado) {
    fluxo.fechar();
    entrarNoSimulado('Histórico simulado', { avisar: false });
  }
  sincronizar();
}

export function iniciarFeed() {
  if (iniciado) return;
  iniciado = true;
  montador = criarMontador({ aoFechar: (dados) => emit('candle:close', dados) });
  simulador = criarSimuladorAoVivo({ aoPreco: (tick) => aoPreco('simulado', tick) });
  fluxo = binance.criarFluxo({
    aoPreco: (tick) => aoPreco('binance', tick),
    aoEstado: aoEstadoBinance,
    WebSocketImpl: WebSocketDoFeed,
  });
  setInterval(() => montador.fecharVencidas(Date.now()), 1000);

  on('data:ready', aoCarregar);
  on('coin:change', ({ mudou }) => { if (mudou.includes('ativa')) sincronizar(); });
  window.addEventListener('offline', () => fluxo.derrubar('sem internet'));
  window.addEventListener('online', () => fluxo.tentarJa());
}

/** "Tentar de novo": reconecta já, sem esperar a próxima tentativa. */
export function reconectarAgora() {
  if (somenteSimulado) location.reload();
  else fluxo?.tentarJa();
}

/**
 * Para testar pelo console: criptoops.feed.simularQueda(30) derruba a conexão e recusa novas
 * tentativas por 30 s. Em ~3 s entra o simulado; depois dos 30 s, a Binance volta sozinha.
 */
export function simularQueda(segundos = 30) {
  bloqueadoAte = Date.now() + segundos * 1000;
  fluxo?.derrubar('queda simulada pelo console');
}

/** Velas fechadas de uma moeda ('1m' ou '15s'). */
export function velasAoVivo(simbolo, intervalo = '1m') {
  return montador?.serie(simbolo, intervalo) ?? [];
}

/** Vela em formação ('1m' ou '15s'). */
export function velaAberta(simbolo, intervalo = '1m') {
  return montador?.aberta(simbolo, intervalo) ?? null;
}
