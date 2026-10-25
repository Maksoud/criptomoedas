// Histórico de preços para o gerador: velas de 4 h (180 dias) e de 15 min (48 h) das moedas ativas.
// Fica em cache no localStorage por dia (historico:AAAA-MM-DD), para o carregamento ser rápido e o
// histórico fictício ser o mesmo durante o dia. Dias antigos são apagados.
// Se a Binance não responder, gera um histórico simulado e marca a fonte como 'simulado'.

import * as binance from './binance.js';
import { velasSimuladas } from './simulated.js';
import * as persist from '../persist.js';
import { diaISO } from '../utils/dates.js';

export const DIAS_HISTORICO = 180;
const VELAS_4H = 1100;   // 183 dias: cobre os 180 com folga (2 chamadas)
const VELAS_15M = 192;   // 48 h
const PREFIXO_CACHE = 'historico:';
const VERSAO_CACHE = 1;

// ---------- Cache compacto: [t, abertura, máxima, mínima, fechamento, volume] ----------
function compactar(velas) {
  return velas.map((v) => [v.t, v.abertura, v.maxima, v.minima, v.fechamento, Math.round(v.volume)]);
}

function expandir(linhas) {
  return linhas.map(([t, abertura, maxima, minima, fechamento, volume]) => ({ t, abertura, maxima, minima, fechamento, volume }));
}

function salvarCache(chave, hist) {
  const moedas = {};
  for (const [s, m] of Object.entries(hist.moedas)) {
    moedas[s] = { h4: compactar(m.velas4h), m15: compactar(m.velas15m), precisao: m.precisao };
  }
  const ok = persist.set(chave, { v: VERSAO_CACHE, fonte: hist.fonte, baixadoEm: hist.baixadoEm, moedas });
  if (!ok) console.warn('[historico] não foi possível salvar o cache (sem espaço ou bloqueado)');
}

function lerCache(chave, simbolos) {
  const c = persist.get(chave);
  if (!c || c.v !== VERSAO_CACHE || !c.moedas) return null;
  if (!simbolos.every((s) => c.moedas[s]?.h4?.length)) return null;
  const moedas = {};
  for (const s of simbolos) {
    const m = c.moedas[s];
    moedas[s] = { velas4h: expandir(m.h4), velas15m: expandir(m.m15 ?? []), precisao: m.precisao ?? null };
  }
  return { fonte: c.fonte, baixadoEm: c.baixadoEm, moedas, doCache: true };
}

function limparDiasAntigos(chaveHoje) {
  for (const k of persist.chaves(PREFIXO_CACHE)) {
    if (k !== chaveHoje) persist.remove(k);
  }
}

// ---------- Download ----------
async function baixar(moedas, agora) {
  const pares = moedas.map((m) => m.par);
  const precisoes = binance.exchangeInfo(pares).catch((erro) => {
    console.warn('[historico] exchangeInfo indisponível, usando precisões do catálogo', erro.message);
    return {};
  });
  const series = await Promise.all(
    moedas.map(async (m) => {
      const [velas4h, velas15m] = await Promise.all([
        binance.velasEmLote(m.par, '4h', VELAS_4H),
        binance.velas(m.par, '15m', VELAS_15M),
      ]);
      if (!velas4h.length) throw new binance.ErroBinance(`Sem histórico para ${m.par}`);
      return [m, velas4h, velas15m];
    }),
  );
  const info = await precisoes;
  const porMoeda = {};
  for (const [m, velas4h, velas15m] of series) {
    porMoeda[m.simbolo] = { velas4h, velas15m, precisao: mesclarPrecisao(m.precisao, info[m.par]) };
  }
  return { fonte: 'binance', baixadoEm: agora.getTime(), moedas: porMoeda, doCache: false };
}

function mesclarPrecisao(padrao, daBinance) {
  if (!daBinance) return { ...padrao };
  return {
    preco: daBinance.preco ?? padrao.preco,
    quantidade: daBinance.quantidade ?? padrao.quantidade,
    minimo: daBinance.minimo ?? padrao.minimo,
  };
}

/** Histórico simulado (sem conexão). Mesma semente durante o dia. */
export function historicoSimulado(moedas, agora = new Date(), erro = null) {
  const dia = diaISO(agora);
  const porMoeda = {};
  for (const m of moedas) {
    const velas4h = velasSimuladas({ moeda: m, intervalo: '4h', quantidade: VELAS_4H, agora: +agora, semente: `${dia}:${m.simbolo}:4h` });
    const ultimo = velas4h.at(-1).fechamento;
    const velas15m = velasSimuladas({ moeda: m, intervalo: '15m', quantidade: VELAS_15M, agora: +agora, precoFinal: ultimo, semente: `${dia}:${m.simbolo}:15m` });
    porMoeda[m.simbolo] = { velas4h, velas15m, precisao: { ...m.precisao } };
  }
  return { fonte: 'simulado', baixadoEm: agora.getTime(), moedas: porMoeda, doCache: false, erro: erro?.message ?? null };
}

/**
 * Carrega o histórico das moedas: cache do dia → Binance → simulado.
 * @returns { fonte: 'binance' | 'simulado', baixadoEm, moedas: { BTC: { velas4h, velas15m, precisao } }, doCache, erro? }
 */
export async function carregarHistorico(moedas, { agora = new Date(), usarCache = true } = {}) {
  const chave = PREFIXO_CACHE + diaISO(agora);
  limparDiasAntigos(chave);
  const simbolos = moedas.map((m) => m.simbolo);

  if (usarCache) {
    const cache = lerCache(chave, simbolos);
    if (cache) return cache;
  }

  try {
    const hist = await baixar(moedas, agora);
    salvarCache(chave, hist);
    return hist;
  } catch (erro) {
    console.warn('[historico] Binance indisponível, usando histórico simulado:', erro.message);
    return historicoSimulado(moedas, agora, erro);
  }
}

/** Variação de 24 h para o topo. Falha silenciosa: devolve null. */
export async function carregarTicker(moedas) {
  try {
    return await binance.ticker24h(moedas.map((m) => m.par));
  } catch (erro) {
    console.warn('[historico] ticker 24h indisponível:', erro.message);
    return null;
  }
}
