// Cartão de KPI: rótulo, valor, variação com seta e minigráfico opcional (docs/IDENTIDADE_VISUAL.md §7).
// `atualizarKpi` troca só os pedaços que mudaram, para a cotação ao vivo não repintar o cartão todo.

import { escapar, trocarHTML } from './dom.js';
import { sparkline } from './sparkline.js';
import { usdt } from '../utils/format.js';

/** "12.345,67 USDT" com a unidade menor. */
export function valorUSDT(v, opcoes) {
  const texto = usdt(v, { sufixo: false, ...opcoes });
  return texto === '—' ? texto : `${texto}<span class="kpi__unit">USDT</span>`;
}

function variacaoHTML(variacao) {
  if (!variacao) return '';
  return `<span class="kpi__chg num" data-dir="${variacao.dir ?? 'flat'}">${escapar(variacao.texto)}</span>`;
}

/**
 * @param k { id, rotulo, valor (HTML), variacao?: { texto, dir }, extra?: texto, spark?: number[], classe?, titulo? }
 */
export function kpiHTML(k) {
  return `
    <article class="kpi card${k.pequeno ? ' kpi--sm' : ''}" data-kpi="${k.id}"${k.titulo ? ` title="${escapar(k.titulo)}"` : ''}>
      <p class="label kpi__label">${escapar(k.rotulo)}</p>
      <p class="kpi__value${k.classe ? ` ${k.classe}` : ''}" data-campo="valor" aria-live="polite" aria-atomic="true">${k.valor}</p>
      <p class="kpi__meta">
        <span data-campo="variacao">${variacaoHTML(k.variacao)}</span>
        <span class="kpi__extra" data-campo="extra">${escapar(k.extra ?? '')}</span>
      </p>
      ${k.spark ? `<div class="kpi__spark" data-campo="spark">${sparkline(k.spark, { rotulo: k.rotuloSpark ?? '' })}</div>` : ''}
    </article>`;
}

/** Atualiza um KPI já desenhado dentro de `raiz`. Só os campos informados mudam. */
export function atualizarKpi(raiz, id, k) {
  const card = raiz.querySelector(`[data-kpi="${id}"]`);
  if (!card) return;
  if ('valor' in k) {
    const el = card.querySelector('[data-campo="valor"]');
    trocarHTML(el, k.valor);
    if ('classe' in k) el.className = `kpi__value${k.classe ? ` ${k.classe}` : ''}`;
  }
  if ('variacao' in k) trocarHTML(card.querySelector('[data-campo="variacao"]'), variacaoHTML(k.variacao));
  if ('extra' in k) trocarHTML(card.querySelector('[data-campo="extra"]'), escapar(k.extra ?? ''));
  if ('spark' in k) trocarHTML(card.querySelector('[data-campo="spark"]'), sparkline(k.spark, { rotulo: k.rotuloSpark ?? '' }));
}
