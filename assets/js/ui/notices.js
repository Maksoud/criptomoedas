// Avisos fixos no alto do conteúdo: compras travadas (admin) e cotações simuladas por falta de conexão.
import { on, getState, atualizarConfig } from '../store.js';
import { icon, renderIcons } from './icons.js';
import { dataHora } from '../utils/format.js';
import { reconectarAgora } from '../market/feed.js';

const area = () => document.getElementById('avisos');

const TEXTOS = {
  historico: {
    titulo: 'Cotações simuladas',
    texto: 'A Binance não respondeu, então o histórico de preços foi simulado a partir de valores de referência. Clientes e operações continuam fictícios como sempre.',
    botao: 'Recarregar',
  },
  aoVivo: {
    titulo: 'Cotações simuladas',
    texto: 'A conexão com a Binance caiu. Os preços continuam a partir dos últimos valores reais, simulados, e a Binance volta sozinha quando a conexão for restabelecida.',
    botao: 'Tentar de novo',
  },
};

// Faixa "Compras travadas" (visão Administrador): fica no alto enquanto a trava global estiver ligada.
function faixaTrava() {
  const { config, visao } = getState();
  if (!config.travaGlobal || visao !== 'admin') return '';
  return `
    <div class="band band--lock" role="status">
      <span class="band__icon">${icon('lock')}</span>
      <div class="band__body">
        <p class="band__title">Compras travadas para todos os clientes</p>
        <p class="band__text">O robô não faz novas compras. As vendas programadas e dinâmicas continuam executando.</p>
      </div>
      <button class="btn btn--secondary btn--sm" type="button" data-acao="destravar">${icon('lock-open')}<span>Destravar</span></button>
    </div>`;
}

function avisoSimulado() {
  const { mercado } = getState();
  if (mercado.fonte !== 'simulado') return '';
  const t = mercado.historicoFonte === 'simulado' ? TEXTOS.historico : TEXTOS.aoVivo;
  return `
    <div class="notice notice--warn" role="status">
      <span class="notice__icon">${icon('wifi-off')}</span>
      <div class="notice__body">
        <p class="notice__title">${t.titulo}</p>
        <p class="notice__text">${t.texto}</p>
      </div>
      <button class="btn btn--secondary btn--sm" type="button" data-acao="reconectar">
        ${icon('refresh-cw')}<span>${t.botao}</span>
      </button>
    </div>`;
}

let ultimo = null;
function desenhar() {
  const html = getState().carregando ? '' : faixaTrava() + avisoSimulado();
  if (html === ultimo) return;
  ultimo = html;
  area().innerHTML = html;
  renderIcons();
}

export function iniciarAvisos() {
  area().addEventListener('click', (e) => {
    if (e.target.closest('[data-acao="reconectar"]')) reconectarAgora();
    if (e.target.closest('[data-acao="destravar"]')) atualizarConfig({ travaGlobal: false });
  });
  on('state:mercado', desenhar);
  on('data:ready', desenhar);
  on('view:change', desenhar);
  on('config:change', ({ mudou }) => { if (mudou.includes('travaGlobal')) desenhar(); });
  desenhar();
}

/** Texto curto da origem dos preços para o topo. `estado` é o do ponto (data-state). */
export function textoOrigem(mercado) {
  const historico = mercado.historicoEm ? `Histórico baixado em ${dataHora(mercado.historicoEm)}` : '';
  switch (mercado.estado) {
    case 'aovivo':
      return { estado: 'live', texto: 'Binance · ao vivo', titulo: `Cotações reais da Binance, atualizadas a cada segundo. ${historico}` };
    case 'reconectando':
      return { estado: 'reconnecting', texto: 'Reconectando…', titulo: 'A conexão com a Binance caiu; tentando de novo' };
    case 'simulado':
      return {
        estado: 'simulated',
        texto: 'Cotações simuladas',
        titulo: mercado.historicoFonte === 'simulado'
          ? 'Sem conexão com a Binance: histórico e preços simulados'
          : 'Sem conexão com a Binance: preços simulados a partir dos últimos valores reais',
      };
    case 'conectando':
      return { estado: 'idle', texto: 'Conectando…', titulo: `Abrindo a conexão ao vivo com a Binance. ${historico}` };
    default:
      return { estado: 'idle', texto: 'Carregando cotações…', titulo: 'Baixando o histórico de preços' };
  }
}
