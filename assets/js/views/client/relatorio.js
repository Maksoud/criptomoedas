// C4 · Relatório de resultados por período e moedas. Só operações fechadas (vendas executadas no
// intervalo) entram no resultado, com as mesmas funções do C5: o relatório do intervalo exato de um
// período bate com o resultado daquele período. Exporta CSV (Excel pt-BR) e imprime em A4 retrato.
//
// `criarRelatorio` é o componente; a C4 o usa com o cliente de "Visualizando como" e a A5 com um
// cliente escolhido ou com `cliente: null` ("Todos — consolidado", com uma linha por cliente).

import { getState, periodosDoCliente } from '../../store.js';
import { gravarConsulta } from '../../router.js';
import { relatorio, relatorioCSV } from '../../calc/reports.js';
import { posicoesAbertasEm } from '../../calc/positions.js';
import { numerosDoPeriodo } from '../../calc/commission.js';
import { criarTabela } from '../../ui/table.js';
import { criarFiltros, lerFiltros, consultaDosFiltros, textoMoedas, PRESETS } from '../../ui/filters.js';
import { criarGrafico, opcoesBase } from '../../ui/chart.js';
import { moedaHTML } from '../../ui/coin.js';
import { escapar, classeResultado, criarAgendador } from '../../ui/dom.js';
import { icon, renderIcons } from '../../ui/icons.js';
import { baixarArquivo, paraNomeDeArquivo } from '../../ui/download.js';
import { usdt, data, dataCurta, dataHora, intervalo, compacto, plural, pctSimples } from '../../utils/format.js';
import { diaISO, somarDias } from '../../utils/dates.js';
import { dataCSV, numeroCSV } from '../../utils/csv.js';
import { criarContexto, clienteAtual, semCliente, cabecalho, moedasDoCliente, contextoFiltros } from './comum.js';

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

/**
 * Consolidado: uma linha por cliente com o resultado das vendas do intervalo e a comissão dos períodos
 * que fecham dentro dele (o período em aberto entra como previsto). O total é a soma das linhas.
 */
export function linhasPorCliente(rel, { clientes, periodos, ordens, de, ate }) {
  const porCliente = new Map();
  for (const l of rel.linhas) {
    const b = porCliente.get(l.clienteId) ?? { vendas: 0, volumeVendido: 0, lucroBruto: 0, taxas: 0, resultado: 0 };
    b.vendas++;
    b.volumeVendido += l.venda.total;
    b.lucroBruto += l.bruto;
    b.taxas += l.taxas;
    b.resultado += l.liquido;
    porCliente.set(l.clienteId, b);
  }
  return Object.values(clientes).map((c) => {
    const ps = periodos.filter((p) => p.clienteId === c.id && p.fim >= de && p.fim <= ate);
    let comissao = 0;
    let prevista = false;
    for (const p of ps) {
      const n = numerosDoPeriodo(p, ordens, c);
      comissao += n.comissao ?? 0;
      if (p.status === 'aberto') prevista = true;
    }
    const b = porCliente.get(c.id) ?? { vendas: 0, volumeVendido: 0, lucroBruto: 0, taxas: 0, resultado: 0 };
    return { clienteId: c.id, nome: c.nome, status: c.status, comissaoPct: c.comissaoPct, periodos: ps.length, comissao, prevista, ...b };
  }).filter((l) => l.vendas > 0 || l.periodos > 0 || l.status !== 'inativo');
}

/**
 * Monta o relatório em `alvo`.
 * @param opcoes {
 *   definicao, consulta,
 *   cliente: objeto do cliente ou null (consolidado de todos),
 *   topo: HTML do cabeçalho da página (recebe os botões CSV/Imprimir em `acoes`),
 *   consultaExtra: campos fixos a manter na URL (ex.: { cliente: 'c01' }),
 * }
 */
