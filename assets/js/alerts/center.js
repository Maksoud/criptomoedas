// Central de alertas (docs/ESTRATEGIAS.md §6.2 e §6.3, IDENTIDADE_VISUAL.md §7):
// sino com o contador de não lidos, painel com o histórico (filtro por severidade, marcar como lidos),
// toasts no canto inferior direito, som curto e notificação do navegador (opcionais).
//
// Quem vê o quê: na visão Administrador, os alertas marcados para o admin; na visão Cliente, só os do
// cliente em "Visualizando como" marcados como visíveis para o cliente. Cada público tem o seu "lido".
// Críticos não lidos ficam fixos no topo da lista.

import { getState, on, marcarAlertasLidos, atualizarConfig } from '../store.js';
import { icon, renderIcons } from '../ui/icons.js';
import { escapar } from '../ui/dom.js';
import { monograma } from '../ui/coin.js';
import { dataHora } from '../utils/format.js';

const $ = (id) => document.getElementById(id);
const MAX_LISTA = 100;
const MAX_TOASTS = 3;
const DURACAO_TOAST = 4000;

export const SEVERIDADES = {
  info: { rotulo: 'Info', icone: 'info' },
  atencao: { rotulo: 'Atenção', icone: 'triangle-alert' },
  critico: { rotulo: 'Crítico', icone: 'octagon-alert' },
};

let filtro = 'todos';

// ---------------------------------------------------------------------------
// Seleção (puras sobre o estado: usadas também pelos testes)
// ---------------------------------------------------------------------------

export function publicoAtual(s = getState()) {
  return s.visao === 'cliente' ? 'cliente' : 'admin';
}

/** O alerta aparece para este público (e, no cliente, para o cliente selecionado)? */
export function visivelPara(alerta, publico, clienteId) {
  if (publico === 'admin') return !!alerta.paraAdmin;
  return !!alerta.paraCliente && alerta.clienteId === clienteId;
}

export function lidoPor(alerta, publico) {
  return publico === 'cliente' ? !!alerta.lidoCliente : !!alerta.lido;
}

/** Alertas visíveis, com críticos não lidos no topo e os demais do mais novo para o mais antigo. */
export function alertasVisiveis(s = getState(), { publico = publicoAtual(s), severidade = 'todos' } = {}) {
  const lista = s.alertas.filter((a) => visivelPara(a, publico, s.clienteAtual) && (severidade === 'todos' || a.severidade === severidade));
  const fixo = (a) => (a.severidade === 'critico' && !lidoPor(a, publico) ? 1 : 0);
  return lista.sort((a, b) => fixo(b) - fixo(a) || b.data - a.data);
}

export function contarNaoLidos(s = getState(), publico = publicoAtual(s)) {
  let total = 0;
  let criticos = 0;
  for (const a of s.alertas) {
    if (!visivelPara(a, publico, s.clienteAtual) || lidoPor(a, publico)) continue;
    total++;
    if (a.severidade === 'critico') criticos++;
  }
  return { total, criticos };
}

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

function itemHTML(a, publico) {
  const sev = SEVERIDADES[a.severidade] ?? SEVERIDADES.info;
  const lido = lidoPor(a, publico);
  const cliente = publico === 'admin' && a.clienteId ? getState().clientes[a.clienteId]?.nome : null;
  const meta = [
    a.moeda ? `<span class="alert-item__coin">${monograma(a.moeda, { pequeno: true })}${escapar(a.moeda)}</span>` : '',
    cliente ? `<span>${escapar(cliente)}</span>` : '',
    `<time class="num" datetime="${new Date(a.data).toISOString()}">${dataHora(a.data)}</time>`,
  ].filter(Boolean).join('<span aria-hidden="true">·</span>');
  return `
    <li>
      <button class="alert-item" type="button" data-id="${a.id}" data-sev="${a.severidade}" data-unread="${!lido}"
              aria-label="${escapar(`${sev.rotulo}: ${a.titulo}${lido ? '' : ' (não lido)'}`)}">
        <span class="alert-item__icon">${icon(sev.icone)}</span>
        <span class="alert-item__body">
          <span class="alert-item__title">${escapar(a.titulo)}</span>
          <span class="alert-item__text">${escapar(a.texto)}</span>
          ${a.acaoAutomatica ? `<span class="alert-item__action">${icon('zap')}Ação automática: ${escapar(a.acaoAutomatica)}</span>` : ''}
          <span class="alert-item__meta">${meta}</span>
        </span>
        ${lido ? '' : '<span class="alert-item__dot" aria-hidden="true"></span>'}
      </button>
    </li>`;
}

