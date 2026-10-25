// Estratégia C — Escalonada por níveis (docs/ESTRATEGIAS.md §5).
// Cada nova compra, se o preço continuar caindo `spread%`, é `multiplicador` vezes maior que a anterior,
// baixando o preço médio. Vende tudo quando o preço supera o preço médio + `lucroMedio%`.

import { arredPreco, fracao, minhas, dinamicas, precoMedio } from './comum.js';

const ID = 'escalonada';

export default {
  id: ID,
  nome: 'Escalonada por níveis',
  sigla: 'C',
  descricao: 'Compra mais a cada queda para baixar o preço médio e vende tudo acima dele.',
  parametros: [
    { chave: 'multiplicador', rotulo: 'Multiplicador', tipo: 'numero', sufixo: '×', padrao: 1.5, demo: 1.5, min: 1, max: 5,
      ajuda: 'Cada nível compra este tanto a mais que o anterior.' },
    { chave: 'niveis', rotulo: 'Níveis', tipo: 'inteiro', padrao: 4, demo: 4, min: 1, max: 10,
      ajuda: 'Quantidade máxima de compras em sequência.' },
    { chave: 'lucroMedio', rotulo: 'Lucro sobre o preço médio', tipo: 'percent', padrao: 2, demo: 0.3, min: 0.05, max: 50,
      ajuda: 'Vende todas as posições quando o preço passa do preço médio mais este percentual.' },
  ],
  usaConfirmacao: { padrao: false },

  estadoInicial: () => ({ fase: 'nivel-0' }),

  avaliar({ preco, estado, params, moeda, posicoes, valorOrdem }) {
    const sinais = [];
    const acoes = [];
    const lista = minhas(posicoes, ID);
    const nivel = lista.length;
    const menor = lista.reduce((m, p) => Math.min(m, p.compra.preco), Infinity);
    if (nivel === 0 || (nivel < params.niveis && preco <= menor * (1 - fracao(params.spread)))) {
      const valor = valorOrdem * Number(params.multiplicador) ** nivel;
      sinais.push({ tipo: 'compra', chave: 'compra', motivo: `nível ${nivel + 1} da escala`, valor });
    }
    const media = precoMedio(lista);
    if (media) {
      const alvo = arredPreco(media * (1 + fracao(params.lucroMedio)), moeda);
      for (const p of dinamicas(posicoes, ID)) {
        acoes.push({ tipo: 'alvo-dinamico', compraId: p.compra.id, alvo });
        if (preco >= alvo) sinais.push({ tipo: 'venda', chave: `venda:${p.compra.id}`, compraId: p.compra.id, motivo: 'preço médio + lucro' });
      }
    }
    return { estado: { ...estado, fase: `nivel-${nivel}`, precoMedio: media }, sinais, acoes, eventos: [] };
  },

  aposCompra({ compra, params, moeda }) {
    return { tipo: 'dinamica', alvo: arredPreco(compra.preco * (1 + fracao(params.lucroMedio)), moeda) };
  },

  rotulo(estado) {
    const n = Number(String(estado.fase).split('-')[1]) || 0;
    return n ? `Nível ${n} · preço médio` : 'Aguardando a primeira compra';
  },
};
