// Verificações antes de qualquer compra (docs/ESTRATEGIAS.md §1.1). Ficam só aqui: o motor chama
// `verificarCompra` para compras a mercado, para programar compras LIMIT e para executá-las.
//
//   1. moeda ativa e com estratégia
//   2. sem trava global, do cliente, por comissão vencida ou da moeda
//   3. cliente ativo, robô ligado e cliente opera a moeda
//   4. valor da ordem ≤ disponível para operar (reserva de banca)
//   5. posições abertas + compras programadas do cliente na moeda < maxPosicoes
//   6. preço dentro do piso/teto, se definidos
//
// `pular` permite deixar regras de fora: executar uma compra LIMIT já programada não refaz a 4 e a 5
// (o valor já estava reservado e a ordem já contava nas posições).

const TEXTOS = {
  'moeda-inativa': 'Moeda desligada',
  'sem-estrategia': 'Estratégia desligada nesta moeda',
  'trava-global': 'Compras travadas para todos os clientes',
  'trava-cliente': 'Compras do cliente travadas',
  'trava-comissao': 'Compras suspensas: comissão vencida',
  'trava-moeda': 'Compras desta moeda travadas',
  'cliente-inativo': 'Cliente não está ativo',
  'robo-pausado': 'Robô pausado',
  'nao-opera': 'O cliente não opera esta moeda',
  reserva: 'Sem disponível para operar: reserva de banca atingida',
  'max-posicoes': 'Limite de posições nesta moeda',
  piso: 'Preço abaixo do piso',
  teto: 'Preço acima do teto',
  minimo: 'Valor abaixo do mínimo da corretora',
};

function nao(regra, regraNum, extra = {}) {
  return { ok: false, regra, regraNum, motivo: TEXTOS[regra], ...extra };
}

/**
 * @param moeda     store.moedas[x]
 * @param cliente   store.clientes[x]
 * @param config    store.config
 * @param robo      'ligado' | 'pausado'
 * @param banca     resumoBanca(...) do cliente (só precisa de `disponivel`)
 * @param ocupadas  posições abertas + compras programadas do cliente na moeda
 * @param preco     preço da compra
 * @param valor     valor da compra em USDT
 */
export function verificarCompra({ moeda, cliente, config, robo, banca, ocupadas = 0, preco = null, valor = null, pular = [] }) {
  const p = moeda?.params ?? {};
  // 1
  if (!moeda?.ativa) return nao('moeda-inativa', 1);
  if (!moeda.estrategia) return nao('sem-estrategia', 1);
  // 2
  if (config?.travaGlobal) return nao('trava-global', 2);
  if (cliente.travaPorComissao) return nao('trava-comissao', 2);
  if (cliente.travaCompras) return nao('trava-cliente', 2);
  if (moeda.travaCompras) return nao('trava-moeda', 2);
  // 3
  if (cliente.status !== 'ativo') return nao('cliente-inativo', 3);
  if (robo !== 'ligado') return nao('robo-pausado', 3);
  if (!cliente.moedas.includes(moeda.simbolo)) return nao('nao-opera', 3);
  // 4
  if (!pular.includes(4) && valor != null && banca) {
    if (valor > banca.disponivel + 1e-9) return nao('reserva', 4, { valor, disponivel: banca.disponivel });
  }
  // 5
  if (!pular.includes(5) && ocupadas >= (p.maxPosicoes ?? Infinity)) return nao('max-posicoes', 5);
  // 6
  if (preco != null) {
    if (p.piso != null && p.piso !== '' && preco < Number(p.piso)) return nao('piso', 6);
    if (p.teto != null && p.teto !== '' && preco > Number(p.teto)) return nao('teto', 6);
  }
  return { ok: true, regra: null, regraNum: null, motivo: null };
}

export function textoDaRegra(regra) {
  return TEXTOS[regra] ?? regra;
}
