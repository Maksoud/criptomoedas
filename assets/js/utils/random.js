// Gerador pseudoaleatório com semente (mulberry32). O gerador de dados fictícios usa só isto,
// nunca Math.random(), para que a mesma semente produza sempre o mesmo histórico.

export const SEMENTE_PADRAO = 20261024;

/** Converte um texto em semente numérica (hash FNV-1a de 32 bits). */
export function sementeDe(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Cria um gerador. Todas as funções devolvidas usam a mesma sequência. */
export function criarRandom(semente = SEMENTE_PADRAO) {
  let s = (typeof semente === 'string' ? sementeDe(semente) : semente) >>> 0;
  let normalGuardado = null;

  /** Número em [0, 1). */
  function proximo() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Número real em [min, max). */
  function entre(min, max) {
    return min + (max - min) * proximo();
  }

  /** Inteiro em [min, max], incluindo as pontas. */
  function inteiro(min, max) {
    return Math.floor(entre(min, max + 1));
  }

  function escolher(lista) {
    return lista[Math.floor(proximo() * lista.length)];
  }

  /** true com probabilidade p. */
  function chance(p) {
    return proximo() < p;
  }

  /** Normal padrão (média 0, desvio 1), pelo método de Box-Muller. */
  function normal() {
    if (normalGuardado !== null) {
      const v = normalGuardado;
      normalGuardado = null;
      return v;
    }
    let u = 0;
    while (u === 0) u = proximo();
    const v = proximo();
    const r = Math.sqrt(-2 * Math.log(u));
    normalGuardado = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  return { proximo, entre, inteiro, escolher, chance, normal };
}
