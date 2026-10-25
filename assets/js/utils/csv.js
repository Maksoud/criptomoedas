// CSV para abrir no Excel em pt-BR: separador ";", decimal ",", UTF-8 com BOM e quebra de linha CRLF.
// Os números vão sem separador de milhar e com o hífen comum como sinal (o Excel não entende o "−").

export const BOM = '\uFEFF';

const dois = (n) => String(n).padStart(2, '0');

/** Número com `casas` decimais e vírgula. `enxugar` tira os zeros à direita (quantidades). */
export function numeroCSV(v, casas = 2, { enxugar = false } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  let texto = v.toFixed(casas);
  if (/^-0(\.0+)?$/.test(texto)) texto = texto.slice(1); // -0,00 vira 0,00
  if (enxugar && texto.includes('.')) texto = texto.replace(/\.?0+$/, '');
  return texto.replace('.', ',');
}

/** 24/10/2026 (aceita Date, timestamp ou 'AAAA-MM-DD'). */
export function dataCSV(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [a, m, dia] = d.split('-');
    return `${dia}/${m}/${a}`;
  }
  const x = d instanceof Date ? d : new Date(d);
  return `${dois(x.getDate())}/${dois(x.getMonth() + 1)}/${x.getFullYear()}`;
}

/** 14:32 */
export function horaCSV(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${dois(x.getHours())}:${dois(x.getMinutes())}`;
}

/** Campo com aspas quando tem ";", aspas ou quebra de linha. */
export function campoCSV(v) {
  const texto = v == null ? '' : String(v);
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Linhas (listas de campos) → texto CSV com BOM. */
export function gerarCSV(linhas) {
  return BOM + linhas.map((l) => l.map(campoCSV).join(';')).join('\r\n') + '\r\n';
}