function desenharFerramentas() {
  const s = getState();
  const publico = publicoAtual(s);
  const { total } = contarNaoLidos(s, publico);
  const opcoes = [['todos', 'Todos'], ...Object.entries(SEVERIDADES).map(([k, v]) => [k, v.rotulo])];
  $('alerts-tools').innerHTML = `
    <div class="chips" role="group" aria-label="Filtrar por severidade">
      ${opcoes.map(([v, r]) => `<button class="chip" type="button" data-sev="${v}" aria-pressed="${filtro === v}">${r}</button>`).join('')}
    </div>
    <button class="btn btn--secondary btn--sm" type="button" data-acao="ler-todos" ${total ? '' : 'disabled'}>
      ${icon('check-check')}<span>Marcar todos como lidos</span>
    </button>`;
}

function desenharLista() {
  const s = getState();
  const publico = publicoAtual(s);
  const lista = alertasVisiveis(s, { publico, severidade: filtro });
  const corpo = $('alerts-list');
  if (!lista.length) {
    const cliente = publico === 'cliente';
    corpo.innerHTML = `
      <div class="empty">
        <span class="empty__icon">${icon('bell')}</span>
        <p class="empty__title">${filtro === 'todos' ? 'Nenhum alerta por enquanto' : 'Nenhum alerta com esta severidade'}</p>
        <p class="empty__text">${cliente
          ? 'Avisos de compras, vendas, reserva de banca e comissão deste cliente aparecem aqui.'
          : 'Avisos de risco, do robô e do sistema aparecem aqui assim que as regras dispararem.'}</p>
      </div>`;
    return;
  }
  const extra = lista.length > MAX_LISTA ? `<p class="alerts__more muted">Mostrando os ${MAX_LISTA} mais recentes de ${lista.length}.</p>` : '';
  corpo.innerHTML = `<ul class="alert-list">${lista.slice(0, MAX_LISTA).map((a) => itemHTML(a, publico)).join('')}</ul>${extra}`;
}

function desenharRodape() {
  const s = getState();
  const foot = $('alerts-foot');
  if (publicoAtual(s) !== 'admin') {
    foot.hidden = true;
    foot.innerHTML = '';
    return;
  }
  foot.hidden = false;
  const permissao = typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission;
  const navegador = s.config.alertasNavegador && permissao === 'granted';
  const nota = permissao === 'denied'
    ? 'O navegador bloqueou as notificações deste site. Libere nas configurações do navegador para ligar.'
    : permissao === 'indisponivel' ? 'Este navegador não oferece notificações.' : '';
  foot.innerHTML = `
    <p class="label">Canais de aviso</p>
    <label class="switch-row">
      <input type="checkbox" data-canal="som" ${s.config.alertasSom ? 'checked' : ''}>
      <span>Som curto</span>
    </label>
    <label class="switch-row">
      <input type="checkbox" data-canal="navegador" ${navegador ? 'checked' : ''} ${permissao === 'denied' || permissao === 'indisponivel' ? 'disabled' : ''}>
      <span>Notificações do navegador</span>
    </label>
    ${nota ? `<p class="alerts__note muted">${nota}</p>` : ''}
    <p class="alerts__soon muted">${icon('mail')}E-mail, Telegram e WhatsApp: em breve</p>`;
}

function desenharSino() {
  const s = getState();
  const { total, criticos } = contarNaoLidos(s);
  const el = $('alerts-count');
  el.hidden = total === 0;
  el.textContent = total > 99 ? '99+' : String(total);
  el.dataset.critical = String(criticos > 0);
  $('alerts-toggle').setAttribute('aria-label', total ? `Alertas: ${total} não ${total === 1 ? 'lido' : 'lidos'}` : 'Alertas');
}

function desenharTudo() {
  if (getState().carregando) return;
  desenharSino();
  desenharFerramentas();
  desenharLista();
  desenharRodape();
  renderIcons();
}

// ---------------------------------------------------------------------------
// Toast, som e notificação
// ---------------------------------------------------------------------------

function tomDoToast(a) {
  if (a.severidade === 'critico') return 'down';
  if (a.severidade === 'atencao') return 'warn';
  return a.tom ?? 'info';
}

