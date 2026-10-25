// Menu lateral: itens da visão atual, item ativo, gaveta no celular e recolher no desktop.
import { getState, setState, on } from '../store.js';
import { VISOES } from '../views/routes.js';
import { hashDe } from '../router.js';
import { icon, renderIcons } from './icons.js';
import { abrirCamada, fecharCamada } from './scrim.js';
import * as persist from '../persist.js';

const $ = (id) => document.getElementById(id);
const gavetaMQ = window.matchMedia('(max-width: 900px)');

function desenharMenu(visao) {
  const def = VISOES[visao];
  $('sidebar-view').textContent = `Visão ${def.nome}`;
  $('nav').innerHTML = def.paginas
    .map((p) => `
      <li>
        <a class="nav-link" href="${hashDe(visao, p.id)}" data-pagina="${p.id}" title="${p.titulo}">
          ${icon(p.icone)}<span class="nav-link__text">${p.titulo}</span>
        </a>
      </li>`)
    .join('');
  marcarAtivo();
  renderIcons();
}

function marcarAtivo() {
  const pagina = getState().rota?.pagina;
  for (const link of $('nav').querySelectorAll('.nav-link')) {
    if (link.dataset.pagina === pagina) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

// ---------- Gaveta (celular) ----------
function abrirGaveta() {
  document.documentElement.dataset.drawer = 'open';
  $('menu-toggle').setAttribute('aria-expanded', 'true');
  abrirCamada(fecharGaveta);
  atualizarInert();
  $('nav').querySelector('[aria-current="page"]')?.focus();
}

function fecharGaveta() {
  if (document.documentElement.dataset.drawer !== 'open') return;
  delete document.documentElement.dataset.drawer;
  $('menu-toggle').setAttribute('aria-expanded', 'false');
  fecharCamada(fecharGaveta);
}

// A gaveta fechada fica fora da ordem de tabulação.
function atualizarInert() {
  const fechada = gavetaMQ.matches && document.documentElement.dataset.drawer !== 'open';
  $('sidebar').inert = fechada;
}

// ---------- Recolher (desktop) ----------
function aplicarRecolhido(recolhido) {
  if (recolhido) document.documentElement.dataset.sidebar = 'collapsed';
  else delete document.documentElement.dataset.sidebar;
  const btn = $('sidebar-collapse');
  btn.setAttribute('aria-label', recolhido ? 'Expandir menu' : 'Recolher menu');
  btn.title = recolhido ? 'Expandir menu' : '';
  btn.querySelector('.collapse-btn__text').textContent = recolhido ? 'Expandir menu' : 'Recolher menu';
}

export function iniciarSidebar() {
  $('menu-toggle').addEventListener('click', () => {
    if (document.documentElement.dataset.drawer === 'open') fecharGaveta();
    else abrirGaveta();
  });
  $('menu-close').addEventListener('click', () => { fecharGaveta(); $('menu-toggle').focus(); });
  $('nav').addEventListener('click', (e) => {
    if (e.target.closest('.nav-link')) fecharGaveta();
  });
  gavetaMQ.addEventListener('change', () => { fecharGaveta(); atualizarInert(); });

  $('sidebar-collapse').addEventListener('click', () => {
    const recolhido = !getState().menuRecolhido;
    setState({ menuRecolhido: recolhido });
    persist.set('menuRecolhido', recolhido);
  });

  on('state:menuRecolhido', aplicarRecolhido);
  on('view:change', desenharMenu);
  on('route:change', marcarAtivo);
  // Qualquer abertura/fechamento da gaveta (inclusive pelo fundo ou Esc) atualiza o tab-order.
  new MutationObserver(atualizarInert).observe(document.documentElement, { attributes: true, attributeFilter: ['data-drawer'] });

  aplicarRecolhido(getState().menuRecolhido);
  desenharMenu(getState().visao);
  atualizarInert();
}
