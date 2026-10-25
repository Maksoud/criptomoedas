// Motor simulado (docs/ESTRATEGIAS.md, PLANO_MVP.md §7).
//
// A cada atualização de preço (e a cada vela fechada da série da moeda), para cada cliente que opera
// a moeda (ou ainda tem posições ou ordens nela):
//   1. ordens LIMIT atingidas viram sinais (compra: preço ≤ ordem; venda: preço ≥ ordem);
//   2. posições abaixo do stop de perda viram sinais de venda (stop);
//   3. a estratégia da moeda é avaliada (função pura) e devolve sinais, ações e eventos;
//   4. sinais de compra passam por `podeComprar`; sinais de venda, pelo lucro mínimo (menos o stop);
//   5. tudo passa pela confirmação de sinal; os confirmados são executados no store;
//   6. as ações (programar, cancelar, alvo dinâmico) são aplicadas e os eventos vão para os alertas.
// Robô pausado: nada é avaliado nem executado (as cotações continuam).

import * as store from '../store.js';
import { getState, on, emit } from '../store.js';
import { resumoBanca, valorDaOrdem } from '../calc/bank.js';
import { estaProgramada, posicoesAbertas } from '../calc/positions.js';
import { truncar } from '../utils/env.js';
import { verificarCompra } from './checks.js';
import { criarConfirmacao } from './confirm.js';
import { estrategiaPorId } from './strategies/index.js';
import { serieDaMoeda, duracaoDaSerie, paramsDoPerfil, confirmacaoDoPerfil, PERFIS, PARAMETROS_GERAIS } from './params.js';

const confirmacao = criarConfirmacao();
const estados = new Map(); // 'c01:BTC' → { estrategia, estado }
let iniciado = false;

export const chaveMotor = (clienteId, simbolo) => `${clienteId}:${simbolo}`;

const lucroMinimoDe = (compra, params) => compra.preco * (1 + (Number(params.lucroMinimo) || 0) / 100);

/** Arredonda para cima nas casas da moeda (alvo nunca abaixo do mínimo por arredondamento). */
function arredParaCima(preco, moeda) {
  const f = 10 ** (moeda.precisao?.preco ?? 8);
  return Math.ceil(preco * f - 1e-9) / f;
}

function velasDa(simbolo, serie) {
  return getState().precos[simbolo]?.[serie === '15s' ? 'velas15s' : 'velas1m'] ?? [];
}

/** Uma passada pelas ordens da moeda: ordens programadas e posições abertas de cada cliente. */
function fotografar(simbolo) {
  const vendidas = new Set();
  const vendaProgramada = new Map();
  const porCliente = new Map();
  const grupo = (id) => {
    if (!porCliente.has(id)) porCliente.set(id, { programadas: [], compras: [], posicoes: [] });
    return porCliente.get(id);
  };
  for (const o of getState().ordens) {
    if (o.moeda !== simbolo) continue;
    if (o.lado === 'venda') {
      if (o.status === 'executada') vendidas.add(o.compraId);
      else if (estaProgramada(o)) {
        vendaProgramada.set(o.compraId, o);
        grupo(o.clienteId).programadas.push(o);
      }
    } else if (o.status === 'executada') grupo(o.clienteId).compras.push(o);
    else if (estaProgramada(o)) grupo(o.clienteId).programadas.push(o);
  }
  for (const g of porCliente.values()) {
    for (const c of g.compras) {
      if (vendidas.has(c.id)) continue;
      const venda = vendaProgramada.get(c.id) ?? null;
      g.posicoes.push({
        compra: c, clienteId: c.clienteId, moeda: simbolo, quantidade: c.quantidade, precoCompra: c.preco, custo: c.total,
        venda, alvo: venda ? venda.preco : (c.vendaDinamica ? c.alvo : null), semAlvo: !venda && !c.vendaDinamica,
      });
    }
    delete g.compras;
  }
  return porCliente;
}

/** Venda programada logo depois de uma compra executada, conforme a estratégia que comprou. */
function programarVendaApos(compra, moeda) {
  const params = moeda.params;
  const est = estrategiaPorId(compra.estrategia) ?? estrategiaPorId(moeda.estrategia);
  const plano = est?.aposCompra?.({ compra, params, moeda }) ?? { tipo: 'limite', preco: lucroMinimoDe(compra, params) };
  if (plano.tipo === 'dinamica') {
    store.definirVendaDinamica(compra.id, Math.max(plano.alvo, arredParaCima(lucroMinimoDe(compra, params), moeda)));
    return null;
  }
  const preco = Math.max(plano.preco, arredParaCima(lucroMinimoDe(compra, params), moeda));
  return store.adicionarOrdem({
    clienteId: compra.clienteId, moeda: compra.moeda, lado: 'venda', preco, quantidade: compra.quantidade,
    compraId: compra.id, estrategia: compra.estrategia, motivo: plano.motivo ?? 'alvo de lucro',
  });
}

