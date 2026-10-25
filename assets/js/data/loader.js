// Carregamento dos dados: histórico de preços (cache do dia → Binance → simulado),
// gerador fictício e store. "Restaurar dados" refaz o gerador sobre o mesmo histórico.

import { MOEDAS_ATIVAS } from './coins.js';
import { gerarDados } from './seed.js';
import { validarNoConsole } from './validate.js';
import { carregarHistorico, carregarTicker } from '../market/history.js';
import { carregarDados, setState, emit, getState, CONFIG_PADRAO } from '../store.js';
import * as persist from '../persist.js';
import { DEV } from '../utils/env.js';
import { regrasPadrao, alertasIniciais } from '../alerts/rules.js';
import { aplicarAjustes, esquecerAjustes } from './ajustes.js';

let historico = null;
let ticker = null;

function aplicar() {
  const config = { ...CONFIG_PADRAO, ...(persist.get('config') ?? {}) };
  const dados = gerarDados({ historico, ticker, config });
  aplicarAjustes(dados);
  dados.regrasAlerta = regrasPadrao(persist.get('regrasAlerta') ?? {});
  dados.alertas = alertasIniciais({ ...dados, regras: dados.regrasAlerta });
  if (DEV) {
    const r = validarNoConsole(dados);
    console.info(
      `[seed] ${dados.estatisticas.executadas} operações, ${dados.estatisticas.programadas} ordens programadas, ` +
      `${dados.periodos.length} períodos em ${dados.estatisticas.duracaoMs} ms (${historico.fonte}${historico.doCache ? ', cache do dia' : ''})` +
      (r.ok ? ' — validações ok' : ` — ${r.problemas.length} problema(s)`),
    );
  }
  // A origem vai antes dos dados: as telas redesenham no `data:ready` e já precisam dela.
  // Em "Restaurar dados" o feed já está rodando, então só o histórico é atualizado.
  const anterior = getState().mercado;
  const historicoInfo = { historicoFonte: historico.fonte, historicoEm: new Date(historico.baixadoEm) };
  const mercado = anterior.estado !== 'carregando'
    ? { ...anterior, ...historicoInfo }
    : {
      ...anterior,
      ...historicoInfo,
      fonte: historico.fonte,
      estado: historico.fonte === 'simulado' ? 'simulado' : 'conectando',
      conectado: false,
      erro: historico.erro ?? null,
    };
  setState({ agora: new Date(), mercado });
  carregarDados({ ...dados, config });
}

/** Primeiro carregamento. Resolve quando o store estiver pronto (nunca rejeita: cai para simulado). */
export async function iniciarDados() {
  setState({ carregando: true });
  [historico, ticker] = await Promise.all([carregarHistorico(MOEDAS_ATIVAS), carregarTicker(MOEDAS_ATIVAS)]);
  aplicar();
  return getState();
}

/** Volta ao estado inicial: descarta ajustes e ações salvos e gera de novo sobre o mesmo histórico. */
export function restaurarDados() {
  if (!historico) return;
  persist.remove('config');
  persist.remove('regrasAlerta');
  esquecerAjustes();
  aplicar();
  emit('data:reset', getState());
}
