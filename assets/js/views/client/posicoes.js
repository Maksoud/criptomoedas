// C3 · Posições em aberto: compras do cliente ainda não vendidas, com a cotação ao vivo.
// Ao mudar o preço de uma moeda, só as células de cotação, variação, distância e valor das linhas
// daquela moeda são trocadas (mais o rodapé e os KPIs); a tabela não é redesenhada.

import { getState } from '../../store.js';
import { gravarConsulta } from '../../router.js';
import { posicoesAbertas, detalharPosicao } from '../../calc/positions.js';
import { criarTabela } from '../../ui/table.js';
import { criarFiltros, lerFiltros, consultaDosFiltros } from '../../ui/filters.js';
import { kpiHTML, atualizarKpi, valorUSDT } from '../../ui/kpi.js';
import { moedaHTML } from '../../ui/coin.js';
import { classeResultado, criarAgendador } from '../../ui/dom.js';
import { usdt, preco, qtd, data, variacao, pct, pctSimples, plural } from '../../utils/format.js';
import { criarContexto, clienteAtual, semCliente, cabecalho, moedasDoCliente, contextoFiltros } from './comum.js';

/** Quanto do caminho entre o preço de compra e o alvo a cotação já andou (0 a 100). */
export function progressoAteAlvo(det) {
  if (!det.alvo || det.cotacao == null) return null;
  const faixa = det.alvo - det.precoCompra;
  if (!(faixa > 0)) return det.cotacao >= det.alvo ? 100 : 0;
  return Math.max(0, Math.min(100, ((det.cotacao - det.precoCompra) / faixa) * 100));
}

function alvoHTML(d) {
  if (d.semAlvo) return '<span class="badge badge--warn" title="A venda programada foi cancelada; o administrador pode definir um novo alvo">sem alvo</span>';
  if (d.compra.vendaDinamica && !d.venda) {
    return `<span class="target">${d.alvo ? `<span class="num">${preco(d.alvo)}</span>` : ''}<span class="badge badge--info">dinâmico</span></span>`;
  }
  return `<span class="target"><span class="num">${preco(d.alvo)}</span><span class="target__kind">fixo</span></span>`;
}

function distanciaHTML(d) {
  const prog = progressoAteAlvo(d);
  if (prog == null) return '<span class="faint">—</span>';
  const atingido = d.distanciaAlvoPct <= 0;
  const texto = atingido ? 'atingido' : pctSimples(d.distanciaAlvoPct);
  return `
    <span class="dist${prog >= 100 ? ' is-done' : ''}" title="Faltam ${texto} até o alvo · ${prog.toFixed(0)}% do caminho desde a compra">
      <span class="dist__text num">${texto}</span>
      <span class="dist__bar" aria-hidden="true"><span style="width:${prog.toFixed(1)}%"></span></span>
    </span>`;
}

const VIVAS = ['cotacao', 'variacao', 'alvo', 'distancia', 'valor'];

