// A1 · Painel geral: totais da casa, cards por cliente (patrimônio, resultado, uso da banca, status e
// minigráfico), feed ao vivo das operações de todos, últimos alertas e o log de ações do admin e
// automáticas. Também é aqui o "Restaurar dados".

import { getState, ordensNoPeriodo, periodoAberto } from '../../store.js';
import { hashDe } from '../../router.js';
import { resumoBanca } from '../../calc/bank.js';
import { evolucaoPatrimonio } from '../../calc/equity.js';
import { numerosDoPeriodo } from '../../calc/commission.js';
import { relatorio } from '../../calc/reports.js';
import { criarTabela } from '../../ui/table.js';
import { kpiHTML, atualizarKpi, valorUSDT } from '../../ui/kpi.js';
import { sparkline } from '../../ui/sparkline.js';
import { iniciais } from '../../ui/clientpicker.js';
import { monograma } from '../../ui/coin.js';
import { confirmar } from '../../ui/modal.js';
import { escapar, classeResultado, criarAgendador, trocarHTML } from '../../ui/dom.js';
import { icon, renderIcons } from '../../ui/icons.js';
import { usdt, variacao, pctSimples, plural, dataHora } from '../../utils/format.js';
import { diaISO, somarDias } from '../../utils/dates.js';
import { restaurarDados } from '../../data/loader.js';
import { COLUNAS_OPERACAO, linhaDaOrdem } from '../client/operacoes.js';
import { SEVERIDADES } from '../../alerts/center.js';
import { criarContexto, cabecalhoAdmin, badgesDoCliente, nomeCliente, listaClientes, motivoSemCompra, botaoVerComo, ligarVerComo, vazioHTML } from './comum.js';

const PERIODOS = [
  { id: 'hoje', nome: 'Hoje', dias: 1 },
  { id: '7d', nome: '7 dias', dias: 7 },
  { id: '30d', nome: '30 dias', dias: 30 },
  { id: 'inicio', nome: 'Desde o início', dias: null },
];

const FILTROS = [
  { id: 'todos', nome: 'Todos', passa: () => true },
  { id: 'ativo', nome: 'Ativos', passa: (c) => c.status === 'ativo' },
  { id: 'pausado', nome: 'Pausados', passa: (c) => c.status === 'pausado' },
  { id: 'inativo', nome: 'Inativos', passa: (c) => c.status === 'inativo' },
  { id: 'travado', nome: 'Compras travadas', passa: (c) => c.travaCompras || c.travaPorComissao },
];

const ORIGENS = { admin: 'Admin', automatico: 'Automático', cliente: 'Cliente', sistema: 'Sistema' };

const dirDe = (v) => (v > 0.005 ? 'up' : v < -0.005 ? 'down' : 'flat');

/** Caixa e patrimônio da casa (clientes não inativos). Muda com a cotação. */
export function totaisDaBanca(s) {
  let caixa = 0;
  let patrimonio = 0;
  let aportado = 0;
  for (const c of Object.values(s.clientes)) {
    if (c.status === 'inativo') continue;
    const b = resumoBanca(c, s.ordens, s.movimentos, s.precos);
    caixa += b.caixa;
    patrimonio += b.patrimonio;
    aportado += b.aportado;
  }
  return { caixa, patrimonio, aportado };
}

/** Volume, resultado (todos os clientes, no intervalo) e comissões. Só muda quando há operação ou apuração. */
export function totaisDasOperacoes(s, { de = null, ate = null } = {}) {
  const rel = relatorio(s.ordens, { inicio: de, fim: ate });
  let aReceber = 0;
  let vencido = 0;
  let previsto = 0;
  for (const p of s.periodos) {
    if (p.status === 'apurado') aReceber += p.comissao;
    else if (p.status === 'vencido') { aReceber += p.comissao; vencido += p.comissao; }
    else if (p.status === 'aberto') previsto += numerosDoPeriodo(p, s.ordens, s.clientes[p.clienteId]).comissao;
  }
  return {
    volume: rel.volumeComprado + rel.volumeVendido, operacoes: rel.compras + rel.vendas,
    resultado: rel.resultado, vendas: rel.vendas, aReceber, vencido, previsto,
  };
}

