// Monograma de moeda: círculo com a cor da moeda a 18% e a inicial na cor cheia (docs/IDENTIDADE_VISUAL.md §3.3).
import { getState } from '../store.js';
import { escapar } from './dom.js';

export function corDaMoeda(simbolo) {
  return getState().moedas[simbolo]?.cor ?? null;
}

export function monograma(simbolo, { pequeno = false } = {}) {
  const cor = corDaMoeda(simbolo);
  const estilo = cor ? ` style="--coin:${cor}"` : '';
  return `<span class="monogram${pequeno ? ' monogram--sm' : ''}"${estilo} aria-hidden="true">${escapar(simbolo.slice(0, 1))}</span>`;
}

/** Monograma + sigla, para células de tabela e listas. */
export function moedaHTML(simbolo) {
  const nome = getState().moedas[simbolo]?.nome ?? simbolo;
  return `<span class="coin" title="${escapar(nome)}">${monograma(simbolo)}<span class="coin__sym">${escapar(simbolo)}</span></span>`;
}
