// Cotações simuladas — parte histórica (a parte ao vivo chega na F2).
// Usada quando a Binance não responde: passeio aleatório que termina no preço de referência da moeda.
// A semente depende do dia e da moeda, então o histórico simulado também se repete no mesmo dia.

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