export function montarPainel(alvo, { definicao }) {
  const ctx = criarContexto();
  const estado = () => getState();
  const hoje = diaISO(new Date());
  let periodo = '30d';
  let filtro = 'todos';

  const acoes = `<button class="btn btn--secondary" type="button" data-acao="restaurar">${icon('rotate-ccw')}<span>Restaurar dados</span></button>`;
  alvo.innerHTML = `
    <section class="page">
      ${cabecalhoAdmin(definicao, { acoes })}
      <section class="card section" aria-labelledby="a1-totais">
        <header class="section__head">
          <h2 id="a1-totais">Totais da casa</h2>
          <div class="segmented segmented--field" role="radiogroup" aria-label="Período do volume e do resultado" data-ref="periodo">
            ${PERIODOS.map((p) => `<button class="segmented__opt" type="button" role="radio" data-periodo="${p.id}">${p.nome}</button>`).join('')}
          </div>
        </header>
        <div class="kpis kpis--house" data-ref="kpis"></div>
      </section>
      <section class="section" aria-labelledby="a1-clientes">
        <header class="section__head">
          <h2 id="a1-clientes">Clientes</h2>
          <div class="chips" role="group" aria-label="Filtrar por status" data-ref="filtro">
            ${FILTROS.map((f) => `<button class="chip" type="button" data-filtro="${f.id}">${f.nome}<span class="chip__count num" data-conta="${f.id}"></span></button>`).join('')}
          </div>
        </header>
        <div class="client-cards" data-ref="cards"></div>
      </section>
      <section class="card section section--table span-7" aria-labelledby="a1-feed">
        <header class="section__head">
          <h2 id="a1-feed">Operações ao vivo</h2>
          <span class="live-tag"><span class="source-dot" data-state="live" aria-hidden="true"></span>Todos os clientes</span>
        </header>
        <div data-ref="feed"></div>
      </section>
      <section class="card section span-5" aria-labelledby="a1-alertas">
        <header class="section__head">
          <h2 id="a1-alertas">Últimos alertas</h2>
          <a class="section__link" href="${hashDe('admin', 'alertas')}">Ver todos ${icon('arrow-right')}</a>
        </header>
        <ul class="mini-alerts" data-ref="alertas"></ul>
      </section>
      <section class="card section" aria-labelledby="a1-log">
        <header class="section__head">
          <h2 id="a1-log">Log de ações</h2>
          <p class="section__note">Ações do admin, do cliente e automáticas, da mais recente para a mais antiga.</p>
        </header>
        <ol class="log-list" data-ref="log"></ol>
      </section>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);
  ligarVerComo(alvo);

  // ---------- Totais ----------
  function intervalo() {
    const p = PERIODOS.find((x) => x.id === periodo);
    return p.dias ? { de: somarDias(hoje, -(p.dias - 1)), ate: hoje } : { de: null, ate: null };
  }

  let operacoes = null; // cache: refeito quando há operação, apuração ou troca de período
  function kpis() {
    operacoes ??= totaisDasOperacoes(estado(), intervalo());
    const t = { ...totaisDaBanca(estado()), ...operacoes };
    const nome = PERIODOS.find((x) => x.id === periodo).nome.toLowerCase();
    const resPct = t.aportado > 0 ? (t.patrimonio / t.aportado - 1) * 100 : 0;
    return [
      { id: 'caixa', rotulo: 'Caixa sob gestão', valor: valorUSDT(t.caixa), extra: 'Clientes ativos e pausados' },
      {
        id: 'patrimonio', rotulo: 'Patrimônio dos clientes', valor: valorUSDT(t.patrimonio),
        variacao: { texto: variacao(resPct), dir: dirDe(resPct) }, extra: 'sobre o aportado',
      },
      { id: 'volume', rotulo: 'Volume operado', valor: valorUSDT(t.volume), extra: `${plural(t.operacoes, 'operação', 'operações')} · ${nome}` },
      {
        id: 'resultado', rotulo: 'Resultado das operações', valor: valorUSDT(t.resultado, { sinal: true }), classe: classeResultado(t.resultado),
        extra: `${plural(t.vendas, 'venda')} · ${nome}`,
      },
      {
        id: 'receber', rotulo: 'Comissões a receber', valor: valorUSDT(t.aReceber), classe: t.vencido > 0 ? 'down' : '',
        extra: t.vencido > 0 ? `${usdt(t.vencido)} vencidos` : 'Períodos apurados, ainda não pagos',
      },
      { id: 'previsto', rotulo: 'Comissões previstas', valor: valorUSDT(t.previsto), extra: 'Períodos em aberto, ao vivo' },
    ];
  }

  function desenharKpis(primeira = false) {
    const lista = kpis();
    if (primeira) ref('kpis').innerHTML = lista.map(kpiHTML).join('');
    else for (const k of lista) atualizarKpi(ref('kpis'), k.id, k);
  }

  function marcarPeriodo() {
    for (const b of ref('periodo').querySelectorAll('[data-periodo]')) {
      const ativo = b.dataset.periodo === periodo;
      b.setAttribute('aria-checked', String(ativo));
      b.tabIndex = ativo ? 0 : -1;
    }
  }

  ref('periodo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-periodo]');
    if (!b) return;
    periodo = b.dataset.periodo;
    operacoes = null;
    marcarPeriodo();
    desenharKpis();
  });
  ref('periodo').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const ids = PERIODOS.map((p) => p.id);
    periodo = ids[(ids.indexOf(periodo) + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length];
    operacoes = null;
    marcarPeriodo();
    desenharKpis();
    ref('periodo').querySelector(`[data-periodo="${periodo}"]`).focus();
  });

  // ---------- Cards dos clientes ----------
  const series = new Map();
  function calcularSeries() {
    const s = estado();
    const diarios = Object.fromEntries(Object.entries(s.precos).map(([m, p]) => [m, p.diario ?? []]));
    for (const c of listaClientes()) {
      const fim = c.encerradoEm && c.encerradoEm < hoje ? c.encerradoEm : hoje;
      let de = somarDias(fim, -29);
      if (de < c.inicioContrato) de = c.inicioContrato;
      series.set(c.id, evolucaoPatrimonio({ clienteId: c.id, ordens: s.ordens, movimentos: s.movimentos, diarios, de, ate: fim }).map((p) => p.patrimonio));
    }
  }

  function dadosDoCard(c) {
    const s = estado();
    const b = resumoBanca(c, s.ordens, s.movimentos, s.precos);
    const serie = [...(series.get(c.id) ?? [])];
    if (serie.length && c.status !== 'inativo') serie[serie.length - 1] = b.patrimonio;
    const motivo = c.status === 'inativo' ? null : motivoSemCompra(c);
    return { b, serie, motivo };
  }

  function barraUso(b) {
    const uso = Math.max(0, Math.min(100, b.usoBancaPct));
    const tom = uso >= 95 ? 'down' : uso >= 80 ? 'warn' : 'ok';
    return `<div class="client-card__usage">
      <div class="usebar" data-tom="${tom}" role="img" aria-label="Uso da banca: ${pctSimples(uso, { casas: 0 })} do caixa operável">
        <span class="usebar__fill" style="width:${uso.toFixed(1)}%"></span>
      </div>
      <p class="client-card__use"><span>Uso da banca</span><span class="num">${pctSimples(uso, { casas: 0 })}</span></p></div>`;
  }

  function corpoDoCard(c) {
    const { b, serie, motivo } = dadosDoCard(c);
    const aberto = periodoAberto(c.id);
    return `
      <div class="client-card__nums">
        <div>
          <p class="label">Patrimônio</p>
          <p class="client-card__value num">${usdt(b.patrimonio)}</p>
        </div>
        <div class="client-card__res">
          <p class="label">Resultado</p>
          <p class="num ${classeResultado(b.resultadoPct)}">${variacao(b.resultadoPct)}</p>
        </div>
      </div>
      <div class="client-card__spark">${sparkline(serie, { rotulo: `Patrimônio de ${c.nome} nos últimos 30 dias` })}</div>
      ${barraUso(b)}
      <p class="client-card__meta muted">
        Em operação <span class="num">${usdt(b.emOperacao)}</span> · ${plural(b.posicoes, 'posição', 'posições')}
        ${aberto ? ` · fecha dia ${aberto.diaFechamento}` : ''}
      </p>
      ${motivo ? `<p class="client-card__why">${icon('circle-pause')}${escapar(motivo)}</p>` : ''}`;
  }

  function cardHTML(c) {
    return `
      <article class="card client-card" data-cliente="${c.id}" data-status="${c.status}">
        <header class="client-card__head">
          <span class="avatar" data-status="${c.status}" aria-hidden="true">${escapar(iniciais(c.nome))}</span>
          <div class="client-card__who">
            <a class="client-card__name" href="${hashDe('admin', 'clientes', `cliente=${c.id}`)}">${escapar(c.nome)}</a>
            <span class="client-card__badges" data-campo="badges">${badgesDoCliente(c)}</span>
          </div>
        </header>
        <div data-campo="corpo">${corpoDoCard(c)}</div>
        <footer class="client-card__foot">
          <a class="btn btn--secondary btn--sm" href="${hashDe('admin', 'clientes', `cliente=${c.id}`)}">${icon('sliders-horizontal')}<span>Ajustar</span></a>
          ${botaoVerComo(c.id)}
        </footer>
      </article>`;
  }

  function desenharCards() {
    const passa = FILTROS.find((f) => f.id === filtro).passa;
    const lista = listaClientes().filter(passa);
    ref('cards').innerHTML = lista.length
      ? lista.map(cardHTML).join('')
      : `<div class="card">${vazioHTML('users', 'Nenhum cliente com este status')}</div>`;
    for (const f of FILTROS) {
      const b = ref('filtro').querySelector(`[data-filtro="${f.id}"]`);
      b.setAttribute('aria-pressed', String(f.id === filtro));
      b.querySelector('[data-conta]').textContent = listaClientes().filter(f.passa).length;
    }
    renderIcons();
  }

  function atualizarCards(ids = null) {
    for (const el of ref('cards').querySelectorAll('[data-cliente]')) {
      const c = estado().clientes[el.dataset.cliente];
      if (!c || (ids && !ids.has(c.id))) continue;
      trocarHTML(el.querySelector('[data-campo="corpo"]'), corpoDoCard(c));
      trocarHTML(el.querySelector('[data-campo="badges"]'), badgesDoCliente(c));
    }
    renderIcons();
  }

  ref('filtro').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    filtro = b.dataset.filtro;
    desenharCards();
  });

  // ---------- Feed ao vivo ----------
  const C = COLUNAS_OPERACAO;
  const colCliente = { id: 'cliente', titulo: 'Cliente', html: (l) => escapar(nomeCliente(l.o.clienteId)) };
  const feed = criarTabela({
    colunas: [C.data, colCliente, C.moeda, C.lado, C.preco, C.total, C.lucro],
    chave: (l) => l.o.id,
    ordem: { col: 'data', dir: 'desc' },
    porPagina: 0,
    maxLinhas: 12,
    ordenavel: false,
    compacta: true,
    rotulo: 'Últimas operações de todos os clientes',
    vazio: { titulo: 'Nenhuma operação ainda', texto: 'As compras e vendas do robô aparecem aqui ao vivo.' },
  });
  ref('feed').append(feed.el);
  feed.definir(ordensNoPeriodo(null, null, null).slice(0, 12).map(linhaDaOrdem));

  // ---------- Últimos alertas ----------
  function desenharAlertas() {
    const lista = estado().alertas.filter((a) => a.paraAdmin).sort((a, b) => b.data - a.data).slice(0, 6);
    ref('alertas').innerHTML = lista.length
      ? lista.map((a) => {
        const sev = SEVERIDADES[a.severidade] ?? SEVERIDADES.info;
        const quem = [a.moeda ? `${monograma(a.moeda, { pequeno: true })}${escapar(a.moeda)}` : '', a.clienteId ? escapar(nomeCliente(a.clienteId)) : '']
          .filter(Boolean).join(' · ');
        return `<li class="mini-alert" data-sev="${a.severidade}">
          <span class="mini-alert__icon">${icon(sev.icone)}</span>
          <div class="mini-alert__body">
            <p class="mini-alert__title">${escapar(a.titulo)}</p>
            <p class="mini-alert__meta">${quem ? `<span class="mini-alert__who">${quem}</span> · ` : ''}<span class="num">${dataHora(a.data)}</span></p>
          </div>
        </li>`;
      }).join('')
      : `<li>${vazioHTML('bell', 'Nenhum alerta ainda')}</li>`;
    renderIcons();
  }

  // ---------- Log ----------
  function desenharLog() {
    const lista = [...estado().logAdmin].sort((a, b) => b.data - a.data).slice(0, 20);
    ref('log').innerHTML = lista.length
      ? lista.map((l) => `
        <li class="log-item" data-origem="${escapar(l.origem)}">
          <time class="num" datetime="${new Date(l.data).toISOString()}">${dataHora(l.data)}</time>
          <span class="log-item__text">${escapar(l.texto)}</span>
          <span class="badge ${l.origem === 'automatico' ? 'badge--info' : l.origem === 'cliente' ? '' : 'badge--admin'}">${ORIGENS[l.origem] ?? escapar(l.origem)}</span>
        </li>`).join('')
      : `<li>${vazioHTML('scroll-text', 'Nenhuma ação registrada')}</li>`;
  }

  // ---------- Ações ----------
  alvo.querySelector('[data-acao="restaurar"]').addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Restaurar dados?',
      texto: 'Os dados fictícios são gerados de novo sobre o mesmo histórico de preços. Ajustes de moedas, clientes, alertas, travas, depósitos, pagamentos e o log desta sessão são descartados.',
      confirmar: 'Restaurar dados',
      icone: 'rotate-ccw',
    });
    if (ok) restaurarDados();
  });

  // ---------- Ao vivo ----------
  const aoPreco = criarAgendador(() => { desenharKpis(); atualizarCards(); }, 1500);
  ctx.aoDestruir(() => aoPreco.parar());
  ctx.on('prices:update', () => aoPreco.pedir());

  const aoOperar = criarAgendador(() => { operacoes = null; desenharKpis(); atualizarCards(); }, 500);
  ctx.aoDestruir(() => aoOperar.parar());
  ctx.on('order:executed', (o) => {
    if (o.status !== 'executada') return;
    feed.inserir(linhaDaOrdem(o));
    aoOperar.pedir();
  });
  ctx.on('order:new', (o) => { if (o.status === 'executada') feed.inserir(linhaDaOrdem(o)); });
  ctx.on('order:canceled', () => aoOperar.pedir());
  ctx.on('cash:new', () => aoOperar.pedir());
  for (const ev of ['commission:closed', 'commission:paid', 'commission:overdue']) ctx.on(ev, () => aoOperar.pedir());

  const cards = criarAgendador(desenharCards, 0);
  ctx.aoDestruir(() => cards.parar());
  ctx.on('client:change', () => cards.pedir());
  ctx.on('config:change', () => aoOperar.pedir());
  ctx.on('coin:change', () => aoOperar.pedir());
  ctx.on('state:robo', () => aoOperar.pedir());

  const alertas = criarAgendador(desenharAlertas, 300);
  ctx.aoDestruir(() => alertas.parar());
  ctx.on('alert:new', (a) => { if (a.paraAdmin) alertas.pedir(); });

  const log = criarAgendador(desenharLog, 200);
  ctx.aoDestruir(() => log.parar());
  ctx.on('log:new', () => log.pedir());

  calcularSeries();
  marcarPeriodo();
  desenharKpis(true);
  desenharCards();
  desenharAlertas();
  desenharLog();
  renderIcons();
  return ctx;
}
