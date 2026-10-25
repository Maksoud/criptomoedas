// C2 · Operações: compras e vendas executadas do cliente, com filtro por período, moedas e lado.
// Uma operação nova (motor da F4) entra no topo da tabela com destaque, sem recarregar.

import { ordensNoPeriodo, ordemPorId } from '../../store.js';
import { gravarConsulta } from '../../router.js';
import { lucroDaVenda } from '../../calc/positions.js';
import { criarTabela } from '../../ui/table.js';
import { criarFiltros, lerFiltros, consultaDosFiltros } from '../../ui/filters.js';
import { moedaHTML } from '../../ui/coin.js';
import { escapar, capitalizar, classeResultado } from '../../ui/dom.js';
import { usdt, preco, qtd, dataHora, plural } from '../../utils/format.js';
import { diaISO } from '../../utils/dates.js';
import {
  criarContexto, clienteAtual, semCliente, cabecalho, moedasDoCliente, contextoFiltros, execucaoDoCliente,
} from './comum.js';

const TIPOS = { LIMIT: 'Limite', MARKET: 'Mercado' };

export function ladoHTML(lado) {
  return lado === 'compra' ? '<span class="badge badge--up">Compra</span>' : '<span class="badge">Venda</span>';
}

/** Linha da tabela: a ordem + o lucro (só vendas). */
export function linhaDaOrdem(o) {
  let lucro = null;
  if (o.lado === 'venda') {
    const compra = ordemPorId(o.compraId);
    if (compra) lucro = lucroDaVenda(o, compra).liquido;
  }
  return { o, lucro };
}

export const COLUNAS_OPERACAO = {
  data: { id: 'data', titulo: 'Data e hora', ordenar: (l) => +l.o.executadaEm, html: (l) => `<span class="num">${dataHora(l.o.executadaEm)}</span>` },
  moeda: { id: 'moeda', titulo: 'Moeda', ordenar: (l) => l.o.moeda, html: (l) => moedaHTML(l.o.moeda) },
  lado: { id: 'lado', titulo: 'Lado', ordenar: (l) => l.o.lado, html: (l) => ladoHTML(l.o.lado) },
  tipo: { id: 'tipo', titulo: 'Tipo', ordenar: (l) => l.o.tipo, html: (l) => TIPOS[l.o.tipo] ?? escapar(l.o.tipo) },
  motivo: { id: 'motivo', titulo: 'Motivo', html: (l) => `<span class="muted">${escapar(capitalizar(l.o.motivo))}</span>` },
  preco: { id: 'preco', titulo: 'Preço', num: true, ordenar: (l) => l.o.preco, html: (l) => preco(l.o.preco) },
  quantidade: { id: 'quantidade', titulo: 'Quantidade', num: true, ordenar: (l) => l.o.quantidade, html: (l) => qtd(l.o.quantidade, l.o.moeda) },
  total: { id: 'total', titulo: 'Total (USDT)', num: true, ordenar: (l) => l.o.total, html: (l) => usdt(l.o.total, { sufixo: false }) },
  taxa: { id: 'taxa', titulo: 'Taxa (USDT)', num: true, ordenar: (l) => l.o.taxa, html: (l) => usdt(l.o.taxa, { sufixo: false }) },
  lucro: {
    id: 'lucro', titulo: 'Lucro (USDT)', num: true, ordenar: (l) => l.lucro,
    html: (l) => (l.lucro == null ? '<span class="faint">—</span>' : usdt(l.lucro, { sufixo: false, sinal: true })),
    classe: (l) => (l.lucro == null ? '' : classeResultado(l.lucro)),
  },
};

export function montarOperacoes(alvo, { definicao, consulta }) {
  const ctx = criarContexto();
  const cliente = clienteAtual();
  if (!cliente) { semCliente(alvo, definicao); return ctx; }

  const moedas = moedasDoCliente(cliente);
  const ctxFiltro = contextoFiltros(cliente);
  let filtros = lerFiltros(consulta, { padrao: '30d', ctx: ctxFiltro, moedas, comLado: true });
  gravarConsulta(consultaDosFiltros(filtros));

  alvo.innerHTML = `
    <section class="page">
      ${cabecalho(definicao, cliente)}
      <div class="card no-print" data-ref="filtros"></div>
      <p class="result-line" data-ref="resumo" aria-live="polite"></p>
      <div data-ref="tabela"></div>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);

  const C = COLUNAS_OPERACAO;
  const tabela = criarTabela({
    colunas: [C.data, C.moeda, C.lado, C.tipo, C.motivo, C.preco, C.quantidade, C.total, C.taxa, C.lucro],
    chave: (l) => l.o.id,
    ordem: { col: 'data', dir: 'desc' },
    rotulo: 'Operações executadas',
    vazio: { titulo: 'Nenhuma operação neste período', texto: 'Tente ampliar as datas ou incluir mais moedas.' },
  });
  ref('tabela').append(tabela.el);

  function resumo() {
    const linhas = tabela.linhas();
    let compras = 0;
    let vendas = 0;
    let volume = 0;
    let lucro = 0;
    for (const l of linhas) {
      if (l.o.lado === 'compra') compras++;
      else vendas++;
      volume += l.o.total;
      lucro += l.lucro ?? 0;
    }
    const partes = [`<b>${plural(linhas.length, 'operação', 'operações')}</b>`, plural(compras, 'compra'), plural(vendas, 'venda'),
      `volume <span class="num">${usdt(volume)}</span>`];
    if (vendas) partes.push(`lucro das vendas <span class="num ${classeResultado(lucro)}">${usdt(lucro, { sinal: true })}</span>`);
    ref('resumo').innerHTML = partes.join(' · ');
  }

  function aplicar() {
    const lista = ordensNoPeriodo(cliente.id, filtros.de, filtros.ate, { lado: filtros.lado || null, moedas: filtros.moedas });
    tabela.definir(lista.map(linhaDaOrdem));
    resumo();
  }

  criarFiltros(ref('filtros'), {
    valor: filtros, ctx: ctxFiltro, moedas, comLado: true,
    aoMudar(f) {
      filtros = f;
      gravarConsulta(consultaDosFiltros(f));
      aplicar();
    },
  });

  function passaNoFiltro(o) {
    const dia = diaISO(o.executadaEm);
    return dia >= filtros.de && dia <= filtros.ate
      && (!filtros.lado || o.lado === filtros.lado)
      && (!filtros.moedas.length || filtros.moedas.includes(o.moeda));
  }

  function aoExecutar(o) {
    if (!execucaoDoCliente(o, cliente) || !passaNoFiltro(o)) return;
    tabela.inserir(linhaDaOrdem(o));
    resumo();
  }
  ctx.on('order:executed', aoExecutar);
  ctx.on('order:new', aoExecutar);

  aplicar();
  return ctx;
}
