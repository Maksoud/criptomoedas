// A7 · Alertas: regras (liga/desliga, limites, escopo, canais, ação automática e silêncio, com
// "Testar alerta"), os canais gerais de aviso do admin e o histórico dos alertas disparados com filtro.
// O editor das regras fica em ./regras.js (o mesmo dos atalhos da A2 e da A3).

import { getState, atualizarConfig, marcarAlertasLidos } from '../../store.js';
import { gravarConsulta } from '../../router.js';
import { SEVERIDADES } from '../../alerts/center.js';
import { criarTabela } from '../../ui/table.js';
import { monograma } from '../../ui/coin.js';
import { escapar, criarAgendador } from '../../ui/dom.js';
import { icon, renderIcons } from '../../ui/icons.js';
import { dataHora, plural } from '../../utils/format.js';
import { criarContexto, cabecalhoAdmin, nomeCliente } from './comum.js';
import { regraHTML, ligarRegras, trocarCartao } from './regras.js';

const GRUPOS = [
  { nome: 'Mercado', regras: ['variacao-brusca', 'preco-alvo', 'canal', 'conexao'] },
  { nome: 'Banca e posições', regras: ['reserva-banca', 'uso-banca', 'posicao-queda', 'posicao-sem-alvo', 'venda-bloqueada', 'ordem-executada'] },
  { nome: 'Comissões', regras: ['fechamento-periodo', 'comissao-a-vencer', 'comissao-vencida'] },
];