function mostrarToast(a) {
  const area = $('toasts');
  // No celular só um aviso por vez, para não cobrir a tela.
  const maximo = window.matchMedia('(max-width: 640px)').matches ? 1 : MAX_TOASTS;
  while (area.children.length >= maximo) area.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.tom = tomDoToast(a);
  el.setAttribute('role', a.severidade === 'critico' ? 'alert' : 'status');
  const sev = SEVERIDADES[a.severidade] ?? SEVERIDADES.info;
  el.innerHTML = `
    <span class="toast__icon">${icon(a.regraId === 'ordem-executada' ? 'bot' : sev.icone)}</span>
    <div class="toast__body">
      <p class="toast__title">${escapar(a.titulo)}</p>
      <p class="toast__text">${escapar(a.texto)}</p>
    </div>
    <button class="icon-btn toast__close" type="button" aria-label="Fechar aviso">${icon('x')}</button>`;
  el.querySelector('.toast__close').addEventListener('click', () => el.remove());
  area.append(el);
  renderIcons();
  setTimeout(() => el.remove(), a.severidade === 'critico' ? DURACAO_TOAST * 2 : DURACAO_TOAST);
}

let audio = null;
function tocarSom(severidade) {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const osc = audio.createOscillator();
    const ganho = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = severidade === 'critico' ? 660 : 880;
    ganho.gain.setValueAtTime(0.0001, audio.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25);
    osc.connect(ganho).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.26);
  } catch {
    /* sem áudio: ignora */
  }
}

function notificar(a) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const n = new Notification(`CriptoOps · ${a.titulo}`, { body: a.texto, tag: a.id, icon: 'assets/img/logo.svg' });
    n.onclick = () => { window.focus(); abrirPainel(); n.close(); };
  } catch {
    /* ignora */
  }
}

let abrirPainel = () => $('alerts-toggle').click();

function aoNovo(a) {
  const s = getState();
  const publico = publicoAtual(s);
  desenharTudo();
  if (a.origem !== 'ao-vivo' || !visivelPara(a, publico, s.clienteAtual)) return;
  const canais = s.regrasAlerta[a.regraId]?.canais ?? {};
  if (canais.toast !== false) mostrarToast(a);
  if (publico === 'admin' && s.config.alertasSom && canais.som) tocarSom(a.severidade);
  if (publico === 'admin' && s.config.alertasNavegador && canais.navegador && (document.hidden || a.severidade === 'critico')) notificar(a);
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------

async function ligarNavegador(caixa) {
  if (typeof Notification === 'undefined') return;
  let permissao = Notification.permission;
  if (permissao === 'default') permissao = await Notification.requestPermission();
  const ok = permissao === 'granted';
  caixa.checked = ok;
  atualizarConfig({ alertasNavegador: ok });
  desenharRodape();
}

export function iniciarCentral({ abrir } = {}) {
  if (abrir) abrirPainel = abrir;

  $('alerts-tools').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-sev]');
    if (chip) {
      filtro = chip.dataset.sev;
      desenharFerramentas();
      desenharLista();
      renderIcons();
      return;
    }
    if (e.target.closest('[data-acao="ler-todos"]')) {
      const s = getState();
      const publico = publicoAtual(s);
      marcarAlertasLidos(alertasVisiveis(s, { publico }).map((a) => a.id), publico);
    }
  });

  $('alerts-list').addEventListener('click', (e) => {
    const item = e.target.closest('.alert-item');
    if (!item || item.dataset.unread !== 'true') return;
    marcarAlertasLidos([item.dataset.id], publicoAtual());
  });

  $('alerts-foot').addEventListener('change', (e) => {
    const caixa = e.target.closest('[data-canal]');
    if (!caixa) return;
    if (caixa.dataset.canal === 'som') {
      atualizarConfig({ alertasSom: caixa.checked });
      if (caixa.checked) tocarSom('info'); // gesto do usuário: libera o áudio e mostra como soa
    } else if (caixa.checked) {
      ligarNavegador(caixa);
    } else {
      atualizarConfig({ alertasNavegador: false });
    }
  });

  on('alert:new', aoNovo);
  on('alert:read', desenharTudo);
  on('data:ready', desenharTudo);
  on('view:change', desenharTudo);
  on('state:clienteAtual', desenharTudo);
  on('config:change', ({ mudou }) => { if (mudou.some((k) => k.startsWith('alertas'))) desenharRodape(); });
  desenharTudo();
}
