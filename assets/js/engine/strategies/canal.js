// Estratégia G — Operação em canal com confirmação (docs/ESTRATEGIAS.md §4).
//
// A cada vela fechada (sem posição aberta), calcula suporte (mínima) e resistência (máxima) das últimas
// `janelaCanal` velas. O canal é confirmado quando a largura está entre `larguraMin` e `larguraMax` e
// houve pelo menos `toquesConfirmacao` toques em cada borda. Confirmado, compra na zona inferior e vende
// na zona superior (o motor garante o lucro mínimo). Fechamento de vela fora do canal = rompimento, e a
// ação configurada é aplicada.

import { arredPreco, fracao, dinamicas, minhas, minimoDeVenda } from './comum.js';

const ID = 'canal';

/**
 * Suporte, resistência e toques de um conjunto de velas. Toques contam episódios: velas seguidas
 * encostadas na borda valem um toque só.
 */
export function calcularCanal(velas, params) {
  const janela = Math.max(2, Math.round(params.janelaCanal));
  if (velas.length < janela) return { valido: false, motivo: 'poucas velas', velas: velas.length, janela };
  const lista = velas.slice(-janela);
  let suporte = Infinity;
  let resistencia = -Infinity;
  for (const v of lista) {
    if (v.minima < suporte) suporte = v.minima;
    if (v.maxima > resistencia) resistencia = v.maxima;
  }
  const tol = fracao(params.toleranciaToque);
  const largura = (resistencia / suporte - 1) * 100;
  let toquesBaixo = 0;
  let toquesAlto = 0;
  let noFundo = false;
  let noTopo = false;
  for (const v of lista) {
    const fundo = v.minima <= suporte * (1 + tol);
    const topo = v.maxima >= resistencia * (1 - tol);
    if (fundo && !noFundo) toquesBaixo++;
    if (topo && !noTopo) toquesAlto++;
    noFundo = fundo;
    noTopo = topo;
  }
  const larguraOk = largura >= params.larguraMin && largura <= params.larguraMax;
  const toquesOk = toquesBaixo >= params.toquesConfirmacao && toquesAlto >= params.toquesConfirmacao;
  return {
    valido: larguraOk && toquesOk,
    motivo: !larguraOk ? 'largura fora da faixa' : !toquesOk ? 'poucos toques' : null,
    suporte, resistencia, largura, toquesBaixo, toquesAlto, velas: lista.length, janela,
  };
}

/** Zonas de compra e venda de um canal. */
export function zonasDoCanal(suporte, resistencia, params) {
  const faixa = resistencia - suporte;
  return {
    compraAte: suporte + faixa * fracao(params.zonaCompra),
    vendaDesde: resistencia - faixa * fracao(params.zonaVenda),
  };
}

const ACOES_BAIXA = [
  { valor: 'vender-pausar', rotulo: 'Vender e pausar' },
  { valor: 'pausar', rotulo: 'Só pausar' },
  { valor: 'manter', rotulo: 'Manter' },
];
const ACOES_ALTA = [
  { valor: 'manter-pausar', rotulo: 'Manter e pausar' },
  { valor: 'vender', rotulo: 'Vender' },
  { valor: 'manter', rotulo: 'Manter' },
];

