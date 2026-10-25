// Telas da visão Cliente (C1–C6), pelo id da rota em views/routes.js.
import { montarVisaoGeral } from './visao-geral.js';
import { montarOperacoes } from './operacoes.js';
import { montarPosicoes } from './posicoes.js';
import { montarRelatorio } from './relatorio.js';
import { montarComissoes } from './comissoes.js';
import { montarCaixa } from './caixa.js';

export const TELAS_CLIENTE = {
  'visao-geral': montarVisaoGeral,
  operacoes: montarOperacoes,
  posicoes: montarPosicoes,
  relatorio: montarRelatorio,
  comissoes: montarComissoes,
  caixa: montarCaixa,
};