export function montarAlertas(alvo, { definicao, consulta }) {
  const ctx = criarContexto();
  const estado = () => getState();
  const filtro = {
    sev: SEVERIDADES[consulta.get('sev')] ? consulta.get('sev') : '',
    regra: estado().regrasAlerta[consulta.get('regra')] ? consulta.get('regra') : '',
  };

  alvo.innerHTML = `
    <section class="page">
      ${cabecalhoAdmin(definicao, { sub: 'Cada regra tem limites, escopo, canais e ação automática. Ações automáticas ficam no log do painel.' })}
      <section class="card section" aria-labelledby="a7-canais">
        <header class="section__head"><h2 id="a7-canais">Canais de aviso do admin</h2>
          <p class="section__note">Valem para todas as regras que tiverem o canal ligado. A central (sino) recebe sempre.</p></header>
        <div class="channels" data-ref="canais"></div>
      </section>
      <div data-ref="regras"></div>
      <section class="card section" aria-labelledby="a7-historico">
        <header class="section__head">
          <h2 id="a7-historico">Histórico de alertas</h2>
          <button class="btn btn--secondary btn--sm" type="button" data-acao="ler-todos">${icon('check-check')}<span>Marcar todos como lidos</span></button>
        </header>
        <div class="filters filters--flat" data-ref="filtros" role="group" aria-label="Filtrar histórico">
          <div class="field">
            <span class="field__label" id="a7-sev">Severidade</span>
            <div class="chips" role="group" aria-labelledby="a7-sev">
              <button class="chip" type="button" data-sev="">Todas</button>
              ${Object.entries(SEVERIDADES).map(([k, v]) => `<button class="chip" type="button" data-sev="${k}">${v.rotulo}</button>`).join('')}
            </div>
          </div>
          <label class="field">
            <span class="field__label">Regra</span>
            <select class="input" data-f="regra">
              <option value="">Todas as regras</option>
              ${Object.values(estado().regrasAlerta).map((r) => `<option value="${r.id}"${r.id === filtro.regra ? ' selected' : ''}>${escapar(r.nome)}</option>`).join('')}
            </select>
          </label>
          <p class="result-line" data-ref="contagem" aria-live="polite"></p>
        </div>
        <div data-ref="historico"></div>
      </section>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);

  // ---------- Canais gerais ----------
  function desenharCanais() {
    const s = estado();
    const permissao = typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission;
    const navegador = s.config.alertasNavegador && permissao === 'granted';
    const nota = permissao === 'denied'
      ? 'O navegador bloqueou as notificações deste site. Libere nas configurações do navegador para ligar.'
      : permissao === 'indisponivel' ? 'Este navegador não oferece notificações.' : 'Pede permissão ao ligar.';
    ref('canais').innerHTML = `
      <label class="switch-row"><input type="checkbox" checked disabled><span>Central de alertas (sino)</span></label>
      <label class="switch-row"><input type="checkbox" data-canal="toast" checked disabled><span>Aviso na tela (por regra)</span></label>
      <label class="switch-row"><input class="switch" type="checkbox" data-canal="som"${s.config.alertasSom ? ' checked' : ''}><span>Som curto</span></label>
      <label class="switch-row"><input class="switch" type="checkbox" data-canal="navegador"${navegador ? ' checked' : ''}${permissao === 'denied' || permissao === 'indisponivel' ? ' disabled' : ''}><span>Notificações do navegador <span class="muted">· ${nota}</span></span></label>
      <label class="switch-row"><input type="checkbox" disabled><span class="faint">E-mail · em breve</span></label>
      <label class="switch-row"><input type="checkbox" disabled><span class="faint">Telegram · em breve</span></label>
      <label class="switch-row"><input type="checkbox" disabled><span class="faint">WhatsApp · em breve</span></label>`;
  }
  ref('canais').addEventListener('change', async (e) => {
    const c = e.target.dataset.canal;
    if (c === 'som') atualizarConfig({ alertasSom: e.target.checked });
    if (c === 'navegador') {
      if (!e.target.checked) { atualizarConfig({ alertasNavegador: false }); return; }
      let permissao = typeof Notification === 'undefined' ? 'denied' : Notification.permission;
      if (permissao === 'default') permissao = await Notification.requestPermission();
      atualizarConfig({ alertasNavegador: permissao === 'granted' });
      desenharCanais();
    }
  });

  // ---------- Regras ----------
  function desenharRegras() {
    const r = estado().regrasAlerta;
    ref('regras').innerHTML = GRUPOS.map((g) => `
      <section class="rules-group" aria-label="${escapar(g.nome)}">
        <h2 class="rules-group__title">${escapar(g.nome)}</h2>
        <div class="rules">${g.regras.filter((id) => r[id]).map((id) => regraHTML(r[id])).join('')}</div>
      </section>`).join('');
    renderIcons();
  }
  ligarRegras(ref('regras'), {
    redesenhar(id) {
      trocarCartao(ref('regras').querySelector(`[data-regra="${id}"]`), regraHTML(estado().regrasAlerta[id]));
    },
  });

  // ---------- Histórico ----------
  const tabela = criarTabela({
    colunas: [
      { id: 'data', titulo: 'Data e hora', ordenar: (a) => +a.data, html: (a) => `<span class="num">${dataHora(a.data)}</span>` },
      {
        id: 'sev', titulo: 'Severidade', ordenar: (a) => a.severidade,
        html: (a) => { const s = SEVERIDADES[a.severidade] ?? SEVERIDADES.info; return `<span class="badge badge--${a.severidade === 'critico' ? 'down' : a.severidade === 'atencao' ? 'warn' : 'info'}">${icon(s.icone)}${s.rotulo}</span>`; },
      },
      {
        id: 'alerta', titulo: 'Alerta',
        html: (a) => `<span class="hist-alert${a.lido ? '' : ' is-unread'}"><b>${escapar(a.titulo)}</b><span class="muted">${escapar(a.texto)}</span>${a.acaoAutomatica ? `<span class="hist-alert__action">${icon('zap')}${escapar(a.acaoAutomatica)}</span>` : ''}</span>`,
      },
      {
        id: 'quem', titulo: 'Moeda · cliente',
        html: (a) => [a.moeda ? `<span class="coin">${monograma(a.moeda, { pequeno: true })}${escapar(a.moeda)}</span>` : '', a.clienteId ? escapar(nomeCliente(a.clienteId)) : ''].filter(Boolean).join(' · ') || '<span class="faint">—</span>',
      },
      { id: 'regra', titulo: 'Regra', ordenar: (a) => a.regraId, html: (a) => `<span class="muted">${escapar(estado().regrasAlerta[a.regraId]?.nome ?? a.regraId ?? '—')}</span>` },
    ],
    chave: (a) => a.id,
    ordem: { col: 'data', dir: 'desc' },
    rotulo: 'Histórico de alertas',
    vazio: { titulo: 'Nenhum alerta com estes filtros', texto: 'Use "Testar alerta" numa regra para ver como chega.' },
  });
  ref('historico').append(tabela.el);

  const passa = (a) => a.paraAdmin && (!filtro.sev || a.severidade === filtro.sev) && (!filtro.regra || a.regraId === filtro.regra);
  function aplicarHistorico() {
    gravarConsulta({ sev: filtro.sev, regra: filtro.regra });
    const lista = estado().alertas.filter(passa);
    tabela.definir(lista);
    for (const b of ref('filtros').querySelectorAll('[data-sev]')) b.setAttribute('aria-pressed', String(b.dataset.sev === filtro.sev));
    const naoLidos = lista.filter((a) => !a.lido).length;
    ref('contagem').innerHTML = `<b>${plural(lista.length, 'alerta')}</b>${naoLidos ? ` · ${plural(naoLidos, 'não lido', 'não lidos')}` : ''}`;
    alvo.querySelector('[data-acao="ler-todos"]').disabled = !estado().alertas.some((a) => a.paraAdmin && !a.lido);
  }
  ref('filtros').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sev]');
    if (!b) return;
    filtro.sev = b.dataset.sev;
    aplicarHistorico();
  });
  ref('filtros').addEventListener('change', (e) => {
    if (e.target.dataset.f !== 'regra') return;
    filtro.regra = e.target.value;
    aplicarHistorico();
  });
  alvo.querySelector('[data-acao="ler-todos"]').addEventListener('click', () => {
    marcarAlertasLidos(estado().alertas.filter((a) => a.paraAdmin && !a.lido).map((a) => a.id), 'admin');
  });

  // ---------- Ao vivo ----------
  ctx.on('alert:new', (a) => {
    if (!passa(a)) return;
    tabela.inserir(a);
    aplicarContagem();
  });
  const aplicarContagem = () => {
    const lista = tabela.linhas();
    const naoLidos = lista.filter((a) => !a.lido).length;
    ref('contagem').innerHTML = `<b>${plural(lista.length, 'alerta')}</b>${naoLidos ? ` · ${plural(naoLidos, 'não lido', 'não lidos')}` : ''}`;
    alvo.querySelector('[data-acao="ler-todos"]').disabled = !estado().alertas.some((x) => x.paraAdmin && !x.lido);
  };
  const lidos = criarAgendador(() => { tabela.atualizarCelulas(() => true, ['alerta']); aplicarContagem(); }, 200);
  ctx.aoDestruir(() => lidos.parar());
  ctx.on('alert:read', () => lidos.pedir());
  ctx.on('config:change', ({ mudou }) => { if (mudou.some((k) => k.startsWith('alertas'))) desenharCanais(); });
  // Regra mudada por fora (outra tela, ação automática): redesenha só se o foco não estiver num campo.
  ctx.on('alert-rule:change', (r) => {
    const card = ref('regras').querySelector(`[data-regra="${r.id}"]`);
    if (card && !card.contains(document.activeElement)) trocarCartao(card, regraHTML(r));
  });

  desenharCanais();
  desenharRegras();
  aplicarHistorico();
  renderIcons();
  return ctx;
}
