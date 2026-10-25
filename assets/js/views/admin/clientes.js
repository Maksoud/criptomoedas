// A3 · Clientes: lista com status, caixa, reserva, valor por ordem, comissão, fechamento e trava, e o
// painel de edição do cliente escolhido (ajustes valem na hora para o motor; o dia de fechamento vale a
// partir do próximo período), com o histórico do caixa, depósito/saque, "Ver como cliente" e o atalho
// para os alertas do cliente.

import {
  getState, atualizarCliente, definirDiaFechamento, registrarLog, registrarMovimento, periodoAberto, cancelarOrdem,
} from '../../store.js';
import { gravarConsulta } from '../../router.js';
import { resumoBanca } from '../../calc/bank.js';
import { estaProgramada } from '../../calc/positions.js';
import { DIAS_FECHAMENTO, fimDoPeriodo } from '../../calc/commission.js';
import { criarTabela } from '../../ui/table.js';
import { bancaHTML, atualizarBanca } from '../../ui/bankbar.js';
import { kpiHTML, atualizarKpi, valorUSDT } from '../../ui/kpi.js';
import { iniciais } from '../../ui/clientpicker.js';
import { monograma } from '../../ui/coin.js';
import { abrirModal } from '../../ui/modal.js';
import { escapar, criarAgendador, trocarHTML } from '../../ui/dom.js';
import { icon, renderIcons } from '../../ui/icons.js';
import { usdt, pctSimples, plural, data, dataHora, intervalo } from '../../utils/format.js';
import { somarDias, diaISO } from '../../utils/dates.js';
import { criarContexto, cabecalhoAdmin, badgesDoCliente, listaClientes, motivoSemCompra, botaoVerComo, ligarVerComo } from './comum.js';
import { abrirAlertasDe } from './regras.js';

const STATUS = [
  { id: 'ativo', nome: 'Ativo', texto: 'O robô opera normalmente.' },
  { id: 'pausado', nome: 'Pausado', texto: 'Sem novas compras; as vendas programadas continuam.' },
  { id: 'inativo', nome: 'Inativo', texto: 'Contrato parado: sem estratégia nem compras; ordens programadas continuam até serem canceladas.' },
];

const textoValorOrdem = (v) => (v.tipo === 'percent' ? `${pctSimples(v.valor, { casas: v.valor % 1 ? 1 : 0 })} do caixa` : usdt(v.valor));

/** Validação dos campos editáveis do cliente. Devolve { valores, erros }. */
export function validarCliente(bruto, catalogo) {
  const erros = {};
  const num = (k) => Number(String(bruto[k] ?? '').replace(',', '.'));
  const reservaPct = num('reservaPct');
  if (!(reservaPct >= 0 && reservaPct <= 90)) erros.reservaPct = 'Use de 0% a 90%.';
  const comissaoPct = num('comissaoPct');
  if (!(comissaoPct >= 0 && comissaoPct <= 50)) erros.comissaoPct = 'Use de 0% a 50%.';
  const prazo = num('prazoPagamentoDias');
  if (!(Number.isInteger(prazo) && prazo >= 1 && prazo <= 30)) erros.prazoPagamentoDias = 'Use de 1 a 30 dias, inteiro.';
  const valor = num('valorOrdem');
  const tipo = bruto.valorOrdemTipo === 'fixo' ? 'fixo' : 'percent';
  if (tipo === 'percent' && !(valor > 0 && valor <= 50)) erros.valorOrdem = 'Use de 0,1% a 50% do caixa.';
  if (tipo === 'fixo' && !(valor >= 5)) erros.valorOrdem = 'O mínimo da corretora é 5 USDT.';
  const moedas = catalogo.filter((m) => (bruto.moedas ?? []).includes(m));
  return {
    valores: {
      status: STATUS.some((s) => s.id === bruto.status) ? bruto.status : 'ativo',
      reservaPct, comissaoPct, prazoPagamentoDias: prazo, valorOrdem: { tipo, valor }, moedas, travaCompras: !!bruto.travaCompras,
      diaFechamento: Number(bruto.diaFechamento),
    },
    erros,
  };
}

