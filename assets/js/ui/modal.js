// Modais com <dialog> nativo (foco preso, Esc fecha, fundo escurecido): confirmação de ações com o
// resumo do impacto (docs/IDENTIDADE_VISUAL.md §7, "Modal de confirmação") e janelas com formulário.

import { escapar } from './dom.js';
import { icon, renderIcons } from './icons.js';

let aberto = null;

/**
 * Abre um modal. `corpo` é HTML. `acoes`: [{ id, rotulo, classe?, icone? }] — a última recebe o foco.
 * `aoAgir(id, el)` decide o que fazer com cada botão; devolver `false` mantém o modal aberto.
 * Devolve { el, fechar }. `aoFechar(id)` roda sempre, com o id do botão (ou null se fechou por Esc/fundo).
 */
export function abrirModal({ titulo, corpo = '', acoes = [], largura = 'md', aoAbrir = null, aoAgir = null, aoFechar = null }) {
  aberto?.fechar(null);
  const el = document.createElement('dialog');
  el.className = `modal modal--${largura}`;
  el.setAttribute('aria-labelledby', 'modal-titulo');
  el.innerHTML = `
    <form method="dialog" class="modal__box" novalidate>
      <header class="modal__head">
        <h2 id="modal-titulo">${escapar(titulo)}</h2>
        <button class="icon-btn" type="button" data-fechar aria-label="Fechar">${icon('x', 'icon-20')}</button>
      </header>
      <div class="modal__body">${corpo}</div>
      ${acoes.length ? `<footer class="modal__foot">${acoes.map((a) => `
        <button class="btn ${a.classe ?? 'btn--secondary'}" type="button" data-acao="${a.id}">
          ${a.icone ? icon(a.icone) : ''}<span>${escapar(a.rotulo)}</span>
        </button>`).join('')}</footer>` : ''}
    </form>`;
  document.body.append(el);

  let fechado = false;
  const voltarFoco = document.activeElement;
  function fechar(id = null) {
    if (fechado) return;
    fechado = true;
    if (aberto?.el === el) aberto = null;
    el.close();
    el.remove();
    aoFechar?.(id);
    if (voltarFoco?.isConnected) voltarFoco.focus();
  }

  el.addEventListener('cancel', (e) => { e.preventDefault(); fechar(null); });
  el.addEventListener('click', async (e) => {
    if (e.target === el) { fechar(null); return; } // clique no fundo
    if (e.target.closest('[data-fechar]')) { fechar(null); return; }
    const b = e.target.closest('[data-acao]');
    if (!b || !el.querySelector('.modal__foot')?.contains(b)) return;
    const r = aoAgir ? await aoAgir(b.dataset.acao, el) : true;
    if (r !== false) fechar(b.dataset.acao);
  });
  // Enter num campo do formulário aciona o último botão (o principal).
  el.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    el.querySelector('.modal__foot [data-acao]:last-child')?.click();
  });

  el.showModal();
  renderIcons();
  aoAbrir?.(el);
  if (!el.contains(document.activeElement) || document.activeElement.matches('[data-fechar]')) {
    (el.querySelector('[autofocus]') ?? el.querySelector('.modal__foot [data-acao]:last-child'))?.focus();
  }
  aberto = { el, fechar };
  return aberto;
}

/**
 * Confirmação: título, texto do efeito e resumo do impacto ("12 ordens · 4.380,00 USDT").
 * Resolve true se confirmou.
 */
export function confirmar({ titulo, texto = '', resumo = '', confirmar: rotulo = 'Confirmar', cancelar = 'Cancelar', perigo = true, icone = null }) {
  return new Promise((resolve) => {
    abrirModal({
      titulo,
      largura: 'sm',
      corpo: `
        ${resumo ? `<p class="modal__impact num">${resumo}</p>` : ''}
        ${texto ? `<p class="modal__text">${texto}</p>` : ''}`,
      acoes: [
        { id: 'nao', rotulo: cancelar },
        { id: 'sim', rotulo, classe: perigo ? 'btn--danger' : 'btn--primary', icone },
      ],
      aoFechar: (id) => resolve(id === 'sim'),
    });
  });
}
