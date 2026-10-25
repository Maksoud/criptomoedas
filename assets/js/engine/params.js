// Parâmetros das moedas e perfis (docs/ESTRATEGIAS.md §1.2 a §1.4).
//
// Cada moeda guarda um único objeto `params` com os parâmetros gerais e os de todas as estratégias
// (as chaves não se repetem). Assim trocar de estratégia não perde os ajustes da outra, e a tela A2
// monta o formulário a partir das listas `parametros` de cada estratégia.
//
// Um perfil só preenche os campos: `padrao` (valores realistas) ou `demo` (spreads menores, para a
// apresentação ter movimento). Cada valor continua editável.

import { TAXA_PCT } from '../data/coins.js';
import { ESTRATEGIAS, estrategiaPorId } from './strategies/index.js';

export const PERFIS = {
  padrao: { id: 'padrao', nome: 'Padrão', intervaloSeg: 60 },
  demo: { id: 'demo', nome: 'Demonstração', intervaloSeg: 15 },
};

/** Parâmetros gerais de todas as estratégias, por moeda (§1.2). `null` = desligado/vazio. */
export const PARAMETROS_GERAIS = [
  { chave: 'spread', rotulo: 'Spread', tipo: 'percent', padrao: 2, demo: 0.1, min: 0.05, max: 20,
    ajuda: 'Distância entre compras. Usado pelas estratégias que montam níveis.' },
  { chave: 'lucroMinimo', rotulo: 'Lucro mínimo', tipo: 'percent', padrao: 0.5, demo: 0.22, min: 0, max: 20,
    ajuda: 'Nenhuma venda automática acontece abaixo do preço de compra mais este percentual (exceto o stop).' },
  { chave: 'maxPosicoes', rotulo: 'Máximo de posições', tipo: 'inteiro', padrao: 5, demo: 10, min: 1, max: 50,
    ajuda: 'Limite de posições abertas (mais compras programadas) por cliente nesta moeda.' },
  { chave: 'piso', rotulo: 'Piso de preço', tipo: 'preco', padrao: null, demo: null, opcional: true,
    ajuda: 'Abaixo deste preço o robô não compra. Vazio = sem limite.' },
  { chave: 'teto', rotulo: 'Teto de preço', tipo: 'preco', padrao: null, demo: null, opcional: true,
    ajuda: 'Acima deste preço o robô não compra. Vazio = sem limite.' },
  { chave: 'stopPerda', rotulo: 'Stop de perda', tipo: 'percent', padrao: null, demo: null, min: 0.1, max: 50, opcional: true,
    ajuda: 'Vende a mercado quando a posição cai este tanto. Ignora o lucro mínimo e sempre pede confirmação.' },
  { chave: 'taxa', rotulo: 'Taxa por execução', tipo: 'percent', padrao: TAXA_PCT, demo: TAXA_PCT, somenteLeitura: true,
    ajuda: 'Cobrada em USDT em cada compra e venda executada.' },
];

/** Confirmação de sinal (§1.3). `ativa` vem de `estrategia.usaConfirmacao.padrao`. */
export const PARAMETROS_CONFIRMACAO = [
  { chave: 'ativa', rotulo: 'Confirmar sinais', tipo: 'booleano' },
  { chave: 'modo', rotulo: 'Modo', tipo: 'opcoes', opcoes: [
    { valor: 'velas', rotulo: 'Velas seguidas' },
    { valor: 'tempo', rotulo: 'Tempo sem interrupção' },
    { valor: 'volume', rotulo: 'Volume acima da média' },
  ] },
  { chave: 'n', rotulo: 'Quantidade', tipo: 'inteiro', min: 1, max: 20, ajuda: 'Velas (ou segundos, no modo tempo).' },
  { chave: 'intervaloSeg', rotulo: 'Vela de', tipo: 'opcoes', opcoes: [
    { valor: 15, rotulo: '15 segundos' },
    { valor: 60, rotulo: '1 minuto' },
  ] },
  { chave: 'aplicarEm', rotulo: 'Aplicar em', tipo: 'opcoes', opcoes: [
    { valor: 'ambos', rotulo: 'Compra e venda' },
    { valor: 'compra', rotulo: 'Só compra' },
    { valor: 'venda', rotulo: 'Só venda' },
  ] },
];

function valoresDe(lista, perfil) {
  const saida = {};
  for (const p of lista) saida[p.chave] = perfil === 'demo' && 'demo' in p ? p.demo : p.padrao;
  return saida;
}

/** Todos os parâmetros (gerais + todas as estratégias) de um perfil. */
export function paramsDoPerfil(perfil = 'demo') {
  const params = valoresDe(PARAMETROS_GERAIS, perfil);
  for (const e of Object.values(ESTRATEGIAS)) Object.assign(params, valoresDe(e.parametros, perfil));
  return params;
}

export function confirmacaoDoPerfil(perfil = 'demo', estrategiaId = 'spread-fixo') {
  const e = estrategiaPorId(estrategiaId);
  return {
    ativa: e?.usaConfirmacao?.padrao ?? false,
    modo: 'velas',
    n: 2,
    intervaloSeg: (PERFIS[perfil] ?? PERFIS.demo).intervaloSeg,
    aplicarEm: 'ambos',
  };
}

/** Campos de uma moeda para um perfil e estratégia: { estrategia, params, confirmacao }. */
export function parametrosDoPerfil(perfil = 'demo', estrategiaId = 'spread-fixo') {
  return {
    estrategia: estrategiaId,
    params: paramsDoPerfil(perfil),
    confirmacao: confirmacaoDoPerfil(perfil, estrategiaId),
  };
}

/** Série de velas que a moeda usa (confirmação e estratégias de vela): '15s' ou '1m'. */
export function serieDaMoeda(moeda) {
  return (moeda?.confirmacao?.intervaloSeg ?? 60) <= 15 ? '15s' : '1m';
}

export function duracaoDaSerie(serie) {
  return serie === '15s' ? 15_000 : 60_000;
}
