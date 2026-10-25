// A6 · Apuração de comissões: períodos de todos os clientes (vencidos no topo), filtros por status,
// dia de fechamento e cliente, "Apurar agora", "Forçar vencimento" (demonstração) e "Marcar como pago",
// totais a receber, pagos no mês e previstos, e o relatório de apuração para imprimir.
// Regras em docs/PLANO_MVP.md §8.3. O cliente vê as mudanças na C5 sem recarregar (eventos commission:*).

import { getState, apurarAgora, forcarVencimento, marcarPago } from '../../store.js';
import { gravarConsulta, hashDe } from '../../router.js';
import { numerosDoPeriodo, diasParaVencer, DIAS_FECHAMENTO } from '../../calc/commission.js';
import { criarTabela } from '../../ui/table.js';
import { kpiHTML, atualizarKpi, valorUSDT } from '../../ui/kpi.js';
import { confirmar } from '../../ui/modal.js';
import { escapar, classeResultado, criarAgendador } from '../../ui/dom.js';
import { icon, renderIcons } from '../../ui/icons.js';
import { usdt, data, dataHora, intervalo, plural, pctSimples } from '../../utils/format.js';
import { diaISO, somarDias } from '../../utils/dates.js';
import { badgePeriodo, textoVencimento, STATUS_PERIODO } from '../client/comissoes.js';
import { criarContexto, cabecalhoAdmin, nomeCliente, opcoesClientes } from './comum.js';

const ORDEM_STATUS = { vencido: 0, apurado: 1, aberto: 2, pago: 3 };

/** Vencidos primeiro, depois apurados (vencimento mais próximo), abertos e pagos (mais recentes). */
export function ordenarPeriodos(lista) {
  return [...lista].sort((a, b) => ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status]
    || (a.status === 'apurado' || a.status === 'vencido' ? (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0) : 0)
    || (a.fim < b.fim ? 1 : a.fim > b.fim ? -1 : 0));
}

/** Totais da apuração: a receber (apurado + vencido), vencido, pago no mês e previsto nos abertos. */
export function totaisApuracao(periodos, ordens, clientes, hoje = diaISO(new Date())) {
  const mes = hoje.slice(0, 7);
  const t = { aReceber: 0, nReceber: 0, vencido: 0, nVencido: 0, pagoMes: 0, nPagoMes: 0, previsto: 0, nAbertos: 0 };
  for (const p of periodos) {
    if (p.status === 'apurado' || p.status === 'vencido') { t.aReceber += p.comissao; t.nReceber++; }
    if (p.status === 'vencido') { t.vencido += p.comissao; t.nVencido++; }
    if (p.status === 'pago' && p.comissao > 0 && p.pagoEm && diaISO(p.pagoEm).slice(0, 7) === mes) { t.pagoMes += p.comissao; t.nPagoMes++; }
    if (p.status === 'aberto') { t.previsto += numerosDoPeriodo(p, ordens, clientes[p.clienteId]).comissao; t.nAbertos++; }
  }
  return t;
}