export default {
  id: ID,
  nome: 'Canal com confirmação',
  sigla: 'G',
  descricao: 'Identifica suporte e resistência, opera dentro do canal confirmado e sai no rompimento.',
  parametros: [
    { chave: 'janelaCanal', rotulo: 'Velas do canal', tipo: 'inteiro', sufixo: 'velas', padrao: 60, demo: 20, min: 5, max: 500,
      ajuda: 'Velas usadas para calcular o suporte (mínima) e a resistência (máxima).' },
    { chave: 'larguraMin', rotulo: 'Largura mínima', tipo: 'percent', padrao: 1, demo: 0.05, min: 0.01, max: 50,
      ajuda: 'Canal mais estreito que isso não é operado.' },
    { chave: 'larguraMax', rotulo: 'Largura máxima', tipo: 'percent', padrao: 6, demo: 1, min: 0.05, max: 100,
      ajuda: 'Canal mais largo que isso não é operado.' },
    { chave: 'toquesConfirmacao', rotulo: 'Toques para confirmar', tipo: 'inteiro', padrao: 2, demo: 2, min: 1, max: 10,
      ajuda: 'Toques mínimos em cada borda para confirmar o canal.' },
    { chave: 'toleranciaToque', rotulo: 'Tolerância do toque', tipo: 'percent', padrao: 0.15, demo: 0.02, min: 0, max: 5,
      ajuda: 'Distância da borda que conta como toque.' },
    { chave: 'zonaCompra', rotulo: 'Zona de compra', tipo: 'percent', padrao: 20, demo: 25, min: 1, max: 50,
      ajuda: 'Compra quando o preço está nesta fração inferior do canal.' },
    { chave: 'zonaVenda', rotulo: 'Zona de venda', tipo: 'percent', padrao: 20, demo: 25, min: 1, max: 50,
      ajuda: 'Vende quando o preço está nesta fração superior do canal (respeitando o lucro mínimo).' },
    { chave: 'rompimento', rotulo: 'Rompimento', tipo: 'percent', padrao: 0.5, demo: 0.05, min: 0.01, max: 20,
      ajuda: 'Vela que fecha esta distância fora do canal é considerada rompimento.' },
    { chave: 'acaoRompimentoBaixa', rotulo: 'Rompimento para baixo', tipo: 'opcoes', opcoes: ACOES_BAIXA, padrao: 'vender-pausar', demo: 'vender-pausar',
      ajuda: 'O que fazer com as posições quando o preço rompe o suporte.' },
    { chave: 'acaoRompimentoAlta', rotulo: 'Rompimento para cima', tipo: 'opcoes', opcoes: ACOES_ALTA, padrao: 'manter-pausar', demo: 'manter-pausar',
      ajuda: 'O que fazer com as posições quando o preço rompe a resistência.' },
  ],
  usaConfirmacao: { padrao: true },

  estadoInicial: () => ({
    fase: 'procurando', suporte: null, resistencia: null, pausaAte: null, compradoNaZona: false,
    rompimento: null, ultimoCanal: null,
  }),

  avaliar({ tipo, preco, vela, velas, estado, params, moeda, posicoes, duracaoVela = 60_000 }) {
    const e = { ...estado };
    const sinais = [];
    const acoes = [];
    const eventos = [];
    const minhasPos = minhas(posicoes, ID);
    const vendaveis = dinamicas(posicoes, ID);
    const romp = fracao(params.rompimento);

    if (tipo === 'vela' && vela) {
      if (e.fase === 'confirmado') {
        const abaixo = vela.fechamento < e.suporte * (1 - romp);
        const acima = vela.fechamento > e.resistencia * (1 + romp);
        if (abaixo || acima) {
          const direcao = abaixo ? 'baixa' : 'alta';
          const acao = abaixo ? params.acaoRompimentoBaixa : params.acaoRompimentoAlta;
          eventos.push({ alerta: 'canal-rompido', dados: { direcao, acao, suporte: e.suporte, resistencia: e.resistencia, preco: vela.fechamento } });
          const vender = acao === 'vender-pausar' || acao === 'vender';
          e.rompimento = vender && vendaveis.length
            ? { direcao, nivel: abaixo ? e.suporte * (1 - romp) : e.resistencia * (1 + romp), compraIds: vendaveis.map((p) => p.compra.id), stop: abaixo }
            : null;
          e.pausaAte = acao.includes('pausar') ? vela.t + Math.round(params.janelaCanal) * duracaoVela : null;
          Object.assign(e, { fase: 'procurando', suporte: null, resistencia: null, compradoNaZona: false });
        } else if (!minhasPos.length) {
          // Sem posição: o canal acompanha as velas. Se deixar de valer, volta a procurar.
          const canal = calcularCanal(velas, params);
          e.ultimoCanal = canal;
          if (canal.valido) Object.assign(e, { suporte: canal.suporte, resistencia: canal.resistencia });
          else Object.assign(e, { fase: 'procurando', suporte: null, resistencia: null });
        }
      }
      if (e.fase === 'procurando' && !(e.pausaAte && vela.t < e.pausaAte)) {
        e.pausaAte = null;
        const canal = calcularCanal(velas, params);
        e.ultimoCanal = canal;
        if (canal.valido) {
          Object.assign(e, { fase: 'confirmado', suporte: canal.suporte, resistencia: canal.resistencia, compradoNaZona: false });
          eventos.push({ alerta: 'canal-confirmado', dados: { suporte: canal.suporte, resistencia: canal.resistencia, largura: canal.largura } });
        }
      }
    }

    // Vendas do rompimento: continuam pedidas enquanto o preço segue fora do canal rompido.
    if (e.rompimento) {
      const ids = new Set(vendaveis.map((p) => p.compra.id));
      const restantes = e.rompimento.compraIds.filter((id) => ids.has(id));
      const fora = e.rompimento.direcao === 'baixa' ? preco < e.rompimento.nivel : preco > e.rompimento.nivel;
      if (!restantes.length || !fora) e.rompimento = null;
      else {
        e.rompimento = { ...e.rompimento, compraIds: restantes };
        for (const id of restantes) {
          sinais.push({ tipo: 'venda', chave: `venda:${id}`, compraId: id, motivo: 'rompimento de canal', stop: e.rompimento.stop });
        }
      }
    }

    if (e.fase === 'confirmado') {
      const { compraAte, vendaDesde } = zonasDoCanal(e.suporte, e.resistencia, params);
      const naZona = preco <= compraAte && preco >= e.suporte * (1 - romp);
      if (!naZona) e.compradoNaZona = false;
      else if (!e.compradoNaZona) sinais.push({ tipo: 'compra', chave: 'compra', motivo: 'fundo do canal' });

      for (const p of vendaveis) {
        const c = p.compra;
        acoes.push({ tipo: 'alvo-dinamico', compraId: c.id, alvo: arredPreco(Math.max(vendaDesde, minimoDeVenda(c, params)), moeda) });
        if (preco >= vendaDesde && !e.rompimento) sinais.push({ tipo: 'venda', chave: `venda:${c.id}`, compraId: c.id, motivo: 'topo do canal' });
      }
    }

    return { estado: e, sinais, acoes, eventos };
  },

  aposCompra({ compra, params, moeda }) {
    return { tipo: 'dinamica', alvo: arredPreco(minimoDeVenda(compra, params), moeda) };
  },

  aoExecutar({ estado, sinal }) {
    return sinal.tipo === 'compra' ? { ...estado, compradoNaZona: true } : estado;
  },

  rotulo(estado) {
    if (estado.fase === 'confirmado') return 'Canal confirmado';
    if (estado.pausaAte) return 'Pausado após rompimento';
    const c = estado.ultimoCanal;
    if (c && c.motivo === 'poucas velas') return `Procurando canal (${c.velas}/${c.janela} velas)`;
    return 'Procurando canal';
  },
};
