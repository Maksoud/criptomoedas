// Posições em aberto e lucro de cada venda (docs/DADOS_FICTICIOS.md §5).
// Posição aberta = compra executada sem venda executada apontando para ela (compraId).

const PROGRAMADA = new Set(['programada', 'aguardando-confirmacao']);

export function estaProgramada(ordem) {
  return PROGRAMADA.has(ordem.status);
}

/** Lucro de uma venda vinculada à sua compra. A taxa da compra entra na proporção vendida. */
export function lucroDaVenda(venda, compra) {
  const fracao = compra.quantidade > 0 ? venda.quantidade / compra.quantidade : 0;
  const custo = compra.total * fracao;
  const bruto = venda.total - custo;
  const taxas = (venda.taxa ?? 0) + (compra.taxa ?? 0) * fracao;
  return { custo, bruto, taxas, liquido: bruto - taxas };
}

/**
 * Posições abertas, com a venda programada (alvo) de cada uma.
 * Filtros opcionais: clienteId, moeda.
 */
export function posicoesAbertas(ordens, { clienteId = null, moeda = null } = {}) {
  const vendidas = new Set();
  const vendaProgramada = new Map();
  for (const o of ordens) {
    if (o.lado !== 'venda' || !o.compraId) continue;
    if (o.status === 'executada') vendidas.add(o.compraId);
    else if (estaProgramada(o)) vendaProgramada.set(o.compraId, o);
  }

  const posicoes = [];
  for (const o of ordens) {
    if (o.lado !== 'compra' || o.status !== 'executada' || vendidas.has(o.id)) continue;
    if (clienteId && o.clienteId !== clienteId) continue;
    if (moeda && o.moeda !== moeda) continue;
    const venda = vendaProgramada.get(o.id) ?? null;
    posicoes.push({
      compra: o,
      clienteId: o.clienteId,
      moeda: o.moeda,
      quantidade: o.quantidade,
      precoCompra: o.preco,
      custo: o.total,
      venda,
      alvo: venda ? venda.preco : (o.vendaDinamica ? o.alvo : null),
      semAlvo: !venda && !o.vendaDinamica,
    });
  }
  return posicoes;
}

/** Valor a mercado de uma posição; sem cotação, usa o custo. */
export function valorAtual(posicao, precos) {
  const atual = precos?.[posicao.moeda]?.atual;
  return Number.isFinite(atual) ? posicao.quantidade * atual : posicao.custo;
}

/** Detalhe de uma posição com a cotação atual: variação e distância até o alvo, em %. */
export function detalharPosicao(posicao, precos) {
  const atual = precos?.[posicao.moeda]?.atual ?? null;
  const valor = valorAtual(posicao, precos);
  return {
    ...posicao,
    cotacao: atual,
    valor,
    resultado: valor - posicao.custo,
    variacaoPct: atual ? (atual / posicao.precoCompra - 1) * 100 : null,
    distanciaAlvoPct: atual && posicao.alvo ? (posicao.alvo / atual - 1) * 100 : null,
  };
}

export function custoTotal(posicoes) {
  return posicoes.reduce((s, p) => s + p.custo, 0);
}