function rotuloPendente(p) {
  const tipo = p.stop ? 'Stop' : p.tipo === 'compra' ? 'Compra' : 'Venda';
  return p.modo === 'tempo'
    ? `${tipo} aguardando confirmação ${p.contagem}/${p.n} s`
    : `${tipo} aguardando confirmação ${p.contagem}/${p.n}`;
}

// ---------------------------------------------------------------------------
// Avaliação
// ---------------------------------------------------------------------------

function avaliarCliente({ cliente, moeda, g, preco, vela, agora }) {
  const s = getState();
  const simbolo = moeda.simbolo;
  const chave = chaveMotor(cliente.id, simbolo);
  const est = estrategiaPorId(moeda.estrategia);
  const params = moeda.params;
  const cfg = moeda.confirmacao;
  const serie = serieDaMoeda(moeda);
  const velas = velasDa(simbolo, serie);
  const em = new Date(agora);

  let banca = null;
  const bancaAtual = () => (banca ??= resumoBanca(cliente, s.ordens, s.movimentos, s.precos));
  const mudouBanca = () => { banca = null; };
  let ocupadas = g.posicoes.length + g.programadas.filter((o) => o.lado === 'compra').length;
  const valorPadrao = () => valorDaOrdem(cliente, bancaAtual().caixa);
  const verificar = ({ valor = null, preco: p = preco, pular = [] } = {}) => verificarCompra({
    moeda, cliente, config: s.config, robo: s.robo, banca: valor != null ? bancaAtual() : null, ocupadas, preco: p, valor, pular,
  });

  const eventos = [];
  const reserva = (v) => eventos.push({ alerta: 'reserva-banca', dados: { valor: v.valor, disponivel: v.disponivel } });
  const sinais = [];
  const temVenda = (compraId) => sinais.some((x) => x.tipo === 'venda' && x.compraId === compraId);

  // 1. Ordens LIMIT atingidas.
  for (const o of g.programadas) {
    const atingida = o.lado === 'compra' ? preco <= o.preco : preco >= o.preco;
    if (!atingida) continue;
    if (o.lado === 'compra' && !verificar({ preco: o.preco, pular: [4, 5] }).ok) continue;
    sinais.push({
      tipo: o.lado, chave: `ordem:${o.id}`, ordemId: o.id, limite: true, compraId: o.compraId,
      motivo: o.lado === 'compra' ? (o.motivo || 'compra programada') : 'alvo atingido',
    });
  }

  // 2. Stop de perda (aplicado pelo motor em todas as estratégias).
  const stop = Number(params.stopPerda);
  if (stop > 0) {
    for (const p of g.posicoes) {
      if (temVenda(p.compra.id)) continue;
      if (preco <= p.compra.preco * (1 - stop / 100)) {
        sinais.push({ tipo: 'venda', chave: `stop:${p.compra.id}`, compraId: p.compra.id, stop: true, motivo: 'stop de perda' });
      }
    }
  }

  // 3. Estratégia.
  const guardado = estados.get(chave);
  let estado = est && guardado?.estrategia === est.id ? guardado.estado : est?.estadoInicial() ?? {};
  const comprasProgramadas = g.programadas.filter((o) => o.lado === 'compra');
  let r = { estado, sinais: [], acoes: [], eventos: [] };
  if (est && cliente.status !== 'inativo') {
    r = est.avaliar({
      tipo: vela ? 'vela' : 'preco', preco, vela, velas, agora, estado, params, moeda,
      posicoes: g.posicoes, ordensProgramadas: comprasProgramadas, valorOrdem: valorPadrao(), duracaoVela: duracaoDaSerie(serie),
      podeComprar: () => {
        const v = verificar({ valor: valorPadrao() });
        if (v.regra === 'reserva') reserva(v);
        return v;
      },
    });
    estado = r.estado;
    eventos.push(...(r.eventos ?? []));
  }

  // 4. Filtros do motor: podeComprar e lucro mínimo.
  for (const sn of r.sinais ?? []) {
    if (sn.tipo === 'compra') {
      const valor = sn.valor ?? valorPadrao();
      const v = verificar({ valor });
      if (!v.ok) { if (v.regra === 'reserva') reserva(v); continue; }
      sinais.push({ ...sn, valor });
      continue;
    }
    const pos = g.posicoes.find((p) => p.compra.id === sn.compraId);
    if (!pos || temVenda(sn.compraId)) continue;
    const minimo = lucroMinimoDe(pos.compra, params);
    if (!sn.stop && preco < minimo) {
      eventos.push({ alerta: 'venda-bloqueada', dados: { compraId: sn.compraId, preco, minimo, motivo: sn.motivo } });
      continue;
    }
    sinais.push(sn);
  }

  // 5. Confirmação.
  const { confirmados, pendentes, cancelados } = confirmacao.processar({ grupo: chave, sinais, cfg, agora, vela, velas });
  for (const c of cancelados) if (c.ordemId) store.marcarAguardando(c.ordemId, false);
  for (const p of pendentes) if (p.ordemId) store.marcarAguardando(p.ordemId, true);

  const vendidasAgora = new Set();
  const ordenados = [...confirmados].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'venda' ? -1 : 1));
  for (const sn of ordenados) {
    if (sn.limite) {
      const o = store.ordemPorId(sn.ordemId);
      if (!o || !estaProgramada(o)) continue;
      if (o.lado === 'compra') {
        if (!verificar({ preco: o.preco, pular: [4, 5] }).ok) { store.marcarAguardando(o.id, false); continue; }
        store.executarOrdem(o.id, { preco: o.preco, em });
        programarVendaApos(o, moeda);
      } else {
        if (vendidasAgora.has(o.compraId)) continue;
        store.executarOrdem(o.id, { preco: o.preco, em, motivo: 'alvo atingido' });
        vendidasAgora.add(o.compraId);
        ocupadas--;
      }
      mudouBanca();
      continue;
    }

    if (sn.tipo === 'compra') {
      const valor = sn.valor ?? valorPadrao();
      const v = verificar({ valor });
      if (!v.ok) { if (v.regra === 'reserva') reserva(v); continue; }
      const prec = moeda.precisao ?? {};
      const quantidade = truncar(valor / preco, prec.quantidade ?? 6);
      if (!(quantidade > 0) || quantidade * preco < (prec.minimo ?? 0)) continue;
      const compra = store.adicionarOrdem({
        clienteId: cliente.id, moeda: simbolo, lado: 'compra', tipo: 'MARKET', preco, quantidade,
        motivo: sn.motivo, estrategia: est?.id ?? moeda.estrategia, criadaEm: em,
      });
      store.executarOrdem(compra.id, { preco, em });
      programarVendaApos(compra, moeda);
      ocupadas++;
      mudouBanca();
      if (est?.aoExecutar) estado = est.aoExecutar({ estado, sinal: sn, ordem: compra, params, preco, agora });
      continue;
    }

    // Venda por sinal (dinâmica, rompimento) ou stop.
    const compra = store.ordemPorId(sn.compraId);
    if (!compra || compra.status !== 'executada' || vendidasAgora.has(compra.id)) continue;
    const jaVendida = g.posicoes.every((p) => p.compra.id !== compra.id);
    if (jaVendida) continue;
    if (!sn.stop && preco < lucroMinimoDe(compra, params)) continue;
    const motivo = sn.stop ? (sn.motivo === 'stop de perda' ? 'stop de perda' : `stop: ${sn.motivo}`) : sn.motivo;
    for (const o of g.programadas) {
      if (o.lado === 'venda' && o.compraId === compra.id && estaProgramada(o)) {
        store.cancelarOrdem(o.id, 'sistema', { motivo: sn.stop ? 'stop de perda' : 'vendida por sinal', em });
      }
    }
    const venda = store.adicionarOrdem({
      clienteId: cliente.id, moeda: simbolo, lado: 'venda', tipo: 'MARKET', preco, quantidade: compra.quantidade,
      compraId: compra.id, motivo, estrategia: compra.estrategia, vendaDinamica: compra.vendaDinamica, criadaEm: em,
    });
    store.executarOrdem(venda.id, { preco, em, motivo });
    vendidasAgora.add(compra.id);
    ocupadas--;
    mudouBanca();
    if (est?.aoExecutar) estado = est.aoExecutar({ estado, sinal: sn, ordem: venda, params, preco, agora });
  }

  // 6. Ações imediatas.
  let semEspaco = false;
  for (const a of r.acoes ?? []) {
    if (a.tipo === 'cancelar') {
      const o = store.ordemPorId(a.ordemId);
      if (!o || !estaProgramada(o)) continue;
      store.cancelarOrdem(o.id, 'sistema', { motivo: a.motivo ?? null, status: a.status ?? 'cancelada', em });
      if (o.lado === 'compra') ocupadas--;
      mudouBanca();
    } else if (a.tipo === 'programar' && a.lado === 'compra') {
      if (semEspaco) continue;
      const valor = a.valor ?? valorPadrao();
      const v = verificar({ valor, preco: a.preco });
      if (!v.ok) {
        semEspaco = true;
        if (v.regra === 'reserva') reserva(v);
        continue;
      }
      const prec = moeda.precisao ?? {};
      const quantidade = truncar(valor / a.preco, prec.quantidade ?? 6);
      if (!(quantidade > 0) || quantidade * a.preco < (prec.minimo ?? 0)) continue;
      store.adicionarOrdem({
        clienteId: cliente.id, moeda: simbolo, lado: 'compra', tipo: 'LIMIT', preco: a.preco, quantidade,
        motivo: a.motivo ?? '', estrategia: est?.id ?? moeda.estrategia, criadaEm: em,
      });
      ocupadas++;
      mudouBanca();
    } else if (a.tipo === 'alvo-dinamico') {
      const c = store.ordemPorId(a.compraId);
      if (!c || !c.vendaDinamica || vendidasAgora.has(c.id)) continue;
      if (c.alvo !== a.alvo) store.definirVendaDinamica(c.id, a.alvo);
    }
  }

  // 7. Estado e eventos.
  estados.set(chave, { estrategia: est?.id ?? null, estado });
  const rotulo = pendentes.length
    ? rotuloPendente(pendentes[0])
    : est?.rotulo?.(estado, { posicoes: g.posicoes, ordensProgramadas: comprasProgramadas, params }) ?? '—';
  store.definirEstadoMotor(chave, {
    clienteId: cliente.id, moeda: simbolo, estrategia: est?.id ?? null, fase: estado.fase ?? null,
    rotulo, pendentes, atualizadoEm: em,
  });
  for (const ev of eventos) emit('engine:event', { ...ev, clienteId: cliente.id, moeda: simbolo, em });
}

