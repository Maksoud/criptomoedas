// C4 · Relatório de resultados por período e moedas. Só operações fechadas (vendas executadas no
// intervalo) entram no resultado, com as mesmas funções do C5: o relatório do intervalo exato de um
// período bate com o resultado daquele período. Exporta CSV (Excel pt-BR) e imprime em A4 retrato.

import { getState, periodosDoCliente } from '../../store.js';
import { gravarConsulta } from '../../router.js';
import { relatorio, relatorioCSV } from '../../calc/reports.js';
import { posicoesAbertasEm } from '../../calc/positions.js';
import { criarTabela } from '../../ui/table.js';
import { criarFiltros, lerFiltros, consultaDosFiltros, textoMoedas, PRESETS } from '../../ui/filters.js';
import { criarGrafico, opcoesBase } from '../../ui/chart.js';
import { moedaHTML } from '../../ui/coin.js';
import { escapar, classeResultado, criarAgendador } from '../../ui/dom.js';
import { icon, renderIcons } from '../../ui/icons.js';
import { baixarArquivo, paraNomeDeArquivo } from '../../ui/download.js';
import { usdt, data, dataCurta, dataHora, intervalo, compacto, plural } from '../../utils/format.js';
import { diaISO, somarDias } from '../../utils/dates.js';
import { dataCSV } from '../../utils/csv.js';
import { criarContexto, clienteAtual, semCliente, cabecalho, moedasDoCliente, contextoFiltros, execucaoDoCliente } from './comum.js';

/** Dias do gráfico: do início do filtro (ou do contrato) até o fim (ou hoje), com zero nos dias sem venda. */
export function serieDiaria(rel, de, ate, { inicioContrato = null, hoje = diaISO(new Date()) } = {}) {
  let ini = de;
  if (inicioContrato && ini < inicioContrato) ini = inicioContrato;
  const fim = ate > hoje ? hoje : ate;
  const porDia = new Map(rel.porDia.map((d) => [d.dia, d.resultado]));
  const dias = [];
  for (let d = ini; d <= fim && dias.length < 800; d = somarDias(d, 1)) dias.push({ dia: d, resultado: porDia.get(d) ?? 0 });
  return dias;
}

/** Período de apuração que coincide com o intervalo (para dizer "período aberto" no cabeçalho). */
function periodoDoIntervalo(clienteId, de, ate) {
  return periodosDoCliente(clienteId).find((p) => p.inicio === de && p.fim === ate) ?? null;
}

