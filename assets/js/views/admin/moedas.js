// A2 · Moedas e estratégias: tabela das moedas (liga/desliga, trava de compras, spread, estratégia e
// estado do motor) e o painel da moeda escolhida, com o formulário gerado a partir de
// `estrategia.parametros`, os parâmetros gerais, a confirmação de sinal, os perfis, a prévia da próxima
// compra/venda (e o gráfico do canal na estratégia G) e o atalho para os alertas da moeda.
// Salvar vale para as próximas ordens; as executadas e as já programadas não mudam.

import { getState, atualizarMoeda, registrarLog } from '../../store.js';
import { gravarConsulta } from '../../router.js';
import { LISTA_ESTRATEGIAS, estrategiaPorId } from '../../engine/strategies/index.js';
import { PARAMETROS_GERAIS, PARAMETROS_CONFIRMACAO, PERFIS, paramsDoPerfil, confirmacaoDoPerfil, serieDaMoeda } from '../../engine/params.js';
import { aplicarPerfil } from '../../engine/engine.js';
import { calcularCanal, zonasDoCanal } from '../../engine/strategies/canal.js';
import { criarTabela } from '../../ui/table.js';
import { criarFormulario, textoValor } from '../../ui/form.js';
import { criarGrafico, opcoesBase, comAlfa } from '../../ui/chart.js';
import { confirmar } from '../../ui/modal.js';
import { moedaHTML, monograma } from '../../ui/coin.js';
import { escapar, criarAgendador, trocarHTML, rolarAte } from '../../ui/dom.js';
import { icon, renderIcons } from '../../ui/icons.js';
import { preco as fmtPreco, pctSimples, variacao, dataHora } from '../../utils/format.js';
import { criarContexto, cabecalhoAdmin, pilulaMotor } from './comum.js';
import { abrirAlertasDe } from './regras.js';

const f = (pct) => (Number(pct) || 0) / 100;

/**
 * Prévia da próxima compra e venda com os parâmetros (editados) e o preço atual.
 * Devolve { compra, venda, texto } — `compra`/`venda` podem ser null quando dependem de um sinal.
 */
export function previa(estrategiaId, p, preco, velas = []) {
  if (!(preco > 0)) return { compra: null, venda: null, texto: 'Sem cotação no momento.' };
  const lucroMin = f(p.lucroMinimo);
  const vendaMin = (c) => c * (1 + lucroMin);
  switch (estrategiaId) {
    case 'spread-fixo': {
      const compra = preco * (1 - f(p.spread));
      return { compra, venda: compra * (1 + Math.max(f(p.lucro), lucroMin)), texto: `Compras programadas a cada ${pctSimples(p.spread)} de queda; cada compra programa a venda ${pctSimples(Math.max(Number(p.lucro), Number(p.lucroMinimo)))} acima.` };
    }
    case 'reversao-picos': {
      const fundo = preco * (1 - f(p.quedaMinima));
      const compra = fundo * (1 + f(p.recuoCompra));
      return { compra, venda: vendaMin(compra), texto: `Se cair ${pctSimples(p.quedaMinima)} e voltar ${pctSimples(p.recuoCompra)} do fundo, compra; vende quando recuar ${pctSimples(p.recuoVenda)} do topo, a partir do lucro mínimo.` };
    }
    case 'canal': {
      const c = calcularCanal(velas, p);
      if (!c.valido) {
        const porque = c.motivo === 'poucas velas' ? `juntando velas (${c.velas}/${c.janela})` : c.motivo;
        return { compra: null, venda: null, texto: `Canal ainda não confirmado: ${porque}.`, canal: c };
      }
      const z = zonasDoCanal(c.suporte, c.resistencia, p);
      return { compra: Math.min(preco, z.compraAte), venda: Math.max(z.vendaDesde, vendaMin(Math.min(preco, z.compraAte))), texto: `Canal de ${pctSimples(c.largura)}: compra até ${fmtPreco(z.compraAte)}, vende a partir de ${fmtPreco(z.vendaDesde)}.`, canal: c };
    }
    case 'escalonada': {
      const compra = preco * (1 - f(p.spread));
      return { compra, venda: compra * (1 + f(p.lucroMedio)), texto: `Até ${p.niveis} níveis a cada ${pctSimples(p.spread)}, cada um ${p.multiplicador}× maior; vende tudo ${pctSimples(p.lucroMedio)} acima do preço médio.` };
    }
    case 'grade': {
      const passo = (2 * Number(p.faixaPct)) / Math.max(2, Math.round(p.linhas));
      const compra = preco * (1 - passo / 100);
      return { compra, venda: compra * (1 + Math.max(passo / 100, lucroMin)), texto: `Grade de ${p.linhas} linhas entre ${fmtPreco(preco * (1 - f(p.faixaPct)))} e ${fmtPreco(preco * (1 + f(p.faixaPct)))} (passo de ${pctSimples(passo)}).` };
    }
    case 'dca':
      return { compra: preco, venda: preco * (1 + f(p.lucroDca)), texto: `Compra a mercado a cada ${p.intervaloMin} min; vende tudo ${pctSimples(p.lucroDca)} acima do preço médio.` };
    case 'medias':
      return { compra: null, venda: vendaMin(preco), texto: `Compra quando a média de ${p.mediaCurta} velas cruzar a de ${p.mediaLonga} para cima; vende no cruzamento para baixo, a partir do lucro mínimo.` };
    default:
      return { compra: null, venda: null, texto: '' };
  }
}

