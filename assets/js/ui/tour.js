// Tour rápido "Como apresentar": 5 passos que destacam o que mostrar numa apresentação de 5 minutos
// (troca de visão, cotações, relatório, trava de compras e alertas). Opcional: abre pelo botão do topo,
// pelo rodapé ou com ?tour na URL. Esc fecha; setas avançam e voltam; o foco fica dentro do cartão.

import { getState } from '../store.js';
import { irPara } from '../router.js';
import { icon, renderIcons } from './icons.js';

const PASSOS = [
  {
    alvo: '#view-switch',
    rota: ['cliente', 'visao-geral'],
    titulo: 'Duas visões numa página',
    texto: 'Comece pelo Cliente: patrimônio, resultado e comissão prevista. "Visualizando como" troca o cliente fictício, no lugar do login. Depois mostre o Administrador, que configura e controla tudo.',
  },
  {
    alvo: '.ticker',
    titulo: 'Cotações reais, ao vivo',
    texto: 'Os preços chegam da Binance a cada segundo, e o robô simulado opera sobre eles. O ponto à esquerda mostra a origem: se a conexão cair, o painel passa para cotações simuladas e avisa no topo.',
  },
  {
    alvo: '.page-head',
    rota: ['cliente', 'relatorio'],
    titulo: 'Relatório de resultados',
    texto: 'Lucro bruto, taxas e resultado líquido por período e moedas, com exportação em CSV e PDF. As vendas novas do robô entram sem recarregar a página.',
  },
  {
    alvo: '#lock-toggle',
    rota: ['admin', 'painel'],
    titulo: 'Travar compras',
    texto: 'Na visão Administrador, este botão bloqueia novas compras de todos os clientes; as vendas continuam. Também dá para travar por cliente (Clientes) ou por moeda (Moedas e estratégias).',
  },
  {
    alvo: '#alerts-toggle',
    titulo: 'Alertas',
    texto: 'Variação brusca, canal rompido, comissão vencida e uso da banca chegam aqui e como aviso na tela. Em Alertas (A7) dá para ligar regras, mudar limites e usar "Testar alerta".',
  },
];

let raiz = null;
let passo = 0;
let focoAnterior = null;
let quadro = null;

const $ = (sel) => raiz.querySelector(sel);

function montar() {
  raiz = document.createElement('div');
  raiz.className = 'tour';
  raiz.hidden = true;
  raiz.innerHTML = `
    <div class="tour__veil"></div>
    <div class="tour__spot" aria-hidden="true"></div>
    <section class="tour__card" role="dialog" aria-modal="true" aria-labelledby="tour-titulo" aria-describedby="tour-texto" tabindex="-1">
      <div class="tour__head">
        <p class="label tour__step" aria-live="polite"></p>
        <button class="icon-btn tour__close" type="button" data-tour="fechar" aria-label="Fechar tour">${icon('x')}</button>
      </div>
      <h2 class="tour__title" id="tour-titulo"></h2>
      <p class="tour__text" id="tour-texto"></p>
      <div class="tour__foot">
        <div class="tour__dots" aria-hidden="true">${PASSOS.map(() => '<span></span>').join('')}</div>
        <button class="btn btn--secondary btn--sm" type="button" data-tour="voltar">${icon('chevron-left')}<span>Anterior</span></button>
        <button class="btn btn--primary btn--sm" type="button" data-tour="avancar"><span>Próximo</span>${icon('chevron-right')}</button>
      </div>
    </section>`;
  document.body.append(raiz);

  raiz.addEventListener('click', (e) => {
    const acao = e.target.closest('[data-tour]')?.dataset.tour;
    if (acao === 'fechar') fecharTour();
    else if (acao === 'voltar') irPasso(passo - 1);
    else if (acao === 'avancar') (passo === PASSOS.length - 1 ? fecharTour() : irPasso(passo + 1));
  });

  raiz.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); fecharTour(); return; }
    if (e.key === 'ArrowRight' && passo < PASSOS.length - 1) { e.preventDefault(); irPasso(passo + 1); return; }
    if (e.key === 'ArrowLeft' && passo > 0) { e.preventDefault(); irPasso(passo - 1); return; }
    if (e.key === 'Tab') prenderFoco(e);
  });
}

