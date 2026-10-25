// Barra superior: seletor de visão, trava global de compras (admin), robô, sino de alertas, tema e
// origem das cotações.
// A faixa de cotações fica em ui/ticker.js.
import { getState, setState, on, atualizarConfig } from '../store.js';
import { trocarVisao, hashDe } from '../router.js';
import { paginaInicial } from '../views/routes.js';
import { icon, renderIcons } from './icons.js';
import { abrirCamada, fecharCamada } from './scrim.js';
import * as persist from '../persist.js';
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

// ---------- Robô (o motor em engine/engine.js não avalia nada enquanto estiver pausado) ----------
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

// ---------- Central de alertas: abre e fecha o painel (conteúdo em alerts/center.js) ----------
function abrirAlertas() {
  const painel = $('alerts-panel');
  painel.classList.add('is-open');
  painel.setAttribute('aria-hidden', 'false');
  painel.inert = false;
  $('alerts-toggle').setAttribute('aria-expanded', 'true');
  abrirCamada(fecharAlertas);
  $('alerts-close').focus();
  // O conteúdo pode ter mudado com o painel fechado (ícones novos).
  renderIcons();
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

// ---------- Travar compras (global, só na visão Administrador) ----------
// Trava novas compras de todos os clientes; as vendas programadas continuam. A faixa "Compras travadas"
// com o botão "Destravar" fica em ui/notices.js.
export function alternarTravaGlobal() {
  atualizarConfig({ travaGlobal: !getState().config.travaGlobal });
}

function desenharTrava() {
  const btn = $('lock-toggle');
  const travado = !!getState().config.travaGlobal;
  btn.disabled = getState().carregando;
  btn.setAttribute('aria-pressed', String(travado));
  btn.classList.toggle('is-locked', travado);
  btn.title = travado ? 'Compras travadas para todos os clientes. Clique para destravar.' : 'Travar novas compras de todos os clientes (as vendas continuam)';
  btn.setAttribute('aria-label', travado ? 'Compras travadas. Destravar compras' : 'Travar compras de todos os clientes');
  btn.innerHTML = `${icon(travado ? 'lock' : 'lock-open')}<span class="lock-btn__text">${travado ? 'Compras travadas' : 'Travar compras'}</span>`;
  renderIcons();
}

function iniciarTrava() {
  $('lock-toggle').addEventListener('click', alternarTravaGlobal);
  on('config:change', ({ mudou }) => { if (mudou.includes('travaGlobal')) desenharTrava(); });
  on('data:ready', desenharTrava);
  desenharTrava();
}

// ---------- Origem das cotações ----------
function desenharOrigem(mercado) {
  const { estado, texto, titulo } = textoOrigem(mercado);
  const el = $('quote-source');
  el.querySelector('.source-dot').dataset.state = estado;
  el.querySelector('.ticker__source-text').textContent = texto;
  el.title = titulo;
}

export function iniciarTopbar() {
  iniciarSeletorVisao();
  iniciarRobo();
  iniciarTema();
  iniciarAlertas();
  iniciarTrava();
  on('state:mercado', desenharOrigem);
  desenharOrigem(getState().mercado);
}