/**
 * Avalia uma moeda para todos os clientes. Chamado pelo feed (via eventos) e direto pelos testes.
 * @param vela vela recém-fechada da série da moeda (avaliação de fechamento) ou null
 */
export function avaliarMoeda(simbolo, { preco, vela = null, agora = Date.now() } = {}) {
  const s = getState();
  if (s.carregando || s.robo !== 'ligado') return;
  const moeda = s.moedas[simbolo];
  if (!moeda?.ativa || !(preco > 0)) return;
  const foto = fotografar(simbolo);
  for (const cliente of Object.values(s.clientes)) {
    const g = foto.get(cliente.id);
    const opera = cliente.status !== 'inativo' && cliente.moedas.includes(simbolo);
    if (!opera && !g) continue;
    try {
      avaliarCliente({ cliente, moeda, g: g ?? { programadas: [], posicoes: [] }, preco, vela, agora });
    } catch (erro) {
      console.error(`[motor] erro ao avaliar ${cliente.id} × ${simbolo}`, erro);
    }
  }
}

// ---------------------------------------------------------------------------
// Verificação pública, sincronização e ciclo de vida
// ---------------------------------------------------------------------------

/** `podeComprar(cliente, moeda)` com os dados do store (as 6 verificações de §1.1). */
export function podeComprar(clienteId, simbolo, { valor = null, preco = null } = {}) {
  const s = getState();
  const cliente = s.clientes[clienteId];
  const moeda = s.moedas[simbolo];
  if (!cliente || !moeda) return { ok: false, regra: 'desconhecido', motivo: 'Cliente ou moeda desconhecido' };
  const banca = resumoBanca(cliente, s.ordens, s.movimentos, s.precos);
  const ocupadas = posicoesAbertas(s.ordens, { clienteId, moeda: simbolo }).length
    + s.ordens.filter((o) => o.clienteId === clienteId && o.moeda === simbolo && o.lado === 'compra' && estaProgramada(o)).length;
  return verificarCompra({
    moeda, cliente, config: s.config, robo: s.robo, banca, ocupadas,
    preco: preco ?? s.precos[simbolo]?.atual ?? null,
    valor: valor ?? valorDaOrdem(cliente, banca.caixa),
  });
}

