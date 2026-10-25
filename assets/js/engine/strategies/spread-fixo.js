// Estratégia B — Spread fixo com venda programada (docs/ESTRATEGIAS.md §3).
//
// Mantém `degraus` compras LIMIT abaixo do preço, cada uma `spread%` abaixo da anterior. Quando uma
// executa (o motor cuida da execução), a venda LIMIT é programada `lucro%` acima. Se o preço subir mais
// que um spread acima do ponto de partida da escada, as compras são recriadas acompanhando o preço.

import { arredPreco, fracao } from './comum.js';

const ID = 'spread-fixo';

export default {
  id: ID,
  nome: 'Spread fixo',
  sigla: 'B',
  descricao: 'Mantém compras programadas a cada queda de X% e programa a venda com Y% de lucro.',
  parametros: [
    { chave: 'lucro', rotulo: 'Lucro de cada compra', tipo: 'percent', padrao: 3, demo: 0.25, min: 0.05, max: 50,
      ajuda: 'Alvo de venda programado para cada compra executada (nunca abaixo do lucro mínimo).' },
    { chave: 'degraus', rotulo: 'Compras abertas', tipo: 'inteiro', padrao: 3, demo: 3, min: 1, max: 20,
      ajuda: 'Quantas compras programadas ficam abertas abaixo do preço.' },
    { chave: 'reposicionar', rotulo: 'Reposicionar quando o preço sobe', tipo: 'booleano', padrao: true, demo: true,
      ajuda: 'Cancela e recria as compras acompanhando o preço quando ele sobe mais que um spread.' },
  ],
  usaConfirmacao: { padrao: false },

  estadoInicial: () => ({ fase: 'escada' }),

  avaliar({ preco, estado, params, moeda, posicoes, ordensProgramadas, podeComprar }) {
    const sp = fracao(params.spread);
    const acoes = [];
    let compras = ordensProgramadas.filter((o) => o.lado === 'compra').sort((a, b) => b.preco - a.preco);

    if (compras.length && params.reposicionar && preco > (compras[0].preco / (1 - sp)) * (1 + sp)) {
      for (const o of compras) acoes.push({ tipo: 'cancelar', ordemId: o.id, status: 'reposicionada', motivo: 'preço subiu acima da escada' });
      compras = [];
    }

    const faltam = compras.length < params.degraus && posicoes.length + compras.length < params.maxPosicoes;
    if (faltam && podeComprar().ok) {
      let base = compras.length ? compras.at(-1).preco : preco;
      let n = compras.length;
      while (n < params.degraus && posicoes.length + n < params.maxPosicoes) {
        base = arredPreco(base * (1 - sp), moeda);
        acoes.push({ tipo: 'programar', lado: 'compra', preco: base, motivo: 'degrau do spread' });
        n++;
      }
    }
    return { estado: { ...estado, degraus: compras.length }, sinais: [], acoes, eventos: [] };
  },

  aposCompra({ compra, params, moeda }) {
    const lucro = Math.max(Number(params.lucro) || 0, Number(params.lucroMinimo) || 0);
    return { tipo: 'limite', preco: arredPreco(compra.preco * (1 + lucro / 100), moeda), motivo: 'alvo de lucro' };
  },

  rotulo(estado, { ordensProgramadas = [] } = {}) {
    const n = ordensProgramadas.filter((o) => o.lado === 'compra').length;
    return n ? `Escada com ${n} ${n === 1 ? 'compra' : 'compras'}` : 'Montando escada';
  },
};
