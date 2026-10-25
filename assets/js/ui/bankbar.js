// Barra de uso da banca: em operação · programado · disponível · reserva, numa barra empilhada de 8 px
// com a legenda embaixo (docs/IDENTIDADE_VISUAL.md §7). As fatias somam o caixa:
//   caixa = custo das posições + compras programadas + disponível + reserva
// "Em operação" aqui é o custo das posições (o valor a mercado fica no KPI, porque oscila com a cotação).

import { usdt, pctSimples } from '../utils/format.js';
import { trocarHTML } from './dom.js';

export function fatiasDaBanca(b) {
  const fatias = [
    { id: 'operacao', rotulo: 'Em operação', valor: Math.max(b.custoPosicoes, 0) },
    { id: 'programado', rotulo: 'Programado', valor: Math.max(b.comprasProgramadas, 0) },
    { id: 'disponivel', rotulo: 'Disponível', valor: Math.max(b.disponivel, 0) },
    { id: 'reserva', rotulo: 'Reserva', valor: Math.max(b.reserva, 0) },
  ];
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  return fatias.map((f) => ({ ...f, pct: total > 0 ? (f.valor / total) * 100 : 0 }));
}

function partes(b) {
  const fatias = fatiasDaBanca(b);
  const barra = fatias
    .filter((f) => f.pct > 0)
    .map((f) => `<span class="bankbar__seg bankbar__seg--${f.id}" style="width:${f.pct.toFixed(3)}%"></span>`)
    .join('');
  const legenda = fatias.map((f) => `
    <li class="bankbar__item">
      <span class="bankbar__key bankbar__key--${f.id}" aria-hidden="true"></span>
      <span class="bankbar__name">${f.rotulo}</span>
      <span class="bankbar__val num">${usdt(f.valor)}</span>
      <span class="bankbar__pct num">${pctSimples(f.pct, { casas: 1 })}</span>
    </li>`).join('');
  const resumo = fatias.map((f) => `${f.rotulo} ${usdt(f.valor)}`).join(', ');
  return { barra, legenda, resumo };
}

export function bancaHTML(b) {
  const { barra, legenda, resumo } = partes(b);
  return `
    <div class="bankbar">
      <div class="bankbar__track" role="img" aria-label="Uso da banca: ${resumo}">${barra}</div>
      <ul class="bankbar__legend">${legenda}</ul>
    </div>`;
}

export function atualizarBanca(raiz, b) {
  const el = raiz.querySelector('.bankbar');
  if (!el) return;
  const { barra, legenda, resumo } = partes(b);
  const trilho = el.querySelector('.bankbar__track');
  trocarHTML(trilho, barra);
  trilho.setAttribute('aria-label', `Uso da banca: ${resumo}`);
  trocarHTML(el.querySelector('.bankbar__legend'), legenda);
}
