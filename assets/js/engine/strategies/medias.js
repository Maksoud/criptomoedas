// Estratégia F — Cruzamento de médias móveis (docs/ESTRATEGIAS.md §5).
// Compra quando a média curta cruza a longa para cima; vende quando cruza para baixo (o motor garante o
// lucro mínimo, salvo stop). Só compra depois de ver um cruzamento, não numa alta já em andamento.

import { arredPreco, minhas, dinamicas, mediaSimples, minimoDeVenda } from './comum.js';

const ID = 'medias';

export default {
  id: ID,
  nome: 'Cruzamento de médias móveis',
  sigla: 'F',
  descricao: 'Compra quando a média curta cruza a longa para cima e vende no cruzamento para baixo.',
  parametros: [
    { chave: 'mediaCurta', rotulo: 'Média curta', tipo: 'inteiro', sufixo: 'velas', padrao: 9, demo: 9, min: 2, max: 200,
      ajuda: 'Velas da média rápida.' },
    { chave: 'mediaLonga', rotulo: 'Média longa', tipo: 'inteiro', sufixo: 'velas', padrao: 21, demo: 21, min: 3, max: 500,
      ajuda: 'Velas da média lenta.' },
  ],
  usaConfirmacao: { padrao: false },

  estadoInicial: () => ({ fase: 'sem-dados', acima: null, cruzouParaCima: false }),

  avaliar({ tipo, estado, params, moeda, posicoes, velas }) {
    const e = { ...estado };
    if (tipo === 'vela') {
      const fech = velas.map((v) => v.fechamento);
      const curta = mediaSimples(fech, params.mediaCurta);
      const longa = mediaSimples(fech, params.mediaLonga);
      if (curta != null && longa != null) {
        const acima = curta > longa;
        if (e.acima === false && acima) e.cruzouParaCima = true;
        if (!acima) e.cruzouParaCima = false;
        e.acima = acima;
        e.fase = acima ? 'alta' : 'baixa';
        Object.assign(e, { curta, longa });
      }
    }
    const sinais = [];
    const acoes = [];
    if (e.acima && e.cruzouParaCima && !minhas(posicoes, ID).length) {
      sinais.push({ tipo: 'compra', chave: 'compra', motivo: 'cruzamento de médias para cima' });
    }
    for (const p of dinamicas(posicoes, ID)) {
      acoes.push({ tipo: 'alvo-dinamico', compraId: p.compra.id, alvo: arredPreco(minimoDeVenda(p.compra, params), moeda) });
      if (e.acima === false) sinais.push({ tipo: 'venda', chave: `venda:${p.compra.id}`, compraId: p.compra.id, motivo: 'cruzamento de médias para baixo' });
    }
    return { estado: e, sinais, acoes, eventos: [] };
  },

  aposCompra({ compra, params, moeda }) {
    return { tipo: 'dinamica', alvo: arredPreco(minimoDeVenda(compra, params), moeda) };
  },

  aoExecutar({ estado, sinal }) {
    return sinal.tipo === 'compra' ? { ...estado, cruzouParaCima: false } : estado;
  },

  rotulo(estado) {
    if (estado.fase === 'sem-dados') return 'Juntando velas';
    return estado.acima ? 'Média curta acima da longa' : 'Média curta abaixo da longa';
  },
};
