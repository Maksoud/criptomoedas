// Tela provisória (visão Administrador até a F5): título, resumo dos dados gerados e estado vazio.
import { icon } from '../ui/icons.js';
import { getState } from '../store.js';
import { data } from '../utils/format.js';

const NOMES_FASE = {
  F5: 'F5 · Visão do administrador',
};

const item = (rotulo, valor, extra = '') => `
  <div class="stat">
    <dt class="label">${rotulo}</dt>
    <dd class="stat__value num">${valor}</dd>
    ${extra ? `<dd class="stat__extra">${extra}</dd>` : ''}
  </div>`;

function resumoDosDados() {
  const s = getState();
  const clientes = Object.values(s.clientes);
  const porStatus = (st) => clientes.filter((c) => c.status === st).length;
  const executadas = s.ordens.filter((o) => o.status === 'executada').length;
  const programadas = s.ordens.filter((o) => o.status === 'programada').length;
  const periodos = s.periodos;
  const contar = (st) => periodos.filter((p) => p.status === st).length;

  const fonte = s.mercado.fonte === 'binance'
    ? `Binance${s.mercado.historicoEm ? ` · ${data(s.mercado.historicoEm)}` : ''}`
    : 'Simulado';

  return `
    <div class="card summary">
      <h2 class="summary__title">Dados da demonstração</h2>
      <dl class="stats">
        ${item('Histórico de preços', fonte, '180 dias, velas de 4 h')}
        ${item('Clientes', clientes.length, `${porStatus('ativo')} ativos · ${porStatus('pausado')} pausado · ${porStatus('inativo')} inativo`)}
        ${item('Operações executadas', executadas.toLocaleString('pt-BR'))}
        ${item('Ordens programadas', programadas.toLocaleString('pt-BR'))}
        ${item('Períodos de apuração', periodos.length, `${contar('aberto')} abertos · ${contar('apurado')} apurados · ${contar('vencido')} vencido`)}
      </dl>
    </div>`;
}

export function renderPlaceholder(alvo, pagina) {
  alvo.innerHTML = `
    <section class="page">
      <header class="page-head">
        <div>
          <p class="label page-head__code">${pagina.codigo}</p>
          <h1>${pagina.titulo}</h1>
          <p>${pagina.resumo}</p>
        </div>
      </header>
      ${resumoDosDados()}
      <div class="card">
        <div class="empty">
          <span class="empty__icon">${icon(pagina.icone)}</span>
          <p class="empty__title">Tela em construção</p>
          <p class="empty__text">O conteúdo desta tela chega na fase ${NOMES_FASE[pagina.fase] ?? pagina.fase}. Por enquanto, use o menu para conhecer as demais telas.</p>
        </div>
      </div>
    </section>
  `;
}
