// A4 · Ordens programadas: compras e vendas programadas, vendas dinâmicas e sinais aguardando
// confirmação de todos os clientes, com filtros, seleção múltipla e cancelamento (com o impacto no
// modal). Posições "sem alvo" ganham um novo alvo por preço ou por % sobre a compra.
// Cancelar compra: o valor volta ao disponível. Cancelar venda: a posição fica sem alvo.

import {
  getState, ordensProgramadas, cancelarOrdem, cancelarVendaDinamica, definirAlvo, registrarLog,
} from '../../store.js';
import { gravarConsulta } from '../../router.js';
import { posicoesAbertas } from '../../calc/positions.js';
import { estrategiaPorId, LISTA_ESTRATEGIAS } from '../../engine/strategies/index.js';
import { criarTabela } from '../../ui/table.js';
import { kpiHTML, atualizarKpi } from '../../ui/kpi.js';
import { moedaHTML, monograma } from '../../ui/coin.js';
import { abrirModal, confirmar } from '../../ui/modal.js';
import { escapar, classeResultado, criarAgendador, trocarHTML } from '../../ui/dom.js';
import { icon, renderIcons } from '../../ui/icons.js';
import { usdt, preco as fmtPreco, qtd, dataHora, pctSimples, variacao, plural } from '../../utils/format.js';
import { criarContexto, cabecalhoAdmin, nomeCliente, opcoesClientes } from './comum.js';

/** Itens da A4: ordens programadas (ou aguardando confirmação) e vendas dinâmicas. */
export function itensProgramados(s) {
  const itens = ordensProgramadas().map((o) => ({
    chave: o.id, tipo: 'ordem', ordem: o, clienteId: o.clienteId, moeda: o.moeda, lado: o.lado,
    estrategia: o.estrategia, preco: o.preco, quantidade: o.quantidade, valor: o.total, criadaEm: o.criadaEm,
    aguardando: o.status === 'aguardando-confirmacao',
  }));
  for (const p of posicoesAbertas(s.ordens)) {
    if (!p.compra.vendaDinamica || p.venda) continue;
    const e = s.estadoMotor[`${p.clienteId}:${p.moeda}`];
    const aguardando = !!e?.pendentes?.some((x) => x.tipo === 'venda' && x.compraId === p.compra.id);
    itens.push({
      chave: `d:${p.compra.id}`, tipo: 'dinamica', compra: p.compra, clienteId: p.clienteId, moeda: p.moeda, lado: 'venda',
      estrategia: p.compra.estrategia, preco: p.alvo, quantidade: p.quantidade, valor: p.alvo ? p.alvo * p.quantidade : p.custo,
      criadaEm: p.compra.executadaEm, aguardando,
    });
  }
  return itens;
}

/** Impacto de cancelar uma lista de itens: quantidades e valor das compras que voltam ao disponível. */
export function impactoDoCancelamento(itens) {
  const compras = itens.filter((i) => i.lado === 'compra');
  const vendas = itens.filter((i) => i.lado === 'venda');
  return {
    total: itens.length,
    compras: compras.length,
    vendas: vendas.length,
    valorCompras: compras.reduce((s, i) => s + i.valor, 0),
  };
}

function tipoHTML(i) {
  const base = i.tipo === 'dinamica'
    ? '<span class="badge badge--info">Venda dinâmica</span>'
    : i.lado === 'compra' ? '<span class="badge badge--up">Compra programada</span>' : '<span class="badge">Venda programada</span>';
  return `${base}${i.aguardando ? ' <span class="badge badge--warn" title="O sinal foi dado e o robô espera a confirmação">Aguardando confirmação</span>' : ''}`;
}

