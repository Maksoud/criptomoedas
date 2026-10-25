// Datas de calendário no fuso local, no formato AAAA-MM-DD.
// Períodos de apuração e relatórios trabalham com dias inteiros; comparar dois textos ISO
// funciona como comparar as datas.

export const MS_MIN = 60_000;
export const MS_HORA = 3_600_000;
export const MS_DIA = 86_400_000;

const dois = (n) => String(n).padStart(2, '0');

export function iso(ano, mes, dia) {
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}

/** Date (ou timestamp) → '2026-10-24' no fuso local. */
export function diaISO(d) {
  const x = d instanceof Date ? d : new Date(d);
  return iso(x.getFullYear(), x.getMonth() + 1, x.getDate());
}

/** '2026-10-24' → [2026, 10, 24] */
export function partes(texto) {
  return texto.split('-').map(Number);
}

/** '2026-10-24' → Date à meia-noite local. */
export function deISO(texto) {
  const [a, m, d] = partes(texto);
  return new Date(a, m - 1, d);
}

export function inicioDoDia(texto) {
  return deISO(texto);
}

export function fimDoDia(texto) {
  const [a, m, d] = partes(texto);
  return new Date(a, m - 1, d, 23, 59, 59, 999);
}

export function somarDias(texto, n) {
  const d = deISO(texto);
  d.setDate(d.getDate() + n);
  return diaISO(d);
}

/** Quantos dias de `a` até `b` (positivo se b é depois). */
export function diasEntre(a, b) {
  return Math.round((deISO(b) - deISO(a)) / MS_DIA);
}

/** mes de 1 a 12. */
export function ultimoDiaDoMes(ano, mes) {
  return new Date(ano, mes, 0).getDate();
}

export function proximoMes(ano, mes) {
  return mes === 12 ? [ano + 1, 1] : [ano, mes + 1];
}

export function mesAnterior(ano, mes) {
  return mes === 1 ? [ano - 1, 12] : [ano, mes - 1];
}

/** Aceita Date, timestamp ou 'AAAA-MM-DD' e devolve o dia ISO. */
export function paraDiaISO(v) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return diaISO(v);
}
