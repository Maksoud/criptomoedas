// Barra superior: seletor de visão, robô, sino de alertas, tema e faixa de cotações (provisória).
import { getState, setState, on } from '../store.js';
import { trocarVisao, hashDe } from '../router.js';
import { paginaInicial } from '../views/routes.js';
import { icon, renderIcons } from './icons.js';
import { abrirCamada, fecharCamada } from './scrim.js';
import * as persist from '../persist.js';
import { restaurarDados } from '../data/loader.js';
import { textoOrigem } from './notices.js';

const $ = (id) => document.getElementById(id);
const temaClaroMQ = window.matchMedia('(prefers-color-scheme: light)');

// ---------- Seletor de visão ----------
function marcarVisao(visao) {
  document.documentElement.dataset.view = visao;
  for (const opt of $('view-switch').querySelectorAll('.segmented__opt')) {
    const ativo = opt.dataset.view === visao;
    opt.setAttribute('aria-checked', String(ativo));
    opt.tabIndex = ativo ? 0 : -1;
  }
  document.querySelector('.brand[href]').href = hashDe(visao, paginaInicial(visao));
}

function iniciarSeletorVisao() {
  const grupo = $('view-switch');
  grupo.addEventListener('click', (e) => {
    const opt = e.target.closest('.segmented__opt');
    if (opt) trocarVisao(opt.dataset.view);
  });
  // Setas alternam entre as opções, como num grupo de rádio.
  grupo.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const outra = getState().visao === 'cliente' ? 'admin' : 'cliente';
    trocarVisao(outra);
    grupo.querySelector(`[data-view="${outra}"]`).focus();
  });
  on('view:change', marcarVisao);
  marcarVisao(getState().visao);
}

// ---------- Robô ----------
function desenharRobo(robo) {
  const btn = $('robot-toggle');
  const ligado = robo === 'ligado';
  btn.setAttribute('aria-pressed', String(ligado));
  btn.setAttribute('aria-label', ligado ? 'Robô ligado. Pausar robô' : 'Robô pausado. Ligar robô');
  btn.title = ligado ? 'Pausar o robô (as cotações continuam)' : 'Ligar o robô';
  btn.innerHTML = `${icon(ligado ? 'bot' : 'pause', 'icon-20')}<span class="robot-btn__text">${ligado ? 'Ligado' : 'Pausado'}</span>`;
  renderIcons();
}

function iniciarRobo() {
  $('robot-toggle').addEventListener('click', () => {
    const robo = getState().robo === 'ligado' ? 'pausado' : 'ligado';
    setState({ robo });
    persist.set('robo', robo);
  });
  on('state:robo', desenharRobo);
  desenharRobo(getState().robo);
}

// ---------- Tema ----------
export function temaEfetivo() {
  return getState().tema ?? (temaClaroMQ.matches ? 'light' : 'dark');
}

function desenharTema() {
  const root = document.documentElement;
  const tema = getState().tema;
  if (tema) root.dataset.theme = tema;
  else delete root.dataset.theme;

  const escuro = temaEfetivo() === 'dark';
  const btn = $('theme-toggle');
  const rotulo = escuro ? 'Ativar tema claro' : 'Ativar tema escuro';
  btn.setAttribute('aria-label', rotulo);
  btn.title = rotulo;
  btn.innerHTML = icon(escuro ? 'sun' : 'moon', 'icon-20');
  renderIcons();
}

function iniciarTema() {
  $('theme-toggle').addEventListener('click', () => {
    const tema = temaEfetivo() === 'dark' ? 'light' : 'dark';
    setState({ tema });
    persist.set('tema', tema);
  });
  temaClaroMQ.addEventListener('change', desenharTema);
  on('state:tema', desenharTema);
  desenharTema();
}

// ---------- Central de alertas (painel vazio até a F4) ----------
function abrirAlertas() {
  const painel = $('alerts-panel');
  painel.classList.add('is-open');
  painel.setAttribute('aria-hidden', 'false');
  painel.inert = false;
  $('alerts-toggle').setAttribute('aria-expanded', 'true');
  abrirCamada(fecharAlertas);
  $('alerts-close').focus();
}

function fecharAlertas() {
  const painel = $('alerts-panel');
  if (!painel.classList.contains('is-open')) return;
  painel.classList.remove('is-open');
  painel.setAttribute('aria-hidden', 'true');
  painel.inert = true;
  $('alerts-toggle').setAttribute('aria-expanded', 'false');
  fecharCamada(fecharAlertas);
  $('alerts-toggle').focus();
}

function iniciarAlertas() {
  $('alerts-panel').inert = true;
  $('alerts-toggle').addEventListener('click', () => {
    if ($('alerts-panel').classList.contains('is-open')) fecharAlertas();
    else abrirAlertas();
  });
  $('alerts-close').addEventListener('click', fecharAlertas);
}

// ---------- Restaurar dados (provisório no topo; vai para o admin na F5) ----------
function iniciarRestaurar() {
  const btn = $('restore-data');
  const desenhar = () => { btn.disabled = getState().carregando; };
  btn.addEventListener('click', () => {
    restaurarDados();
    const texto = btn.querySelector('.restore-btn__text');
    texto.textContent = 'Dados restaurados';
    setTimeout(() => { texto.textContent = 'Restaurar dados'; }, 2000);
  });
  on('data:ready', desenhar);
  desenhar();
}

// ---------- Origem das cotações ----------
function desenharOrigem(mercado) {
  const { estado, texto, titulo } = textoOrigem(mercado);
  const el = $('quote-source');
  el.querySelector('.source-dot').dataset.state = estado;
  el.querySelector('.ticker__source-text').textContent = texto;
  el.title = titulo;
}

// ---------- Faixa de cotações (preenchida na F2) ----------
function desenharTickerProvisorio() {
  const larguras = [56, 64, 48, 60, 52, 58];
  $('ticker-list').innerHTML = larguras
    .map((w) => `
      <li class="ticker__item" aria-hidden="true">
        <span class="skeleton" style="width:28px"></span>
        <span class="skeleton" style="width:${w}px"></span>
      </li>`)
    .join('');
}

export function iniciarTopbar() {
  iniciarSeletorVisao();
  iniciarRobo();
  iniciarTema();
  iniciarAlertas();
  iniciarRestaurar();
  on('state:mercado', desenharOrigem);
  desenharOrigem(getState().mercado);
  desenharTickerProvisorio();
}