export function montarClientes(alvo, { definicao, consulta }) {
  const ctx = criarContexto();
  const estado = () => getState();
  let selecionado = estado().clientes[consulta.get('cliente')] ? consulta.get('cliente') : listaClientes()[0]?.id;

  alvo.innerHTML = `
    <section class="page">
      ${cabecalhoAdmin(definicao, { sub: 'Caixa, reserva e valor por ordem são por cliente. Os ajustes valem na hora para o robô.' })}
      <div data-ref="tabela"></div>
      <section class="card section client-panel" data-ref="painel"></section>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);
  ligarVerComo(alvo);

  const banca = (c) => resumoBanca(c, estado().ordens, estado().movimentos, estado().precos);

  // ---------- Tabela ----------
  const tabela = criarTabela({
    colunas: [
      {
        id: 'nome', titulo: 'Cliente', ordenar: (c) => c.nome,
        html: (c) => `<span class="who"><span class="avatar avatar--sm" data-status="${c.status}" aria-hidden="true">${escapar(iniciais(c.nome))}</span><b>${escapar(c.nome)}</b></span>`,
      },
      { id: 'status', titulo: 'Status', ordenar: (c) => c.status, html: (c) => `<span class="page-head__badges">${badgesDoCliente(c)}</span>` },
      { id: 'caixa', titulo: 'Caixa (USDT)', num: true, ordenar: (c) => banca(c).caixa, html: (c) => usdt(banca(c).caixa, { sufixo: false }) },
      { id: 'reserva', titulo: 'Reserva', num: true, ordenar: (c) => c.reservaPct, html: (c) => pctSimples(c.reservaPct, { casas: 0 }) },
      { id: 'ordem', titulo: 'Valor por ordem', num: true, ordenar: (c) => c.valorOrdem.valor, html: (c) => textoValorOrdem(c.valorOrdem) },
      { id: 'comissao', titulo: 'Comissão', num: true, ordenar: (c) => c.comissaoPct, html: (c) => pctSimples(c.comissaoPct, { casas: 0 }) },
      {
        id: 'fechamento', titulo: 'Fechamento', ordenar: (c) => c.diaFechamento,
        html: (c) => `Dia ${c.diaFechamento}${c.diaFechamentoProximo ? ` <span class="badge badge--info" title="A partir do próximo período">→ dia ${c.diaFechamentoProximo}</span>` : ''}`,
      },
      { id: 'moedas', titulo: 'Moedas', ordenar: (c) => c.moedas.length, html: (c) => `<span class="coin-stack" title="${escapar(c.moedas.join(', '))}">${c.moedas.slice(0, 6).map((m) => monograma(m, { pequeno: true })).join('')}</span>` },
      {
        id: 'trava', titulo: 'Travar compras',
        html: (c) => `<label class="switch-field switch-field--compact"><input class="switch" type="checkbox" data-trava="${c.id}"${c.travaCompras ? ' checked' : ''} aria-label="Travar compras de ${escapar(c.nome)}"></label>`,
      },
      { id: 'editar', titulo: '<span class="sr-only">Ajustar</span>', html: (c) => `<button class="btn btn--secondary btn--sm" type="button" data-selecionar="${c.id}" aria-label="Ajustar ${escapar(c.nome)}">${icon('sliders-horizontal')}<span>Ajustar</span></button>` },
    ],
    chave: (c) => c.id,
    porPagina: 0,
    rotulo: 'Clientes',
  });
  ref('tabela').append(tabela.el);
  tabela.el.classList.add('table--select');

  function marcarSelecionado() {
    for (const tr of tabela.el.querySelectorAll('tbody tr')) tr.classList.toggle('is-selected', tr.dataset.chave === selecionado);
  }
  function carregarTabela() {
    tabela.definir(listaClientes());
    marcarSelecionado();
  }

  tabela.el.addEventListener('change', (e) => {
    const t = e.target.closest('[data-trava]');
    if (t) atualizarCliente(t.dataset.trava, { travaCompras: t.checked });
  });
  tabela.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-selecionar]');
    const tr = e.target.closest('tbody tr');
    if (b || (tr && !e.target.closest('input, label, button, a'))) selecionar(b ? b.dataset.selecionar : tr.dataset.chave, { rolar: !!b });
  });

  // ---------- Painel ----------
  let rascunho = null; // valores do formulário (string dos campos + listas)
  let sujo = false;

  function rascunhoDe(c) {
    return {
      status: c.status, reservaPct: String(c.reservaPct), comissaoPct: String(c.comissaoPct),
      prazoPagamentoDias: String(c.prazoPagamentoDias), valorOrdemTipo: c.valorOrdem.tipo, valorOrdem: String(c.valorOrdem.valor),
      moedas: [...c.moedas], travaCompras: c.travaCompras, diaFechamento: c.diaFechamentoProximo ?? c.diaFechamento,
    };
  }

  function kpisBanca(c) {
    const b = banca(c);
    return [
      { id: 'caixa', rotulo: 'Caixa', valor: valorUSDT(b.caixa), extra: 'Somente leitura: muda com o resultado e as movimentações', pequeno: true },
      { id: 'reserva', rotulo: 'Reserva de banca', valor: valorUSDT(b.reserva), extra: `${pctSimples(c.reservaPct, { casas: 0 })} do caixa`, pequeno: true },
      { id: 'disponivel', rotulo: 'Disponível para operar', valor: valorUSDT(b.disponivel), extra: `Ordem de ${usdt(b.valorOrdem)}`, pequeno: true },
      { id: 'operacao', rotulo: 'Em operação', valor: valorUSDT(b.emOperacao), extra: `${plural(b.posicoes, 'posição', 'posições')} · ${plural(b.ordensProgramadas, 'ordem programada', 'ordens programadas')}`, pequeno: true },
    ];
  }

  function motivoHTML(c) {
    if (c.status === 'inativo') return `<p class="why why--off">${icon('circle-off')}Cliente inativo: o robô não opera para ele.</p>`;
    const m = motivoSemCompra(c);
    return m
      ? `<p class="why why--warn">${icon('circle-pause')}Sem novas compras agora: ${escapar(m)}.</p>`
      : `<p class="why why--ok">${icon('circle-check')}O robô pode comprar para este cliente.</p>`;
  }

  function movimentosHTML(c) {
    const lista = estado().movimentos.filter((m) => m.clienteId === c.id).sort((a, b) => b.data - a.data);
    if (!lista.length) return '<p class="muted">Nenhuma movimentação.</p>';
    return `<ul class="mov-list">${lista.slice(0, 8).map((m) => `
      <li><span class="num muted">${dataHora(m.data)}</span>
        <span>${m.tipo === 'deposito' ? '<span class="badge badge--info">Depósito</span>' : '<span class="badge">Saque</span>'} <span class="muted">${escapar(m.observacao ?? '')}</span></span>
        <span class="num ${m.tipo === 'deposito' ? 'up' : ''}">${usdt(m.tipo === 'deposito' ? m.valor : -m.valor, { sinal: true })}</span></li>`).join('')}</ul>
      ${lista.length > 8 ? `<p class="muted mov-more">Mais ${plural(lista.length - 8, 'movimentação', 'movimentações')} na tela C6 do cliente.</p>` : ''}`;
  }

  function fechamentoHTML(c) {
    const aberto = periodoAberto(c.id);
    const dia = Number(rascunho.diaFechamento);
    const prox = aberto ? { inicio: somarDias(aberto.fim, 1) } : null;
    if (prox) prox.fim = fimDoPeriodo(prox.inicio, dia);
    return aberto
      ? `Período aberto: <span class="num">${intervalo(aberto.inicio, aberto.fim)}</span> (mantém as datas). Próximo: <span class="num">${intervalo(prox.inicio, prox.fim)}</span>.`
      : 'Sem período em aberto.';
  }

  function erro(campo, texto) {
    const el = ref('painel').querySelector(`[data-erro="${campo}"]`);
    if (!el) return;
    el.hidden = !texto;
    el.textContent = texto ?? '';
    ref('painel').querySelector(`[data-campo="${campo}"]`)?.setAttribute('aria-invalid', String(!!texto));
  }

  function desenharPainel() {
    const c = estado().clientes[selecionado];
    const el = ref('painel');
    if (!c) { el.innerHTML = ''; return; }
    rascunho = rascunhoDe(c);
    sujo = false;
    const catalogo = Object.keys(estado().moedas);
    el.dataset.cliente = c.id;
    el.innerHTML = `
      <header class="client-panel__head">
        <div class="client-panel__who">
          <span class="avatar" data-status="${c.status}" aria-hidden="true">${escapar(iniciais(c.nome))}</span>
          <div>
            <h2>${escapar(c.nome)}</h2>
            <p class="muted">Cliente desde ${data(c.inicioContrato)}${c.encerradoEm ? ` · contrato encerrado em ${data(c.encerradoEm)}` : ''} <span class="page-head__badges" data-ref="badges">${badgesDoCliente(c)}</span></p>
          </div>
        </div>
        <div class="coin-panel__actions">
          <button class="btn btn--secondary btn--sm" type="button" data-acao="alertas">${icon('bell')}<span>Alertas deste cliente</span></button>
          ${botaoVerComo(c.id)}
        </div>
      </header>

      <div data-ref="motivo">${motivoHTML(c)}</div>
      <div class="kpis kpis--inline" data-ref="kpis">${kpisBanca(c).map(kpiHTML).join('')}</div>
      <div data-ref="banca">${bancaHTML(banca(c))}</div>

      <div class="client-panel__cols">
        <form class="client-form" data-ref="form" novalidate>
          <fieldset class="coin-form__group">
            <legend>Operação</legend>
            <div class="pfields">
              <label class="pfield">
                <span class="field__label">Status</span>
                <select class="input" data-campo="status">${STATUS.map((s) => `<option value="${s.id}"${s.id === c.status ? ' selected' : ''}>${s.nome}</option>`).join('')}</select>
                <span class="pfield__help" data-ref="status-texto">${STATUS.find((s) => s.id === c.status)?.texto ?? ''}</span>
              </label>
              <label class="pfield">
                <span class="field__label">Reserva de banca</span>
                <span class="input-group"><input class="input num" type="number" min="0" max="90" step="any" data-campo="reservaPct" value="${c.reservaPct}"><span class="input-group__suffix">%</span></span>
                <span class="pfield__help">Parte do caixa que nunca é usada em compras. De 0% a 90%.</span>
                <span class="pfield__erro" data-erro="reservaPct" hidden></span>
              </label>
              <div class="pfield">
                <span class="field__label" id="a3-ordem">Valor por ordem</span>
                <div class="order-value">
                  <div class="segmented segmented--field" role="radiogroup" aria-labelledby="a3-ordem">
                    <button class="segmented__opt" type="button" role="radio" data-tipo="percent">% do caixa</button>
                    <button class="segmented__opt" type="button" role="radio" data-tipo="fixo">Fixo</button>
                  </div>
                  <span class="input-group"><input class="input num" type="number" min="0" step="any" data-campo="valorOrdem" value="${c.valorOrdem.valor}" aria-labelledby="a3-ordem"><span class="input-group__suffix" data-ref="sufixo-ordem"></span></span>
                </div>
                <span class="pfield__help" data-ref="ordem-texto"></span>
                <span class="pfield__erro" data-erro="valorOrdem" hidden></span>
              </div>
              <label class="pfield switch-field-row">
                <span class="field__label">Travar compras</span>
                <span class="switch-field"><input class="switch" type="checkbox" data-campo="travaCompras"${c.travaCompras ? ' checked' : ''}><span>${c.travaCompras ? 'Travadas' : 'Liberadas'}</span></span>
                <span class="pfield__help">Vendas programadas continuam.${c.travaPorComissao ? ' A suspensão por comissão vencida só sai com o pagamento (A6).' : ''}</span>
              </label>
            </div>
            <div class="field">
              <span class="field__label" id="a3-moedas">Moedas operadas</span>
              <div class="chips" role="group" aria-labelledby="a3-moedas" data-ref="moedas">
                ${catalogo.map((m) => `<button class="chip" type="button" data-moeda="${m}" aria-pressed="${c.moedas.includes(m)}"${estado().moedas[m].ativa ? '' : ' title="Moeda desligada na A2"'}>${monograma(m, { pequeno: true })}<span>${m}</span></button>`).join('')}
              </div>
              <span class="pfield__help">Tirar uma moeda cancela as compras programadas nela; as posições abertas continuam até a venda.</span>
            </div>
          </fieldset>
          <fieldset class="coin-form__group">
            <legend>Comissão</legend>
            <div class="pfields">
              <label class="pfield">
                <span class="field__label">Comissão</span>
                <span class="input-group"><input class="input num" type="number" min="0" max="50" step="any" data-campo="comissaoPct" value="${c.comissaoPct}"><span class="input-group__suffix">%</span></span>
                <span class="pfield__help">Sobre o resultado positivo de cada período. Vale para o período aberto e os próximos.</span>
                <span class="pfield__erro" data-erro="comissaoPct" hidden></span>
              </label>
              <label class="pfield">
                <span class="field__label">Prazo de pagamento</span>
                <span class="input-group"><input class="input num" type="number" min="1" max="30" step="1" data-campo="prazoPagamentoDias" value="${c.prazoPagamentoDias}"><span class="input-group__suffix">dias</span></span>
                <span class="pfield__help">Depois do fechamento. Vale para as próximas apurações.</span>
                <span class="pfield__erro" data-erro="prazoPagamentoDias" hidden></span>
              </label>
              <div class="pfield">
                <span class="field__label" id="a3-dia">Dia de fechamento</span>
                <div class="segmented segmented--field" role="radiogroup" aria-labelledby="a3-dia" data-ref="dias">
                  ${DIAS_FECHAMENTO.map((d) => `<button class="segmented__opt" type="button" role="radio" data-dia="${d}">Dia ${d}</button>`).join('')}
                </div>
                <span class="pfield__help" data-ref="fechamento-texto"></span>
              </div>
            </div>
          </fieldset>
          <footer class="coin-form__foot">
            <p class="muted" data-ref="aviso-form">Os ajustes valem na hora para o robô.</p>
            <div class="coin-form__btns">
              <button class="btn btn--secondary" type="button" data-acao="descartar" disabled>Descartar</button>
              <button class="btn btn--primary" type="submit" data-acao="salvar" disabled>${icon('check')}<span>Salvar alterações</span></button>
            </div>
          </footer>
        </form>

        <section class="client-cash" aria-labelledby="a3-caixa">
          <header class="section__head">
            <h3 id="a3-caixa">Caixa</h3>
            <div class="coin-panel__actions">
              <button class="btn btn--secondary btn--sm" type="button" data-mov="deposito">${icon('plus')}<span>Depósito</span></button>
              <button class="btn btn--secondary btn--sm" type="button" data-mov="saque">${icon('minus')}<span>Saque</span></button>
            </div>
          </header>
          <div data-ref="movs">${movimentosHTML(c)}</div>
        </section>
      </div>`;
    desenharControles();
    renderIcons();
  }

  function desenharControles() {
    const el = ref('painel');
    for (const b of el.querySelectorAll('[data-tipo]')) {
      const ativo = b.dataset.tipo === rascunho.valorOrdemTipo;
      b.setAttribute('aria-checked', String(ativo));
      b.tabIndex = ativo ? 0 : -1;
    }
    for (const b of el.querySelectorAll('[data-dia]')) {
      const ativo = Number(b.dataset.dia) === Number(rascunho.diaFechamento);
      b.setAttribute('aria-checked', String(ativo));
      b.tabIndex = ativo ? 0 : -1;
    }
    for (const b of el.querySelectorAll('[data-moeda]')) b.setAttribute('aria-pressed', String(rascunho.moedas.includes(b.dataset.moeda)));
    el.querySelector('[data-ref="sufixo-ordem"]').textContent = rascunho.valorOrdemTipo === 'fixo' ? 'USDT' : '%';
    const c = estado().clientes[selecionado];
    const b = banca(c);
    const v = Number(String(rascunho.valorOrdem).replace(',', '.'));
    el.querySelector('[data-ref="ordem-texto"]').textContent = rascunho.valorOrdemTipo === 'fixo'
      ? 'Cada compra usa este valor em USDT.'
      : `Cada compra usa este percentual do caixa (hoje ~${usdt((b.caixa * (v || 0)) / 100)}).`;
    el.querySelector('[data-ref="fechamento-texto"]').innerHTML = `<b>Vale a partir do próximo período.</b> ${fechamentoHTML(c)}`;
    el.querySelector('[data-ref="status-texto"]').textContent = STATUS.find((s) => s.id === rascunho.status)?.texto ?? '';
    el.querySelector('[data-campo="travaCompras"] + span').textContent = rascunho.travaCompras ? 'Travadas' : 'Liberadas';
  }

  function lerFormulario() {
    const el = ref('painel');
    for (const k of ['status', 'reservaPct', 'comissaoPct', 'prazoPagamentoDias', 'valorOrdem']) rascunho[k] = el.querySelector(`[data-campo="${k}"]`).value;
    rascunho.travaCompras = el.querySelector('[data-campo="travaCompras"]').checked;
  }

  function aoMudar() {
    lerFormulario();
    const c = estado().clientes[selecionado];
    const { erros } = validarCliente(rascunho, Object.keys(estado().moedas));
    for (const k of ['reservaPct', 'comissaoPct', 'prazoPagamentoDias', 'valorOrdem']) erro(k, erros[k]);
    sujo = JSON.stringify(rascunho) !== JSON.stringify(rascunhoDe(c));
    const valido = !Object.keys(erros).length;
    const el = ref('painel');
    el.querySelector('[data-acao="salvar"]').disabled = !sujo || !valido;
    el.querySelector('[data-acao="descartar"]').disabled = !sujo;
    el.querySelector('[data-ref="aviso-form"]').textContent = !valido ? 'Corrija os campos marcados para salvar.' : sujo ? 'Alterações não salvas.' : 'Os ajustes valem na hora para o robô.';
    desenharControles();
  }

  function salvar() {
    lerFormulario();
    const c = estado().clientes[selecionado];
    const { valores: v, erros } = validarCliente(rascunho, Object.keys(estado().moedas));
    if (Object.keys(erros).length) return;
    const mudancas = [];
    const p = (x) => pctSimples(x, { casas: x % 1 ? 1 : 0 });
    if (v.status !== c.status) mudancas.push(`status ${c.status} → ${v.status}`);
    if (v.reservaPct !== c.reservaPct) mudancas.push(`reserva ${p(c.reservaPct)} → ${p(v.reservaPct)}`);
    if (JSON.stringify(v.valorOrdem) !== JSON.stringify(c.valorOrdem)) mudancas.push(`ordem ${textoValorOrdem(c.valorOrdem)} → ${textoValorOrdem(v.valorOrdem)}`);
    if (v.comissaoPct !== c.comissaoPct) mudancas.push(`comissão ${p(c.comissaoPct)} → ${p(v.comissaoPct)}`);
    if (v.prazoPagamentoDias !== c.prazoPagamentoDias) mudancas.push(`prazo ${c.prazoPagamentoDias} → ${v.prazoPagamentoDias} dias`);
    const tiradas = c.moedas.filter((m) => !v.moedas.includes(m));
    const postas = v.moedas.filter((m) => !c.moedas.includes(m));
    if (postas.length) mudancas.push(`passa a operar ${postas.join(', ')}`);
    if (tiradas.length) mudancas.push(`deixa de operar ${tiradas.join(', ')}`);

    atualizarCliente(c.id, {
      status: v.status, reservaPct: v.reservaPct, valorOrdem: v.valorOrdem, comissaoPct: v.comissaoPct,
      prazoPagamentoDias: v.prazoPagamentoDias, moedas: v.moedas, travaCompras: v.travaCompras,
      ...(v.status === 'pausado' && c.status !== 'pausado' ? { pausadoEm: diaISO(new Date()) } : {}),
    });
    if (tiradas.length) {
      for (const o of [...estado().ordens]) {
        if (o.clienteId === c.id && o.lado === 'compra' && tiradas.includes(o.moeda) && estaProgramada(o)) {
          cancelarOrdem(o.id, 'sistema', { motivo: 'moeda retirada do cliente' });
        }
      }
    }
    if (mudancas.length) registrarLog(`${c.nome}: ${mudancas.join(', ')}`);
    if (v.diaFechamento !== (c.diaFechamentoProximo ?? c.diaFechamento)) definirDiaFechamento(c.id, v.diaFechamento, 'admin');
    desenharPainel();
    carregarTabela();
  }

  function abrirMovimento(tipo) {
    const c = estado().clientes[selecionado];
    const b = banca(c);
    const maximo = Math.max(0, b.disponivel);
    const deposito = tipo === 'deposito';
    abrirModal({
      titulo: `${deposito ? 'Registrar depósito' : 'Registrar saque'} · ${c.nome}`,
      largura: 'sm',
      corpo: `
        <label class="field">
          <span class="field__label">Valor</span>
          <span class="input-group"><input class="input num" type="number" min="0" step="any" inputmode="decimal" data-mov-valor autofocus><span class="input-group__suffix">USDT</span></span>
          <span class="pfield__erro" data-mov-erro hidden></span>
        </label>
        <label class="field">
          <span class="field__label">Observação</span>
          <input class="input" type="text" maxlength="80" data-mov-obs placeholder="${deposito ? 'Aporte adicional' : 'Saque solicitado'}">
        </label>
        <p class="muted modal__text">${deposito
          ? `O caixa passa de ${usdt(b.caixa)} para o novo valor e a reserva de ${pctSimples(c.reservaPct, { casas: 0 })} acompanha.`
          : `Saques só usam o disponível para operar: no máximo ${usdt(maximo)} agora (posições e reserva ficam de fora).`}</p>`,
      acoes: [
        { id: 'cancelar', rotulo: 'Cancelar' },
        { id: 'ok', rotulo: deposito ? 'Registrar depósito' : 'Registrar saque', classe: 'btn--primary', icone: deposito ? 'plus' : 'minus' },
      ],
      aoAgir(id, el) {
        if (id !== 'ok') return true;
        const input = el.querySelector('[data-mov-valor]');
        const valor = Number(input.value);
        const erroEl = el.querySelector('[data-mov-erro]');
        let msg = null;
        if (!(valor > 0)) msg = 'Informe um valor maior que zero.';
        else if (!deposito && valor > maximo + 1e-9) msg = `O máximo para saque agora é ${usdt(maximo)}.`;
        if (msg) {
          erroEl.hidden = false;
          erroEl.textContent = msg;
          input.setAttribute('aria-invalid', 'true');
          input.focus();
          return false;
        }
        const obs = el.querySelector('[data-mov-obs]').value.trim() || (deposito ? 'Aporte adicional' : 'Saque solicitado');
        registrarMovimento(c.id, tipo, Math.round(valor * 100) / 100, { observacao: obs });
        return true;
      },
    });
  }

  const painel = ref('painel');
  painel.addEventListener('input', (e) => { if (e.target.matches('[data-campo]')) aoMudar(); });
  painel.addEventListener('change', (e) => { if (e.target.matches('[data-campo]')) aoMudar(); });
  painel.addEventListener('submit', (e) => { e.preventDefault(); salvar(); });
  painel.addEventListener('click', (e) => {
    const t = e.target;
    const tipo = t.closest('[data-tipo]');
    const dia = t.closest('[data-dia]');
    const moeda = t.closest('[data-moeda]');
    const mov = t.closest('[data-mov]');
    if (tipo) { rascunho.valorOrdemTipo = tipo.dataset.tipo; aoMudar(); }
    else if (dia) { rascunho.diaFechamento = Number(dia.dataset.dia); aoMudar(); }
    else if (moeda) {
      const m = moeda.dataset.moeda;
      rascunho.moedas = rascunho.moedas.includes(m) ? rascunho.moedas.filter((x) => x !== m) : [...rascunho.moedas, m];
      rascunho.moedas = Object.keys(estado().moedas).filter((x) => rascunho.moedas.includes(x));
      aoMudar();
    } else if (mov) abrirMovimento(mov.dataset.mov);
    else if (t.closest('[data-acao="descartar"]')) desenharPainel();
    else if (t.closest('[data-acao="alertas"]')) abrirAlertasDe({ clienteId: selecionado });
  });
  // Setas nos grupos de rádio (tipo do valor por ordem e dia de fechamento).
  painel.addEventListener('keydown', (e) => {
    const opt = e.target.closest('[data-tipo], [data-dia]');
    if (!opt || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const irmaos = [...opt.parentElement.querySelectorAll('.segmented__opt')];
    const prox = irmaos[(irmaos.indexOf(opt) + (e.key === 'ArrowRight' ? 1 : -1) + irmaos.length) % irmaos.length];
    prox.click();
    prox.focus();
  });

  function selecionar(id, { rolar = false } = {}) {
    if (!estado().clientes[id]) return;
    if (id !== selecionado) {
      selecionado = id;
      gravarConsulta({ cliente: id });
      marcarSelecionado();
      desenharPainel();
    }
    if (rolar) ref('painel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Ao vivo ----------
  function atualizarNumeros() {
    const c = estado().clientes[selecionado];
    if (!c) return;
    const el = ref('painel');
    for (const k of kpisBanca(c)) atualizarKpi(el.querySelector('[data-ref="kpis"]'), k.id, k);
    atualizarBanca(el.querySelector('[data-ref="banca"]'), banca(c));
    trocarHTML(el.querySelector('[data-ref="motivo"]'), motivoHTML(c));
    trocarHTML(el.querySelector('[data-ref="badges"]'), badgesDoCliente(c));
    tabela.atualizarCelulas(() => true, ['caixa', 'status']);
    renderIcons();
  }
  const vivo = criarAgendador(atualizarNumeros, 1000);
  ctx.aoDestruir(() => vivo.parar());
  for (const ev of ['prices:update', 'order:executed', 'order:canceled', 'order:new', 'config:change', 'coin:change', 'state:robo', 'commission:paid', 'commission:overdue']) {
    ctx.on(ev, () => vivo.pedir());
  }
  ctx.on('cash:new', (m) => {
    if (m.clienteId === selecionado) trocarHTML(ref('painel').querySelector('[data-ref="movs"]'), movimentosHTML(estado().clientes[selecionado]));
    vivo.pedir();
  });
  const deFora = criarAgendador(() => {
    carregarTabela();
    if (!sujo) desenharPainel();
    else atualizarNumeros();
  }, 0);
  ctx.aoDestruir(() => deFora.parar());
  ctx.on('client:change', () => deFora.pedir());

  gravarConsulta({ cliente: selecionado });
  carregarTabela();
  desenharPainel();
  return ctx;
}
