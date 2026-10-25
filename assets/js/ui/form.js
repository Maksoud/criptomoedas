// Formulário gerado a partir de definições de parâmetros (engine/params.js e `estrategia.parametros`):
// rótulo + campo com sufixo + ajuda, validação de mínimo/máximo e, quando o valor difere do perfil,
// ponto âmbar com "Restaurar" (docs/IDENTIDADE_VISUAL.md §7, "Formulário de parâmetros").
//
// Definição: { chave, rotulo, tipo: percent|inteiro|numero|preco|usdt|booleano|opcoes, sufixo?, min?, max?,
//              opcional?, somenteLeitura?, opcoes?: [{ valor, rotulo }], ajuda? }

import { escapar } from './dom.js';
import { preco as fmtPreco } from '../utils/format.js';

let seq = 0;

const SUFIXOS = { percent: '%', usdt: 'USDT', preco: 'USDT' };
const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 });

export function sufixoDe(def) {
  return def.sufixo ?? SUFIXOS[def.tipo] ?? '';
}

/** Valor legível ("0,1%", "Sim", "Compra e venda") para textos de ajuda e do "Restaurar". */
export function textoValor(def, v) {
  if (v == null || v === '') return 'vazio';
  if (def.tipo === 'booleano') return v ? 'ligado' : 'desligado';
  if (def.tipo === 'opcoes') return def.opcoes?.find((o) => String(o.valor) === String(v))?.rotulo ?? String(v);
  if (def.tipo === 'preco') return `${fmtPreco(Number(v))} USDT`;
  const s = sufixoDe(def);
  return `${nf.format(Number(v))}${s === '%' ? '%' : s ? ` ${s}` : ''}`;
}

function limitesTexto(def) {
  if (def.tipo === 'booleano' || def.tipo === 'opcoes') return '';
  const s = sufixoDe(def);
  const f = (v) => `${nf.format(v)}${s === '%' ? '%' : ''}`;
  if (def.min != null && def.max != null) return `De ${f(def.min)} a ${f(def.max)}.`;
  if (def.min != null) return `Mínimo ${f(def.min)}.`;
  return '';
}

function campoHTML(def, valor, id) {
  const ro = def.somenteLeitura ? ' disabled' : '';
  let controle;
  if (def.tipo === 'booleano') {
    controle = `<label class="switch-field"><input class="switch" type="checkbox" id="${id}" data-campo${valor ? ' checked' : ''}${ro}><span>${valor ? 'Ligado' : 'Desligado'}</span></label>`;
  } else if (def.tipo === 'opcoes') {
    controle = `<select class="input" id="${id}" data-campo${ro}>${(def.opcoes ?? []).map((o) => `<option value="${escapar(o.valor)}"${String(o.valor) === String(valor) ? ' selected' : ''}>${escapar(o.rotulo)}</option>`).join('')}</select>`;
  } else {
    const passo = def.tipo === 'inteiro' ? '1' : 'any';
    const s = sufixoDe(def);
    controle = `
      <div class="input-group">
        <input class="input num" type="number" inputmode="decimal" id="${id}" data-campo step="${passo}"
          ${def.min != null ? `min="${def.min}"` : ''} ${def.max != null ? `max="${def.max}"` : ''}
          value="${valor == null ? '' : escapar(valor)}" ${def.opcional ? 'placeholder="sem limite"' : ''}${ro}>
        ${s ? `<span class="input-group__suffix">${escapar(s)}</span>` : ''}
      </div>`;
  }
  const ajuda = [def.ajuda, limitesTexto(def)].filter(Boolean).join(' ');
  return `
    <div class="pfield" data-chave="${escapar(def.chave)}">
      <label class="field__label pfield__label" for="${id}">${escapar(def.rotulo)}<span class="pfield__dot" title="Diferente do perfil" hidden></span></label>
      ${controle}
      ${ajuda ? `<p class="pfield__help">${escapar(ajuda)}</p>` : ''}
      <p class="pfield__erro" role="alert" hidden></p>
      <button class="link-btn pfield__reset" type="button" data-restaurar hidden></button>
    </div>`;
}