export function montarPosicoes(alvo, { definicao, consulta }) {
  const ctx = criarContexto();
  const cliente = clienteAtual();
  if (!cliente) { semCliente(alvo, definicao); return ctx; }

  const moedas = moedasDoCliente(cliente);
  let filtros = lerFiltros(consulta, { padrao: 'inicio', ctx: contextoFiltros(cliente), moedas });
  gravarConsulta({ moedas: consultaDosFiltros(filtros).moedas });

  alvo.innerHTML = `
    <section class="page">
      ${cabecalho(definicao, cliente)}
      <div class="kpis" data-ref="kpis"></div>
      <div class="card no-print" data-ref="filtros"></div>
      <div data-ref="tabela"></div>
      <p class="page-note muted">Posições em aberto não entram no resultado do período: o lucro só conta quando a venda é executada.</p>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);

  const precos = () => getState().precos;
  const colunas = [
    { id: 'moeda', titulo: 'Moeda', ordenar: (l) => l.moeda, html: (l) => moedaHTML(l.moeda) },
    { id: 'compra', titulo: 'Compra', ordenar: (l) => +l.compra.executadaEm, html: (l) => `<span class="num">${data(l.compra.executadaEm)}</span>` },
    { id: 'quantidade', titulo: 'Quantidade', num: true, ordenar: (l) => l.quantidade, html: (l) => qtd(l.quantidade, l.moeda) },
    { id: 'precoCompra', titulo: 'Preço de compra', num: true, ordenar: (l) => l.precoCompra, html: (l) => preco(l.precoCompra) },
    { id: 'cotacao', titulo: 'Cotação', num: true, ordenar: (l) => l.det.cotacao, html: (l) => preco(l.det.cotacao) },
    {
      id: 'variacao', titulo: 'Variação', num: true, ordenar: (l) => l.det.variacaoPct,
      html: (l) => variacao(l.det.variacaoPct), classe: (l) => classeResultado(l.det.variacaoPct ?? 0),
    },
    { id: 'alvo', titulo: 'Alvo', num: true, ordenar: (l) => l.alvo, html: (l) => alvoHTML(l.det) },
    { id: 'distancia', titulo: 'Distância até o alvo', ordenar: (l) => l.det.distanciaAlvoPct, html: (l) => distanciaHTML(l.det) },
    { id: 'valor', titulo: 'Valor atual (USDT)', num: true, ordenar: (l) => l.det.valor, html: (l) => usdt(l.det.valor, { sufixo: false }) },
  ];

  function totais(linhas) {
    let custo = 0;
    let valor = 0;
    for (const l of linhas) {
      custo += l.custo;
      valor += l.det.valor;
    }
    return { custo, valor, resultado: valor - custo, pct: custo > 0 ? (valor / custo - 1) * 100 : 0 };
  }

  const tabela = criarTabela({
    colunas,
    chave: (l) => l.compra.id,
    ordem: { col: 'compra', dir: 'desc' },
    rotulo: 'Posições em aberto',
    vazio: { titulo: 'Nenhuma posição em aberto', texto: 'Quando o robô comprar, a posição aparece aqui até a venda.' },
    rodape(linhas) {
      const t = totais(linhas);
      return `<tr>
        <th scope="row" colspan="4">Total · ${plural(linhas.length, 'posição', 'posições')}</th>
        <td class="is-num num muted" colspan="2" data-tot="custo">custo ${usdt(t.custo, { sufixo: false })}</td>
        <td class="is-num num ${classeResultado(t.resultado)}" colspan="2" data-tot="resultado">${usdt(t.resultado, { sufixo: false, sinal: true })} (${pct(t.pct)})</td>
        <td class="is-num num" data-tot="valor">${usdt(t.valor, { sufixo: false })}</td>
      </tr>`;
    },
  });
  ref('tabela').append(tabela.el);

  let linhas = [];

  function desenharKpis() {
    const t = totais(linhas);
    const kpis = [
      { id: 'n', rotulo: 'Posições', valor: linhas.length.toLocaleString('pt-BR'), extra: `${new Set(linhas.map((l) => l.moeda)).size} moedas` },
      { id: 'custo', rotulo: 'Custo das posições', valor: valorUSDT(t.custo), extra: 'Valor pago nas compras' },
      { id: 'valor', rotulo: 'Valor atual', valor: valorUSDT(t.valor), extra: 'Pela cotação ao vivo' },
      {
        id: 'resultado', rotulo: 'Resultado em aberto', valor: valorUSDT(t.resultado, { sinal: true }), classe: classeResultado(t.resultado),
        variacao: { texto: variacao(t.pct), dir: t.pct > 0 ? 'up' : t.pct < 0 ? 'down' : 'flat' }, extra: 'Ainda não realizado',
      },
    ];
    if (!ref('kpis').children.length) {
      ref('kpis').innerHTML = kpis.map(kpiHTML).join('');
    } else {
      for (const k of kpis) atualizarKpi(ref('kpis'), k.id, k);
    }
  }

  function carregar() {
    const p = precos();
    linhas = posicoesAbertas(getState().ordens, { clienteId: cliente.id })
      .filter((x) => !filtros.moedas.length || filtros.moedas.includes(x.moeda))
      .map((x) => ({ ...x, det: detalharPosicao(x, p) }));
    tabela.definir(linhas);
    desenharKpis();
  }

  // Cotação ao vivo: junta as moedas que mudaram e aplica no máximo 4 vezes por segundo.
  const mudaram = new Set();
  const vivo = criarAgendador(() => {
    const p = precos();
    for (const l of linhas) {
      if (!mudaram.has(l.moeda)) continue;
      if (l.compra.vendaDinamica && !l.venda) l.alvo = l.compra.alvo; // alvo dinâmico acompanha o topo
      l.det = detalharPosicao(l, p);
    }
    tabela.atualizarCelulas((l) => mudaram.has(l.moeda), VIVAS);
    tabela.atualizarRodape();
    desenharKpis();
    mudaram.clear();
  }, 250);
  ctx.aoDestruir(() => vivo.parar());

  ctx.on('prices:update', ({ moeda }) => {
    if (!linhas.some((l) => l.moeda === moeda)) return;
    mudaram.add(moeda);
    vivo.pedir();
  });

  // Mudança de estrutura (compra nova, venda executada, alvo trocado): refaz a lista.
  const refazer = criarAgendador(carregar, 0);
  ctx.aoDestruir(() => refazer.parar());
  const doCliente = (o) => o?.clienteId === cliente.id;
  ctx.on('order:executed', (o) => doCliente(o) && refazer.pedir());
  ctx.on('order:new', (o) => doCliente(o) && refazer.pedir());
  ctx.on('order:canceled', (o) => doCliente(o) && refazer.pedir());
  ctx.on('position:target', ({ compra }) => doCliente(compra) && refazer.pedir());
  ctx.on('position:dynamic', ({ compra }) => {
    if (!doCliente(compra) || !linhas.some((l) => l.compra.id === compra.id)) return;
    mudaram.add(compra.moeda);
    vivo.pedir();
  });

  criarFiltros(ref('filtros'), {
    valor: filtros, ctx: contextoFiltros(cliente), moedas, comPeriodo: false,
    aoMudar(f) {
      filtros = f;
      gravarConsulta({ moedas: consultaDosFiltros(f).moedas });
      carregar();
    },
  });
  if (moedas.length <= 1) ref('filtros').hidden = true;

  carregar();
  return ctx;
}
