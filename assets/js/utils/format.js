// Formatação de números e datas em pt-BR (docs/IDENTIDADE_VISUAL.md §5).
// Negativos usam o sinal de menos tipográfico (−), não o hífen.

export const MENOS = '−';
const TRACO = '—';

const cache = new Map();
function nf(opcoes) {
  const chave = JSON.stringify(opcoes);
  if (!cache.has(chave)) cache.set(chave, new Intl.NumberFormat('pt-BR', opcoes));
  return cache.get(chave);
}

function valido(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Formata |v| e põe o sinal; zero arredondado nunca recebe sinal. */
function comSinal(v, formatador, { mais = false } = {}) {
  const texto = formatador.format(Math.abs(v));
  if (!/[1-9]/.test(texto)) return texto;
  if (v < 0) return MENOS + texto;
  return mais ? '+' + texto : texto;
}

/** 12.345,67 USDT */
export function usdt(v, { sufixo = true, sinal = false } = {}) {
  if (!valido(v)) return TRACO;
  const texto = comSinal(v, nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }), { mais: sinal });
  return sufixo ? `${texto} USDT` : texto;
}

/** Percentual com sinal: pct(3) → "+3,00%", pct(-1.25) → "−1,25%". Recebe o valor em pontos percentuais. */
export function pct(v, { casas = 2 } = {}) {
  if (!valido(v)) return TRACO;
  return comSinal(v, nf({ minimumFractionDigits: casas, maximumFractionDigits: casas }), { mais: true }) + '%';
}

/** Quantidade: até 8 casas, sem zeros à direita. qtd(0.0123, 'BTC') → "0,0123 BTC" */
export function qtd(v, sigla) {
  if (!valido(v)) return TRACO;
  const texto = comSinal(v, nf({ minimumFractionDigits: 0, maximumFractionDigits: 8 }));
  return sigla ? `${texto} ${sigla}` : texto;
}

/** Preço: ≥ 1 com 2 casas; < 1 com 4 a 6 algarismos significativos. */
export function preco(v) {
  if (!valido(v)) return TRACO;
  const f = Math.abs(v) >= 1
    ? nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : nf({ minimumSignificantDigits: 4, maximumSignificantDigits: 6 });
  return comSinal(v, f);
}

function paraData(d) {
  const data = d instanceof Date ? d : new Date(d);
  return Number.isNaN(data.getTime()) ? null : data;
}

const dois = (n) => String(n).padStart(2, '0');

/** 24/10/2026 */
export function data(d) {
  const x = paraData(d);
  if (!x) return TRACO;
  return `${dois(x.getDate())}/${dois(x.getMonth() + 1)}/${x.getFullYear()}`;
}

/** 24/10 14:32 — o ano aparece só se for diferente do atual. */
export function dataHora(d, agora = new Date()) {
  const x = paraData(d);
  if (!x) return TRACO;
  const ano = x.getFullYear() !== agora.getFullYear() ? `/${x.getFullYear()}` : '';
  return `${dois(x.getDate())}/${dois(x.getMonth() + 1)}${ano} ${dois(x.getHours())}:${dois(x.getMinutes())}`;
}

/** Seta + percentual, para alta/baixa: "▲ +2,31%" / "▼ −0,84%". */
export function variacao(v) {
  if (!valido(v)) return TRACO;
  const texto = pct(v);
  if (!/[1-9]/.test(texto)) return texto;
  return `${v > 0 ? '▲' : '▼'} ${texto}`;
}