export function montarOrdens(alvo, { definicao, consulta }) {
  const ctx = criarContexto();
  const estado = () => getState();
  const catalogo = Object.keys(estado().moedas);
  const filtros = {
    cliente: estado().clientes[consulta.get('cliente')] ? consulta.get('cliente') : '',
    moedas: (consulta.get('moedas') ?? '').split(',').filter((m) => catalogo.includes(m)),
    lado: ['compra', 'venda'].includes(consulta.get('lado')) ? consulta.get('lado') : '',
    estrategia: estrategiaPorId(consulta.get('estrategia')) ? consulta.get('estrategia') : '',
  };
  const selecao = new Set();

  alvo.innerHTML = `
    <section class="page">
      ${cabecalhoAdmin(definicao, { sub: 'Ordens aguardando execução de todos os clientes. Cancelar uma compra devolve o valor ao disponível; cancelar uma venda deixa a posição sem alvo.' })}
      <div class="kpis" data-ref="kpis"></div>
      <div class="card filters" data-ref="filtros" role="group" aria-label="Filtros">
        <label class="field">
          <span class="field__label">Cliente</span>
          <select class="input" data-f="cliente">${opcoesClientes(filtros.cliente, { todos: 'Todos os clientes' })}</select>
        </label>
        <div class="field">
          <span class="field__label" id="a4-lado">Lado</span>
          <div class="segmented segmented--field" role="radiogroup" aria-labelledby="a4-lado">
            ${[['', 'Todos'], ['compra', 'Compras'], ['venda', 'Vendas']].map(([v, n]) => `<button class="segmented__opt" type="button" role="radio" data-lado="${v}">${n}</button>`).join('')}
          </div>
        </div>
        <label class="field">
          <span class="field__label">Estratégia</span>
          <select class="input" data-f="estrategia">
            <option value="">Todas</option>
            ${LISTA_ESTRATEGIAS.map((e) => `<option value="${e.id}"${e.id === filtros.estrategia ? ' selected' : ''}>${e.sigla} · ${escapar(e.nome)}</option>`).join('')}
          </select>
        </label>
        <div class="field filters__coins">
          <span class="field__label" id="a4-moedas">Moedas</span>
          <div class="chips" role="group" aria-labelledby="a4-moedas">
            <button class="chip" type="button" data-moeda="">Todas</button>
            ${catalogo.map((m) => `<button class="chip" type="button" data-moeda="${m}">${monograma(m, { pequeno: true })}<span>${m}</span></button>`).join('')}
          </div>
        </div>
      </div>
      <div class="bulkbar card" data-ref="barra" role="region" aria-label="Ações nas ordens">
        <p class="bulkbar__info" data-ref="selecao" aria-live="polite"></p>
        <div class="bulkbar__btns">
          <button class="btn btn--secondary btn--sm" type="button" data-acao="limpar" disabled>Limpar seleção</button>
          <button class="btn btn--danger btn--sm" type="button" data-acao="cancelar-selecionadas" disabled>${icon('x-circle')}<span>Cancelar selecionadas</span></button>
          <button class="btn btn--secondary btn--sm btn--danger-outline" type="button" data-acao="cancelar-compras">${icon('x-circle')}<span>Cancelar todas as compras</span></button>
        </div>
      </div>
      <div data-ref="tabela"></div>
      <section class="card section" aria-labelledby="a4-sem-alvo">
        <header class="section__head">
          <h2 id="a4-sem-alvo">Posições sem alvo</h2>
          <p class="section__note">Venda programada ou dinâmica cancelada. A posição fica aberta até o admin definir um novo alvo.</p>
        </header>
        <div data-ref="sem-alvo"></div>
      </section>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);

  // ---------- Itens e filtros ----------
  let itens = [];
  const passa = (i) => (!filtros.cliente || i.clienteId === filtros.cliente)
    && (!filtros.moedas.length || filtros.moedas.includes(i.moeda))
    && (!filtros.lado || i.lado === filtros.lado)
    && (!filtros.estrategia || i.estrategia === filtros.estrategia);
  const filtrados = () => itens.filter(passa);
  const temFiltro = () => !!(filtros.cliente || filtros.moedas.length || filtros.lado || filtros.estrategia);

  function gravar() {
    gravarConsulta({ cliente: filtros.cliente, moedas: filtros.moedas.join(','), lado: filtros.lado, estrategia: filtros.estrategia });
  }

  function marcarFiltros() {
    const f = ref('filtros');
    for (const b of f.querySelectorAll('[data-lado]')) {
      const ativo = b.dataset.lado === filtros.lado;
      b.setAttribute('aria-checked', String(ativo));
      b.tabIndex = ativo ? 0 : -1;
    }
    for (const b of f.querySelectorAll('[data-moeda]')) {
      const m = b.dataset.moeda;
      b.setAttribute('aria-pressed', String(m ? filtros.moedas.includes(m) : !filtros.moedas.length));
    }
  }

  ref('filtros').addEventListener('change', (e) => {
    const k = e.target.dataset.f;
    if (!k) return;
    filtros[k] = e.target.value;
    aplicar();
  });
  ref('filtros').addEventListener('click', (e) => {
    const lado = e.target.closest('[data-lado]');
    const chip = e.target.closest('[data-moeda]');
    if (lado) filtros.lado = lado.dataset.lado;
    else if (chip) {
      const m = chip.dataset.moeda;
      if (!m) filtros.moedas = [];
      else {
        const lista = filtros.moedas.includes(m) ? filtros.moedas.filter((x) => x !== m) : [...filtros.moedas, m];
        filtros.moedas = lista.length === catalogo.length ? [] : catalogo.filter((x) => lista.includes(x));
      }
    } else return;
    aplicar();
  });

  // ---------- Tabela ----------
  const atual = (m) => estado().precos[m]?.atual ?? null;
  const distancia = (i) => {
    const p = atual(i.moeda);
    return p && i.preco ? (i.preco / p - 1) * 100 : null;
  };
  const tabela = criarTabela({
    colunas: [
      {
        id: 'sel', titulo: '<input type="checkbox" class="check" data-sel-todas aria-label="Selecionar todas as ordens visíveis">',
        html: (i) => `<input type="checkbox" class="check" data-sel="${escapar(i.chave)}"${selecao.has(i.chave) ? ' checked' : ''} aria-label="Selecionar ${i.lado} de ${i.moeda} de ${escapar(nomeCliente(i.clienteId))}">`,
      },
      { id: 'cliente', titulo: 'Cliente', ordenar: (i) => nomeCliente(i.clienteId), html: (i) => escapar(nomeCliente(i.clienteId)) },
      { id: 'moeda', titulo: 'Moeda', ordenar: (i) => i.moeda, html: (i) => moedaHTML(i.moeda) },
      { id: 'tipo', titulo: 'Tipo', ordenar: (i) => `${i.lado}${i.tipo}`, html: tipoHTML },
      { id: 'estrategia', titulo: 'Estratégia', ordenar: (i) => i.estrategia, html: (i) => { const e = estrategiaPorId(i.estrategia); return e ? `<span class="strat-tag" title="${escapar(e.nome)}">${e.sigla}</span>` : '—'; } },
      { id: 'preco', titulo: 'Preço / alvo', num: true, ordenar: (i) => i.preco, html: (i) => (i.preco ? fmtPreco(i.preco) : '<span class="faint">—</span>') },
      { id: 'cotacao', titulo: 'Cotação', num: true, ordenar: (i) => atual(i.moeda), html: (i) => fmtPreco(atual(i.moeda)) },
      {
        id: 'distancia', titulo: 'Distância', num: true, ordenar: (i) => Math.abs(distancia(i) ?? Infinity),
        html: (i) => { const d = distancia(i); return d == null ? '<span class="faint">—</span>' : pctSimples(d); },
        classe: (i) => { const d = distancia(i); return d != null && Math.abs(d) < 0.15 ? 'is-near' : ''; },
      },
      { id: 'quantidade', titulo: 'Quantidade', num: true, ordenar: (i) => i.quantidade, html: (i) => qtd(i.quantidade, i.moeda) },
      { id: 'valor', titulo: 'Valor (USDT)', num: true, ordenar: (i) => i.valor, html: (i) => usdt(i.valor, { sufixo: false }) },
      { id: 'criada', titulo: 'Desde', ordenar: (i) => +i.criadaEm, html: (i) => `<span class="num muted">${dataHora(i.criadaEm)}</span>` },
      { id: 'acao', titulo: '<span class="sr-only">Cancelar</span>', html: (i) => `<button class="icon-btn icon-btn--sm" type="button" data-cancelar="${escapar(i.chave)}" aria-label="Cancelar esta ordem" title="Cancelar">${icon('x-circle')}</button>` },
    ],
    chave: (i) => i.chave,
    ordem: { col: 'criada', dir: 'desc' },
    rotulo: 'Ordens programadas',
    vazio: { titulo: 'Nenhuma ordem programada com estes filtros', texto: 'O robô programa novas ordens conforme a estratégia de cada moeda.' },
  });
  ref('tabela').append(tabela.el);

  function desenharSelecao() {
    const visiveis = new Set(filtrados().map((i) => i.chave));
    for (const k of [...selecao]) if (!itens.some((i) => i.chave === k)) selecao.delete(k);
    const escolhidos = itens.filter((i) => selecao.has(i.chave));
    const imp = impactoDoCancelamento(escolhidos);
    const lista = filtrados();
    ref('selecao').innerHTML = escolhidos.length
      ? `<b>${plural(escolhidos.length, 'selecionada', 'selecionadas')}</b> · ${plural(imp.compras, 'compra')} (<span class="num">${usdt(imp.valorCompras)}</span>) · ${plural(imp.vendas, 'venda')}`
      : `${plural(lista.length, 'ordem', 'ordens')}${temFiltro() ? ' com estes filtros' : ''} · selecione para cancelar`;
    ref('barra').querySelector('[data-acao="cancelar-selecionadas"]').disabled = !escolhidos.length;
    ref('barra').querySelector('[data-acao="limpar"]').disabled = !escolhidos.length;
    ref('barra').querySelector('[data-acao="cancelar-compras"]').disabled = !lista.some((i) => i.lado === 'compra');
    const todas = tabela.el.querySelector('[data-sel-todas]');
    if (todas) {
      const n = [...visiveis].filter((k) => selecao.has(k)).length;
      todas.checked = n > 0 && n === visiveis.size;
      todas.indeterminate = n > 0 && n < visiveis.size;
    }
  }

  tabela.el.addEventListener('change', (e) => {
    const um = e.target.closest('[data-sel]');
    const todas = e.target.closest('[data-sel-todas]');
    if (um) {
      if (um.checked) selecao.add(um.dataset.sel);
      else selecao.delete(um.dataset.sel);
    } else if (todas) {
      for (const i of filtrados()) {
        if (todas.checked) selecao.add(i.chave);
        else selecao.delete(i.chave);
      }
      for (const cb of tabela.el.querySelectorAll('[data-sel]')) cb.checked = selecao.has(cb.dataset.sel);
    }
    desenharSelecao();
  });
  tabela.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cancelar]');
    if (b) {
      const i = itens.find((x) => x.chave === b.dataset.cancelar);
      if (i) pedirCancelamento([i], 'esta ordem');
    }
  });

  // ---------- Cancelamento ----------
  function cancelarItens(lista) {
    let n = 0;
    for (const i of lista) {
      if (i.tipo === 'dinamica') {
        if (i.compra.vendaDinamica) {
          cancelarVendaDinamica(i.compra.id, 'admin', { registrar: lista.length === 1 });
          n++;
        }
      } else {
        const o = cancelarOrdem(i.ordem.id, 'admin', { motivo: 'cancelada pelo admin', registrar: lista.length === 1 });
        if (o.status === 'cancelada') n++;
      }
      selecao.delete(i.chave);
    }
    if (lista.length > 1) {
      const imp = impactoDoCancelamento(lista);
      registrarLog(`${plural(n, 'ordem programada cancelada', 'ordens programadas canceladas')} (${plural(imp.compras, 'compra')}, ${plural(imp.vendas, 'venda')}; ${usdt(imp.valorCompras)} de volta ao disponível)`);
    }
    return n;
  }

  async function pedirCancelamento(lista, sobre) {
    if (!lista.length) return;
    const imp = impactoDoCancelamento(lista);
    const partes = [];
    if (imp.compras) partes.push(`${plural(imp.compras, 'compra programada', 'compras programadas')}: o valor de ${usdt(imp.valorCompras)} volta ao disponível dos clientes.`);
    if (imp.vendas) partes.push(`${plural(imp.vendas, 'venda', 'vendas')}: ${imp.vendas === 1 ? 'a posição continua aberta e fica' : 'as posições continuam abertas e ficam'} sem alvo até você definir um novo.`);
    const ok = await confirmar({
      titulo: lista.length === 1 ? 'Cancelar esta ordem?' : `Cancelar ${plural(lista.length, 'ordem', 'ordens')}?`,
      resumo: `${plural(lista.length, 'ordem', 'ordens')} · ${usdt(imp.valorCompras)}${sobre && lista.length > 1 ? ` · ${sobre}` : ''}`,
      texto: `${partes.join(' ')} Nada é executado agora; as ordens canceladas aparecem no histórico do cliente.`,
      confirmar: lista.length === 1 ? 'Cancelar ordem' : 'Cancelar ordens',
      cancelar: 'Voltar',
      icone: 'x-circle',
    });
    if (ok) cancelarItens(lista);
  }

  ref('barra').addEventListener('click', (e) => {
    const acao = e.target.closest('[data-acao]')?.dataset.acao;
    if (acao === 'limpar') {
      selecao.clear();
      for (const cb of tabela.el.querySelectorAll('[data-sel]')) cb.checked = false;
      desenharSelecao();
    } else if (acao === 'cancelar-selecionadas') {
      pedirCancelamento(itens.filter((i) => selecao.has(i.chave)), 'selecionadas');
    } else if (acao === 'cancelar-compras') {
      pedirCancelamento(filtrados().filter((i) => i.lado === 'compra'), temFiltro() ? 'todas as compras dos filtros atuais' : 'todas as compras');
    }
  });

  // ---------- Posições sem alvo ----------
  const semAlvo = criarTabela({
    colunas: [
      { id: 'cliente', titulo: 'Cliente', ordenar: (p) => nomeCliente(p.clienteId), html: (p) => escapar(nomeCliente(p.clienteId)) },
      { id: 'moeda', titulo: 'Moeda', ordenar: (p) => p.moeda, html: (p) => moedaHTML(p.moeda) },
      { id: 'quantidade', titulo: 'Quantidade', num: true, html: (p) => qtd(p.quantidade, p.moeda) },
      { id: 'compra', titulo: 'Preço de compra', num: true, ordenar: (p) => p.precoCompra, html: (p) => fmtPreco(p.precoCompra) },
      { id: 'cotacao', titulo: 'Cotação', num: true, html: (p) => fmtPreco(atual(p.moeda)) },
      {
        id: 'variacao', titulo: 'Variação', num: true, ordenar: (p) => (atual(p.moeda) ? atual(p.moeda) / p.precoCompra : null),
        html: (p) => (atual(p.moeda) ? variacao((atual(p.moeda) / p.precoCompra - 1) * 100) : '—'),
        classe: (p) => (atual(p.moeda) ? classeResultado(atual(p.moeda) - p.precoCompra) : ''),
      },
      { id: 'custo', titulo: 'Custo (USDT)', num: true, ordenar: (p) => p.custo, html: (p) => usdt(p.custo, { sufixo: false }) },
      { id: 'acao', titulo: '<span class="sr-only">Definir novo alvo</span>', html: (p) => `<button class="btn btn--primary btn--sm" type="button" data-alvo="${p.compra.id}">${icon('target')}<span>Definir novo alvo</span></button>` },
    ],
    chave: (p) => p.compra.id,
    ordem: { col: 'cliente', dir: 'asc' },
    rotulo: 'Posições sem alvo',
    vazio: { titulo: 'Nenhuma posição sem alvo', texto: 'Quando uma venda for cancelada, a posição aparece aqui para receber um novo alvo.' },
  });
  ref('sem-alvo').append(semAlvo.el);
  let listaSemAlvo = [];

  function abrirNovoAlvo(compraId) {
    const p = listaSemAlvo.find((x) => x.compra.id === compraId);
    if (!p) return;
    const m = estado().moedas[p.moeda];
    const lucroMin = Number(m.params.lucroMinimo) || 0;
    const minimo = p.precoCompra * (1 + lucroMin / 100);
    const sugerido = Math.max(minimo, (atual(p.moeda) ?? 0) * 1.002);
    let modo = 'pct';
    const corpo = `
      <dl class="mini-dl">
        <div><dt>Posição</dt><dd>${qtd(p.quantidade, p.moeda)} · ${escapar(nomeCliente(p.clienteId))}</dd></div>
        <div><dt>Preço de compra</dt><dd class="num">${fmtPreco(p.precoCompra)}</dd></div>
        <div><dt>Cotação</dt><dd class="num">${fmtPreco(atual(p.moeda))}</dd></div>
        <div><dt>Mínimo</dt><dd class="num">${fmtPreco(minimo)} <span class="muted">(lucro mínimo de ${pctSimples(lucroMin)})</span></dd></div>
      </dl>
      <div class="segmented segmented--field" role="radiogroup" aria-label="Definir por">
        <button class="segmented__opt" type="button" role="radio" data-modo="pct" aria-checked="true">% sobre a compra</button>
        <button class="segmented__opt" type="button" role="radio" data-modo="preco" aria-checked="false" tabindex="-1">Preço</button>
      </div>
      <label class="field">
        <span class="field__label" data-alvo-rotulo>Lucro sobre a compra</span>
        <span class="input-group"><input class="input num" type="number" min="0" step="any" inputmode="decimal" data-alvo-valor value="${Math.max(lucroMin, ((sugerido / p.precoCompra) - 1) * 100).toFixed(2)}" autofocus><span class="input-group__suffix" data-alvo-sufixo>%</span></span>
        <span class="pfield__help" data-alvo-preview></span>
        <span class="pfield__erro" data-alvo-erro hidden></span>
      </label>`;
    const precoDoCampo = (el) => {
      const v = Number(el.querySelector('[data-alvo-valor]').value);
      return modo === 'pct' ? p.precoCompra * (1 + v / 100) : v;
    };
    const modal = abrirModal({
      titulo: `Novo alvo de ${p.moeda}`,
      largura: 'sm',
      corpo,
      acoes: [{ id: 'cancelar', rotulo: 'Cancelar' }, { id: 'ok', rotulo: 'Definir alvo', classe: 'btn--primary', icone: 'target' }],
      aoAgir(id, el) {
        if (id !== 'ok') return true;
        const alvoPreco = precoDoCampo(el);
        const erro = el.querySelector('[data-alvo-erro]');
        try {
          const casas = m.precisao?.preco ?? 8;
          definirAlvo(p.compra.id, Math.ceil(alvoPreco * 10 ** casas - 1e-9) / 10 ** casas);
          return true;
        } catch (err) {
          erro.hidden = false;
          erro.textContent = err.message;
          return false;
        }
      },
    });
    const el = modal.el;
    const atualizarPrevia = () => {
      const v = precoDoCampo(el);
      const lucro = (v / p.precoCompra - 1) * 100;
      el.querySelector('[data-alvo-preview]').textContent = Number.isFinite(v) && v > 0
        ? `Venda programada em ${fmtPreco(v)} USDT (${pctSimples(lucro)} sobre a compra, ${usdt(v * p.quantidade)}).`
        : '';
      el.querySelector('[data-alvo-erro]').hidden = true;
    };
    el.addEventListener('input', atualizarPrevia);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-modo]');
      if (!b || b.dataset.modo === modo) return;
      const preco = precoDoCampo(el);
      modo = b.dataset.modo;
      for (const x of el.querySelectorAll('[data-modo]')) {
        x.setAttribute('aria-checked', String(x === b));
        x.tabIndex = x === b ? 0 : -1;
      }
      el.querySelector('[data-alvo-rotulo]').textContent = modo === 'pct' ? 'Lucro sobre a compra' : 'Preço de venda';
      el.querySelector('[data-alvo-sufixo]').textContent = modo === 'pct' ? '%' : 'USDT';
      el.querySelector('[data-alvo-valor]').value = modo === 'pct' ? ((preco / p.precoCompra - 1) * 100).toFixed(2) : String(preco);
      atualizarPrevia();
    });
    atualizarPrevia();
  }
  semAlvo.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-alvo]');
    if (b) abrirNovoAlvo(b.dataset.alvo);
  });

  // ---------- KPIs ----------
  function kpis() {
    const lista = itens;
    const compras = lista.filter((i) => i.tipo === 'ordem' && i.lado === 'compra');
    const vendas = lista.filter((i) => i.tipo === 'ordem' && i.lado === 'venda');
    const dinamicas = lista.filter((i) => i.tipo === 'dinamica');
    const aguardando = lista.filter((i) => i.aguardando);
    return [
      { id: 'compras', rotulo: 'Compras programadas', valor: compras.length.toLocaleString('pt-BR'), extra: `${usdt(compras.reduce((s, i) => s + i.valor, 0))} reservados` },
      { id: 'vendas', rotulo: 'Vendas programadas', valor: vendas.length.toLocaleString('pt-BR'), extra: `${usdt(vendas.reduce((s, i) => s + i.valor, 0))} nos alvos` },
      { id: 'dinamicas', rotulo: 'Vendas dinâmicas', valor: dinamicas.length.toLocaleString('pt-BR'), extra: 'O robô acompanha o preço e vende por sinal' },
      { id: 'aguardando', rotulo: 'Aguardando confirmação', valor: aguardando.length.toLocaleString('pt-BR'), extra: 'Sinais dados, à espera da confirmação' },
      { id: 'semalvo', rotulo: 'Posições sem alvo', valor: listaSemAlvo.length.toLocaleString('pt-BR'), extra: listaSemAlvo.length ? 'Defina um novo alvo abaixo' : 'Nenhuma pendência', classe: listaSemAlvo.length ? 'warn' : '' },
    ];
  }

  // ---------- Ciclo ----------
  function carregar() {
    const s = estado();
    itens = itensProgramados(s);
    listaSemAlvo = posicoesAbertas(s.ordens).filter((p) => p.semAlvo);
  }

  function aplicar() {
    gravar();
    marcarFiltros();
    tabela.definir(filtrados());
    desenharSelecao();
  }

  function tudo(primeira = false) {
    carregar();
    if (primeira) ref('kpis').innerHTML = kpis().map(kpiHTML).join('');
    else for (const k of kpis()) atualizarKpi(ref('kpis'), k.id, k);
    // Ao vivo, refaz só a página visível (sem voltar para a primeira).
    const visiveis = new Set(filtrados().map((i) => i.chave));
    const antes = new Set(tabela.linhas().map((i) => i.chave));
    const igual = visiveis.size === antes.size && [...visiveis].every((k) => antes.has(k));
    if (primeira || !igual) tabela.definir(filtrados());
    else tabela.atualizarCelulas(() => true, ['tipo', 'preco', 'cotacao', 'distancia', 'valor']);
    semAlvo.definir(listaSemAlvo);
    desenharSelecao();
    renderIcons();
  }

  const refazer = criarAgendador(() => tudo(), 700);
  ctx.aoDestruir(() => refazer.parar());
  for (const ev of ['order:new', 'order:executed', 'order:canceled', 'order:update', 'position:dynamic', 'position:target', 'engine:state']) {
    ctx.on(ev, () => refazer.pedir());
  }
  const mudaram = new Set();
  const vivo = criarAgendador(() => {
    tabela.atualizarCelulas((i) => mudaram.has(i.moeda), ['cotacao', 'distancia', 'preco', 'valor']);
    semAlvo.atualizarCelulas((p) => mudaram.has(p.moeda), ['cotacao', 'variacao']);
    mudaram.clear();
  }, 1000);
  ctx.aoDestruir(() => vivo.parar());
  ctx.on('prices:update', ({ moeda }) => { mudaram.add(moeda); vivo.pedir(); });

  marcarFiltros();
  gravar();
  tudo(true);
  return ctx;
}
