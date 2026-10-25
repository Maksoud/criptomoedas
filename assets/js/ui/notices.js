// Avisos fixos no alto do conteúdo (ex.: histórico simulado por falta de conexão).
import { on, getState } from '../store.js';
import { icon, renderIcons } from './icons.js';
import { dataHora } from '../utils/format.js';

const area = () => document.getElementById('avisos');

function desenhar() {
  const { mercado, carregando } = getState();
  if (carregando || mercado.fonte !== 'simulado') {
    area().innerHTML = '';
    return;
  }
  area().innerHTML = `
    <div class="notice notice--warn" role="status">
      <span class="notice__icon">${icon('wifi-off')}</span>
      <div class="notice__body">
        <p class="notice__title">Cotações simuladas</p>
        <p class="notice__text">A Binance não respondeu, então o histórico de preços foi simulado a partir de valores de referência. Clientes e operações continuam fictícios como sempre.</p>
      </div>
      <button class="btn btn--secondary btn--sm" type="button" data-acao="recarregar">
        ${icon('refresh-cw')}<span>Tentar de novo</span>
      </button>
    </div>`;
  renderIcons();
}

export function iniciarAvisos() {
  area().addEventListener('click', (e) => {
    if (e.target.closest('[data-acao="recarregar"]')) location.reload();
  });
  on('state:mercado', desenhar);
  on('data:ready', desenhar);
  desenhar();
}

/** Texto curto da origem dos preços para o topo. */
export function textoOrigem(mercado) {
  if (!mercado.fonte) return { estado: 'idle', texto: 'Carregando cotações…', titulo: 'Baixando o histórico de preços' };
  if (mercado.fonte === 'simulado') {
    return { estado: 'simulated', texto: 'Cotações simuladas', titulo: 'Sem conexão com a Binance: preços simulados' };
  }
  const quando = mercado.historicoEm ? dataHora(mercado.historicoEm) : '';
  return {
    estado: 'idle',
    texto: 'Binance · histórico',
    titulo: `Histórico real da Binance, baixado em ${quando}`,
  };
}
