// Editor das regras de alerta (docs/ESTRATEGIAS.md §6): usado na tela A7 (todas as regras, completas) e
// nos atalhos "Alertas desta moeda" (A2) e "Alertas deste cliente" (A3), que abrem um modal só com as
// regras daquela moeda ou cliente. Tudo vale na hora e fica salvo no navegador (store.atualizarRegraAlerta).

import { getState, atualizarRegraAlerta, adicionarAlerta, registrarLog } from '../../store.js';
import { hashDe } from '../../router.js';
import { ACOES } from '../../alerts/rules.js';
import { SEVERIDADES } from '../../alerts/center.js';
import { abrirModal } from '../../ui/modal.js';
import { monograma } from '../../ui/coin.js';
import { escapar } from '../../ui/dom.js';
import { icon, renderIcons } from '../../ui/icons.js';
import { preco as fmtPreco } from '../../utils/format.js';

/** Em quais dimensões cada regra pode ter escopo. */
export const ESCOPO_DE = {
  'variacao-brusca': ['moedas'],
  'preco-alvo': ['moedas'],
  canal: ['moedas'],
  'reserva-banca': ['clientes', 'moedas'],
  'uso-banca': ['clientes'],
  'posicao-queda': ['clientes', 'moedas'],
  'venda-bloqueada': ['clientes', 'moedas'],
  'posicao-sem-alvo': ['clientes', 'moedas'],
  'ordem-executada': ['clientes', 'moedas'],
  'fechamento-periodo': ['clientes'],
  'comissao-a-vencer': ['clientes'],
  'comissao-vencida': ['clientes'],
  conexao: [],
};

export const REGRAS_DA_MOEDA = ['variacao-brusca', 'preco-alvo', 'canal'];
export const REGRAS_DO_CLIENTE = ['uso-banca', 'posicao-queda', 'reserva-banca'];

const CANAIS = [
  { id: 'toast', rotulo: 'Aviso na tela' },
  { id: 'som', rotulo: 'Som' },
  { id: 'navegador', rotulo: 'Navegador' },
];

const todosIds = (dim) => Object.keys(dim === 'moedas' ? getState().moedas : getState().clientes);
const nomeDe = (dim, id) => (dim === 'moedas' ? id : getState().clientes[id]?.nome ?? id);

/** A regra vale para este item? */
export function incluiNoEscopo(regra, dim, id) {
  const v = regra.escopo?.[dim];
  return !Array.isArray(v) || v.includes(id);
}

/** Novo escopo de uma dimensão incluindo ou tirando `id` ('todas'/'todos' quando a lista fica completa). */
export function escopoCom(regra, dim, id, incluir) {
  const todos = todosIds(dim);
  let lista = Array.isArray(regra.escopo?.[dim]) ? [...regra.escopo[dim]] : [...todos];
  lista = incluir ? [...new Set([...lista, id])] : lista.filter((x) => x !== id);
  lista = todos.filter((x) => lista.includes(x));
  const valor = lista.length === todos.length ? (dim === 'moedas' ? 'todas' : 'todos') : lista;
  return { ...regra.escopo, [dim]: valor };
}

export function textoEscopo(regra) {
  const partes = [];
  for (const dim of ESCOPO_DE[regra.id] ?? []) {
    const v = regra.escopo?.[dim];
    if (!Array.isArray(v)) partes.push(dim === 'moedas' ? 'todas as moedas' : 'todos os clientes');
    else if (!v.length) partes.push(dim === 'moedas' ? 'nenhuma moeda' : 'nenhum cliente');
    else partes.push(v.length <= 3 ? v.map((x) => nomeDe(dim, x)).join(', ') : `${v.length} ${dim === 'moedas' ? 'moedas' : 'clientes'}`);
  }
  return partes.join(' · ') || 'Geral';
}