export function montarComissoesAdmin(alvo, { definicao, consulta }) {
  const ctx = criarContexto();
  const estado = () => getState();
  const filtros = {
    status: STATUS_PERIODO[consulta.get('status')] ? consulta.get('status') : '',
    dia: DIAS_FECHAMENTO.includes(Number(consulta.get('dia'))) ? Number(consulta.get('dia')) : 0,
    cliente: estado().clientes[consulta.get('cliente')] ? consulta.get('cliente') : '',
  };
  let emitidoEm = new Date();

  const acoes = `<button class="btn btn--secondary" type="button" data-acao="imprimir">${icon('printer')}<span>Imprimir apuração</span></button>`;
  alvo.innerHTML = `
    <section class="page apuracao">
      ${cabecalhoAdmin(definicao, { acoes, sub: 'Os períodos fecham sozinhos no dia escolhido por cliente. Comissão não paga em 5 dias suspende as novas compras.' })}
      <div data-ref="faixa"></div>
      <div class="kpis" data-ref="kpis"></div>
      <div class="card filters no-print" data-ref="filtros" role="group" aria-label="Filtros">
        <div class="field">
          <span class="field__label" id="a6-status">Status</span>
          <div class="chips" role="group" aria-labelledby="a6-status">
            <button class="chip" type="button" data-status="">Todos</button>
            ${Object.entries(STATUS_PERIODO).map(([k, v]) => `<button class="chip" type="button" data-status="${k}">${v.texto}<span class="chip__count num" data-conta="${k}"></span></button>`).join('')}
          </div>
        </div>
        <div class="field">
          <span class="field__label" id="a6-dia">Fechamento</span>
          <div class="segmented segmented--field" role="radiogroup" aria-labelledby="a6-dia">
            <button class="segmented__opt" type="button" role="radio" data-dia="0">Todos</button>
            ${DIAS_FECHAMENTO.map((d) => `<button class="segmented__opt" type="button" role="radio" data-dia="${d}">Dia ${d}</button>`).join('')}
          </div>
        </div>
        <label class="field">
          <span class="field__label">Cliente</span>
          <select class="input" data-f="cliente">${opcoesClientes(filtros.cliente, { todos: 'Todos os clientes' })}</select>
        </label>
      </div>
      <div class="card report-head print-only" data-ref="cabecalho-impressao"></div>
      <div data-ref="tabela"></div>
      <p class="page-note muted">Resultado = lucro das vendas executadas no período − taxas. Comissão = resultado positivo × % do cliente; prejuízo não passa para o período seguinte. Comissão 0,00 já nasce paga.</p>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);

  const num = (p) => numerosDoPeriodo(p, estado().ordens, estado().clientes[p.clienteId]);
  const hoje = () => diaISO(new Date());

  function acoesHTML(p) {
    const b = [];
    if (p.status === 'aberto') {
      const podeApurar = p.inicio <= somarDias(hoje(), -1);
      b.push(`<button class="btn btn--secondary btn--sm" type="button" data-apurar="${p.id}"${podeApurar ? '' : ' disabled title="O período começou hoje: ainda não há dias fechados"'}>${icon('calculator')}<span>Apurar agora</span></button>`);
    }
    if (p.status === 'apurado') {
      b.push(`<button class="btn btn--secondary btn--sm" type="button" data-vencer="${p.id}" title="Para a demonstração: antecipa o vencimento">${icon('alarm-clock')}<span>Forçar vencimento</span></button>`);
    }
    if (p.status === 'apurado' || p.status === 'vencido') {
      b.push(`<button class="btn btn--primary btn--sm" type="button" data-pagar="${p.id}">${icon('check')}<span>Marcar como pago</span></button>`);
    }
    return `<span class="row-actions">${b.join('')}</span>`;
  }

  const tabela = criarTabela({
    colunas: [
      {
        id: 'cliente', titulo: 'Cliente', ordenar: (p) => nomeCliente(p.clienteId),
        html: (p) => {
          const c = estado().clientes[p.clienteId];
          const suspenso = c?.travaPorComissao && p.status === 'vencido';
          return `<a href="${hashDe('admin', 'clientes', `cliente=${p.clienteId}`)}">${escapar(nomeCliente(p.clienteId))}</a>${suspenso ? ` <span class="badge badge--down">${icon('lock')}Compras suspensas</span>` : ''}`;
        },
      },
      {
        id: 'periodo', titulo: 'Período', ordenar: (p) => p.inicio,
        html: (p) => `<a class="num" href="${hashDe('admin', 'relatorios', `cliente=${p.clienteId}&de=${p.inicio}&ate=${p.fim}`)}" title="Abrir o relatório do período">${intervalo(p.inicio, p.fim)}</a>`,
      },
      { id: 'dia', titulo: 'Fecha', ordenar: (p) => p.diaFechamento, html: (p) => `Dia ${p.diaFechamento}` },
      { id: 'vendas', titulo: 'Vendas', num: true, ordenar: (p) => num(p).operacoes, html: (p) => (num(p).operacoes ?? 0).toLocaleString('pt-BR') },
      {
        id: 'resultado', titulo: 'Resultado (USDT)', num: true, ordenar: (p) => num(p).resultado,
        html: (p) => usdt(num(p).resultado, { sufixo: false, sinal: true }), classe: (p) => classeResultado(num(p).resultado ?? 0),
      },
      { id: 'pct', titulo: '%', num: true, ordenar: (p) => num(p).comissaoPct, html: (p) => pctSimples(num(p).comissaoPct, { casas: 0 }) },
      {
        id: 'comissao', titulo: 'Comissão (USDT)', num: true, ordenar: (p) => num(p).comissao,
        html: (p) => `${usdt(num(p).comissao, { sufixo: false })}${p.status === 'aberto' ? '<span class="muted"> prevista</span>' : ''}`,
      },
      {
        id: 'vencimento', titulo: 'Vencimento', ordenar: (p) => p.vencimento,
        html: (p) => {
          if (p.status === 'aberto') return `<span class="num muted">${data(p.vencimento)}</span>`;
          if (p.status === 'pago') return `<span class="num muted">pago ${p.pagoEm ? data(p.pagoEm) : ''}</span>`;
          const d = diasParaVencer(p, hoje());
          return `<span class="num">${data(p.vencimento)}</span><span class="cell-sub ${d < 0 ? 'down' : d <= 2 ? 'warn' : ''}">${textoVencimento(d)}</span>`;
        },
      },
      { id: 'status', titulo: 'Status', ordenar: (p) => ORDEM_STATUS[p.status], html: (p) => badgePeriodo(p.status) },
      { id: 'acoes', titulo: '<span class="sr-only">Ações</span>', html: acoesHTML },
    ],
    chave: (p) => p.id,
    porPagina: 0, // a apuração impressa precisa de todas as linhas
    rotulo: 'Períodos de apuração de todos os clientes',
    vazio: { titulo: 'Nenhum período com estes filtros', texto: 'Troque o status, o dia de fechamento ou o cliente.' },
    rodape: (lista) => {
      const soma = lista.reduce((s, p) => s + (num(p).comissao ?? 0), 0);
      return `<tr><th scope="row" colspan="6">Total · ${plural(lista.length, 'período', 'períodos')}</th>
        <td class="is-num num">${usdt(soma, { sufixo: false })}</td><td colspan="3"></td></tr>`;
    },
  });
  ref('tabela').append(tabela.el);

  const passa = (p) => (!filtros.status || p.status === filtros.status)
    && (!filtros.dia || p.diaFechamento === filtros.dia)
    && (!filtros.cliente || p.clienteId === filtros.cliente);

  function desenharFaixa() {
    const s = estado();
    const suspensos = Object.values(s.clientes).filter((c) => c.travaPorComissao);
    const el = ref('faixa');
    if (!suspensos.length) { el.className = ''; el.innerHTML = ''; return; }
    el.className = 'band band--critical';
    el.innerHTML = `
      <span class="band__icon">${icon('lock')}</span>
      <div class="band__body">
        <p class="band__title">${suspensos.length === 1 ? '1 cliente com compras suspensas' : `${suspensos.length} clientes com compras suspensas`} por comissão vencida</p>
        <p class="band__text">${suspensos.map((c) => escapar(c.nome)).join(', ')}. As vendas programadas continuam; marque a comissão como paga para liberar as compras.</p>
      </div>`;
  }

  function kpis() {
    const s = estado();
    const t = totaisApuracao(s.periodos, s.ordens, s.clientes);
    return [
      { id: 'receber', rotulo: 'Apurado a receber', valor: valorUSDT(t.aReceber), extra: plural(t.nReceber, 'período', 'períodos') },
      { id: 'vencido', rotulo: 'Vencido', valor: valorUSDT(t.vencido), classe: t.vencido > 0 ? 'down' : '', extra: t.nVencido ? plural(t.nVencido, 'período', 'períodos') : 'Nenhum vencido' },
      { id: 'pago', rotulo: 'Pago no mês', valor: valorUSDT(t.pagoMes), extra: plural(t.nPagoMes, 'pagamento') },
      { id: 'previsto', rotulo: 'Previsto nos períodos abertos', valor: valorUSDT(t.previsto), extra: `${plural(t.nAbertos, 'período aberto', 'períodos abertos')} · ao vivo` },
    ];
  }

  function marcarFiltros() {
    const f = ref('filtros');
    const todos = estado().periodos.filter((p) => (!filtros.dia || p.diaFechamento === filtros.dia) && (!filtros.cliente || p.clienteId === filtros.cliente));
    for (const b of f.querySelectorAll('[data-status]')) {
      b.setAttribute('aria-pressed', String(b.dataset.status === filtros.status));
      const conta = b.querySelector('[data-conta]');
      if (conta) conta.textContent = todos.filter((p) => p.status === b.dataset.status).length;
    }
    for (const b of f.querySelectorAll('[data-dia]')) {
      const ativo = Number(b.dataset.dia) === filtros.dia;
      b.setAttribute('aria-checked', String(ativo));
      b.tabIndex = ativo ? 0 : -1;
    }
  }

  function cabecalhoImpressao() {
    const partes = [
      filtros.status ? STATUS_PERIODO[filtros.status].texto : 'Todos os status',
      filtros.dia ? `fechamento dia ${filtros.dia}` : 'todos os fechamentos',
      filtros.cliente ? nomeCliente(filtros.cliente) : 'todos os clientes',
    ];
    ref('cabecalho-impressao').innerHTML = `
      <div class="report-head__brand">
        <span class="brand__name"><b>Cripto</b>Ops</span>
        <span class="report-head__title">Apuração de comissões</span>
        <span class="badge badge--demo">DEMO</span>
      </div>
      <dl class="report-meta">
        <div><dt class="label">Filtros</dt><dd>${escapar(partes.join(' · '))}</dd></div>
        <div><dt class="label">Emitido em</dt><dd class="num">${dataHora(emitidoEm)}</dd><dd class="report-meta__extra">Valores em USDT</dd></div>
      </dl>`;
  }

  function aplicar(primeira = false) {
    gravarConsulta({ status: filtros.status, dia: filtros.dia || '', cliente: filtros.cliente });
    marcarFiltros();
    tabela.definir(ordenarPeriodos(estado().periodos.filter(passa)));
    if (primeira) ref('kpis').innerHTML = kpis().map(kpiHTML).join('');
    else for (const k of kpis()) atualizarKpi(ref('kpis'), k.id, k);
    desenharFaixa();
    renderIcons();
  }

  ref('filtros').addEventListener('click', (e) => {
    const st = e.target.closest('[data-status]');
    const dia = e.target.closest('[data-dia]');
    if (st) filtros.status = st.dataset.status === filtros.status ? '' : st.dataset.status;
    else if (dia) filtros.dia = Number(dia.dataset.dia);
    else return;
    aplicar();
  });
  ref('filtros').addEventListener('change', (e) => {
    if (e.target.dataset.f !== 'cliente') return;
    filtros.cliente = e.target.value;
    aplicar();
  });

  // ---------- Ações ----------
  const periodo = (id) => estado().periodos.find((p) => p.id === id);
  tabela.el.addEventListener('click', async (e) => {
    const apurar = e.target.closest('[data-apurar]');
    const vencer = e.target.closest('[data-vencer]');
    const pagar = e.target.closest('[data-pagar]');
    if (apurar) {
      const p = periodo(apurar.dataset.apurar);
      const ontem = somarDias(hoje(), -1);
      const n = numerosDoPeriodo({ ...p, fim: ontem }, estado().ordens, estado().clientes[p.clienteId]);
      const ok = await confirmar({
        titulo: `Apurar o período de ${nomeCliente(p.clienteId)} agora?`,
        resumo: `${intervalo(p.inicio, ontem)} · comissão de ${usdt(n.comissao)}`,
        texto: `O período fecha em ${data(ontem)} com resultado de ${usdt(n.resultado, { sinal: true })} e fica congelado. O próximo período começa hoje; as vendas de hoje entram nele.${n.comissao > 0 ? ` A comissão vence em ${data(somarDias(ontem, estado().clientes[p.clienteId].prazoPagamentoDias))}.` : ' Sem lucro, a comissão já nasce paga.'}`,
        confirmar: 'Apurar agora',
        perigo: false,
        icone: 'calculator',
      });
      if (!ok) return;
      try { apurarAgora(p.clienteId); } catch (err) { console.warn(err); }
    } else if (vencer) {
      const p = periodo(vencer.dataset.vencer);
      const ok = await confirmar({
        titulo: 'Forçar o vencimento desta comissão?',
        resumo: `${nomeCliente(p.clienteId)} · ${usdt(p.comissao)}`,
        texto: `Só para a demonstração: o vencimento passa para ontem, o período fica vencido e as novas compras de ${escapar(nomeCliente(p.clienteId))} ficam suspensas até o pagamento. As vendas programadas continuam.`,
        confirmar: 'Forçar vencimento',
        icone: 'alarm-clock',
      });
      if (ok) forcarVencimento(p.id);
    } else if (pagar) {
      const p = periodo(pagar.dataset.pagar);
      const c = estado().clientes[p.clienteId];
      const outros = estado().periodos.filter((x) => x.clienteId === c.id && x.status === 'vencido' && x.id !== p.id).length;
      const ok = await confirmar({
        titulo: 'Marcar esta comissão como paga?',
        resumo: `${escapar(c.nome)} · ${usdt(p.comissao)}`,
        texto: `Período de ${intervalo(p.inicio, p.fim)}.${c.travaPorComissao ? (outros ? ` Ainda há ${plural(outros, 'outro período vencido', 'outros períodos vencidos')}: as compras continuam suspensas.` : ' As compras do cliente são liberadas na hora.') : ''}`,
        confirmar: 'Marcar como pago',
        perigo: false,
        icone: 'check',
      });
      if (ok) marcarPago(p.id);
    }
  });

  alvo.querySelector('[data-acao="imprimir"]').addEventListener('click', () => {
    emitidoEm = new Date();
    cabecalhoImpressao();
    const titulo = document.title;
    document.title = `Apuração de comissões ${data(emitidoEm)}`.replace(/\//g, '-');
    window.addEventListener('afterprint', () => { document.title = titulo; }, { once: true });
    window.print();
  });

  // ---------- Ao vivo ----------
  const refazer = criarAgendador(() => aplicar(), 300);
  ctx.aoDestruir(() => refazer.parar());
  for (const ev of ['commission:closed', 'commission:paid', 'commission:overdue', 'client:change']) ctx.on(ev, () => refazer.pedir());
  const vivo = criarAgendador(() => {
    tabela.atualizarCelulas((p) => p.status === 'aberto', ['vendas', 'resultado', 'comissao']);
    tabela.atualizarRodape();
    for (const k of kpis()) atualizarKpi(ref('kpis'), k.id, k);
  }, 1000);
  ctx.aoDestruir(() => vivo.parar());
  ctx.on('order:executed', (o) => { if (o.lado === 'venda') vivo.pedir(); });

  cabecalhoImpressao();
  aplicar(true);
  return ctx;
}
