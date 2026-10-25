// C1 · Visão geral: KPIs da banca e do período, barra de uso da banca, evolução do patrimônio com a
// linha de aportes, distribuição por moeda e as últimas 10 operações.
// Com a cotação mudando, patrimônio, resultado, em operação, distribuição e o último ponto do gráfico
// são atualizados (no máximo 1 vez por segundo) sem redesenhar a tela.

import { getState, periodoAberto, ordensNoPeriodo } from '../../store.js';
import { hashDe } from '../../router.js';
import { resumoBanca } from '../../calc/bank.js';
import { evolucaoPatrimonio } from '../../calc/equity.js';
import { numerosDoPeriodo } from '../../calc/commission.js';
import { posicoesAbertas, valorAtual } from '../../calc/positions.js';
import { criarTabela } from '../../ui/table.js';
import { kpiHTML, atualizarKpi, valorUSDT } from '../../ui/kpi.js';
import { bancaHTML, atualizarBanca } from '../../ui/bankbar.js';
import { criarGrafico, opcoesBase, comAlfa } from '../../ui/chart.js';
import { monograma } from '../../ui/coin.js';
import { escapar, classeResultado, criarAgendador, trocarHTML } from '../../ui/dom.js';
import { icon, renderIcons } from '../../ui/icons.js';
import { usdt, data, dataCurta, variacao, compacto, plural, pctSimples, intervalo } from '../../utils/format.js';
import { diaISO, diasEntre } from '../../utils/dates.js';
import { COLUNAS_OPERACAO, linhaDaOrdem } from './operacoes.js';
import { criarContexto, clienteAtual, semCliente, cabecalho, execucaoDoCliente } from './comum.js';

const dirDe = (v) => (v > 0.005 ? 'up' : v < -0.005 ? 'down' : 'flat');

