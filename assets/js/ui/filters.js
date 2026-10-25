// Filtros de período, moedas e lado, guardados na URL (?de=2026-10-01&ate=2026-10-24&moedas=BTC,ETH&lado=venda).
// A primeira parte (sem DOM) é pura e testada em docs/testes.html; a segunda desenha os controles.

import { somarDias, deISO, diaISO } from '../utils/dates.js';
import { data as fmtData } from '../utils/format.js';
import { escapar } from './dom.js';
import { monograma } from './coin.js';

export const PRESETS = [
  { id: 'hoje', nome: 'Hoje' },
  { id: '7d', nome: '7 dias' },
  { id: '30d', nome: '30 dias' },
  { id: 'periodo', nome: 'Período de apuração atual' },
  { id: 'anterior', nome: 'Período anterior' },
  { id: 'mes', nome: 'Mês atual' },
  { id: 'inicio', nome: 'Desde o início' },
  { id: 'personalizado', nome: 'Personalizado' },
];

export const LADOS = [
  { id: '', nome: 'Todos' },
  { id: 'compra', nome: 'Compras' },
  { id: 'venda', nome: 'Vendas' },
];

/** 'AAAA-MM-DD' que existe no calendário. */
export function dataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  return diaISO(deISO(texto)) === texto;
}

/**
 * Intervalo { de, ate } de um preset. `ctx`: { hoje, inicioContrato, periodos } — periodos do cliente,
 * do mais recente para o mais antigo. Devolve null quando o preset não se aplica (ex.: sem período aberto).
 */
export function intervaloDoPreset(id, { hoje, inicioContrato = null, periodos = [] }) {
  switch (id) {
    case 'hoje': return { de: hoje, ate: hoje };
    case '7d': return { de: somarDias(hoje, -6), ate: hoje };
    case '30d': return { de: somarDias(hoje, -29), ate: hoje };
    case 'mes': return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
    case 'inicio': return { de: inicioContrato ?? somarDias(hoje, -179), ate: hoje };
    case 'periodo': {
      const p = periodos.find((x) => x.status === 'aberto');
      return p ? { de: p.inicio, ate: p.fim } : null;
    }
    case 'anterior': {
      const p = periodos.find((x) => x.status !== 'aberto');
      return p ? { de: p.inicio, ate: p.fim } : null;
    }
    default: return null;
  }
}

/** Qual preset gera exatamente esse intervalo ('personalizado' se nenhum). */
export function detectarPreset(de, ate, ctx) {
  for (const p of PRESETS) {
    if (p.id === 'personalizado') continue;
    const i = intervaloDoPreset(p.id, ctx);
    if (i && i.de === de && i.ate === ate) return p.id;
  }
  return 'personalizado';
}

/**
 * Lê os filtros da URL. Sem datas válidas, usa o preset `padrao`.
 * `moedas` = moedas que o filtro aceita; `comLado` liga o filtro de lado.
 */
export function lerFiltros(params, { padrao = '30d', ctx, moedas = [], comLado = false }) {
  let de = params.get('de');
  let ate = params.get('ate');
  let preset;
  if (dataValida(de) && dataValida(ate)) {
    if (de > ate) [de, ate] = [ate, de];
    preset = detectarPreset(de, ate, ctx);
  } else {
    const i = intervaloDoPreset(padrao, ctx) ?? intervaloDoPreset('inicio', ctx);
    ({ de, ate } = i);
    preset = intervaloDoPreset(padrao, ctx) ? padrao : 'inicio';
  }
  const pedidas = (params.get('moedas') ?? '').split(',').map((m) => m.trim().toUpperCase()).filter(Boolean);
  let escolhidas = moedas.filter((m) => pedidas.includes(m));
  if (escolhidas.length === moedas.length) escolhidas = []; // todas = sem filtro
  const lado = comLado && ['compra', 'venda'].includes(params.get('lado')) ? params.get('lado') : '';
  return { preset, de, ate, moedas: escolhidas, lado };
}

/** Campos da URL para os filtros. */
export function consultaDosFiltros(f) {
  return { de: f.de, ate: f.ate, moedas: f.moedas.length ? f.moedas.join(',') : '', lado: f.lado || '' };
}

