// Estratégia E — Compra periódica (DCA) com alvo no preço médio (docs/ESTRATEGIAS.md §5).
// Compra o valor da ordem a cada `intervaloMin`, independente do preço. Vende tudo quando o preço passa
// do preço médio + `lucroDca%`.

import { arredPreco, fracao, minhas, dinamicas, precoMedio } from './comum.js';

const ID = 'dca';
const MS_MIN = 60_000;

export default {
  id: ID,
  nome: 'Compra periódica (DCA)',
  sigla: 'E',
  descricao: 'Compra um valor fixo a cada intervalo e vende tudo acima do preço médio.',
  parametros: [
    { chave: 'intervaloMin', rotulo: 'Intervalo entre compras', tipo: 'numero', sufixo: 'min', padrao: 360, demo: 2, min: 1, max: 10080,
      ajuda: 'Tempo entre uma compra e a seguinte.' },
    { chave: 'lucroDca', rotulo: 'Lucro sobre o preço médio', tipo: 'percent', padrao: 4, demo: 0.3, min: 0.05, max: 50,
      ajuda: 'Vende todas as posições quando o preço passa do preço médio mais este percentual.' },
  ],
  usaConfirmacao: { padrao: false },

  estadoInicial: () => ({ fase: 'periodica', ultimaCompraEm: null }),

  avaliar({ preco, agora, estado, params, moeda, posicoes }) {
    const sinais = [];
    const acoes = [];
    const lista = minhas(posicoes, ID);
    const ultima = estado.ultimaCompraEm ?? lista.reduce((m, p) => Math.max(m, +p.compra.executadaEm), 0);
    if (!ultima || agora - ultima >= Number(params.intervaloMin) * MS_MIN) {
      sinais.push({ tipo: 'compra', chave: 'compra', motivo: 'compra periódica' });
    }
    const media = precoMedio(lista);
    if (media) {
      const alvo = arredPreco(media * (1 + fracao(params.lucroDca)), moeda);
      for (const p of dinamicas(posicoes, ID)) {
        acoes.push({ tipo: 'alvo-dinamico', compraId: p.compra.id, alvo });
        if (preco >= alvo) sinais.push({ tipo: 'venda', chave: `venda:${p.compra.id}`, compraId: p.compra.id, motivo: 'preço médio + lucro' });
      }
    }
    return { estado: { ...estado, ultimaCompraEm: ultima || null, precoMedio: media }, sinais, acoes, eventos: [] };
  },

  aposCompra({ compra, params, moeda }) {
    return { tipo: 'dinamica', alvo: arredPreco(compra.preco * (1 + fracao(params.lucroDca)), moeda) };
  },

  aoExecutar({ estado, sinal, agora }) {
    return sinal.tipo === 'compra' ? { ...estado, ultimaCompraEm: agora } : estado;
  },

  rotulo(estado, { params } = {}) {
    if (!estado.ultimaCompraEm) return 'Primeira compra pendente';
    const prox = estado.ultimaCompraEm + Number(params?.intervaloMin ?? 0) * MS_MIN;
    const min = Math.max(0, Math.ceil((prox - Date.now()) / MS_MIN));
    return `Próxima compra em ~${min} min`;
  },
};
