// localStorage com fallback: se o navegador bloquear o acesso (aba anônima,
// dados bloqueados), os valores ficam só em memória durante a sessão.

const PREFIXO = 'criptoops:';
const memoria = new Map();

export function get(chave, padrao = null) {
  try {
    const bruto = localStorage.getItem(PREFIXO + chave);
    if (bruto !== null) return JSON.parse(bruto);
  } catch {
    if (memoria.has(chave)) return memoria.get(chave);
  }
  return memoria.has(chave) ? memoria.get(chave) : padrao;
}

export function set(chave, valor) {
  memoria.set(chave, valor);
  try {
    localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function remove(chave) {
  memoria.delete(chave);
  try {
    localStorage.removeItem(PREFIXO + chave);
  } catch {
    /* ignora */
  }
}