/** Esquece confirmações pendentes (dos grupos que passam no filtro) e devolve as ordens LIMIT para "programada". */
function limparPendentes(filtro = () => true) {
  for (const g of confirmacao.grupos()) {
    if (!filtro(g)) continue;
    for (const { sinal } of confirmacao.limpar(g)) if (sinal.ordemId) store.marcarAguardando(sinal.ordemId, false);
  }
}

/**
 * Deixa a moeda coerente com a estratégia atual: compras programadas de outra estratégia são canceladas
 * e posições com venda dinâmica de outra estratégia ganham um alvo fixo (nunca abaixo do lucro mínimo).
 */
export function sincronizarMoeda(simbolo, { motivo = 'estratégia da moeda trocada' } = {}) {
  const s = getState();
  const moeda = s.moedas[simbolo];
  if (!moeda) return;
  for (const o of [...s.ordens]) {
    if (o.moeda === simbolo && o.lado === 'compra' && estaProgramada(o) && o.estrategia !== moeda.estrategia) {
      store.cancelarOrdem(o.id, 'sistema', { motivo });
    }
  }
  for (const p of posicoesAbertas(s.ordens, { moeda: simbolo })) {
    const c = p.compra;
    if (!c.vendaDinamica || p.venda || c.estrategia === moeda.estrategia) continue;
    const alvo = arredParaCima(Math.max(c.alvo ?? 0, lucroMinimoDe(c, moeda.params)), moeda);
    store.definirAlvo(c.id, alvo, { por: 'sistema' });
  }
  for (const c of Object.keys(s.clientes)) estados.delete(chaveMotor(c, simbolo));
  limparPendentes((g) => g.endsWith(`:${simbolo}`));
}