export function textoPublico(regra) {
  const v = regra.visivel ?? {};
  if (v.admin && v.cliente) return 'Admin e cliente';
  if (v.cliente) return 'Só o cliente';
  return 'Só o admin';
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function limitesHTML(regra) {
  const defs = (regra.limitesDef ?? []).filter((d) => d.tipo !== 'lista');
  if (!defs.length) return '';
  return `<div class="rule__limits">${defs.map((d) => `
    <label class="field rule__limit">
      <span class="field__label">${escapar(d.rotulo)}</span>
      <span class="input-group">
        <input class="input num" type="number" min="0" step="any" inputmode="decimal" data-r-limite="${d.chave}" value="${escapar(regra.limites[d.chave])}">
        ${d.sufixo ? `<span class="input-group__suffix">${escapar(d.sufixo)}</span>` : ''}
      </span>
      <span class="pfield__erro" hidden></span>
    </label>`).join('')}</div>`;
}

function alvosHTML(regra, moeda = null) {
  if (regra.id !== 'preco-alvo') return '';
  const s = getState();
  const alvos = (regra.limites.alvos ?? []).map((a, i) => ({ ...a, i })).filter((a) => !moeda || a.moeda === moeda);
  const opcoes = Object.keys(s.moedas).map((m) => `<option value="${m}"${m === moeda ? ' selected' : ''}>${m}</option>`).join('');
  const atual = moeda ? s.precos[moeda]?.atual : null;
  return `
    <div class="rule__targets">
      <p class="field__label">Preços alvo${moeda ? ` de ${escapar(moeda)}` : ''}</p>
      ${alvos.length ? `<ul class="target-list">${alvos.map((a) => `
        <li>${moeda ? '' : `${monograma(a.moeda, { pequeno: true })}<b>${escapar(a.moeda)}</b>`}
          <span class="num">${fmtPreco(Number(a.preco))} USDT</span>
          <button class="icon-btn icon-btn--sm" type="button" data-r-alvo-del="${a.i}" aria-label="Remover alvo de ${escapar(a.moeda)} em ${fmtPreco(Number(a.preco))}">${icon('x')}</button>
        </li>`).join('')}</ul>` : '<p class="muted rule__hint">Nenhum preço alvo definido.</p>'}
      <div class="target-add">
        ${moeda ? `<input type="hidden" data-r-alvo-moeda value="${escapar(moeda)}">` : `<select class="input" data-r-alvo-moeda aria-label="Moeda do alvo">${opcoes}</select>`}
        <span class="input-group">
          <input class="input num" type="number" min="0" step="any" inputmode="decimal" data-r-alvo-preco placeholder="${atual ? fmtPreco(atual).replace(/\./g, '').replace(',', '.') : 'Preço'}" aria-label="Preço alvo em USDT">
          <span class="input-group__suffix">USDT</span>
        </span>
        <button class="btn btn--secondary btn--sm" type="button" data-r-alvo-add>${icon('plus')}<span>Adicionar alvo</span></button>
      </div>
      <p class="pfield__erro" data-r-alvo-erro hidden></p>
    </div>`;
}

function escopoFocoHTML(regra, foco) {
  const dim = foco.moeda ? 'moedas' : 'clientes';
  const id = foco.moeda ?? foco.clienteId;
  if (!(ESCOPO_DE[regra.id] ?? []).includes(dim)) return '';
  const nome = nomeDe(dim, id);
  return `<label class="switch-row rule__scope-one"><input class="switch" type="checkbox" data-r-escopo-foco="${dim}:${escapar(id)}"${incluiNoEscopo(regra, dim, id) ? ' checked' : ''}>
    <span>Vale para ${escapar(nome)}</span></label>`;
}

function escopoCompletoHTML(regra) {
  const dims = ESCOPO_DE[regra.id] ?? [];
  if (!dims.length) return '<p class="muted rule__hint">Regra geral, sem escopo.</p>';
  return dims.map((dim) => {
    const ids = todosIds(dim);
    const todos = !Array.isArray(regra.escopo?.[dim]);
    return `
      <div class="field">
        <span class="field__label">${dim === 'moedas' ? 'Moedas' : 'Clientes'}</span>
        <div class="chips chips--sm" role="group" aria-label="${dim === 'moedas' ? 'Moedas' : 'Clientes'} desta regra">
          <button class="chip" type="button" data-r-escopo-todos="${dim}" aria-pressed="${todos}">${dim === 'moedas' ? 'Todas' : 'Todos'}</button>
          ${ids.map((id) => `<button class="chip" type="button" data-r-escopo="${dim}:${escapar(id)}" aria-pressed="${!todos && regra.escopo[dim].includes(id)}">
            ${dim === 'moedas' ? monograma(id, { pequeno: true }) : ''}<span>${escapar(nomeDe(dim, id))}</span></button>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function canaisHTML(regra) {
  return `
    <div class="field">
      <span class="field__label">Canais</span>
      <div class="rule__channels">
        <label class="switch-row"><input type="checkbox" checked disabled><span>Central de alertas</span></label>
        ${CANAIS.map((c) => `<label class="switch-row"><input type="checkbox" data-r-canal="${c.id}"${regra.canais?.[c.id] ? ' checked' : ''}><span>${c.rotulo}</span></label>`).join('')}
        <label class="switch-row"><input type="checkbox" disabled><span>E-mail · em breve</span></label>
        <label class="switch-row"><input type="checkbox" disabled><span>Telegram · em breve</span></label>
      </div>
    </div>`;
}

function acaoHTML(regra) {
  let controle;
  if (regra.acaoFixa) {
    const texto = regra.acaoFixa === 'conforme a estratégia' ? 'Conforme a estratégia (parâmetros de rompimento na A2)' : `${ACOES[regra.acaoFixa]} (fixa)`;
    controle = `<p class="rule__fixed">${icon('zap')}${escapar(texto)}</p>`;
  } else if ((regra.acoesPossiveis ?? []).length > 1) {
    controle = `<select class="input" data-r-acao aria-label="Ação automática">${regra.acoesPossiveis.map((a) => `<option value="${a}"${a === regra.acaoAutomatica ? ' selected' : ''}>${ACOES[a]}</option>`).join('')}</select>`;
  } else {
    controle = '<p class="muted rule__fixed">Nenhuma</p>';
  }
  return `<div class="field rule__action"><span class="field__label">Ação automática</span>${controle}</div>`;
}

function silencioHTML(regra) {
  return `
    <label class="field rule__cooldown">
      <span class="field__label">Silêncio</span>
      <span class="input-group">
        <input class="input num" type="number" min="0" max="1440" step="1" data-r-cooldown value="${escapar(regra.cooldownMin)}">
        <span class="input-group__suffix">min</span>
      </span>
      <span class="pfield__erro" hidden></span>
    </label>`;
}

/**
 * Um cartão de regra. `foco` = { moeda } ou { clienteId } (atalhos: só o "vale para" daquele item);
 * sem foco, o cartão completo da A7.
 */
export function regraHTML(regra, { foco = null } = {}) {
  const sev = SEVERIDADES[regra.severidade] ?? SEVERIDADES.info;
  const fixa = regra.id === 'comissao-vencida';
  return `
    <article class="rule card" data-regra="${regra.id}" data-sev="${regra.severidade}" data-ligada="${regra.ligada}">
      <header class="rule__head">
        <span class="rule__icon">${icon(sev.icone)}</span>
        <div class="rule__title">
          <h3>${escapar(regra.nome)}</h3>
          <p class="muted">${escapar(regra.descricao)}</p>
        </div>
        <label class="switch-field rule__on" title="${fixa ? 'Esta regra não pode ser desligada' : ''}">
          <input class="switch" type="checkbox" data-r-ligada${regra.ligada ? ' checked' : ''}${fixa ? ' disabled' : ''} aria-label="Regra ${escapar(regra.nome)} ligada">
          <span>${regra.ligada ? 'Ligada' : 'Desligada'}</span>
        </label>
      </header>
      <div class="rule__body">
        ${foco ? escopoFocoHTML(regra, foco) : ''}
        ${limitesHTML(regra)}
        ${alvosHTML(regra, foco?.moeda ?? null)}
        ${foco ? '' : `
          <div class="rule__grid">
            <div class="rule__scope">${escopoCompletoHTML(regra)}</div>
            ${canaisHTML(regra)}
            ${acaoHTML(regra)}
            ${silencioHTML(regra)}
          </div>`}
        <footer class="rule__foot">
          <span class="muted">${icon('eye')}${textoPublico(regra)} · <span class="badge badge--${regra.severidade === 'critico' ? 'down' : regra.severidade === 'atencao' ? 'warn' : 'info'}">${sev.rotulo}</span>
            ${foco ? '' : ` · ${escapar(textoEscopo(regra))}`}</span>
          <button class="btn btn--secondary btn--sm" type="button" data-r-testar>${icon('bell-ring')}<span>Testar alerta</span></button>
        </footer>
      </div>
    </article>`;
}

/** Troca um cartão de regra mantendo o foco no mesmo controle (teclado não perde o lugar). */
export function trocarCartao(card, html) {
  if (!card) return;
  const ativo = card.contains(document.activeElement) ? document.activeElement : null;
  const attr = ativo ? [...ativo.attributes].find((a) => a.name.startsWith('data-r')) : null;
  const pai = card.parentElement;
  const id = card.dataset.regra;
  card.outerHTML = html;
  renderIcons();
  if (!attr) return;
  const novo = pai.querySelector(`[data-regra="${id}"]`);
  const alvo = novo?.querySelector(attr.value ? `[${attr.name}="${CSS.escape(attr.value)}"]` : `[${attr.name}]`);
  alvo?.focus();
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

/** Dispara um alerta de teste da regra pelos canais dela (sem ação automática nem silêncio). */
export function testarRegra(regraId) {
  const regra = getState().regrasAlerta[regraId];
  if (!regra) return null;
  const a = adicionarAlerta({
    regraId,
    tipo: 'teste',
    severidade: regra.severidade,
    titulo: `Teste: ${regra.nome}`,
    texto: `Alerta de teste disparado pelo admin. ${regra.descricao}`,
    paraAdmin: true,
    paraCliente: false,
    origem: 'ao-vivo',
    acaoAutomatica: regra.acaoAutomatica !== 'nenhuma' || regra.acaoFixa ? 'Não executada no teste' : null,
  });
  registrarLog(`Alerta de teste disparado: ${regra.nome}`);
  return a;
}

function erroDe(input, texto) {
  const el = input.closest('.field, .pfield, .rule__targets')?.querySelector('.pfield__erro');
  input.setAttribute('aria-invalid', String(!!texto));
  if (el) { el.hidden = !texto; el.textContent = texto ?? ''; }
}

/**
 * Liga os controles dos cartões de regra dentro de `raiz`. `redesenhar(regraId)` é chamado quando o
 * cartão precisa ser refeito (escopo, alvos); mudanças simples (limites, canais) só gravam.
 */
export function ligarRegras(raiz, { redesenhar }) {
  const regraDe = (el) => {
    const card = el.closest('[data-regra]');
    return card ? getState().regrasAlerta[card.dataset.regra] : null;
  };

  raiz.addEventListener('change', (e) => {
    const t = e.target;
    const regra = regraDe(t);
    if (!regra) return;
    if (t.matches('[data-r-ligada]')) {
      atualizarRegraAlerta(regra.id, { ligada: t.checked });
      registrarLog(`Regra de alerta "${regra.nome}" ${t.checked ? 'ligada' : 'desligada'}`);
      redesenhar(regra.id);
    } else if (t.matches('[data-r-canal]')) {
      atualizarRegraAlerta(regra.id, { canais: { ...regra.canais, [t.dataset.rCanal]: t.checked } });
    } else if (t.matches('[data-r-acao]')) {
      atualizarRegraAlerta(regra.id, { acaoAutomatica: t.value });
      registrarLog(`Ação automática de "${regra.nome}": ${ACOES[t.value]}`);
    } else if (t.matches('[data-r-escopo-foco]')) {
      const [dim, id] = t.dataset.rEscopoFoco.split(':');
      atualizarRegraAlerta(regra.id, { escopo: escopoCom(regra, dim, id, t.checked) });
    } else if (t.matches('[data-r-limite]') || t.matches('[data-r-cooldown]')) {
      const v = Number(t.value);
      if (t.value.trim() === '' || !Number.isFinite(v) || v < 0 || (t.matches('[data-r-limite]') && v === 0)) {
        erroDe(t, t.matches('[data-r-cooldown]') ? 'Use 0 ou mais minutos.' : 'Use um número maior que zero.');
        return;
      }
      erroDe(t, null);
      if (t.matches('[data-r-cooldown]')) atualizarRegraAlerta(regra.id, { cooldownMin: Math.round(v) });
      else atualizarRegraAlerta(regra.id, { limites: { ...regra.limites, [t.dataset.rLimite]: v } });
    }
  });

  raiz.addEventListener('click', (e) => {
    const t = e.target;
    const regra = regraDe(t);
    if (!regra) return;
    const todos = t.closest('[data-r-escopo-todos]');
    const chip = t.closest('[data-r-escopo]');
    if (todos) {
      const dim = todos.dataset.rEscopoTodos;
      if (!Array.isArray(regra.escopo?.[dim])) return; // já vale para todos
      atualizarRegraAlerta(regra.id, { escopo: { ...regra.escopo, [dim]: dim === 'moedas' ? 'todas' : 'todos' } });
      redesenhar(regra.id);
    } else if (chip) {
      const [dim, id] = chip.dataset.rEscopo.split(':');
      const lista = Array.isArray(regra.escopo?.[dim]) ? regra.escopo[dim] : [];
      // Com "Todos" marcado, clicar num item passa a valer só para ele.
      const novo = Array.isArray(regra.escopo?.[dim])
        ? escopoCom(regra, dim, id, !lista.includes(id))
        : { ...regra.escopo, [dim]: [id] };
      atualizarRegraAlerta(regra.id, { escopo: novo });
      redesenhar(regra.id);
    } else if (t.closest('[data-r-alvo-add]')) {
      const caixa = t.closest('.rule__targets');
      const moeda = caixa.querySelector('[data-r-alvo-moeda]').value;
      const input = caixa.querySelector('[data-r-alvo-preco]');
      const v = Number(input.value);
      const erro = caixa.querySelector('[data-r-alvo-erro]');
      if (!(v > 0)) {
        erro.hidden = false;
        erro.textContent = 'Informe um preço maior que zero.';
        input.focus();
        return;
      }
      const alvos = [...(regra.limites.alvos ?? []), { moeda, preco: v }];
      atualizarRegraAlerta(regra.id, { limites: { ...regra.limites, alvos } });
      registrarLog(`Preço alvo de ${moeda} em ${fmtPreco(v)} USDT adicionado`);
      redesenhar(regra.id);
    } else if (t.closest('[data-r-alvo-del]')) {
      const i = Number(t.closest('[data-r-alvo-del]').dataset.rAlvoDel);
      const alvos = (regra.limites.alvos ?? []).filter((_, j) => j !== i);
      atualizarRegraAlerta(regra.id, { limites: { ...regra.limites, alvos } });
      redesenhar(regra.id);
    } else if (t.closest('[data-r-testar]')) {
      testarRegra(regra.id);
      const b = t.closest('[data-r-testar]');
      const texto = b.querySelector('span');
      texto.textContent = 'Alerta enviado';
      setTimeout(() => { if (texto.isConnected) texto.textContent = 'Testar alerta'; }, 1800);
    }
  });

  // Enter no preço alvo adiciona.
  raiz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-r-alvo-preco]')) {
      e.preventDefault();
      e.target.closest('.rule__targets').querySelector('[data-r-alvo-add]').click();
    }
  });
}

/** Modal "Alertas desta moeda" / "Alertas deste cliente", sem sair da tela. */
export function abrirAlertasDe(foco) {
  const s = getState();
  const ids = foco.moeda ? REGRAS_DA_MOEDA : REGRAS_DO_CLIENTE;
  const nome = foco.moeda ? `${s.moedas[foco.moeda]?.nome ?? foco.moeda} (${foco.moeda})` : s.clientes[foco.clienteId]?.nome;
  const corpo = () => `
    <p class="muted modal__text">Limites, canais e ação automática valem para todos; aqui você escolhe se a regra vale para ${escapar(nome)}.
      <a href="${hashDe('admin', 'alertas')}" data-fechar-modal>Todas as regras</a></p>
    <div class="rules rules--compact">${ids.map((id) => regraHTML(s.regrasAlerta[id], { foco })).join('')}</div>`;
  const modal = abrirModal({
    titulo: foco.moeda ? `Alertas de ${foco.moeda}` : `Alertas de ${nome}`,
    largura: 'lg',
    corpo: corpo(),
    acoes: [{ id: 'ok', rotulo: 'Fechar', classe: 'btn--primary' }],
  });
  const body = modal.el.querySelector('.modal__body');
  ligarRegras(body, {
    redesenhar(regraId) {
      trocarCartao(body.querySelector(`[data-regra="${regraId}"]`), regraHTML(getState().regrasAlerta[regraId], { foco }));
    },
  });
  body.addEventListener('click', (e) => { if (e.target.closest('[data-fechar-modal]')) modal.fechar('ok'); });
  return modal;
}
