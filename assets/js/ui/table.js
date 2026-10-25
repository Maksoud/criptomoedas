// Tabela reaproveitável: cabeçalho fixo, ordenação por coluna, paginação de 50, números à direita em
// fonte mono e linha nova entrando no topo com destaque de 2 s (docs/IDENTIDADE_VISUAL.md §7, Tabelas).
//
// Colunas: { id, titulo, num?, ordenar?(linha) → valor, html(linha) → string, classe?(linha) → string, abreviado? }
// Sem `ordenar` a coluna não é ordenável. `atualizarCelulas` troca só as células indicadas das linhas
// visíveis (cotação ao vivo), sem redesenhar a tabela.

import { escapar } from './dom.js';
import { icon, renderIcons } from './icons.js';

let seq = 0;

function comparar(a, b) {
  const nuloA = a == null || Number.isNaN(a);
  const nuloB = b == null || Number.isNaN(b);
  if (nuloA || nuloB) return nuloA === nuloB ? 0 : nuloA ? 1 : -1;
  if (typeof a === 'string' || typeof b === 'string') return String(a).localeCompare(String(b), 'pt-BR');
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * @param opcoes {
 *   colunas, chave(linha) → id único, ordem: { col, dir: 'asc'|'desc' }, porPagina (0 = sem paginação),
 *   rotulo (nome acessível), vazio: { titulo, texto }, rodape?(linhas) → '<tr>…</tr>',
 *   aoClicarLinha?(linha, evento), compacta?, ordenavel (false = sem botões no cabeçalho, mas mantém `ordem`),
 *   maxLinhas? (guarda só as N primeiras: lista "últimas operações")
 * }
 */
export function criarTabela({
  colunas, chave, ordem = null, porPagina = 50, rotulo = 'Tabela',
  vazio = { titulo: 'Nada por aqui', texto: '' }, rodape = null, aoClicarLinha = null, compacta = false,
  ordenavel = true, maxLinhas = 0,
}) {
  const id = `tabela-${++seq}`;
  let linhas = [];
  let pagina = 0;
  let ordenacao = ordem ? { ...ordem } : null;
  const porChave = new Map();

  const el = document.createElement('div');
  el.className = 'table-card card';
  el.innerHTML = `
    <div class="table-wrap" role="region" aria-label="${escapar(rotulo)}" tabindex="0">
      <table class="table${compacta ? ' table--compact' : ''}${aoClicarLinha ? ' table--links' : ''}" id="${id}">
        <thead><tr>${colunas.map((c) => `
          <th scope="col" data-col="${c.id}" class="${c.num ? 'is-num' : ''}"${c.ordenar && ordenavel ? ' aria-sort="none"' : ''}>
            ${c.ordenar && ordenavel
              ? `<button class="th-sort" type="button" data-ordenar="${c.id}">${c.titulo}<span class="th-sort__icon" aria-hidden="true"></span></button>`
              : `<span>${c.titulo}</span>`}
          </th>`).join('')}</tr></thead>
        <tbody></tbody>
        <tfoot></tfoot>
      </table>
    </div>
    <div class="table-empty" hidden>
      <div class="empty">
        <span class="empty__icon">${icon('search')}</span>
        <p class="empty__title">${escapar(vazio.titulo)}</p>
        ${vazio.texto ? `<p class="empty__text">${escapar(vazio.texto)}</p>` : ''}
      </div>
    </div>
    <div class="pager" hidden>
      <p class="pager__info" aria-live="polite"></p>
      <div class="pager__btns">
        <button class="btn btn--secondary btn--sm" type="button" data-pagina="-1" aria-label="Página anterior">${icon('chevron-left')}</button>
        <button class="btn btn--secondary btn--sm" type="button" data-pagina="1" aria-label="Próxima página">${icon('chevron-right')}</button>
      </div>
    </div>`;

  const wrap = el.querySelector('.table-wrap');
  const tbody = el.querySelector('tbody');
  const tfoot = el.querySelector('tfoot');
  const vazioEl = el.querySelector('.table-empty');
  const pager = el.querySelector('.pager');

  function ordenar() {
    if (!ordenacao) return;
    const col = colunas.find((c) => c.id === ordenacao.col);
    if (!col?.ordenar) return;
    const sinal = ordenacao.dir === 'asc' ? 1 : -1;
    // Ordenação estável: empate mantém a ordem de chegada.
    const comIndice = linhas.map((l, i) => [col.ordenar(l), i, l]);
    comIndice.sort((a, b) => comparar(a[0], b[0]) * sinal || a[1] - b[1]);
    linhas = comIndice.map((x) => x[2]);
  }

  function celula(c, l) {
    const extra = c.classe ? c.classe(l) : '';
    const classes = [c.num ? 'is-num num' : '', extra].filter(Boolean).join(' ');
    return `<td data-col="${c.id}"${classes ? ` class="${classes}"` : ''}>${c.html(l)}</td>`;
  }

  function linhaHTML(l, nova = false) {
    return `<tr data-chave="${escapar(chave(l))}"${nova ? ' class="is-new"' : ''}>${colunas.map((c) => celula(c, l)).join('')}</tr>`;
  }

  function totalPaginas() {
    return porPagina ? Math.max(1, Math.ceil(linhas.length / porPagina)) : 1;
  }

  function visiveis() {
    if (!porPagina) return linhas;
    return linhas.slice(pagina * porPagina, (pagina + 1) * porPagina);
  }

  function desenharPager() {
    const n = linhas.length;
    if (!porPagina || n <= porPagina) {
      pager.hidden = true;
      return;
    }
    pager.hidden = false;
    const ini = pagina * porPagina + 1;
    const fim = Math.min(n, (pagina + 1) * porPagina);
    pager.querySelector('.pager__info').textContent = `${ini.toLocaleString('pt-BR')}–${fim.toLocaleString('pt-BR')} de ${n.toLocaleString('pt-BR')}`;
    pager.querySelector('[data-pagina="-1"]').disabled = pagina === 0;
    pager.querySelector('[data-pagina="1"]').disabled = pagina >= totalPaginas() - 1;
  }

  function desenharCabecalho() {
    for (const th of el.querySelectorAll('th[aria-sort]')) {
      const ativo = ordenacao?.col === th.dataset.col;
      th.setAttribute('aria-sort', ativo ? (ordenacao.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    }
  }

  function desenharRodape() {
    tfoot.innerHTML = rodape && linhas.length ? rodape(linhas) : '';
  }

  function desenhar() {
    pagina = Math.min(pagina, totalPaginas() - 1);
    const lista = visiveis();
    tbody.innerHTML = lista.map((l) => linhaHTML(l)).join('');
    vazioEl.hidden = linhas.length > 0;
    wrap.hidden = linhas.length === 0;
    desenharPager();
    desenharRodape();
    desenharCabecalho();
    renderIcons();
  }

  function indexar() {
    porChave.clear();
    for (const l of linhas) porChave.set(String(chave(l)), l);
  }

  el.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-ordenar]');
    if (botao) {
      const col = botao.dataset.ordenar;
      const primeira = colunas.find((c) => c.id === col)?.num ? 'desc' : 'asc';
      ordenacao = ordenacao?.col === col
        ? { col, dir: ordenacao.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: primeira };
      ordenar();
      pagina = 0;
      desenhar();
      return;
    }
    const nav = e.target.closest('[data-pagina]');
    if (nav) {
      pagina = Math.max(0, Math.min(totalPaginas() - 1, pagina + Number(nav.dataset.pagina)));
      desenhar();
      wrap.scrollTop = 0;
      return;
    }
    if (aoClicarLinha) {
      const tr = e.target.closest('tbody tr');
      if (tr && !e.target.closest('a, button')) {
        const l = porChave.get(tr.dataset.chave);
        if (l) aoClicarLinha(l, e);
      }
    }
  });

  tbody.addEventListener('animationend', (e) => {
    if (e.animationName === 'row-new') e.target.closest('tr')?.classList.remove('is-new');
  });

  return {
    el,

    /** Troca todas as linhas (filtro novo). Volta para a primeira página. */
    definir(novas) {
      linhas = [...novas];
      ordenar();
      if (maxLinhas) linhas = linhas.slice(0, maxLinhas);
      indexar();
      pagina = 0;
      desenhar();
    },

    /**
     * Acrescenta uma linha. Se ela cair no topo da primeira página (ordem por data), entra no DOM com
     * destaque sem redesenhar as outras; senão a página visível é refeita.
     */
    inserir(l, { destacar = true } = {}) {
      const k = String(chave(l));
      if (porChave.has(k)) return;
      linhas.push(l);
      ordenar();
      porChave.set(k, l);
      const pos = linhas.indexOf(l);
      if (maxLinhas && linhas.length > maxLinhas) {
        for (const fora of linhas.splice(maxLinhas)) porChave.delete(String(chave(fora)));
        if (pos >= maxLinhas) return;
      }
      if (pagina === 0 && pos === 0 && tbody.children.length) {
        tbody.insertAdjacentHTML('afterbegin', linhaHTML(l, destacar));
        const limite = maxLinhas || porPagina;
        while (limite && tbody.children.length > limite) tbody.lastElementChild.remove();
        desenharPager();
        desenharRodape();
        renderIcons();
        return;
      }
      desenhar();
      if (destacar) tbody.querySelector(`tr[data-chave="${CSS.escape(k)}"]`)?.classList.add('is-new');
    },

    /** Re-renderiza só as colunas `ids` das linhas visíveis que passam no `filtro`. */
    atualizarCelulas(filtro, ids) {
      const cols = colunas.filter((c) => ids.includes(c.id));
      for (const tr of tbody.rows) {
        const l = porChave.get(tr.dataset.chave);
        if (!l || !filtro(l)) continue;
        for (const c of cols) {
          const td = tr.querySelector(`td[data-col="${c.id}"]`);
          if (!td) continue;
          const html = c.html(l);
          if (td.innerHTML !== html) td.innerHTML = html;
          const extra = c.classe ? c.classe(l) : '';
          const classes = [c.num ? 'is-num num' : '', extra].filter(Boolean).join(' ');
          if (td.className !== classes) td.className = classes;
        }
      }
    },

    atualizarRodape: desenharRodape,
    linhas: () => linhas,
  };
}