/** Volta o motor ao zero (dados carregados ou restaurados). */
export function reiniciarMotor() {
  confirmacao.limpar();
  estados.clear();
  const s = getState();
  s.estadoMotor = {};
  for (const simbolo of Object.keys(s.moedas)) sincronizarMoeda(simbolo, { motivo: 'estratégia da moeda definida no perfil' });
}

export function iniciarMotor() {
  if (iniciado) return;
  iniciado = true;
  on('data:ready', reiniciarMotor);
  on('prices:update', ({ moeda, atual }) => avaliarMoeda(moeda, { preco: atual }));
  on('candle:close', ({ moeda, intervalo, vela }) => {
    const m = getState().moedas[moeda];
    if (m && intervalo === serieDaMoeda(m)) avaliarMoeda(moeda, { preco: vela.fechamento, vela, agora: Math.max(Date.now(), vela.t) });
  });
  on('state:robo', (robo) => { if (robo !== 'ligado') limparPendentes(); });
  on('coin:change', ({ moeda, mudou }) => {
    if (mudou.includes('estrategia')) sincronizarMoeda(moeda.simbolo);
    else if (mudou.includes('confirmacao')) limparPendentes((g) => g.endsWith(`:${moeda.simbolo}`));
  });
}

/**
 * Aplica um perfil ('demo' ou 'padrao') a uma moeda, a uma lista ou a todas. O perfil só preenche os
 * campos: piso, teto e stop (opcionais, sem valor de perfil) continuam como estavam. Vale para as
 * próximas ordens; as já executadas e as programadas não mudam.
 */
export function aplicarPerfil(perfil, simbolos = 'todas', { por = 'admin' } = {}) {
  if (!PERFIS[perfil]) throw new Error(`Perfil desconhecido: ${perfil}`);
  const s = getState();
  const lista = simbolos === 'todas' ? Object.keys(s.moedas) : [].concat(simbolos);
  const opcionais = PARAMETROS_GERAIS.filter((p) => p.opcional).map((p) => p.chave);
  for (const simbolo of lista) {
    const moeda = s.moedas[simbolo];
    if (!moeda) continue;
    const params = paramsDoPerfil(perfil);
    for (const k of opcionais) params[k] = moeda.params?.[k] ?? null;
    store.atualizarMoeda(simbolo, { params, confirmacao: confirmacaoDoPerfil(perfil, moeda.estrategia) });
  }
  const nome = PERFIS[perfil].nome;
  if (simbolos === 'todas') store.atualizarConfig({ perfil });
  store.registrarLog(`Perfil ${nome} aplicado ${simbolos === 'todas' ? 'a todas as moedas' : `a ${lista.join(', ')}`}`, por);
}

/** Estado interno da estratégia de um cliente × moeda (para inspecionar pelo console e nos testes). */
export function estadoInterno(clienteId, simbolo) {
  return estados.get(chaveMotor(clienteId, simbolo))?.estado ?? null;
}