/** Lê e valida um campo. Devolve { valor, erro }. */
export function lerValor(def, el) {
  if (def.tipo === 'booleano') return { valor: el.checked, erro: null };
  if (def.tipo === 'opcoes') {
    const o = def.opcoes?.find((x) => String(x.valor) === el.value);
    return { valor: o ? o.valor : el.value, erro: null };
  }
  const bruto = el.value.trim();
  if (bruto === '') return def.opcional ? { valor: null, erro: null } : { valor: null, erro: 'Preencha este campo.' };
  const v = Number(bruto.replace(',', '.'));
  if (!Number.isFinite(v)) return { valor: null, erro: 'Use só números.' };
  if (def.tipo === 'inteiro' && !Number.isInteger(v)) return { valor: v, erro: 'Use um número inteiro.' };
  if (def.min != null && v < def.min) return { valor: v, erro: `O mínimo é ${textoValor(def, def.min)}.` };
  if (def.max != null && v > def.max) return { valor: v, erro: `O máximo é ${textoValor(def, def.max)}.` };
  if ((def.tipo === 'preco' || def.tipo === 'usdt') && v <= 0) return { valor: v, erro: 'Use um valor maior que zero.' };
  return { valor: v, erro: null };
}

const normal = (v) => (v === '' || v === undefined ? null : v);
function iguais(a, b) {
  a = normal(a);
  b = normal(b);
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return String(a) === String(b);
}

/**
 * Desenha os campos em `alvo`. `valores` = { chave: valor }; `referencia` = valores do perfil (opcional).
 * `aoMudar({ valores, erros, sujo })` roda a cada alteração.
 */
export function criarFormulario(alvo, defs, valores, { referencia = null, aoMudar = null } = {}) {
  const ns = `pf${++seq}`;
  let original = { ...valores };
  alvo.innerHTML = defs.map((d) => campoHTML(d, valores[d.chave], `${ns}-${d.chave}`)).join('');
  const porChave = new Map(defs.map((d) => [d.chave, d]));

  const campo = (chave) => alvo.querySelector(`.pfield[data-chave="${CSS.escape(chave)}"]`);

  function estado() {
    const saida = {};
    const erros = {};
    for (const d of defs) {
      const el = campo(d.chave)?.querySelector('[data-campo]');
      if (!el) continue;
      const { valor, erro } = lerValor(d, el);
      saida[d.chave] = valor;
      if (erro) erros[d.chave] = erro;
    }
    const sujo = defs.some((d) => !iguais(saida[d.chave], original[d.chave]));
    return { valores: saida, erros, sujo, valido: !Object.keys(erros).length };
  }

  function marcar() {
    const e = estado();
    for (const d of defs) {
      const caixa = campo(d.chave);
      if (!caixa) continue;
      const erro = e.erros[d.chave];
      const errEl = caixa.querySelector('.pfield__erro');
      errEl.hidden = !erro;
      errEl.textContent = erro ?? '';
      caixa.querySelector('[data-campo]').setAttribute('aria-invalid', String(!!erro));
      if (d.tipo === 'booleano') caixa.querySelector('.switch-field span').textContent = e.valores[d.chave] ? 'Ligado' : 'Desligado';
      const ref = referencia && d.chave in referencia && !d.somenteLeitura ? referencia[d.chave] : undefined;
      const difere = ref !== undefined && !iguais(e.valores[d.chave], ref);
      caixa.querySelector('.pfield__dot').hidden = !difere;
      const reset = caixa.querySelector('[data-restaurar]');
      reset.hidden = !difere;
      reset.textContent = difere ? `Restaurar (${textoValor(d, ref)})` : '';
      caixa.classList.toggle('is-changed', !iguais(e.valores[d.chave], original[d.chave]));
    }
    return e;
  }

  function definirValor(chave, v) {
    const d = porChave.get(chave);
    const el = campo(chave)?.querySelector('[data-campo]');
    if (!d || !el) return;
    if (d.tipo === 'booleano') el.checked = !!v;
    else el.value = v == null ? '' : String(v);
  }

  const mudou = () => { const e = marcar(); aoMudar?.(e); };
  alvo.addEventListener('input', mudou);
  alvo.addEventListener('change', mudou);
  alvo.addEventListener('click', (e) => {
    const b = e.target.closest('[data-restaurar]');
    if (!b || !referencia) return;
    const chave = b.closest('.pfield').dataset.chave;
    definirValor(chave, referencia[chave]);
    mudou();
    campo(chave)?.querySelector('[data-campo]')?.focus();
  });

  marcar();
  return {
    estado,
    /** Troca os valores (e a base de "sujo"), sem redesenhar. */
    redefinir(novos, novaReferencia = referencia) {
      original = { ...novos };
      referencia = novaReferencia;
      for (const d of defs) definirValor(d.chave, novos[d.chave]);
      marcar();
    },
  };
}