/** Valor a mercado por moeda + USDT livre, do maior para o menor, em % do patrimônio. */
export function distribuicao(cliente, ordens, precos, banca) {
  const porMoeda = new Map();
  for (const p of posicoesAbertas(ordens, { clienteId: cliente.id })) {
    porMoeda.set(p.moeda, (porMoeda.get(p.moeda) ?? 0) + valorAtual(p, precos));
  }
  const itens = [...porMoeda.entries()].map(([moeda, valor]) => ({ moeda, valor }));
  itens.push({ moeda: 'USDT', valor: Math.max(banca.saldoLivre, 0) });
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return itens
    .map((i) => ({ ...i, pct: total > 0 ? (i.valor / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

export function montarVisaoGeral(alvo, { definicao }) {
  const ctx = criarContexto();
  const cliente = clienteAtual();
  if (!cliente) { semCliente(alvo, definicao); return ctx; }

  const estado = () => getState();
  const hoje = diaISO(new Date());

  alvo.innerHTML = `
    <section class="page">
      ${cabecalho(definicao, cliente)}
      <div class="kpis kpis--main" data-ref="kpis"></div>
      <section class="card section" aria-labelledby="c1-banca">
        <header class="section__head">
          <h2 id="c1-banca">Banca</h2>
          <p class="section__note">Caixa = saldo livre + custo das posições. A reserva nunca é usada em compras.</p>
        </header>
        <div class="kpis kpis--inline" data-ref="banca-kpis"></div>
        <div data-ref="banca"></div>
      </section>
      <section class="card section span-8" aria-labelledby="c1-evolucao">
        <header class="section__head">
          <h2 id="c1-evolucao">Evolução do patrimônio</h2>
          <p class="section__note">Desde ${data(cliente.inicioContrato)} · fechamento de cada dia; hoje pela cotação ao vivo</p>
        </header>
        <div class="chart-box chart-box--lg"><canvas data-ref="grafico" role="img" aria-label="Evolução diária do patrimônio e dos aportes"></canvas></div>
      </section>
      <section class="card section span-4" aria-labelledby="c1-dist">
        <header class="section__head"><h2 id="c1-dist">Distribuição por moeda</h2></header>
        <ul class="dist-list" data-ref="dist"></ul>
      </section>
      <section class="card section section--table" aria-labelledby="c1-ultimas">
        <header class="section__head">
          <h2 id="c1-ultimas">Últimas operações</h2>
          <a class="section__link" href="${hashDe('cliente', 'operacoes')}">Ver todas ${icon('arrow-right')}</a>
        </header>
        <div data-ref="ultimas"></div>
      </section>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);

  // ---------- Série do patrimônio ----------
  const diarios = Object.fromEntries(Object.entries(estado().precos).map(([s, p]) => [s, p.diario ?? []]));
  let serie = [];
  function calcularSerie() {
    const s = estado();
    serie = evolucaoPatrimonio({
      clienteId: cliente.id, ordens: s.ordens, movimentos: s.movimentos, diarios,
      de: cliente.inicioContrato, ate: hoje,
    });
  }

  let banca = null;

  // ---------- KPIs ----------
  function kpisPrincipais() {
    const s = estado();
    const aberto = periodoAberto(cliente.id);
    const num = aberto ? numerosDoPeriodo(aberto, s.ordens, cliente) : null;
    const ult30 = serie.slice(-30).map((p) => p.patrimonio);
    const faltam = aberto ? Math.max(0, diasEntre(hoje, aberto.fim)) : null;
    return [
      {
        id: 'patrimonio', rotulo: 'Patrimônio', valor: valorUSDT(banca.patrimonio),
        extra: `Aportes − saques: ${usdt(banca.aportado)}`, spark: ult30, rotuloSpark: 'Patrimônio nos últimos 30 dias',
      },
      {
        id: 'resultado', rotulo: 'Resultado', valor: valorUSDT(banca.resultado, { sinal: true }), classe: classeResultado(banca.resultado),
        variacao: { texto: variacao(banca.resultadoPct), dir: dirDe(banca.resultadoPct) }, extra: 'sobre o aportado',
      },
      {
        id: 'periodo', rotulo: 'Resultado do período atual', valor: num ? valorUSDT(num.resultado, { sinal: true }) : '—',
        classe: num ? classeResultado(num.resultado) : '',
        extra: aberto ? `${intervalo(aberto.inicio, aberto.fim).replace(/\/\d{4}/g, '')} · ${plural(num.operacoes, 'venda')}` : 'Sem período em aberto',
      },
      {
        id: 'comissao', rotulo: 'Comissão prevista', valor: num ? valorUSDT(num.comissao) : '—',
        extra: num ? `${pctSimples(num.comissaoPct, { casas: 0 })} do resultado positivo` : '',
      },
      {
        id: 'fechamento', rotulo: 'Próximo fechamento', valor: aberto ? `<span class="num">${data(aberto.fim)}</span>` : '—',
        extra: aberto ? (faltam === 0 ? 'Fecha hoje' : `Em ${plural(faltam, 'dia')} · fecha no dia ${aberto.diaFechamento}`) : '',
      },
    ];
  }

  function kpisBanca() {
    return [
      { id: 'caixa', rotulo: 'Caixa', valor: valorUSDT(banca.caixa), extra: 'Valor que o robô pode operar', pequeno: true },
      { id: 'reserva', rotulo: 'Reserva de banca', valor: valorUSDT(banca.reserva), extra: `${pctSimples(cliente.reservaPct, { casas: 0 })} do caixa`, pequeno: true },
      { id: 'disponivel', rotulo: 'Disponível para operar', valor: valorUSDT(banca.disponivel), extra: `Ordem de ${usdt(banca.valorOrdem)}`, pequeno: true },
      {
        id: 'emOperacao', rotulo: 'Em operação', valor: valorUSDT(banca.emOperacao), pequeno: true,
        extra: `${plural(banca.posicoes, 'posição', 'posições')} · custo ${usdt(banca.custoPosicoes)}`,
      },
    ];
  }

  function desenharKpis(primeira = false) {
    const principais = kpisPrincipais();
    const daBanca = kpisBanca();
    if (primeira) {
      ref('kpis').innerHTML = principais.map(kpiHTML).join('');
      ref('banca-kpis').innerHTML = daBanca.map(kpiHTML).join('');
      ref('banca').innerHTML = bancaHTML(banca);
      return;
    }
    for (const k of principais) atualizarKpi(ref('kpis'), k.id, k);
    for (const k of daBanca) atualizarKpi(ref('banca-kpis'), k.id, k);
    atualizarBanca(ref('banca'), banca);
  }

  function desenharDistribuicao() {
    const itens = distribuicao(cliente, estado().ordens, estado().precos, banca);
    const html = itens.length && banca.patrimonio > 0
      ? itens.map((i) => `
        <li class="dist-list__item">
          <span class="dist-list__coin">${i.moeda === 'USDT' ? '<span class="monogram monogram--base" aria-hidden="true">$</span>' : monograma(i.moeda)}
            <span>${i.moeda === 'USDT' ? 'USDT livre' : escapar(i.moeda)}</span></span>
          <span class="dist-list__val num">${usdt(i.valor, { sufixo: false })}</span>
          <span class="dist-list__pct num">${pctSimples(i.pct, { casas: 1 })}</span>
          <span class="dist-list__bar" aria-hidden="true"><span style="width:${i.pct.toFixed(2)}%;${i.moeda === 'USDT' ? '' : `--coin:${estado().moedas[i.moeda]?.cor ?? 'currentColor'}`}"${i.moeda === 'USDT' ? ' class="is-base"' : ''}></span></span>
        </li>`).join('')
      : '<li class="muted">Sem saldo no momento.</li>';
    trocarHTML(ref('dist'), html);
  }

  // ---------- Gráfico ----------
  function pontos() {
    const lista = serie.map((p) => ({ ...p }));
    if (lista.length && lista.at(-1).dia === hoje) lista.at(-1).patrimonio = banca.patrimonio;
    return lista;
  }

  const grafico = criarGrafico(ref('grafico'), (cores) => {
    const lista = pontos();
    return {
      type: 'line',
      data: {
        labels: lista.map((p) => dataCurta(p.dia)),
        datasets: [
          {
            label: 'Patrimônio', data: lista.map((p) => p.patrimonio),
            borderColor: cores.brand, backgroundColor: comAlfa(cores.brand, 0.12), fill: true,
            pointRadius: 0, pointHoverRadius: 3, borderWidth: 2, tension: 0.25,
          },
          {
            label: 'Aportes', data: lista.map((p) => p.aportado),
            borderColor: cores.faint, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0,
            stepped: true, fill: false,
          },
        ],
      },
      options: opcoesBase(cores, {
        eixoY: (v) => compacto(v),
        dica: {
          title: (itens) => data(lista[itens[0].dataIndex]?.dia),
          label: (c) => `${c.dataset.label}: ${usdt(c.parsed.y)}`,
        },
      }),
    };
  });
  ctx.aoDestruir(() => grafico.destruir());

  function atualizarUltimoPonto() {
    if (!serie.length || serie.at(-1).dia !== hoje) return;
    grafico.atualizar((g) => {
      const ds = g.data.datasets[0].data;
      ds[ds.length - 1] = banca.patrimonio;
    });
  }

  // ---------- Últimas operações ----------
  const C = COLUNAS_OPERACAO;
  const ultimas = criarTabela({
    colunas: [C.data, C.moeda, C.lado, C.preco, C.quantidade, C.total, C.lucro],
    chave: (l) => l.o.id,
    ordem: { col: 'data', dir: 'desc' },
    porPagina: 0,
    maxLinhas: 10,
    ordenavel: false,
    compacta: true,
    rotulo: 'Últimas 10 operações',
    vazio: { titulo: 'Nenhuma operação ainda', texto: 'As compras e vendas do robô aparecem aqui.' },
  });
  ref('ultimas').append(ultimas.el);
  function carregarUltimas() {
    const lista = ordensNoPeriodo(cliente.id, null, null).slice(0, 10).map(linhaDaOrdem);
    ultimas.definir(lista);
  }

  // ---------- Ciclo ----------
  function recalcularBanca() {
    const s = estado();
    banca = resumoBanca(cliente, s.ordens, s.movimentos, s.precos);
  }

  function tudo() {
    recalcularBanca();
    calcularSerie();
    desenharKpis(true);
    desenharDistribuicao();
    grafico.refazer();
    carregarUltimas();
    renderIcons();
  }

  const aoVivo = criarAgendador(() => {
    recalcularBanca();
    desenharKpis();
    desenharDistribuicao();
    atualizarUltimoPonto();
  }, 1000);
  ctx.aoDestruir(() => aoVivo.parar());
  ctx.on('prices:update', ({ moeda }) => {
    if (banca && banca.posicoes && cliente.moedas.includes(moeda)) aoVivo.pedir();
  });

  // Operação nova: números da banca e do período mudam, e a linha entra no topo das últimas.
  const aoOperar = criarAgendador(() => {
    recalcularBanca();
    calcularSerie();
    desenharKpis();
    desenharDistribuicao();
    grafico.refazer();
  }, 500);
  ctx.aoDestruir(() => aoOperar.parar());
  const aoExecutar = (o) => {
    if (!execucaoDoCliente(o, cliente)) return;
    ultimas.inserir(linhaDaOrdem(o));
    aoOperar.pedir();
  };
  ctx.on('order:executed', aoExecutar);
  ctx.on('order:new', aoExecutar);
  ctx.on('order:canceled', (o) => { if (o?.clienteId === cliente.id) aoOperar.pedir(); });
  ctx.on('cash:new', (m) => { if (m?.clienteId === cliente.id) aoOperar.pedir(); });
  ctx.on('client:change', (c) => { if (c?.id === cliente.id) aoOperar.pedir(); });

  tudo();
  return ctx;
}