function prenderFoco(e) {
  const focaveis = [...$('.tour__card').querySelectorAll('button:not(:disabled)')];
  if (!focaveis.length) return;
  const primeiro = focaveis[0];
  const ultimo = focaveis.at(-1);
  if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
  else if (!$('.tour__card').contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); }
}

/** Elemento visível do passo, ou null (ex.: alvo escondido na tela estreita). */
function alvoVisivel(seletor) {
  const el = document.querySelector(seletor);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height ? el : null;
}

function posicionar() {
  quadro = null;
  if (!raiz || raiz.hidden) return;
  const spot = $('.tour__spot');
  const card = $('.tour__card');
  const el = alvoVisivel(PASSOS[passo].alvo);
  const margem = 6;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;

  if (!el) {
    spot.hidden = true;
    raiz.classList.add('tour--centro');
    card.style.left = card.style.top = '';
    return;
  }
  raiz.classList.remove('tour--centro');
  spot.hidden = false;
  const r = el.getBoundingClientRect();
  Object.assign(spot.style, {
    left: `${r.left - margem}px`,
    top: `${r.top - margem}px`,
    width: `${r.width + margem * 2}px`,
    height: `${r.height + margem * 2}px`,
  });

  // No celular o cartão fica preso embaixo (CSS); no resto, abaixo do alvo ou acima se não couber.
  if (vw <= 640) {
    card.style.left = card.style.top = '';
    return;
  }
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const espaco = 12;
  let top = r.bottom + margem + espaco;
  if (top + ch > vh - espaco) top = Math.max(espaco, r.top - margem - espaco - ch);
  let left = r.left + r.width / 2 - cw / 2;
  left = Math.max(espaco, Math.min(vw - cw - espaco, left));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function pedirPosicao() {
  if (!quadro) quadro = requestAnimationFrame(posicionar);
}

function desenharPasso() {
  const p = PASSOS[passo];
  $('.tour__step').textContent = `Passo ${passo + 1} de ${PASSOS.length}`;
  $('#tour-titulo').textContent = p.titulo;
  $('#tour-texto').textContent = p.texto;
  $('[data-tour="voltar"]').disabled = passo === 0;
  const avancar = $('[data-tour="avancar"]');
  avancar.innerHTML = passo === PASSOS.length - 1 ? `<span>Concluir</span>${icon('check')}` : `<span>Próximo</span>${icon('chevron-right')}`;
  raiz.querySelectorAll('.tour__dots span').forEach((d, i) => d.classList.toggle('is-on', i === passo));
  renderIcons();
}

function irPasso(n) {
  passo = Math.max(0, Math.min(PASSOS.length - 1, n));
  const p = PASSOS[passo];
  if (p.rota) {
    const [visao, pagina] = p.rota;
    const rota = getState().rota;
    if (rota?.visao !== visao || rota?.pagina !== pagina) irPara(visao, pagina);
  }
  desenharPasso();
  // A tela nova desenha no hashchange; espera dois quadros para medir o alvo já no lugar.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelector(p.alvo)?.scrollIntoView({ block: 'nearest' });
    posicionar();
  }));
  $('[data-tour="avancar"]').focus();
}

export function abrirTour() {
  if (!raiz) montar();
  if (!raiz.hidden) return;
  focoAnterior = document.activeElement;
  raiz.hidden = false;
  document.documentElement.classList.add('tour-aberto');
  window.addEventListener('resize', pedirPosicao);
  window.addEventListener('scroll', pedirPosicao, true);
  irPasso(0);
}

export function fecharTour() {
  if (!raiz || raiz.hidden) return;
  raiz.hidden = true;
  document.documentElement.classList.remove('tour-aberto');
  window.removeEventListener('resize', pedirPosicao);
  window.removeEventListener('scroll', pedirPosicao, true);
  focoAnterior?.focus?.();
}

/** Liga os botões "Como apresentar" e o ?tour da URL. */
export function iniciarTour() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-abrir-tour]')) abrirTour();
  });
  if (new URLSearchParams(location.search).has('tour')) {
    const iniciarQuandoPronto = () => (getState().carregando ? setTimeout(iniciarQuandoPronto, 300) : abrirTour());
    iniciarQuandoPronto();
  }
}
