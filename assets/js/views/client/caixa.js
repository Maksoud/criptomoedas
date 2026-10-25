// C6 · Movimentações do caixa: depósitos e saques do cliente, com os totais do período escolhido.

import { getState } from '../../store.js';
import { gravarConsulta } from '../../router.js';
import { totaisMovimentos } from '../../calc/bank.js';
import { criarTabela } from '../../ui/table.js';
import { criarFiltros, lerFiltros } from '../../ui/filters.js';
import { kpiHTML, atualizarKpi, valorUSDT } from '../../ui/kpi.js';
import { escapar } from '../../ui/dom.js';
import { usdt, dataHora, plural, intervalo } from '../../utils/format.js';
import { diaISO } from '../../utils/dates.js';
import { criarContexto, clienteAtual, semCliente, cabecalho, contextoFiltros } from './comum.js';

/** Movimentos do cliente entre duas datas (inclusive), do mais recente para o mais antigo. */
export function movimentosNoPeriodo(movimentos, clienteId, de, ate) {
  return movimentos
    .filter((m) => {
      if (m.clienteId !== clienteId) return false;
      const dia = diaISO(m.data);
      return dia >= de && dia <= ate;
    })
    .sort((a, b) => b.data - a.data);
}

export function montarCaixa(alvo, { definicao, consulta }) {
  const ctx = criarContexto();
  const cliente = clienteAtual();
  if (!cliente) { semCliente(alvo, definicao); return ctx; }

  const ctxFiltro = contextoFiltros(cliente);
  let filtros = lerFiltros(consulta, { padrao: 'inicio', ctx: ctxFiltro });
  gravarConsulta({ de: filtros.de, ate: filtros.ate });

  alvo.innerHTML = `
    <section class="page">
      ${cabecalho(definicao, cliente)}
      <div class="card no-print" data-ref="filtros"></div>
      <div class="kpis" data-ref="kpis"></div>
      <div data-ref="tabela"></div>
      <p class="page-note muted">O aporte inicial é o primeiro depósito. Saques nunca usam o valor em operação nem a reserva de banca.</p>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);

  const tabela = criarTabela({
    colunas: [
      { id: 'data', titulo: 'Data e hora', ordenar: (m) => +m.data, html: (m) => `<span class="num">${dataHora(m.data)}</span>` },
      {
        id: 'tipo', titulo: 'Tipo', ordenar: (m) => m.tipo,
        html: (m) => (m.tipo === 'deposito' ? '<span class="badge badge--info">Depósito</span>' : '<span class="badge">Saque</span>'),
      },
      {
        id: 'valor', titulo: 'Valor (USDT)', num: true, ordenar: (m) => (m.tipo === 'deposito' ? m.valor : -m.valor),
        html: (m) => usdt(m.tipo === 'deposito' ? m.valor : -m.valor, { sufixo: false, sinal: true }),
      },
      { id: 'obs', titulo: 'Observação', html: (m) => `<span class="muted">${escapar(m.observacao ?? '')}</span>` },
    ],
    chave: (m) => m.id,
    ordem: { col: 'data', dir: 'desc' },
    rotulo: 'Movimentações do caixa',
    vazio: { titulo: 'Nenhuma movimentação neste período', texto: 'Tente ampliar as datas.' },
    rodape(lista) {
      const t = totaisMovimentos(lista, cliente.id);
      return `<tr>
        <th scope="row" colspan="2">Saldo do período</th>
        <td class="is-num num">${usdt(t.aportado, { sufixo: false, sinal: true })}</td>
        <td class="muted">${plural(lista.length, 'movimentação', 'movimentações')}</td>
      </tr>`;
    },
  });
  ref('tabela').append(tabela.el);

  function aplicar() {
    const todos = getState().movimentos;
    const lista = movimentosNoPeriodo(todos, cliente.id, filtros.de, filtros.ate);
    const t = totaisMovimentos(lista, cliente.id);
    const geral = totaisMovimentos(todos, cliente.id);
    const nDep = lista.filter((m) => m.tipo === 'deposito').length;
    const kpis = [
      { id: 'depositos', rotulo: 'Depósitos no período', valor: valorUSDT(t.depositos), extra: plural(nDep, 'depósito') },
      { id: 'saques', rotulo: 'Saques no período', valor: valorUSDT(t.saques), extra: plural(lista.length - nDep, 'saque') },
      { id: 'saldo', rotulo: 'Saldo das movimentações', valor: valorUSDT(t.aportado, { sinal: true }), extra: intervalo(filtros.de, filtros.ate) },
      { id: 'aportado', rotulo: 'Total aportado', valor: valorUSDT(geral.aportado), extra: 'Desde o início do contrato' },
    ];
    if (!ref('kpis').children.length) ref('kpis').innerHTML = kpis.map(kpiHTML).join('');
    else for (const k of kpis) atualizarKpi(ref('kpis'), k.id, k);
    tabela.definir(lista);
  }

  criarFiltros(ref('filtros'), {
    valor: filtros, ctx: ctxFiltro, comMoedas: false,
    aoMudar(f) {
      filtros = f;
      gravarConsulta({ de: f.de, ate: f.ate });
      aplicar();
    },
  });

  ctx.on('cash:new', (m) => { if (m?.clienteId === cliente.id) aplicar(); });

  aplicar();
  return ctx;
}