export function montarRelatorio(alvo, { definicao, consulta }) {
  const ctx = criarContexto();
  const cliente = clienteAtual();
  if (!cliente) { semCliente(alvo, definicao); return ctx; }

  const moedas = moedasDoCliente(cliente);
  const ctxFiltro = contextoFiltros(cliente);
  let filtros = lerFiltros(consulta, { padrao: 'periodo', ctx: ctxFiltro, moedas });
  gravarConsulta(consultaDosFiltros(filtros));

  const acoes = `
    <button class="btn btn--secondary" type="button" data-acao="csv">${icon('download')}<span>Exportar CSV</span></button>
    <button class="btn btn--secondary" type="button" data-acao="imprimir">${icon('printer')}<span>Imprimir/PDF</span></button>`;

  alvo.innerHTML = `
    <section class="page report">
      ${cabecalho(definicao, cliente, { acoes })}
      <div class="card no-print" data-ref="filtros"></div>
      <div class="card report-head" data-ref="cabecalho"></div>
      <div class="report-stats" data-ref="resumo"></div>
      <section class="card section" aria-labelledby="c4-moedas">
        <header class="section__head"><h2 id="c4-moedas">Por moeda</h2></header>
        <div data-ref="moedas"></div>
      </section>
      <section class="card section report-chart" aria-labelledby="c4-dia">
        <header class="section__head"><h2 id="c4-dia">Resultado por dia</h2><p class="section__note" data-ref="nota-dia"></p></header>
        <div class="chart-box chart-box--md"><canvas data-ref="grafico" role="img" aria-label="Resultado líquido por dia"></canvas></div>
      </section>
      <footer class="print-footer print-only">
        <span>Demonstração — dados fictícios</span>
        <span data-ref="emissao-rodape"></span>
      </footer>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);

  const linhaMoeda = (moeda, b) => ({ moeda, ...b });
  const n = (v) => usdt(v, { sufixo: false });
  const tabela = criarTabela({
    colunas: [
      { id: 'moeda', titulo: 'Moeda', ordenar: (l) => l.moeda, html: (l) => moedaHTML(l.moeda) },
      { id: 'compras', titulo: 'Compras', num: true, ordenar: (l) => l.compras, html: (l) => l.compras.toLocaleString('pt-BR') },
      { id: 'volumeComprado', titulo: 'Volume comprado', num: true, ordenar: (l) => l.volumeComprado, html: (l) => n(l.volumeComprado) },
      { id: 'vendas', titulo: 'Vendas', num: true, ordenar: (l) => l.vendas, html: (l) => l.vendas.toLocaleString('pt-BR') },
      { id: 'volumeVendido', titulo: 'Volume vendido', num: true, ordenar: (l) => l.volumeVendido, html: (l) => n(l.volumeVendido) },
      { id: 'lucroBruto', titulo: 'Lucro bruto', num: true, ordenar: (l) => l.lucroBruto, html: (l) => usdt(l.lucroBruto, { sufixo: false, sinal: true }), classe: (l) => classeResultado(l.lucroBruto) },
      { id: 'taxas', titulo: 'Taxas', num: true, ordenar: (l) => l.taxas, html: (l) => n(l.taxas) },
      { id: 'resultado', titulo: 'Resultado líquido', num: true, ordenar: (l) => l.resultado, html: (l) => usdt(l.resultado, { sufixo: false, sinal: true }), classe: (l) => classeResultado(l.resultado) },
    ],
    chave: (l) => l.moeda,
    ordem: { col: 'resultado', dir: 'desc' },
    porPagina: 0,
    rotulo: 'Resultado por moeda (USDT)',
    vazio: { titulo: 'Nenhuma operação neste período', texto: 'Tente ampliar as datas ou incluir mais moedas.' },
    rodape: () => `<tr>
      <th scope="row">Total</th>
      <td class="is-num num">${rel.compras.toLocaleString('pt-BR')}</td>
      <td class="is-num num">${n(rel.volumeComprado)}</td>
      <td class="is-num num">${rel.vendas.toLocaleString('pt-BR')}</td>
      <td class="is-num num">${n(rel.volumeVendido)}</td>
      <td class="is-num num ${classeResultado(rel.lucroBruto)}">${usdt(rel.lucroBruto, { sufixo: false, sinal: true })}</td>
      <td class="is-num num">${n(rel.taxas)}</td>
      <td class="is-num num ${classeResultado(rel.resultado)}">${usdt(rel.resultado, { sufixo: false, sinal: true })}</td>
    </tr>`,
  });
  ref('moedas').append(tabela.el);

  let rel = null;
  let dias = [];
  let emitidoEm = new Date();

  const grafico = criarGrafico(ref('grafico'), (cores) => ({
    type: 'bar',
    data: {
      labels: dias.map((d) => dataCurta(d.dia)),
      datasets: [{
        label: 'Resultado líquido',
        data: dias.map((d) => d.resultado),
        backgroundColor: dias.map((d) => (d.resultado >= 0 ? cores.up : cores.down)),
        borderRadius: 2,
        maxBarThickness: 18,
      }],
    },
    options: opcoesBase(cores, {
      legenda: false,
      eixoY: (v) => compacto(v),
      dica: {
        title: (itens) => data(dias[itens[0].dataIndex]?.dia),
        label: (c) => `Resultado: ${usdt(c.parsed.y, { sinal: true })}`,
      },
    }),
  }));
  ctx.aoDestruir(() => grafico.destruir());

  function cabecalhoHTML() {
    const p = periodoDoIntervalo(cliente.id, filtros.de, filtros.ate);
    const preset = PRESETS.find((x) => x.id === filtros.preset);
    const sobre = p ? `Período de apuração${p.status === 'aberto' ? ' em aberto' : ''}` : preset && preset.id !== 'personalizado' ? preset.nome : 'Intervalo personalizado';
    return `
      <div class="report-head__brand print-only">
        <svg class="brand__mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 6.5 12 3 4.5 8.5"/><path d="M4.5 15.5 12 21l7-3.5"/><path d="M4.5 8.5v7" opacity=".45"/>
        </svg>
        <span class="brand__name"><b>Cripto</b>Ops</span>
        <span class="report-head__title">Relatório de resultados</span>
        <span class="badge badge--demo">DEMO</span>
      </div>
      <dl class="report-meta">
        <div><dt class="label">Cliente</dt><dd>${escapar(cliente.nome)}</dd></div>
        <div><dt class="label">Período</dt><dd class="num">${intervalo(filtros.de, filtros.ate)}</dd><dd class="report-meta__extra">${escapar(sobre)}</dd></div>
        <div><dt class="label">Moedas</dt><dd>${escapar(textoMoedas(filtros.moedas))}</dd></div>
        <div><dt class="label">Emitido em</dt><dd class="num">${dataHora(emitidoEm)}</dd><dd class="report-meta__extra">Valores em USDT</dd></div>
      </dl>`;
  }

  function stat(rotulo, valor, extra = '', classe = '') {
    return `<div class="stat card${classe ? ` ${classe}` : ''}">
      <p class="label">${rotulo}</p>
      <p class="stat__value num">${valor}</p>
      ${extra ? `<p class="stat__extra">${extra}</p>` : ''}
    </div>`;
  }

  function resumoHTML() {
    const abertas = posicoesAbertasEm(getState().ordens, { clienteId: cliente.id, ate: filtros.ate, moedas: filtros.moedas });
    const custoAbertas = abertas.reduce((s, o) => s + o.total, 0);
    const fimTexto = filtros.ate >= diaISO(new Date()) ? 'agora' : `em ${data(filtros.ate)}`;
    return [
      stat('Volume comprado', usdt(rel.volumeComprado), plural(rel.compras, 'compra')),
      stat('Volume vendido', usdt(rel.volumeVendido), plural(rel.vendas, 'venda')),
      stat('Operações', (rel.compras + rel.vendas).toLocaleString('pt-BR'), `${plural(rel.vendas, 'operação fechada', 'operações fechadas')}`),
      stat('Lucro bruto', `<span class="${classeResultado(rel.lucroBruto)}">${usdt(rel.lucroBruto, { sinal: true })}</span>`, 'Vendas − custo das compras'),
      stat('Taxas', usdt(rel.taxas), '0,1% por execução, nas duas pontas'),
      stat('Resultado líquido', `<span class="${classeResultado(rel.resultado)}">${usdt(rel.resultado, { sinal: true })}</span>`, 'Lucro bruto − taxas', 'stat--main'),
      stat('Posições em aberto no fim', plural(abertas.length, 'posição', 'posições'), `Custo ${usdt(custoAbertas)} ${fimTexto} · informativo, fora do resultado`, 'stat--info'),
    ].join('');
  }

  function aplicar() {
    emitidoEm = new Date();
    rel = relatorio(getState().ordens, { clienteId: cliente.id, inicio: filtros.de, fim: filtros.ate, moedas: filtros.moedas });
    dias = serieDiaria(rel, filtros.de, filtros.ate, { inicioContrato: cliente.inicioContrato });
    ref('cabecalho').innerHTML = cabecalhoHTML();
    ref('resumo').innerHTML = resumoHTML();
    ref('emissao-rodape').textContent = `Emitido em ${dataHora(emitidoEm)} · ${cliente.nome} · ${intervalo(filtros.de, filtros.ate)}`;
    tabela.definir(Object.entries(rel.porMoeda).map(([m, b]) => linhaMoeda(m, b)));
    const comVenda = dias.filter((d) => d.resultado !== 0).length;
    ref('nota-dia').textContent = dias.length ? `${plural(dias.length, 'dia')} · ${plural(comVenda, 'dia', 'dias')} com vendas` : 'Nenhum dia no intervalo';
    // As cores das barras dependem do sinal de cada dia: refazer o gráfico com os dados novos é
    // barato (sem animação) e mantém as cores do tema.
    grafico.refazer();
    renderIcons();
  }

  criarFiltros(ref('filtros'), {
    valor: filtros, ctx: ctxFiltro, moedas,
    aoMudar(f) {
      filtros = f;
      gravarConsulta(consultaDosFiltros(f));
      aplicar();
    },
  });

  function exportarCSV() {
    const nomes = Object.fromEntries(Object.values(getState().clientes).map((c) => [c.id, c.nome]));
    const csv = relatorioCSV(rel, {
      nomeCliente: (id) => nomes[id] ?? id,
      cabecalho: [
        ['Relatório de resultados', 'CriptoOps — demonstração, dados fictícios'],
        ['Cliente', cliente.nome],
        ['Período', `${dataCSV(filtros.de)} a ${dataCSV(filtros.ate)}`],
        ['Moedas', textoMoedas(filtros.moedas)],
        ['Emitido em', `${dataCSV(emitidoEm)} ${emitidoEm.toTimeString().slice(0, 5)}`],
        ['Valores em', 'USDT'],
      ],
    });
    baixarArquivo(`relatorio-${paraNomeDeArquivo(cliente.nome)}-${filtros.de}-a-${filtros.ate}.csv`, csv);
  }

  function imprimir() {
    const titulo = document.title;
    document.title = `Relatório ${cliente.nome} ${data(filtros.de)} a ${data(filtros.ate)}`.replace(/\//g, '-');
    window.addEventListener('afterprint', () => { document.title = titulo; }, { once: true });
    window.print();
  }

  alvo.addEventListener('click', (e) => {
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'csv') exportarCSV();
    else if (acao === 'imprimir') imprimir();
  });

  // Venda nova dentro do intervalo muda o resultado: refaz (no máximo uma vez por segundo).
  const refazer = criarAgendador(aplicar, 1000);
  ctx.aoDestruir(() => refazer.parar());
  const aoExecutar = (o) => {
    if (!execucaoDoCliente(o, cliente)) return;
    const dia = diaISO(o.executadaEm);
    if (dia >= filtros.de && dia <= filtros.ate) refazer.pedir();
  };
  ctx.on('order:executed', aoExecutar);
  ctx.on('order:new', aoExecutar);

  aplicar();
  return ctx;
}
