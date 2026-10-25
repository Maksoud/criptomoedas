// Estratégia D — Grade (grid) em faixa (docs/ESTRATEGIAS.md §5).
// Ao ligar, a faixa vai de −faixaPct% a +faixaPct% do preço e é dividida em `linhas`. Mantém compras
// LIMIT nas linhas logo abaixo do preço (sem posição naquela linha) e vende cada compra na linha de cima.

import { arredPreco, fracao, minhas } from './comum.js';

const ID = 'grade';

/** Linhas da grade a partir do preço de referência. */
export function linhasDaGrade(base, params) {
  const f = fracao(params.faixaPct);
  const piso = base * (1 - f);
  const teto = base * (1 + f);
  const n = Math.max(2, Math.round(params.linhas));
  const passo = (teto - piso) / n;
  return { piso, teto, passo, linhas: Array.from({ length: n + 1 }, (_, i) => piso + i * passo) };
}

export default {
  id: ID,
  nome: 'Grade em faixa',
  sigla: 'D',
  descricao: 'Divide a faixa de preço em linhas: compra ao tocar uma linha descendo e vende na de cima.',
  parametros: [
    { chave: 'faixaPct', rotulo: 'Faixa', tipo: 'percent', padrao: 8, demo: 1, min: 0.2, max: 50,
      ajuda: 'A grade vai deste percentual abaixo até este percentual acima do preço ao ligar.' },
    { chave: 'linhas', rotulo: 'Linhas', tipo: 'inteiro', padrao: 10, demo: 10, min: 2, max: 50,
      ajuda: 'Em quantas partes a faixa é dividida.' },
  ],
  usaConfirmacao: { padrao: false },

  estadoInicial: () => ({ fase: 'grade', base: null }),

  avaliar({ preco, estado, params, moeda, posicoes, ordensProgramadas, podeComprar }) {
    const e = { ...estado };
    if (!e.base) e.base = preco;
    const { passo, linhas } = linhasDaGrade(e.base, params);
    const acoes = [];
    const compras = ordensProgramadas.filter((o) => o.lado === 'compra');
    const ocupada = (nivel) => compras.some((o) => Math.abs(o.preco - nivel) < passo * 0.25)
      || minhas(posicoes, ID).some((p) => Math.abs(p.compra.preco - nivel) < passo * 0.5);
    let usadas = posicoes.length + compras.length;
    const abaixo = linhas.filter((l) => l < preco).sort((a, b) => b - a);
    for (const nivel of abaixo) {
      if (usadas >= params.maxPosicoes) break;
      if (ocupada(nivel)) continue;
      acoes.push({ tipo: 'programar', lado: 'compra', preco: arredPreco(nivel, moeda), motivo: 'linha da grade' });
      usadas++;
    }
    if (acoes.length && !podeComprar().ok) acoes.length = 0;
    return { estado: e, sinais: [], acoes, eventos: [] };
  },

  aposCompra({ compra, params, moeda }) {
    const passoPct = (2 * Number(params.faixaPct)) / Math.max(2, Math.round(params.linhas));
    const lucro = Math.max(passoPct, Number(params.lucroMinimo) || 0);
    return { tipo: 'limite', preco: arredPreco(compra.preco * (1 + lucro / 100), moeda), motivo: 'linha de cima da grade' };
  },

  rotulo(estado, { params } = {}) {
    if (!estado.base) return 'Montando grade';
    return `Grade de ${Math.round(params?.linhas ?? 10)} linhas`;
  },
};
