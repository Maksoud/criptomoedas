// C5 · Comissões: período aberto (ao vivo), comissão apurada a pagar, lista dos períodos e a escolha
// do dia de fechamento. Clicar num período abre o relatório (C4) com o intervalo exato dele.
// Regras em docs/PLANO_MVP.md §8.3.

import { getState, periodosDoCliente, periodoAberto, definirDiaFechamento } from '../../store.js';
import { hashDe } from '../../router.js';
import { numerosDoPeriodo, diasParaVencer, fimDoPeriodo, DIAS_FECHAMENTO } from '../../calc/commission.js';
import { criarTabela } from '../../ui/table.js';
import { kpiHTML, atualizarKpi, valorUSDT } from '../../ui/kpi.js';
import { classeResultado, criarAgendador } from '../../ui/dom.js';
import { icon, renderIcons } from '../../ui/icons.js';
import { usdt, data, intervalo, plural, pctSimples } from '../../utils/format.js';
import { diaISO, somarDias, diasEntre } from '../../utils/dates.js';
import { criarContexto, clienteAtual, semCliente, cabecalho, execucaoDoCliente, vazioHTML } from './comum.js';

export const STATUS_PERIODO = {
  aberto: { texto: 'Aberto', classe: 'badge--info' },
  apurado: { texto: 'Apurado', classe: 'badge--warn' },
  pago: { texto: 'Pago', classe: 'badge--up' },
  vencido: { texto: 'Vencido', classe: 'badge--down' },
};

export function badgePeriodo(status) {
  const s = STATUS_PERIODO[status] ?? { texto: status, classe: '' };
  return `<span class="badge ${s.classe}">${s.texto}</span>`;
}

/** "vence hoje", "vence em 3 dias", "venceu há 2 dias". */
export function textoVencimento(dias) {
  if (dias === 0) return 'vence hoje';
  if (dias > 0) return `vence em ${plural(dias, 'dia')}`;
  return `venceu há ${plural(-dias, 'dia')}`;
}

/** Datas do próximo período, se o aberto fechar como previsto e o dia escolhido valer. */
export function proximoPeriodo(aberto, dia) {
  const inicio = somarDias(aberto.fim, 1);
  return { inicio, fim: fimDoPeriodo(inicio, dia) };
}

const linkRelatorio = (p) => hashDe('cliente', 'relatorio', `de=${p.inicio}&ate=${p.fim}`);