const clientesQueOperam = (simbolo) => Object.values(getState().clientes).filter((c) => c.status !== 'inativo' && c.moedas.includes(simbolo)).length;

export function montarMoedas(alvo, { definicao, consulta }) {
  const ctx = criarContexto();
  const estado = () => getState();
  let selecionada = estado().moedas[consulta.get('moeda')] ? consulta.get('moeda') : Object.keys(estado().moedas)[0];

  const acoes = `
    <button class="btn btn--secondary" type="button" data-perfil-todas="demo">${icon('zap')}<span>Perfil Demonstração em todas</span></button>
    <button class="btn btn--secondary" type="button" data-perfil-todas="padrao">${icon('gauge')}<span>Perfil Padrão em todas</span></button>`;
  alvo.innerHTML = `
    <section class="page">
      ${cabecalhoAdmin(definicao, { acoes, sub: 'Spread e estratégia valem por moeda, para todos os clientes que a operam. Mudanças valem para as próximas ordens.' })}
      <div data-ref="tabela"></div>
      <section class="card section coin-panel" data-ref="painel" aria-live="off"></section>
    </section>`;
  const ref = (n) => alvo.querySelector(`[data-ref="${n}"]`);

  // ---------- Tabela ----------
  const interruptor = (simbolo, campo, ligado, rotulo) => `
    <label class="switch-field switch-field--compact" title="${escapar(rotulo)}">
      <input class="switch" type="checkbox" data-alternar="${campo}" data-moeda="${simbolo}"${ligado ? ' checked' : ''} aria-label="${escapar(rotulo)}">
    </label>`;
  const tabela = criarTabela({
    colunas: [
      { id: 'moeda', titulo: 'Moeda', ordenar: (m) => m.simbolo, html: (m) => `${moedaHTML(m.simbolo)}<span class="muted coin-name">${escapar(m.nome)}</span>` },
      {
        id: 'cotacao', titulo: 'Cotação', num: true, ordenar: (m) => estado().precos[m.simbolo]?.atual,
        html: (m) => {
          const p = estado().precos[m.simbolo];
          return p?.atual ? `${fmtPreco(p.atual)}<span class="cell-sub ${p.variacao24h > 0 ? 'up' : p.variacao24h < 0 ? 'down' : ''}">${variacao(p.variacao24h)}</span>` : '<span class="faint">—</span>';
        },
      },
      { id: 'ativa', titulo: 'Ligada', html: (m) => interruptor(m.simbolo, 'ativa', m.ativa, `${m.simbolo} ligada`) },
      { id: 'trava', titulo: 'Travar compras', html: (m) => interruptor(m.simbolo, 'travaCompras', m.travaCompras, `Travar compras de ${m.simbolo}`) },
      { id: 'spread', titulo: 'Spread', num: true, ordenar: (m) => m.params.spread, html: (m) => pctSimples(m.params.spread) },
      { id: 'estrategia', titulo: 'Estratégia', ordenar: (m) => m.estrategia, html: (m) => { const e = estrategiaPorId(m.estrategia); return e ? `<span class="strat-tag">${e.sigla}</span>${escapar(e.nome)}` : '—'; } },
      { id: 'motor', titulo: 'Estado do motor', html: (m) => `<span class="engine-pills">${pilulaMotor(m)}</span>` },
      { id: 'clientes', titulo: 'Clientes', num: true, ordenar: (m) => clientesQueOperam(m.simbolo), html: (m) => String(clientesQueOperam(m.simbolo)) },
      { id: 'config', titulo: '<span class="sr-only">Configurar</span>', html: (m) => `<button class="btn btn--secondary btn--sm" type="button" data-selecionar="${m.simbolo}" aria-label="Configurar ${m.simbolo}">${icon('sliders-horizontal')}<span>Configurar</span></button>` },
    ],
    chave: (m) => m.simbolo,
    porPagina: 0,
    rotulo: 'Moedas operadas',
    vazio: { titulo: 'Nenhuma moeda no catálogo', texto: 'Use "Restaurar dados" no Painel geral para voltar às moedas da demonstração.' },
  });
  ref('tabela').append(tabela.el);
  tabela.el.classList.add('table--select');

  function marcarSelecionada() {
    for (const tr of tabela.el.querySelectorAll('tbody tr')) tr.classList.toggle('is-selected', tr.dataset.chave === selecionada);
  }
  function carregarTabela() {
    tabela.definir(Object.values(estado().moedas));
    marcarSelecionada();
  }

  tabela.el.addEventListener('change', (e) => {
    const t = e.target.closest('[data-alternar]');
    if (!t) return;
    const simbolo = t.dataset.moeda;
    const campo = t.dataset.alternar;
    atualizarMoeda(simbolo, { [campo]: t.checked });
    if (campo === 'travaCompras') registrarLog(t.checked ? `Compras de ${simbolo} travadas` : `Compras de ${simbolo} destravadas`);
  });
  tabela.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-selecionar]');
    const tr = e.target.closest('tbody tr');
    if (b || (tr && !e.target.closest('input, label, button, a'))) {
      selecionar(b ? b.dataset.selecionar : tr.dataset.chave, { rolar: !!b });
    }
  });

  // ---------- Painel da moeda ----------
  let form = { estrategia: null, gerais: null, confirmacao: null };
  let estrategiaEditada = null;
  let grafico = null;
  let sujo = false;

  function referencias(moeda, estrategiaId) {
    const perfil = estado().config.perfil;
    return { params: paramsDoPerfil(perfil), confirmacao: confirmacaoDoPerfil(perfil, estrategiaId), perfil };
  }

  function velasDe(moeda) {
    const p = estado().precos[moeda.simbolo];
    return (serieDaMoeda(moeda) === '15s' ? p?.velas15s : p?.velas1m) ?? [];
  }

  function paramsEditados() {
    const m = estado().moedas[selecionada];
    return { ...m.params, ...(form.gerais?.estado().valores ?? {}), ...(form.estrategia?.estado().valores ?? {}) };
  }

  function desenharPrevia() {
    const m = estado().moedas[selecionada];
    const el = ref('painel').querySelector('[data-ref="previa"]');
    if (!m || !el) return;
    const valido = [form.gerais, form.estrategia].every((x) => !x || x.estado().valido);
    const p = paramsEditados();
    const atual = estado().precos[m.simbolo]?.atual;
    const pr = valido ? previa(estrategiaEditada, p, atual, velasDe(m)) : { compra: null, venda: null, texto: 'Corrija os campos marcados para ver a prévia.' };
    const fmt = (v) => (v ? `~${fmtPreco(v)} USDT` : 'aguardando sinal');
    trocarHTML(el, `
      <p class="preview__main">Próxima compra em <b class="num">${fmt(pr.compra)}</b>, venda em <b class="num">${fmt(pr.venda)}</b></p>
      <p class="preview__text muted">${escapar(pr.texto)} Cotação agora: <span class="num">${atual ? fmtPreco(atual) : '—'}</span>.</p>`);
    if (grafico) grafico.refazer();
  }

  function criarGraficoCanal(canvas) {
    return criarGrafico(canvas, (cores) => {
      const m = estado().moedas[selecionada];
      const p = paramsEditados();
      const velas = velasDe(m).slice(-Math.max(30, Math.round(p.janelaCanal) * 2));
      const c = calcularCanal(velas, p);
      const linhas = velas.map((v) => v.fechamento);
      const horizontal = (v) => velas.map(() => v);
      const sets = [{ label: 'Preço', data: linhas, borderColor: cores.texto, borderWidth: 1.5, pointRadius: 0, tension: 0.2, order: 0 }];
      if (Number.isFinite(c.suporte) && Number.isFinite(c.resistencia)) {
        const z = zonasDoCanal(c.suporte, c.resistencia, p);
        const corCanal = c.valido ? cores.brand : cores.faint;
        sets.push(
          { label: 'Resistência', data: horizontal(c.resistencia), borderColor: corCanal, borderDash: [4, 4], borderWidth: 1, pointRadius: 0 },
          { label: 'Zona de venda', data: horizontal(z.vendaDesde), borderColor: comAlfa(cores.down, 0.5), borderWidth: 1, pointRadius: 0, fill: '-1', backgroundColor: comAlfa(cores.down, 0.1) },
          { label: 'Zona de compra', data: horizontal(z.compraAte), borderColor: comAlfa(cores.up, 0.5), borderWidth: 1, pointRadius: 0 },
          { label: 'Suporte', data: horizontal(c.suporte), borderColor: corCanal, borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: '-1', backgroundColor: comAlfa(cores.up, 0.1) },
        );
      }
      return {
        type: 'line',
        data: { labels: velas.map((v) => dataHora(v.t).slice(-5)), datasets: sets },
        options: opcoesBase(cores, { eixoY: (v) => fmtPreco(v), dica: { label: (x) => `${x.dataset.label}: ${fmtPreco(x.parsed.y)}` } }),
      };
    });
  }

  function opcoesEstrategia(atual) {
    return LISTA_ESTRATEGIAS.map((e) => `<option value="${e.id}"${e.id === atual ? ' selected' : ''}>${e.sigla} · ${escapar(e.nome)}</option>`).join('');
  }

  function montarFormEstrategia(m, estrategiaId) {
    const est = estrategiaPorId(estrategiaId);
    const caixa = ref('painel').querySelector('[data-ref="f-estrategia"]');
    const ref0 = referencias(m, estrategiaId);
    const valores = Object.fromEntries(est.parametros.map((d) => [d.chave, m.params[d.chave] ?? (ref0.perfil === 'demo' && 'demo' in d ? d.demo : d.padrao)]));
    form.estrategia = criarFormulario(caixa, est.parametros, valores, { referencia: ref0.params, aoMudar: aoMudarForm });
    ref('painel').querySelector('[data-ref="desc"]').textContent = est.descricao;
    const temCanal = estrategiaId === 'canal';
    const box = ref('painel').querySelector('[data-ref="grafico-canal"]');
    box.hidden = !temCanal;
    grafico?.destruir();
    grafico = temCanal ? criarGraficoCanal(box.querySelector('canvas')) : null;
  }

  function desenharPainel() {
    const m = estado().moedas[selecionada];
    const el = ref('painel');
    if (!m) { el.innerHTML = ''; return; }
    grafico?.destruir();
    grafico = null;
    estrategiaEditada = m.estrategia;
    const refs = referencias(m, m.estrategia);
    el.dataset.moeda = m.simbolo;
    el.innerHTML = `
      <header class="coin-panel__head">
        <div class="coin-panel__title">
          ${monograma(m.simbolo)}
          <div>
            <h2 id="a2-painel">${escapar(m.nome)} <span class="muted">${m.simbolo}/USDT</span></h2>
            <p class="coin-panel__state" data-ref="estado-moeda"></p>
          </div>
        </div>
        <div class="coin-panel__actions">
          <button class="btn btn--secondary btn--sm" type="button" data-acao="alertas">${icon('bell')}<span>Alertas desta moeda</span></button>
          <button class="btn btn--secondary btn--sm" type="button" data-perfil="demo">${icon('zap')}<span>Perfil Demonstração</span></button>
          <button class="btn btn--secondary btn--sm" type="button" data-perfil="padrao">${icon('gauge')}<span>Perfil Padrão</span></button>
        </div>
      </header>

      <div class="preview" data-ref="previa" aria-live="polite"></div>
      <div class="chart-box chart-box--md" data-ref="grafico-canal" hidden><canvas role="img" aria-label="Canal de preço com as zonas de compra e venda"></canvas></div>

      <form class="coin-form" data-ref="form" novalidate>
        <fieldset class="coin-form__group">
          <legend>Estratégia</legend>
          <label class="field coin-form__strategy">
            <span class="field__label">Estratégia desta moeda</span>
            <select class="input" data-ref="estrategia">${opcoesEstrategia(m.estrategia)}</select>
            <span class="pfield__help" data-ref="desc"></span>
          </label>
          <div class="pfields" data-ref="f-estrategia"></div>
        </fieldset>
        <fieldset class="coin-form__group">
          <legend>Parâmetros gerais</legend>
          <div class="pfields" data-ref="f-gerais"></div>
        </fieldset>
        <fieldset class="coin-form__group">
          <legend>Confirmação de sinal</legend>
          <p class="pfield__help">Antes de comprar ou vender, o robô espera o sinal se manter por N velas seguidas, por um tempo ou com volume acima da média.</p>
          <div class="pfields" data-ref="f-confirmacao"></div>
        </fieldset>
        <footer class="coin-form__foot">
          <p class="muted" data-ref="aviso-form">Vale para as próximas ordens. As já executadas e as programadas não mudam.</p>
          <div class="coin-form__btns">
            <button class="btn btn--secondary" type="button" data-acao="descartar" disabled>Descartar</button>
            <button class="btn btn--primary" type="submit" data-acao="salvar" disabled>${icon('check')}<span>Salvar alterações</span></button>
          </div>
        </footer>
      </form>`;

    form.gerais = criarFormulario(el.querySelector('[data-ref="f-gerais"]'), PARAMETROS_GERAIS, m.params, { referencia: refs.params, aoMudar: aoMudarForm });
    form.confirmacao = criarFormulario(el.querySelector('[data-ref="f-confirmacao"]'), PARAMETROS_CONFIRMACAO, m.confirmacao, { referencia: refs.confirmacao, aoMudar: aoMudarForm });
    montarFormEstrategia(m, m.estrategia);
    sujo = false;
    desenharEstadoMoeda();
    desenharPrevia();
    renderIcons();
  }

  function desenharEstadoMoeda() {
    const m = estado().moedas[selecionada];
    const el = ref('painel').querySelector('[data-ref="estado-moeda"]');
    if (!m || !el) return;
    trocarHTML(el, `<span class="engine-pills">${pilulaMotor(m)}</span><span class="muted">${clientesQueOperam(m.simbolo)} clientes operam · perfil ${PERFIS[estado().config.perfil]?.nome ?? ''} nas referências</span>`);
  }

  function aoMudarForm() {
    const partes = [form.estrategia, form.gerais, form.confirmacao].filter(Boolean).map((x) => x.estado());
    const m = estado().moedas[selecionada];
    sujo = partes.some((p) => p.sujo) || estrategiaEditada !== m.estrategia;
    const valido = partes.every((p) => p.valido);
    const painel = ref('painel');
    painel.querySelector('[data-acao="salvar"]').disabled = !sujo || !valido;
    painel.querySelector('[data-acao="descartar"]').disabled = !sujo;
    painel.querySelector('[data-ref="aviso-form"]').textContent = !valido
      ? 'Corrija os campos marcados para salvar.'
      : sujo ? 'Alterações não salvas. Valem para as próximas ordens; as já executadas e as programadas não mudam.'
        : 'Vale para as próximas ordens. As já executadas e as programadas não mudam.';
    desenharPrevia();
  }

  function salvar() {
    const m = estado().moedas[selecionada];
    const g = form.gerais.estado();
    const e = form.estrategia.estado();
    const c = form.confirmacao.estado();
    if (!g.valido || !e.valido || !c.valido) return;
    const params = { ...m.params, ...g.valores, ...e.valores };
    const confirmacao = { ...m.confirmacao, ...c.valores };
    const est = estrategiaPorId(estrategiaEditada);
    const defs = [...est.parametros, ...PARAMETROS_GERAIS];
    const mudancas = defs.filter((d) => params[d.chave] !== m.params[d.chave]).map((d) => `${d.rotulo.toLowerCase()} ${textoValor(d, m.params[d.chave])} → ${textoValor(d, params[d.chave])}`);
    if (estrategiaEditada !== m.estrategia) mudancas.unshift(`estratégia ${estrategiaPorId(m.estrategia)?.nome} → ${est.nome}`);
    if (JSON.stringify(confirmacao) !== JSON.stringify(m.confirmacao)) mudancas.push('confirmação de sinal');
    atualizarMoeda(m.simbolo, { estrategia: estrategiaEditada, params, confirmacao });
    if (mudancas.length) registrarLog(`${m.simbolo}: ${mudancas.slice(0, 4).join(', ')}${mudancas.length > 4 ? ` e mais ${mudancas.length - 4}` : ''}`);
    desenharPainel();
    carregarTabela();
  }

  ref('painel').addEventListener('change', (e) => {
    if (e.target.matches('[data-ref="estrategia"]')) {
      estrategiaEditada = e.target.value;
      montarFormEstrategia(estado().moedas[selecionada], estrategiaEditada);
      aoMudarForm();
      renderIcons();
    }
  });
  ref('painel').addEventListener('submit', (e) => { e.preventDefault(); salvar(); });
  ref('painel').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-acao], [data-perfil]');
    if (!b) return;
    const m = estado().moedas[selecionada];
    if (b.dataset.acao === 'descartar') desenharPainel();
    else if (b.dataset.acao === 'alertas') abrirAlertasDe({ moeda: m.simbolo });
    else if (b.dataset.perfil) {
      const perfil = PERFIS[b.dataset.perfil];
      if (sujo && !(await confirmar({ titulo: `Aplicar o perfil ${perfil.nome} em ${m.simbolo}?`, texto: 'As alterações não salvas deste formulário serão substituídas pelos valores do perfil.', confirmar: 'Aplicar perfil', perigo: false }))) return;
      aplicarPerfil(b.dataset.perfil, m.simbolo);
      desenharPainel();
      carregarTabela();
    }
  });

  alvo.querySelector('.page-head').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-perfil-todas]');
    if (!b) return;
    const perfil = PERFIS[b.dataset.perfilTodas];
    const n = Object.keys(estado().moedas).length;
    const ok = await confirmar({
      titulo: `Aplicar o perfil ${perfil.nome} em todas as moedas?`,
      resumo: `${n} moedas`,
      texto: `Spread, lucro mínimo, parâmetros das estratégias e confirmação de sinal passam para os valores do perfil ${perfil.nome}. Piso, teto e stop continuam como estão. Ordens executadas e programadas não mudam.`,
      confirmar: 'Aplicar em todas',
      perigo: false,
    });
    if (!ok) return;
    aplicarPerfil(b.dataset.perfilTodas, 'todas');
    desenharPainel();
    carregarTabela();
  });

  function selecionar(simbolo, { rolar = false } = {}) {
    if (!estado().moedas[simbolo]) return;
    if (simbolo === selecionada) {
      if (rolar) rolarAte(ref('painel'));
      return;
    }
    selecionada = simbolo;
    gravarConsulta({ moeda: simbolo });
    marcarSelecionada();
    desenharPainel();
    if (rolar) rolarAte(ref('painel'));
  }

  // ---------- Ao vivo ----------
  const mudaram = new Set();
  const vivo = criarAgendador(() => {
    tabela.atualizarCelulas((m) => mudaram.has(m.simbolo), ['cotacao']);
    if (mudaram.has(selecionada)) desenharPrevia();
    mudaram.clear();
  }, 1000);
  ctx.aoDestruir(() => vivo.parar());
  ctx.on('prices:update', ({ moeda }) => { mudaram.add(moeda); vivo.pedir(); });
  ctx.on('candle:close', ({ moeda }) => { if (moeda === selecionada && grafico) { mudaram.add(moeda); vivo.pedir(); } });

  const motor = criarAgendador(() => {
    tabela.atualizarCelulas(() => true, ['motor']);
    desenharEstadoMoeda();
  }, 1000);
  ctx.aoDestruir(() => motor.parar());
  ctx.on('engine:state', () => motor.pedir());
  ctx.on('state:robo', () => motor.pedir());

  // Mudança de fora (alerta que trava a moeda, perfil aplicado em outra aba do código): atualiza a tabela;
  // o formulário só é refeito se não houver edição em andamento.
  const deFora = criarAgendador(() => {
    carregarTabela();
    if (!sujo) desenharPainel();
    else desenharEstadoMoeda();
  }, 0);
  ctx.aoDestruir(() => deFora.parar());
  ctx.on('coin:change', () => deFora.pedir());
  ctx.on('client:change', () => tabela.atualizarCelulas(() => true, ['clientes']));
  ctx.aoDestruir(() => grafico?.destruir());

  gravarConsulta({ moeda: selecionada });
  carregarTabela();
  desenharPainel();
  return ctx;
}