/** Contexto dos presets para um cliente. */
export function contextoDoCliente(cliente, periodos, hoje = diaISO(new Date())) {
  return { hoje, inicioContrato: cliente?.inicioContrato ?? null, periodos };
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

/**
 * Desenha os filtros em `alvo` e chama `aoMudar(filtros)` a cada mudança.
 * @param opcoes { valor, ctx, moedas: [símbolos], comPeriodo, comMoedas, comLado, aoMudar }
 */
export function criarFiltros(alvo, { valor, ctx, moedas = [], comPeriodo = true, comMoedas = true, comLado = false, aoMudar }) {
  let f = { ...valor, moedas: [...valor.moedas] };

  const opcoesPreset = PRESETS.map((p) => {
    const aplica = p.id === 'personalizado' || intervaloDoPreset(p.id, ctx);
    return `<option value="${p.id}"${aplica ? '' : ' disabled'}>${p.nome}</option>`;
  }).join('');

  alvo.classList.add('filters');
  alvo.setAttribute('role', 'group');
  alvo.setAttribute('aria-label', 'Filtros');
  alvo.innerHTML = `
    ${comPeriodo ? `
      <div class="filters__period">
        <label class="field">
          <span class="field__label">Período</span>
          <select class="input" data-f="preset">${opcoesPreset}</select>
        </label>
        <label class="field field--date">
          <span class="field__label">De</span>
          <input class="input num" type="date" data-f="de" required>
        </label>
        <label class="field field--date">
          <span class="field__label">Até</span>
          <input class="input num" type="date" data-f="ate" required>
        </label>
      </div>` : ''}
    ${comLado ? `
      <div class="field">
        <span class="field__label" id="lado-rotulo">Lado</span>
        <div class="segmented segmented--field" role="radiogroup" aria-labelledby="lado-rotulo">
          ${LADOS.map((l) => `<button class="segmented__opt" type="button" role="radio" data-lado="${l.id}">${l.nome}</button>`).join('')}
        </div>
      </div>` : ''}
    ${comMoedas && moedas.length > 1 ? `
      <div class="field filters__coins">
        <span class="field__label" id="moedas-rotulo">Moedas</span>
        <div class="chips" role="group" aria-labelledby="moedas-rotulo">
          <button class="chip" type="button" data-moeda="">Todas</button>
          ${moedas.map((m) => `<button class="chip" type="button" data-moeda="${escapar(m)}">${monograma(m, { pequeno: true })}<span>${escapar(m)}</span></button>`).join('')}
        </div>
      </div>` : ''}`;

  const $ = (sel) => alvo.querySelector(sel);

  function desenhar() {
    if (comPeriodo) {
      $('[data-f="preset"]').value = f.preset;
      $('[data-f="de"]').value = f.de;
      $('[data-f="ate"]').value = f.ate;
      $('[data-f="de"]').title = fmtData(f.de);
      $('[data-f="ate"]').title = fmtData(f.ate);
    }
    for (const b of alvo.querySelectorAll('[data-lado]')) {
      const ativo = b.dataset.lado === f.lado;
      b.setAttribute('aria-checked', String(ativo));
      b.tabIndex = ativo ? 0 : -1;
    }
    for (const b of alvo.querySelectorAll('[data-moeda]')) {
      const m = b.dataset.moeda;
      b.setAttribute('aria-pressed', String(m ? f.moedas.includes(m) : f.moedas.length === 0));
    }
  }

  function mudar(parcial) {
    f = { ...f, ...parcial };
    desenhar();
    aoMudar({ ...f, moedas: [...f.moedas] });
  }

  alvo.addEventListener('change', (e) => {
    const campo = e.target.dataset?.f;
    if (campo === 'preset') {
      const i = intervaloDoPreset(e.target.value, ctx);
      if (i) mudar({ preset: e.target.value, ...i });
      else mudar({ preset: 'personalizado' });
    } else if (campo === 'de' || campo === 'ate') {
      let de = $('[data-f="de"]').value;
      let ate = $('[data-f="ate"]').value;
      if (!dataValida(de) || !dataValida(ate)) { desenhar(); return; }
      if (de > ate) {
        if (campo === 'de') ate = de;
        else de = ate;
      }
      mudar({ de, ate, preset: detectarPreset(de, ate, ctx) });
    }
  });

  alvo.addEventListener('click', (e) => {
    const lado = e.target.closest('[data-lado]');
    if (lado) {
      mudar({ lado: lado.dataset.lado });
      return;
    }
    const chip = e.target.closest('[data-moeda]');
    if (!chip) return;
    const m = chip.dataset.moeda;
    if (!m) {
      mudar({ moedas: [] });
      return;
    }
    let lista = f.moedas.includes(m) ? f.moedas.filter((x) => x !== m) : [...f.moedas, m];
    if (lista.length === moedas.length) lista = [];
    lista = moedas.filter((x) => lista.includes(x)); // mantém a ordem do catálogo
    mudar({ moedas: lista });
  });

  // Setas no grupo de lado, como num grupo de rádio.
  alvo.addEventListener('keydown', (e) => {
    const atual = e.target.closest('[data-lado]');
    if (!atual || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const ids = LADOS.map((l) => l.id);
    const i = (ids.indexOf(f.lado) + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length;
    mudar({ lado: ids[i] });
    alvo.querySelector(`[data-lado="${ids[i]}"]`).focus();
  });

  desenhar();
  return { valor: () => ({ ...f, moedas: [...f.moedas] }) };
}

/** Texto das moedas escolhidas para cabeçalhos: "Todas" ou "BTC, ETH". */
export function textoMoedas(escolhidas) {
  return escolhidas.length ? escolhidas.join(', ') : 'Todas';
}