export function montarComissoes(alvo, { definicao }) {
  const ctx = criarContexto();
  const cliente = clienteAtual();
  if (!cliente) { semCliente(alvo, definicao); return ctx; }

  alvo.innerHTML = `
    <section class="page">
      ${cabecalho(definicao, cliente)}
      <div data-ref="faixa"></div>
      <section class="card section span-7 period-open" data-ref="aberto" aria-labelledby="c5-aberto"></section>
      <section class="card section span-5" data-ref="pagar" aria-labelledby="c5-pagar"></section>
      <section class="card section" data-ref="fechamento" aria-labelledby="c5-fechamento"></section>
      <section class="card section" aria-labelledby="c5-periodos">
        <header class="section__head">
          <h2 id="c5-periodos">Períodos de apuração</h2>
          <p class="section__note">Clique num período para abrir o relatório daquele intervalo.</p>
        </header>
        <div data-ref="tabela"></div>
      </section>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);

  const hoje = () => diaISO(new Date());
  const numeros = (p) => numerosDoPeriodo(p, getState().ordens, cliente);

  const tabela = criarTabela({
    colunas: [
      {
        id: 'periodo', titulo: 'Período', ordenar: (l) => l.inicio,
        html: (l) => `<a class="num" href="${linkRelatorio(l)}">${intervalo(l.inicio, l.fim)}</a>`,
      },
      { id: 'operacoes', titulo: 'Vendas', num: true, ordenar: (l) => numeros(l).operacoes, html: (l) => (numeros(l).operacoes ?? 0).toLocaleString('pt-BR') },
      {
        id: 'resultado', titulo: 'Resultado (USDT)', num: true, ordenar: (l) => numeros(l).resultado,
        html: (l) => usdt(numeros(l).resultado, { sufixo: false, sinal: true }), classe: (l) => classeResultado(numeros(l).resultado ?? 0),
      },
      { id: 'pct', titulo: 'Comissão %', num: true, ordenar: (l) => numeros(l).comissaoPct, html: (l) => pctSimples(numeros(l).comissaoPct, { casas: 0 }) },
      {
        id: 'comissao', titulo: 'Comissão (USDT)', num: true, ordenar: (l) => numeros(l).comissao,
        html: (l) => `${usdt(numeros(l).comissao, { sufixo: false })}${l.status === 'aberto' ? '<span class="muted"> prevista</span>' : ''}`,
      },
      { id: 'vencimento', titulo: 'Vencimento', ordenar: (l) => l.vencimento, html: (l) => `<span class="num">${data(l.vencimento)}</span>` },
      { id: 'status', titulo: 'Status', ordenar: (l) => l.status, html: (l) => badgePeriodo(l.status) },
    ],
    chave: (l) => l.id,
    ordem: { col: 'periodo', dir: 'desc' },
    porPagina: 0,
    rotulo: 'Períodos de apuração',
    vazio: { titulo: 'Nenhum período de apuração', texto: 'Os períodos começam na data de início do contrato.' },
    aoClicarLinha: (l) => { location.hash = linkRelatorio(l); },
  });
  ref('tabela').append(tabela.el);

  // ---------- Período aberto ----------
  function desenharAberto() {
    const aberto = periodoAberto(cliente.id);
    const el = ref('aberto');
    if (!aberto) {
      el.innerHTML = `<header class="section__head"><h2 id="c5-aberto">Período em aberto</h2></header>
        ${vazioHTML('calendar-x', 'Nenhum período em aberto', cliente.encerradoEm ? `O contrato foi encerrado em ${data(cliente.encerradoEm)}.` : '')}`;
      return;
    }
    const num = numeros(aberto);
    const total = diasEntre(aberto.inicio, aberto.fim) + 1;
    const passados = Math.max(0, Math.min(total, diasEntre(aberto.inicio, hoje()) + 1));
    const faltam = Math.max(0, diasEntre(hoje(), aberto.fim));
    const kpis = [
      {
        id: 'resultado', rotulo: 'Resultado das operações fechadas', valor: valorUSDT(num.resultado, { sinal: true }),
        classe: classeResultado(num.resultado), extra: plural(num.operacoes, 'venda'),
      },
      { id: 'comissao', rotulo: 'Comissão prevista', valor: valorUSDT(num.comissao), extra: `${pctSimples(num.comissaoPct, { casas: 0 })} do resultado positivo` },
      {
        id: 'dias', rotulo: 'Dias para o fechamento', valor: faltam.toLocaleString('pt-BR'),
        extra: faltam === 0 ? 'Fecha hoje' : `Fecha em ${data(aberto.fim)}`,
      },
    ];
    if (el.dataset.periodo === aberto.id) {
      for (const k of kpis) atualizarKpi(el, k.id, k);
      return;
    }
    el.dataset.periodo = aberto.id;
    el.innerHTML = `
      <header class="section__head">
        <h2 id="c5-aberto">Período em aberto ${badgePeriodo('aberto')}</h2>
        <span class="live-tag"><span class="source-dot" data-state="live" aria-hidden="true"></span>Atualiza ao vivo</span>
      </header>
      <p class="period-open__dates num">${intervalo(aberto.inicio, aberto.fim)}</p>
      <div class="period-open__progress" role="img" aria-label="${passados} de ${total} dias do período">
        <span style="width:${((passados / total) * 100).toFixed(1)}%"></span>
      </div>
      <p class="period-open__days muted">Dia ${passados} de ${total} · fechamento no dia ${aberto.diaFechamento}</p>
      <div class="kpis kpis--inline">${kpis.map((k) => kpiHTML({ ...k, pequeno: true })).join('')}</div>
      <p class="section__foot">
        Só entram as vendas executadas até o fechamento; posições em aberto não contam. Prejuízo não passa para o período seguinte.
        <a href="${linkRelatorio(aberto)}">Ver relatório do período</a>
      </p>`;
  }

  // ---------- Comissão a pagar ----------
  function desenharPagar() {
    const devidos = periodosDoCliente(cliente.id).filter((p) => p.status === 'apurado' || p.status === 'vencido');
    const vencidos = devidos.filter((p) => p.status === 'vencido');
    const el = ref('pagar');
    const cab = '<header class="section__head"><h2 id="c5-pagar">Comissão a pagar</h2></header>';
    if (!devidos.length) {
      el.innerHTML = `${cab}${vazioHTML('check', 'Nada a pagar', 'Todas as comissões apuradas estão pagas.')}`;
    } else {
      const total = devidos.reduce((s, p) => s + p.comissao, 0);
      el.innerHTML = `${cab}
        <p class="due__total num${vencidos.length ? ' down' : ''}">${valorUSDT(total)}</p>
        <ul class="due__list">${devidos.map((p) => {
          const dias = diasParaVencer(p, hoje());
          return `<li class="due__item${p.status === 'vencido' ? ' is-overdue' : ''}">
            <div>
              <a class="num" href="${linkRelatorio(p)}">${intervalo(p.inicio, p.fim)}</a>
              <p class="muted">Vencimento ${data(p.vencimento)} · ${textoVencimento(dias)}</p>
            </div>
            <div class="due__value">
              <span class="num">${usdt(p.comissao)}</span>
              ${badgePeriodo(p.status)}
            </div>
          </li>`;
        }).join('')}</ul>
        <p class="section__foot">O prazo é de ${plural(cliente.prazoPagamentoDias, 'dia')} depois do fechamento. Sem pagamento, as novas compras ficam suspensas.</p>`;
    }

    // Faixa crítica no alto da tela.
    const faixa = ref('faixa');
    if (vencidos.length) {
      const v = vencidos[0];
      faixa.className = 'band band--critical';
      faixa.setAttribute('role', 'alert');
      faixa.innerHTML = `
        <span class="band__icon">${icon('lock')}</span>
        <div class="band__body">
          <p class="band__title">Compras suspensas até o pagamento</p>
          <p class="band__text">A comissão de ${usdt(v.comissao)} do período ${intervalo(v.inicio, v.fim)} venceu em ${data(v.vencimento)}.
            O robô não faz novas compras; as vendas programadas continuam.</p>
        </div>`;
    } else {
      faixa.className = '';
      faixa.removeAttribute('role');
      faixa.innerHTML = '';
    }
  }

  // ---------- Dia de fechamento ----------
  function desenharFechamento() {
    const el = ref('fechamento');
    const aberto = periodoAberto(cliente.id);
    const escolhido = cliente.diaFechamentoProximo ?? cliente.diaFechamento;
    const encerrado = cliente.status === 'inativo' || !aberto;
    const proximo = aberto ? proximoPeriodo(aberto, escolhido) : null;
    const pendente = cliente.diaFechamentoProximo && cliente.diaFechamentoProximo !== cliente.diaFechamento;
    el.innerHTML = `
      <header class="section__head"><h2 id="c5-fechamento">Dia de fechamento</h2></header>
      <div class="closing">
        <div class="closing__pick">
          <div class="segmented segmented--lg" role="radiogroup" aria-label="Dia de fechamento" aria-describedby="c5-vale">
            ${DIAS_FECHAMENTO.map((d) => `
              <button class="segmented__opt" type="button" role="radio" data-dia="${d}" aria-checked="${d === escolhido}"
                ${d === escolhido ? 'tabindex="0"' : 'tabindex="-1"'}${encerrado ? ' disabled' : ''}>Dia ${d}</button>`).join('')}
          </div>
          <p class="closing__note" id="c5-vale"><b>Vale a partir do próximo período.</b> Em meses sem dia 30, o fechamento é no último dia.</p>
        </div>
        <div class="closing__info">
          ${encerrado
            ? '<p class="muted">Sem período em aberto: não há próximo fechamento para ajustar.</p>'
            : `<p>Período em aberto: <span class="num">${intervalo(aberto.inicio, aberto.fim)}</span> (fecha no dia ${aberto.diaFechamento}, sem mudança).</p>
               <p>Próximo período: <span class="num">${intervalo(proximo.inicio, proximo.fim)}</span>${pendente ? ` <span class="badge badge--info">novo dia ${escolhido}</span>` : ''}</p>`}
        </div>
      </div>`;
  }

  ref('fechamento').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dia]');
    if (!b || b.disabled) return;
    definirDiaFechamento(cliente.id, Number(b.dataset.dia), 'cliente');
    ref('fechamento').querySelector(`[data-dia="${b.dataset.dia}"]`)?.focus();
  });
  ref('fechamento').addEventListener('keydown', (e) => {
    if (!e.target.closest('[data-dia]') || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const atual = cliente.diaFechamentoProximo ?? cliente.diaFechamento;
    const i = (DIAS_FECHAMENTO.indexOf(atual) + (e.key === 'ArrowRight' ? 1 : -1) + DIAS_FECHAMENTO.length) % DIAS_FECHAMENTO.length;
    definirDiaFechamento(cliente.id, DIAS_FECHAMENTO[i], 'cliente');
    ref('fechamento').querySelector(`[data-dia="${DIAS_FECHAMENTO[i]}"]`)?.focus();
  });

  function desenharTudo() {
    ref('aberto').dataset.periodo = '';
    desenharAberto();
    desenharPagar();
    desenharFechamento();
    tabela.definir(periodosDoCliente(cliente.id));
    renderIcons();
  }

  // Ao vivo: venda nova do cliente muda o período aberto (cartão e linha da tabela).
  const vivo = criarAgendador(() => {
    desenharAberto();
    const aberto = periodoAberto(cliente.id);
    if (aberto) tabela.atualizarCelulas((l) => l.id === aberto.id, ['operacoes', 'resultado', 'comissao']);
  }, 500);
  ctx.aoDestruir(() => vivo.parar());
  const aoExecutar = (o) => { if (execucaoDoCliente(o, cliente) && o.lado === 'venda') vivo.pedir(); };
  ctx.on('order:executed', aoExecutar);
  ctx.on('order:new', aoExecutar);

  const tudo = criarAgendador(desenharTudo, 0);
  ctx.aoDestruir(() => tudo.parar());
  const doCliente = (p) => p?.clienteId === cliente.id || p?.id === cliente.id;
  for (const ev of ['commission:closed', 'commission:paid', 'commission:overdue']) ctx.on(ev, (p) => doCliente(p) && tudo.pedir());
  ctx.on('client:change', (c) => {
    if (c?.id !== cliente.id) return;
    desenharFechamento();
    desenharPagar();
    renderIcons();
  });

  desenharTudo();
  return ctx;
}
