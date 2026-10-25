// Estratégia A — Reversão de picos (docs/ESTRATEGIAS.md §2).
//
// Compra: espera o preço cair pelo menos `quedaMinima` desde a máxima recente (arma), acompanha o
// menor preço e compra quando ele volta a subir `recuoCompra` a partir desse fundo.
// Venda: cada posição comprada aqui tem venda dinâmica. O robô acompanha o maior preço desde a compra
// e pede a venda quando o preço cai `recuoVenda` a partir dele. O motor só vende se o lucro mínimo
// estiver garantido; o alvo mostrado é max(topo × (1 − recuoVenda), compra × (1 + lucroMinimo)).

import { arredPreco, fracao, dinamicas, minimoDeVenda } from './comum.js';

const ID = 'reversao-picos';
const MS_HORA = 3_600_000;

export default {
  id: ID,
  nome: 'Reversão de picos',
  sigla: 'A',
  descricao: 'Compra na retomada após o fundo e vende no recuo após o topo.',
  parametros: [
    { chave: 'recuoCompra', rotulo: 'Recuo para compra', tipo: 'percent', padrao: 3, demo: 0.1, min: 0.05, max: 20,
      ajuda: 'Quanto o preço precisa subir a partir do fundo para comprar.' },
    { chave: 'recuoVenda', rotulo: 'Recuo para venda', tipo: 'percent', padrao: 3, demo: 0.1, min: 0.05, max: 20,
      ajuda: 'Quanto o preço precisa cair a partir do topo para vender.' },
    { chave: 'quedaMinima', rotulo: 'Queda mínima para armar', tipo: 'percent', padrao: 2, demo: 0.12, min: 0, max: 30,
      ajuda: 'Só arma a compra se o preço caiu pelo menos isso desde a máxima recente (evita comprar em lateralização).' },
    { chave: 'janela', rotulo: 'Janela da máxima recente', tipo: 'numero', sufixo: 'h', padrao: 24, demo: 1, min: 0.25, max: 168,
      ajuda: 'Período considerado para a máxima de referência antes de armar.' },
  ],
  usaConfirmacao: { padrao: true },

  estadoInicial: () => ({ fase: 'aguardando', referencia: null, referenciaEm: null, minimo: null, topos: {} }),

  avaliar({ preco, agora, estado, params, moeda, posicoes }) {
    const e = { ...estado, topos: { ...estado.topos } };
    const sinais = [];
    const acoes = [];

    // ----- Lado da compra -----
    if (e.fase === 'aguardando') {
      const venceu = e.referenciaEm == null || agora - e.referenciaEm > (Number(params.janela) || 24) * MS_HORA;
      if (e.referencia == null || venceu || preco > e.referencia) {
        e.referencia = preco;
        e.referenciaEm = agora;
      }
      if (preco <= e.referencia * (1 - fracao(params.quedaMinima))) {
        e.fase = 'armado';
        e.minimo = preco;
      }
    }
    if (e.fase === 'armado') {
      if (preco < e.minimo) e.minimo = preco;
      if (preco >= e.minimo * (1 + fracao(params.recuoCompra))) {
        sinais.push({ tipo: 'compra', chave: 'compra', motivo: 'retomada após o fundo' });
      }
    }

    // ----- Lado da venda (uma trilha por posição) -----
    const abertas = dinamicas(posicoes, ID);
    const ids = new Set(abertas.map((p) => p.compra.id));
    for (const id of Object.keys(e.topos)) if (!ids.has(id)) delete e.topos[id];
    for (const p of abertas) {
      const c = p.compra;
      const topo = Math.max(e.topos[c.id] ?? c.preco, preco);
      e.topos[c.id] = topo;
      const gatilho = topo * (1 - fracao(params.recuoVenda));
      const alvo = arredPreco(Math.max(gatilho, minimoDeVenda(c, params)), moeda);
      acoes.push({ tipo: 'alvo-dinamico', compraId: c.id, alvo });
      if (preco <= gatilho) sinais.push({ tipo: 'venda', chave: `venda:${c.id}`, compraId: c.id, motivo: 'recuo após o topo' });
    }

    return { estado: e, sinais, acoes, eventos: [] };
  },

  /** Depois de comprar: venda dinâmica, começando pelo lucro mínimo. */
  aposCompra({ compra, params, moeda }) {
    return { tipo: 'dinamica', alvo: arredPreco(minimoDeVenda(compra, params), moeda) };
  },

  aoExecutar({ estado, sinal, preco, agora }) {
    if (sinal.tipo === 'compra') {
      return { ...estado, fase: 'aguardando', referencia: preco, referenciaEm: agora, minimo: null };
    }
    const topos = { ...estado.topos };
    delete topos[sinal.compraId];
    return { ...estado, topos };
  },

  rotulo(estado, { posicoes = [] } = {}) {
    const rastreando = dinamicas(posicoes, ID).length;
    const compra = estado.fase === 'armado' ? 'Armado: rastreando fundo' : 'Aguardando queda';
    return rastreando ? `${compra} · rastreando topo (${rastreando})` : compra;
  },
};
