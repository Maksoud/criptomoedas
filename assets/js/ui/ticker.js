// Faixa de cotações do topo: monograma, símbolo, preço e variação de 24 h de cada moeda ativa.
// Ao mudar o preço, o item pisca verde ou vermelho por 600 ms (sem piscar com prefers-reduced-motion).
// No celular a faixa rola sozinha (a lista é desenhada duas vezes para a rolagem não ter emenda).
// Com a aba oculta não mexe na tela; a conexão continua e tudo é redesenhado ao voltar.

import { getState, on } from '../store.js';
import { preco, variacao } from '../utils/format.js';

const SEGUNDOS_POR_ITEM = 3.5; // velocidade da rolagem no celular
const movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)');

let lista = null;
let simbolos = [];
const pendentes = new Map(); // moeda → direção do último movimento ('up' | 'down' | null)
let quadro = null;

const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function moedasAtivas() {
  return Object.values(getState().moedas).filter((m) => m.ativa);
}

function direcao(v) {
  if (!(Math.abs(v) >= 0.005)) return 'flat';
  return v > 0 ? 'up' : 'down';
}

function itemHTML(m, copia) {
  const p = getState().precos[m.simbolo];
  const v = p?.variacao24h;
  return `
    <li class="ticker__item${copia ? ' ticker__item--copia' : ''}" data-moeda="${m.simbolo}"${copia ? ' aria-hidden="true"' : ''} title="${escapar(m.nome)} · ${m.simbolo}/USDT">
      <span class="monogram monogram--sm" style="--coin:${m.cor}" aria-hidden="true">${escapar(m.simbolo.slice(0, 1))}</span>
      <span class="ticker__sym">${m.simbolo}</span>
      <span class="ticker__price num">${preco(p?.atual)}</span>
      <span class="ticker__chg num" data-dir="${direcao(v)}">${variacao(v)}</span>
    </li>`;
}

function montar() {
  if (!lista) return;
  const moedas = moedasAtivas();
  simbolos = moedas.map((m) => m.simbolo);
  pendentes.clear();
  if (!moedas.length) {
    lista.innerHTML = '<li class="ticker__item ticker__vazio">Nenhuma moeda ativa</li>';
    return;
  }
  lista.innerHTML = moedas.map((m) => itemHTML(m, false)).join('') + moedas.map((m) => itemHTML(m, true)).join('');
  lista.style.setProperty('--ticker-dur', `${moedas.length * SEGUNDOS_POR_ITEM}s`);
}

function desenharEsqueleto() {
  const larguras = [56, 64, 48, 60, 52, 58];
  lista.innerHTML = larguras
    .map((w) => `
      <li class="ticker__item" aria-hidden="true">
        <span class="skeleton" style="width:20px;height:20px;border-radius:50%"></span>
        <span class="skeleton" style="width:${w}px"></span>
      </li>`)
    .join('');
}

function piscar(el, dir) {
  if (!dir || movimentoReduzido.matches) return;
  el.classList.remove('is-flash-up', 'is-flash-down');
  void el.offsetWidth; // reinicia a animação se o preço mudar de novo antes de terminar
  el.classList.add(dir === 'up' ? 'is-flash-up' : 'is-flash-down');
}

function aplicar() {
  quadro = null;
  if (document.hidden) return;
  const precos = getState().precos;
  for (const [moeda, dir] of pendentes) {
    const p = precos[moeda];
    if (!p) continue;
    const textoPreco = preco(p.atual);
    const textoVar = variacao(p.variacao24h);
    const dirVar = direcao(p.variacao24h);
    for (const el of lista.querySelectorAll(`[data-moeda="${moeda}"]`)) {
      el.querySelector('.ticker__price').textContent = textoPreco;
      const chg = el.querySelector('.ticker__chg');
      chg.textContent = textoVar;
      chg.dataset.dir = dirVar;
      piscar(el, dir);
    }
  }
  pendentes.clear();
}

function agendar() {
  if (!quadro && !document.hidden) quadro = requestAnimationFrame(aplicar);
}

function aoPreco({ moeda, atual, anterior }) {
  if (!simbolos.includes(moeda) || document.hidden) return;
  const dir = atual > anterior ? 'up' : atual < anterior ? 'down' : null;
  // Guarda só o último movimento de cada moeda: a fila nunca passa do número de moedas.
  pendentes.set(moeda, dir ?? pendentes.get(moeda) ?? null);
  agendar();
}

function aoMudarVisibilidade() {
  if (document.hidden) {
    if (quadro) cancelAnimationFrame(quadro);
    quadro = null;
    pendentes.clear();
    return;
  }
  // De volta: atualiza os valores sem piscar (o que mudou com a aba oculta não é "agora").
  for (const s of simbolos) pendentes.set(s, null);
  agendar();
}

export function iniciarTicker() {
  lista = document.getElementById('ticker-list');
  lista.addEventListener('animationend', (e) => {
    if (e.animationName.startsWith('ticker-flash')) e.target.classList.remove('is-flash-up', 'is-flash-down');
  });
  desenharEsqueleto();
  on('data:ready', montar);
  on('coin:change', ({ mudou }) => { if (mudou.includes('ativa')) montar(); });
  on('prices:update', aoPreco);
  document.addEventListener('visibilitychange', aoMudarVisibilidade);
}
