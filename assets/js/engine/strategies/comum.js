// Ajudantes das estratégias. Tudo puro: recebe números e listas, devolve números e listas.

/** Arredonda um preço nas casas da moeda. */
export function arredPreco(preco, moeda) {
  const casas = moeda?.precisao?.preco ?? 8;
  const f = 10 ** casas;
  return Math.round(preco * f) / f;
}

export const fracao = (pct) => (Number(pct) || 0) / 100;

/** Posições abertas desta estratégia (a compra foi feita por ela). */
export function minhas(posicoes, estrategiaId) {
  return posicoes.filter((p) => p.compra.estrategia === estrategiaId);
}

/** Posições desta estratégia com venda dinâmica ativa (as que ela mesma vende por sinal). */
export function dinamicas(posicoes, estrategiaId) {
  return posicoes.filter((p) => p.compra.estrategia === estrategiaId && p.compra.vendaDinamica && !p.venda);
}

/** Preço médio ponderado de um conjunto de posições. */
export function precoMedio(posicoes) {
  let qtd = 0;
  let custo = 0;
  for (const p of posicoes) {
    qtd += p.compra.quantidade;
    custo += p.compra.total;
  }
  return qtd > 0 ? custo / qtd : null;
}

/** Piso de venda pelo lucro mínimo. */
export function minimoDeVenda(compra, params) {
  return compra.preco * (1 + fracao(params.lucroMinimo));
}

/** Média simples dos últimos `n` valores que terminam em `fim` (exclusivo). */
export function mediaSimples(valores, n, fim = valores.length) {
  if (fim < n) return null;
  let s = 0;
  for (let i = fim - n; i < fim; i++) s += valores[i];
  return s / n;
}

export function resultadoVazio(estado) {
  return { estado, sinais: [], acoes: [], eventos: [] };
}
