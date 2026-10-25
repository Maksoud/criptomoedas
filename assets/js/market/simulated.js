// Cotações simuladas, usadas quando a Binance não responde.
// Histórico: passeio aleatório que termina no preço de referência da moeda; a semente depende do dia
// e da moeda, então o histórico simulado se repete no mesmo dia.
// Ao vivo: continua dos últimos preços conhecidos, uma atualização por segundo, no mesmo formato do
// miniTicker da Binance (assim o resto do sistema não precisa saber de onde veio o preço).

import { criarRandom } from '../utils/random.js';
import { DURACAO_INTERVALO } from './binance.js';

// Volatilidade do catálogo é por atualização (~1 s). Para velas, escala pela raiz do número de segundos,
// amortecida para os preços não ficarem irreais.
function desvioDaVela(volatilidadePct, intervalo) {
  const segundos = DURACAO_INTERVALO[intervalo] / 1000;
  return (volatilidadePct / 100) * Math.sqrt(segundos) * 0.12;
}

/**
 * Gera `quantidade` velas terminando na vela que contém `agora`, com fechamento final = `precoFinal`.
 */
export function velasSimuladas({ moeda, intervalo, quantidade, agora = Date.now(), precoFinal, semente }) {
  const rnd = criarRandom(semente ?? `${moeda.simbolo}:${intervalo}`);
  const duracao = DURACAO_INTERVALO[intervalo];
  const sigma = desvioDaVela(moeda.volatilidade, intervalo);
  const ultimaAbertura = Math.floor(agora / duracao) * duracao;

  // Passeio em log-preço, com leve reversão à média para não derivar demais em 180 dias.
  const retornos = [];
  let acumulado = 0;
  for (let i = 0; i < quantidade; i++) {
    const r = sigma * rnd.normal() - acumulado * 0.004;
    retornos.push(r);
    acumulado += r;
  }

  // Constrói de trás para frente: o último fechamento é o preço final.
  const fechamentos = new Array(quantidade);
  let p = precoFinal ?? moeda.precoRef;
  for (let i = quantidade - 1; i >= 0; i--) {
    fechamentos[i] = p;
    p = p / Math.exp(retornos[i]);
  }

  const lista = [];
  let abertura = p;
  for (let i = 0; i < quantidade; i++) {
    const fechamento = fechamentos[i];
    const pavio = () => Math.abs(rnd.normal()) * sigma * 0.6;
    lista.push({
      t: ultimaAbertura - (quantidade - 1 - i) * duracao,
      abertura,
      maxima: Math.max(abertura, fechamento) * (1 + pavio()),
      minima: Math.min(abertura, fechamento) * (1 - pavio()),
      fechamento,
      volume: moeda.precoRef * rnd.entre(50, 400),
    });
    abertura = fechamento;
  }
  return lista;
}

// ---------------------------------------------------------------------------
// Ao vivo
// ---------------------------------------------------------------------------

/**
 * Simulador ao vivo. `moedas`: [{ simbolo, par, volatilidade, precoRef, precisao }].
 * `precos`: { BTC: { atual, abertura24h } } — ponto de partida (últimos preços reais, se houver).
 */
export function criarSimuladorAoVivo({ aoPreco, intervaloMs = 1000, semente = Date.now() } = {}) {
  const rnd = criarRandom(semente >>> 0);
  const estado = new Map(); // simbolo → { moeda, preco, base, abertura24h, volume24h }
  let timer = null;

  function preparar(moedas, precos = {}) {
    const vistos = new Set();
    for (const m of moedas) {
      vistos.add(m.simbolo);
      if (estado.has(m.simbolo)) { estado.get(m.simbolo).moeda = m; continue; }
      const p = precos[m.simbolo];
      const preco = p?.atual > 0 ? p.atual : m.precoRef;
      estado.set(m.simbolo, {
        moeda: m,
        preco,
        base: preco,
        abertura24h: p?.abertura24h > 0 ? p.abertura24h : preco,
        volume24h: rnd.entre(5e7, 5e8),
      });
    }
    for (const s of [...estado.keys()]) if (!vistos.has(s)) estado.delete(s);
  }

  function passo() {
    const em = Date.now();
    for (const e of estado.values()) {
      const { moeda } = e;
      // Passeio em log-preço com leve volta ao preço inicial (não deriva demais numa apresentação longa).
      const sigma = (moeda.volatilidade ?? 0.1) / 100;
      const r = sigma * rnd.normal() - Math.log(e.preco / e.base) * 0.002;
      const casas = moeda.precisao?.preco ?? 2;
      const novo = Math.max(10 ** -casas, +(e.preco * Math.exp(r)).toFixed(casas));
      e.preco = novo;
      e.volume24h += (e.volume24h * rnd.entre(0.5, 1.5)) / 86400; // ~1 segundo de volume
      aoPreco({
        par: moeda.par,
        atual: novo,
        abertura24h: e.abertura24h,
        variacao24h: (novo / e.abertura24h - 1) * 100,
        maxima: null,
        minima: null,
        volume24h: e.volume24h,
        em,
      });
    }
  }

  return {
    iniciar(moedas, precos) {
      preparar(moedas, precos);
      if (!timer) timer = setInterval(passo, intervaloMs);
    },
    /** Troca as moedas sem reiniciar as que continuam. */
    atualizarMoedas(moedas, precos) { preparar(moedas, precos); },
    parar() {
      clearInterval(timer);
      timer = null;
      estado.clear();
    },
    get ativo() { return timer != null; },
  };
}