export function criarRelatorio(alvo, { definicao, consulta, cliente = null, topo, consultaExtra = {} }) {
  const ctx = criarContexto();
  const s0 = getState();
  const consolidado = !cliente;
  const todos = Object.values(s0.clientes);
  const catalogo = Object.keys(s0.moedas);
  const usadas = new Set(s0.ordens.map((o) => o.moeda));
  const moedas = consolidado ? catalogo.filter((m) => usadas.has(m)) : moedasDoCliente(cliente);
  const hoje = diaISO(new Date());
  const inicioGeral = todos.reduce((m, c) => (c.inicioContrato < m ? c.inicioContrato : m), hoje);
  const ctxFiltro = consolidado ? { hoje, inicioContrato: inicioGeral, periodos: [] } : contextoFiltros(cliente);
  let filtros = lerFiltros(consulta, { padrao: consolidado ? '30d' : 'periodo', ctx: ctxFiltro, moedas });
  const gravar = () => gravarConsulta({ ...consultaExtra, ...consultaDosFiltros(filtros) });
  gravar();
  const nomeRel = consolidado ? 'Todos os clientes — consolidado' : cliente.nome;

  const acoes = `
    <button class="btn btn--secondary" type="button" data-acao="csv">${icon('download')}<span>Exportar CSV</span></button>
    <button class="btn btn--secondary" type="button" data-acao="imprimir">${icon('printer')}<span>Imprimir/PDF</span></button>`;

  alvo.innerHTML = `
    <section class="page report">
      ${topo(acoes)}
      <div class="card no-print" data-ref="filtros"></div>
      <div class="card report-head" data-ref="cabecalho"></div>
      <div class="report-stats" data-ref="resumo"></div>
      ${consolidado ? `
        <section class="card section" aria-labelledby="rel-clientes">
          <header class="section__head"><h2 id="rel-clientes">Por cliente</h2>
            <p class="section__note">Comissão dos períodos que fecham no intervalo; o período em aberto entra como previsto.</p></header>
          <div data-ref="clientes"></div>
        </section>` : ''}
      <section class="card section" aria-labelledby="rel-moedas">
        <header class="section__head"><h2 id="rel-moedas">Por moeda</h2></header>
        <div data-ref="moedas"></div>
      </section>
      <section class="card section report-chart" aria-labelledby="rel-dia">
        <header class="section__head"><h2 id="rel-dia">Resultado por dia</h2><p class="section__note" data-ref="nota-dia"></p></header>
        <div class="chart-box chart-box--md"><canvas data-ref="grafico" role="img" aria-label="Resultado líquido por dia"></canvas></div>
      </section>
      <footer class="print-footer print-only">
        <span>Demonstração — dados fictícios</span>
        <span data-ref="emissao-rodape"></span>
      </footer>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);

  let rel = null;
  let porCliente = [];
  let dias = [];
  let emitidoEm = new Date();

  const n = (v) => usdt(v, { sufixo: false });
  const res = (v) => usdt(v, { sufixo: false, sinal: true });
  const tabela = criarTabela({
    colunas: [
      { id: 'moeda', titulo: 'Moeda', ordenar: (l) => l.moeda, html: (l) => moedaHTML(l.moeda) },
      { id: 'compras', titulo: 'Compras', num: true, ordenar: (l) => l.compras, html: (l) => l.compras.toLocaleString('pt-BR') },
      { id: 'volumeComprado', titulo: 'Volume comprado', num: true, ordenar: (l) => l.volumeComprado, html: (l) => n(l.volumeComprado) },
      { id: 'vendas', titulo: 'Vendas', num: true, ordenar: (l) => l.vendas, html: (l) => l.vendas.toLocaleString('pt-BR') },
      { id: 'volumeVendido', titulo: 'Volume vendido', num: true, ordenar: (l) => l.volumeVendido, html: (l) => n(l.volumeVendido) },
      { id: 'lucroBruto', titulo: 'Lucro bruto', num: true, ordenar: (l) => l.lucroBruto, html: (l) => res(l.lucroBruto), classe: (l) => classeResultado(l.lucroBruto) },
      { id: 'taxas', titulo: 'Taxas', num: true, ordenar: (l) => l.taxas, html: (l) => n(l.taxas) },
      { id: 'resultado', titulo: 'Resultado líquido', num: true, ordenar: (l) => l.resultado, html: (l) => res(l.resultado), classe: (l) => classeResultado(l.resultado) },
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
      <td class="is-num num ${classeResultado(rel.lucroBruto)}">${res(rel.lucroBruto)}</td>
      <td class="is-num num">${n(rel.taxas)}</td>
      <td class="is-num num ${classeResultado(rel.resultado)}">${res(rel.resultado)}</td>
    </tr>`,
  });
  ref('moedas').append(tabela.el);

  const tabelaClientes = consolidado ? criarTabela({
    colunas: [
      { id: 'nome', titulo: 'Cliente', ordenar: (l) => l.nome, html: (l) => `${escapar(l.nome)}${l.status !== 'ativo' ? ` <span class="muted">(${l.status})</span>` : ''}` },
      { id: 'vendas', titulo: 'Vendas', num: true, ordenar: (l) => l.vendas, html: (l) => l.vendas.toLocaleString('pt-BR') },
      { id: 'volumeVendido', titulo: 'Volume vendido', num: true, ordenar: (l) => l.volumeVendido, html: (l) => n(l.volumeVendido) },
      { id: 'lucroBruto', titulo: 'Lucro bruto', num: true, ordenar: (l) => l.lucroBruto, html: (l) => res(l.lucroBruto), classe: (l) => classeResultado(l.lucroBruto) },
      { id: 'taxas', titulo: 'Taxas', num: true, ordenar: (l) => l.taxas, html: (l) => n(l.taxas) },
      { id: 'resultado', titulo: 'Resultado líquido', num: true, ordenar: (l) => l.resultado, html: (l) => res(l.resultado), classe: (l) => classeResultado(l.resultado) },
      { id: 'pct', titulo: 'Comissão %', num: true, ordenar: (l) => l.comissaoPct, html: (l) => pctSimples(l.comissaoPct, { casas: 0 }) },
      {
        id: 'comissao', titulo: 'Comissão (USDT)', num: true, ordenar: (l) => l.comissao,
        html: (l) => `${n(l.comissao)}${l.prevista ? '<span class="muted"> *</span>' : ''}`,
      },
    ],
    chave: (l) => l.clienteId,
    ordem: { col: 'resultado', dir: 'desc' },
    porPagina: 0,
    rotulo: 'Resultado e comissão por cliente (USDT)',
    vazio: { titulo: 'Nenhum cliente neste período' },
    rodape: (linhas) => {
      const t = (k) => linhas.reduce((s, l) => s + l[k], 0);
      return `<tr>
        <th scope="row">Total · ${plural(linhas.length, 'cliente')}</th>
        <td class="is-num num">${t('vendas').toLocaleString('pt-BR')}</td>
        <td class="is-num num">${n(t('volumeVendido'))}</td>
        <td class="is-num num ${classeResultado(t('lucroBruto'))}">${res(t('lucroBruto'))}</td>
        <td class="is-num num">${n(t('taxas'))}</td>
        <td class="is-num num ${classeResultado(t('resultado'))}">${res(t('resultado'))}</td>
        <td></td>
        <td class="is-num num" data-total="comissao">${n(t('comissao'))}</td>
      </tr>`;
    },
  }) : null;
  if (tabelaClientes) ref('clientes').append(tabelaClientes.el);

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
    const p = consolidado ? null : periodoDoIntervalo(cliente.id, filtros.de, filtros.ate);
    const preset = PRESETS.find((x) => x.id === filtros.preset);
    const sobre = p ? `Período de apuração${p.status === 'aberto' ? ' em aberto' : ''}` : preset && preset.id !== 'personalizado' ? preset.nome : 'Intervalo personalizado';
    return `
      <div class="report-head__brand print-only">
        <svg class="brand__mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 6.5 12 3 4.5 8.5"/><path d="M4.5 15.5 12 21l7-3.5"/><path d="M4.5 8.5v7" opacity=".45"/>
        </svg>
        <span class="brand__name"><b>Cripto</b>Ops</span>
        <span class="report-head__title">${consolidado ? 'Relatório consolidado' : 'Relatório de resultados'}</span>
        <span class="badge badge--demo">DEMO</span>
      </div>
      <dl class="report-meta">
        <div><dt class="label">Cliente</dt><dd>${escapar(nomeRel)}</dd>${consolidado ? `<dd class="report-meta__extra">${plural(porCliente.length, 'cliente')}</dd>` : ''}</div>
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
    const abertas = posicoesAbertasEm(getState().ordens, { clienteId: cliente?.id ?? null, ate: filtros.ate, moedas: filtros.moedas });
    const custoAbertas = abertas.reduce((s, o) => s + o.total, 0);
    const fimTexto = filtros.ate >= diaISO(new Date()) ? 'agora' : `em ${data(filtros.ate)}`;
    const lista = [
      stat('Volume comprado', usdt(rel.volumeComprado), plural(rel.compras, 'compra')),
      stat('Volume vendido', usdt(rel.volumeVendido), plural(rel.vendas, 'venda')),
      stat('Operações', (rel.compras + rel.vendas).toLocaleString('pt-BR'), `${plural(rel.vendas, 'operação fechada', 'operações fechadas')}`),
      stat('Lucro bruto', `<span class="${classeResultado(rel.lucroBruto)}">${usdt(rel.lucroBruto, { sinal: true })}</span>`, 'Vendas − custo das compras'),
      stat('Taxas', usdt(rel.taxas), '0,1% por execução, nas duas pontas'),
      stat('Resultado líquido', `<span class="${classeResultado(rel.resultado)}">${usdt(rel.resultado, { sinal: true })}</span>`, 'Lucro bruto − taxas', 'stat--main'),
    ];
    if (consolidado) {
      const total = porCliente.reduce((s, l) => s + l.comissao, 0);
      lista.push(stat('Comissões', usdt(total), 'Soma das comissões por cliente'));
    }
    lista.push(stat('Posições em aberto no fim', plural(abertas.length, 'posição', 'posições'), `Custo ${usdt(custoAbertas)} ${fimTexto} · informativo, fora do resultado`, 'stat--info'));
    return lista.join('');
  }

  function aplicar() {
    const s = getState();
    emitidoEm = new Date();
    rel = relatorio(s.ordens, { clienteId: cliente?.id ?? null, inicio: filtros.de, fim: filtros.ate, moedas: filtros.moedas });
    if (consolidado) {
      porCliente = linhasPorCliente(rel, { clientes: s.clientes, periodos: s.periodos, ordens: s.ordens, de: filtros.de, ate: filtros.ate });
      tabelaClientes.definir(porCliente);
    }
    dias = serieDiaria(rel, filtros.de, filtros.ate, { inicioContrato: consolidado ? inicioGeral : cliente.inicioContrato });
    ref('cabecalho').innerHTML = cabecalhoHTML();
    ref('resumo').innerHTML = resumoHTML();
    ref('emissao-rodape').textContent = `Emitido em ${dataHora(emitidoEm)} · ${nomeRel} · ${intervalo(filtros.de, filtros.ate)}`;
    tabela.definir(Object.entries(rel.porMoeda).map(([moeda, b]) => ({ moeda, ...b })));
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
      gravar();
      aplicar();
    },
  });

  function exportarCSV() {
    const nomes = Object.fromEntries(Object.values(getState().clientes).map((c) => [c.id, c.nome]));
    const cab = [
      [consolidado ? 'Relatório consolidado' : 'Relatório de resultados', 'CriptoOps — demonstração, dados fictícios'],
      ['Cliente', nomeRel],
      ['Período', `${dataCSV(filtros.de)} a ${dataCSV(filtros.ate)}`],
      ['Moedas', textoMoedas(filtros.moedas)],
      ['Emitido em', `${dataCSV(emitidoEm)} ${emitidoEm.toTimeString().slice(0, 5)}`],
      ['Valores em', 'USDT'],
    ];
    if (consolidado) {
      const v = (x) => numeroCSV(x, 2);
      cab.push([], ['Resumo por cliente', 'Vendas', 'Resultado (USDT)', 'Comissão %', 'Comissão (USDT)']);
      for (const l of porCliente) cab.push([l.nome, String(l.vendas), v(l.resultado), v(l.comissaoPct), v(l.comissao) + (l.prevista ? ' (prevista)' : '')]);
      cab.push(['Total', String(porCliente.reduce((s, l) => s + l.vendas, 0)), v(porCliente.reduce((s, l) => s + l.resultado, 0)), '', v(porCliente.reduce((s, l) => s + l.comissao, 0))]);
    }
    const csv = relatorioCSV(rel, { nomeCliente: (id) => nomes[id] ?? id, cabecalho: cab });
    baixarArquivo(`relatorio-${paraNomeDeArquivo(consolidado ? 'consolidado' : cliente.nome)}-${filtros.de}-a-${filtros.ate}.csv`, csv);
  }

  function imprimir() {
    const titulo = document.title;
    document.title = `Relatório ${consolidado ? 'consolidado' : cliente.nome} ${data(filtros.de)} a ${data(filtros.ate)}`.replace(/\//g, '-');
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
    if (!o || o.status !== 'executada' || (cliente && o.clienteId !== cliente.id)) return;
    const dia = diaISO(o.executadaEm);
    if (dia >= filtros.de && dia <= filtros.ate) refazer.pedir();
  };
  ctx.on('order:executed', aoExecutar);
  ctx.on('order:new', aoExecutar);
  if (consolidado) for (const ev of ['commission:closed', 'commission:paid']) ctx.on(ev, () => refazer.pedir());

  aplicar();
  return ctx;
}

export function montarRelatorio(alvo, { definicao, consulta }) {
  const cliente = clienteAtual();
  if (!cliente) { semCliente(alvo, definicao); return criarContexto(); }
  return criarRelatorio(alvo, { definicao, consulta, cliente, topo: (acoes) => cabecalho(definicao, cliente, { acoes }) });
}
