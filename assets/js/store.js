// Estado central em memória + eventos (pub/sub). Modelo em docs/DADOS_FICTICIOS.md §4.
// As telas só leem daqui e reagem aos eventos; nada guarda estado por conta própria.
// Os números derivados (caixa, posições, relatórios, comissões) vêm de calc/*, nunca são guardados.

import { TAXA_PCT } from './data/coins.js';
import { apurar, fimDoPeriodo, vencimentoDe, estaVencido, DIAS_FECHAMENTO } from './calc/commission.js';
import { estaProgramada } from './calc/positions.js';
import { diaISO, somarDias, paraDiaISO } from './utils/dates.js';
import * as persist from './persist.js';

const ouvintes = new Map();

export const CONFIG_PADRAO = {
  travaGlobal: false,
  perfil: 'demo',          // 'demo' | 'padrao'
  reservaPadrao: 20,
  valorOrdemPadrao: { tipo: 'percent', valor: 3 },
  alertasSom: false,        // som curto nos alertas (canal da regra também precisa estar ligado)
  alertasNavegador: false,  // notificação do navegador (pede permissão ao ligar)
};

const estado = {
  // Interface
  visao: 'cliente',      // 'cliente' | 'admin'
  rota: null,            // { visao, pagina }
  tema: null,            // 'dark' | 'light' | null (segue o sistema)
  robo: 'ligado',        // 'ligado' | 'pausado'
  menuRecolhido: false,
  clienteAtual: 'c01',   // "Visualizando como"

  // Dados
  carregando: true,
  agora: new Date(),
  // fonte: de onde vêm os preços agora; estado: carregando | conectando | aovivo | reconectando | simulado
  mercado: { fonte: null, estado: 'carregando', conectado: false, ultimaMensagem: null, desde: null, historicoFonte: null, historicoEm: null, erro: null },
  moedas: {},
  precos: {},
  clientes: {},
  ordens: [],
  movimentos: [],
  periodos: [],
  alertas: [],
  regrasAlerta: {},
  logAdmin: [],
  estadoMotor: {},
  config: { ...CONFIG_PADRAO },
  estatisticas: null,
};

// Índice id → ordem, refeito ao carregar os dados e mantido pelas mutações.
const indice = new Map();
let seqOrdem = 0;
let seqPeriodo = 0;
let seqAlerta = 0;
const MAX_ALERTAS = 500;

// ---------------------------------------------------------------------------
// Básico
// ---------------------------------------------------------------------------

export function getState() {
  return estado;
}

/** Atualiza o estado e emite `state:<chave>` para cada chave que mudou. */
export function setState(parcial) {
  const mudou = [];
  for (const [chave, valor] of Object.entries(parcial)) {
    if (estado[chave] !== valor) {
      estado[chave] = valor;
      mudou.push(chave);
    }
  }
  for (const chave of mudou) emit(`state:${chave}`, estado[chave]);
  return mudou;
}

/** Assina um evento. Retorna a função que cancela a assinatura. */
export function on(evento, fn) {
  if (!ouvintes.has(evento)) ouvintes.set(evento, new Set());
  ouvintes.get(evento).add(fn);
  return () => ouvintes.get(evento)?.delete(fn);
}

export function emit(evento, dados) {
  const lista = ouvintes.get(evento);
  if (!lista) return;
  for (const fn of [...lista]) {
    try {
      fn(dados);
    } catch (erro) {
      console.error(`[store] erro no ouvinte de "${evento}"`, erro);
    }
  }
}

/** Substitui os dados (gerador ou "Restaurar dados") e emite `data:ready`. */
export function carregarDados(dados) {
  const campos = ['agora', 'moedas', 'precos', 'clientes', 'ordens', 'movimentos', 'periodos',
    'alertas', 'regrasAlerta', 'logAdmin', 'estadoMotor', 'estatisticas'];
  for (const c of campos) if (c in dados) estado[c] = dados[c];
  if (dados.config) estado.config = { ...CONFIG_PADRAO, ...dados.config };

  indice.clear();
  seqOrdem = 0;
  for (const o of estado.ordens) {
    indice.set(o.id, o);
    seqOrdem = Math.max(seqOrdem, Number(o.id.slice(1)) || 0);
  }
  seqPeriodo = estado.periodos.reduce((m, p) => Math.max(m, Number(p.id.slice(1)) || 0), 0);
  seqAlerta = estado.alertas.reduce((m, a) => Math.max(m, Number(String(a.id).slice(1)) || 0), 0);
  if (!estado.clientes[estado.clienteAtual]) estado.clienteAtual = Object.keys(estado.clientes)[0] ?? null;

  estado.carregando = false;
  emit('data:ready', estado);
}

// ---------------------------------------------------------------------------
// Seletores
// ---------------------------------------------------------------------------

export function ordemPorId(id) {
  return indice.get(id) ?? null;
}

function filtrar(o, { clienteId, moedas, lado, status }) {
  if (clienteId && o.clienteId !== clienteId) return false;
  if (lado && o.lado !== lado) return false;
  if (moedas && moedas.length && !moedas.includes(o.moeda)) return false;
  if (status) {
    const lista = Array.isArray(status) ? status : [status];
    if (!lista.includes(o.status)) return false;
  }
  return true;
}

/** Ordens de um cliente. Filtros: status (texto ou lista), lado, moedas. Mais recentes primeiro. */
export function ordensDoCliente(clienteId, filtro = {}) {
  return estado.ordens
    .filter((o) => filtrar(o, { ...filtro, clienteId }))
    .sort((a, b) => (b.executadaEm ?? b.criadaEm) - (a.executadaEm ?? a.criadaEm));
}

/**
 * Ordens executadas entre duas datas (Date ou 'AAAA-MM-DD', inclusive). `clienteId` null = todos.
 * Filtros: lado, moedas. Mais recentes primeiro.
 */
export function ordensNoPeriodo(clienteId, inicio, fim, filtro = {}) {
  const ini = inicio ? paraDiaISO(inicio) : null;
  const fi = fim ? paraDiaISO(fim) : null;
  return estado.ordens
    .filter((o) => {
      if (o.status !== 'executada' || !filtrar(o, { ...filtro, clienteId })) return false;
      const dia = diaISO(o.executadaEm);
      return (!ini || dia >= ini) && (!fi || dia <= fi);
    })
    .sort((a, b) => b.executadaEm - a.executadaEm);
}

/** Ordens aguardando execução (programadas ou aguardando confirmação). Filtros: clienteId, moedas, lado. */
export function ordensProgramadas(filtro = {}) {
  return estado.ordens
    .filter((o) => estaProgramada(o) && filtrar(o, filtro))
    .sort((a, b) => b.criadaEm - a.criadaEm);
}

/** Períodos de apuração do cliente, do mais recente para o mais antigo. */
export function periodosDoCliente(clienteId) {
  return estado.periodos
    .filter((p) => p.clienteId === clienteId)
    .sort((a, b) => (a.inicio < b.inicio ? 1 : -1));
}

export function periodoAberto(clienteId) {
  return estado.periodos.find((p) => p.clienteId === clienteId && p.status === 'aberto') ?? null;
}

// ---------------------------------------------------------------------------
// Mutações (todas emitem eventos)
// ---------------------------------------------------------------------------

export function registrarLog(texto, origem = 'admin', data = new Date()) {
  const item = { data, texto, origem };
  estado.logAdmin.push(item);
  emit('log:new', item);
  return item;
}

/** Cria uma ordem. Campos mínimos: clienteId, moeda, lado, preco, quantidade. */
export function adicionarOrdem(campos) {
  const { clienteId, moeda, lado, preco, quantidade } = campos;
  if (!estado.clientes[clienteId]) throw new Error(`Cliente desconhecido: ${clienteId}`);
  if (!estado.moedas[moeda]) throw new Error(`Moeda desconhecida: ${moeda}`);
  if (lado !== 'compra' && lado !== 'venda') throw new Error(`Lado inválido: ${lado}`);
  if (!(preco > 0) || !(quantidade > 0)) throw new Error('Preço e quantidade precisam ser positivos');
  if (lado === 'venda') {
    const compra = indice.get(campos.compraId);
    if (!compra || compra.lado !== 'compra' || compra.status !== 'executada') throw new Error('Venda sem compra executada de origem');
  }

  const ordem = {
    id: 'o' + String(++seqOrdem).padStart(6, '0'),
    clienteId,
    moeda,
    lado,
    tipo: 'LIMIT',
    status: 'programada',
    preco,
    quantidade,
    total: preco * quantidade,
    taxa: 0,
    estrategia: estado.moedas[moeda].estrategia,
    motivo: '',
    compraId: null,
    alvo: null,
    vendaDinamica: false,
    criadaEm: new Date(),
    executadaEm: null,
    canceladaEm: null,
    canceladaPor: null,
    motivoCancelamento: null,
    origem: 'ao-vivo',
    ...campos,
  };
  ordem.total = ordem.preco * ordem.quantidade;
  estado.ordens.push(ordem);
  indice.set(ordem.id, ordem);
  if (ordem.lado === 'venda' && estaProgramada(ordem)) {
    const compra = indice.get(ordem.compraId);
    if (!ordem.vendaDinamica) compra.alvo = ordem.preco;
  }
  emit('order:new', ordem);
  return ordem;
}

/** Executa uma ordem programada (ou MARKET) ao preço informado. */
export function executarOrdem(id, { preco = null, em = new Date(), motivo = null, tipo = null } = {}) {
  const ordem = indice.get(id);
  if (!ordem) throw new Error(`Ordem não encontrada: ${id}`);
  if (!estaProgramada(ordem)) throw new Error(`Ordem ${id} não está programada (${ordem.status})`);
  if (ordem.lado === 'venda') {
    const compra = indice.get(ordem.compraId);
    const jaVendida = estado.ordens.some((o) => o.compraId === ordem.compraId && o.lado === 'venda' && o.status === 'executada');
    if (!compra || compra.status !== 'executada' || jaVendida) throw new Error(`Venda ${id} sem posição aberta`);
  }
  const taxaPct = estado.moedas[ordem.moeda]?.params?.taxa ?? TAXA_PCT;
  if (preco != null) ordem.preco = preco;
  if (tipo) ordem.tipo = tipo;
  ordem.total = ordem.preco * ordem.quantidade;
  ordem.taxa = (ordem.total * taxaPct) / 100;
  ordem.status = 'executada';
  ordem.executadaEm = new Date(em);
  if (motivo) ordem.motivo = motivo;
  emit('order:executed', ordem);
  return ordem;
}

/**
 * Cancela uma ordem programada. Compra: o valor reservado volta ao disponível.
 * Venda: a posição continua aberta e fica "sem alvo".
 */
export function cancelarOrdem(id, por = 'admin', { motivo = null, status = 'cancelada', em = new Date(), registrar = true } = {}) {
  const ordem = indice.get(id);
  if (!ordem) throw new Error(`Ordem não encontrada: ${id}`);
  if (!estaProgramada(ordem)) return ordem;
  ordem.status = status;
  ordem.canceladaPor = por;
  ordem.canceladaEm = new Date(em);
  ordem.motivoCancelamento = motivo;
  if (ordem.lado === 'venda') {
    const compra = indice.get(ordem.compraId);
    if (compra) compra.alvo = null;
  }
  if (por === 'admin' && registrar) {
    const nome = estado.clientes[ordem.clienteId]?.nome ?? ordem.clienteId;
    registrarLog(`${ordem.lado === 'compra' ? 'Compra' : 'Venda'} programada de ${ordem.moeda} de ${nome} cancelada`, 'admin', ordem.canceladaEm);
  }
  emit('order:canceled', ordem);
  return ordem;
}

/** Define (ou troca) o alvo de venda de uma posição. Nunca abaixo do lucro mínimo da moeda. */
export function definirAlvo(compraId, preco, { por = 'admin' } = {}) {
  const compra = indice.get(compraId);
  if (!compra || compra.lado !== 'compra' || compra.status !== 'executada') throw new Error('Posição não encontrada');
  const vendida = estado.ordens.some((o) => o.compraId === compraId && o.lado === 'venda' && o.status === 'executada');
  if (vendida) throw new Error('Esta posição já foi vendida');
  const lucroMinimo = estado.moedas[compra.moeda]?.params?.lucroMinimo ?? 0;
  const minimo = compra.preco * (1 + lucroMinimo / 100);
  if (!(preco >= minimo)) throw new Error(`O alvo precisa ser de pelo menos ${minimo.toFixed(8).replace(/0+$/, '')} (lucro mínimo de ${lucroMinimo}%)`);

  for (const o of estado.ordens) {
    if (o.compraId === compraId && o.lado === 'venda' && estaProgramada(o)) {
      cancelarOrdem(o.id, 'sistema', { motivo: 'novo alvo definido', status: 'reposicionada' });
    }
  }
  compra.vendaDinamica = false; // alvo fixo substitui a venda dinâmica
  const venda = adicionarOrdem({
    clienteId: compra.clienteId,
    moeda: compra.moeda,
    lado: 'venda',
    preco,
    quantidade: compra.quantidade,
    compraId,
    estrategia: compra.estrategia,
    motivo: por === 'admin' ? 'alvo definido pelo admin' : 'alvo de lucro',
  });
  if (por === 'admin') {
    const nome = estado.clientes[compra.clienteId]?.nome ?? compra.clienteId;
    registrarLog(`Novo alvo de ${compra.moeda} para ${nome}: ${preco}`, 'admin');
  }
  emit('position:target', { compra, venda });
  return venda;
}

/**
 * Liga (ou atualiza) a venda dinâmica de uma posição: sem ordem programada, o robô acompanha o preço e
 * vende por sinal. `alvo` é só o preço de referência mostrado nas telas.
 */
export function definirVendaDinamica(compraId, alvo) {
  const compra = indice.get(compraId);
  if (!compra || compra.lado !== 'compra' || compra.status !== 'executada') return null;
  if (compra.vendaDinamica && compra.alvo === alvo) return compra;
  const nova = !compra.vendaDinamica;
  compra.vendaDinamica = true;
  compra.alvo = alvo;
  emit('position:dynamic', { compra, nova });
  return compra;
}

/** Cancela a venda dinâmica: a posição fica "sem alvo" até o admin definir um novo. */
export function cancelarVendaDinamica(compraId, por = 'admin', { registrar = true } = {}) {
  const compra = indice.get(compraId);
  if (!compra || !compra.vendaDinamica) return compra ?? null;
  compra.vendaDinamica = false;
  compra.alvo = null;
  compra.semAlvoDesde = new Date();
  if (por === 'admin' && registrar) {
    const nome = estado.clientes[compra.clienteId]?.nome ?? compra.clienteId;
    registrarLog(`Venda dinâmica de ${compra.moeda} de ${nome} cancelada`, 'admin');
  }
  emit('position:target', { compra, venda: null });
  return compra;
}

/** Marca uma ordem programada como aguardando confirmação de sinal (ou devolve para programada). */
export function marcarAguardando(id, aguardando = true) {
  const ordem = indice.get(id);
  if (!ordem || !estaProgramada(ordem)) return ordem ?? null;
  const status = aguardando ? 'aguardando-confirmacao' : 'programada';
  if (ordem.status === status) return ordem;
  ordem.status = status;
  emit('order:update', ordem);
  return ordem;
}

/** Atualiza campos de um cliente (status, trava, reserva…) e emite `client:change`. */
export function atualizarCliente(clienteId, parcial, { por = 'admin', registrar = true } = {}) {
  const cliente = estado.clientes[clienteId];
  if (!cliente) throw new Error(`Cliente desconhecido: ${clienteId}`);
  const mudou = Object.keys(parcial).filter((k) => JSON.stringify(cliente[k]) !== JSON.stringify(parcial[k]));
  if (!mudou.length) return cliente;
  Object.assign(cliente, parcial);
  if (registrar && mudou.includes('travaCompras')) {
    registrarLog(cliente.travaCompras ? `Compras de ${cliente.nome} travadas` : `Compras de ${cliente.nome} destravadas`, por);
  }
  emit('client:change', cliente);
  return cliente;
}

/** Guarda o estado do motor de um cliente × moeda (telas A2/A4). Emite só quando o texto muda. */
export function definirEstadoMotor(chave, valor) {
  const anterior = estado.estadoMotor[chave];
  estado.estadoMotor[chave] = valor;
  if (!anterior || anterior.rotulo !== valor.rotulo || JSON.stringify(anterior.pendentes) !== JSON.stringify(valor.pendentes)) {
    emit('engine:state', { chave, estado: valor });
  }
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

/** Registra um alerta disparado e emite `alert:new`. */
export function adicionarAlerta(campos) {
  const alerta = {
    id: 'a' + String(++seqAlerta).padStart(5, '0'),
    regraId: null,
    severidade: 'info',
    titulo: '',
    texto: '',
    moeda: null,
    clienteId: null,
    data: new Date(),
    lido: false,
    lidoCliente: false,
    paraAdmin: true,
    paraCliente: false,
    acaoAutomatica: null,
    origem: 'ao-vivo',
    ...campos,
  };
  estado.alertas.push(alerta);
  if (estado.alertas.length > MAX_ALERTAS) estado.alertas.splice(0, estado.alertas.length - MAX_ALERTAS);
  emit('alert:new', alerta);
  return alerta;
}

/** Marca alertas como lidos para o público ('admin' ou 'cliente'). `ids` null = todos os visíveis. */
export function marcarAlertasLidos(ids = null, publico = 'admin') {
  const campo = publico === 'cliente' ? 'lidoCliente' : 'lido';
  const alvo = ids ? new Set(ids) : null;
  const marcados = [];
  for (const a of estado.alertas) {
    if (a[campo] || (alvo && !alvo.has(a.id))) continue;
    a[campo] = true;
    marcados.push(a);
  }
  if (marcados.length) emit('alert:read', { publico, alertas: marcados });
  return marcados;
}

/** Atualiza uma regra de alerta (liga/desliga, limites, canais, ação). Fica salva no navegador. */
export function atualizarRegraAlerta(id, parcial) {
  const regra = estado.regrasAlerta[id];
  if (!regra) throw new Error(`Regra desconhecida: ${id}`);
  Object.assign(regra, parcial);
  const salvas = persist.get('regrasAlerta') ?? {};
  salvas[id] = { ...(salvas[id] ?? {}), ...parcial };
  persist.set('regrasAlerta', salvas);
  emit('alert-rule:change', regra);
  return regra;
}

/**
 * Atualiza os campos de uma moeda (ligar/desligar, trava, estratégia, parâmetros) e emite `coin:change`.
 * Ligar ou desligar uma moeda faz o feed reabrir a conexão ao vivo com as moedas ativas.
 */
export function atualizarMoeda(simbolo, parcial) {
  const moeda = estado.moedas[simbolo];
  if (!moeda) throw new Error(`Moeda desconhecida: ${simbolo}`);
  const mudou = Object.keys(parcial).filter((k) => JSON.stringify(moeda[k]) !== JSON.stringify(parcial[k]));
  if (!mudou.length) return moeda;
  Object.assign(moeda, parcial);
  if (mudou.includes('ativa')) registrarLog(`${moeda.nome} (${simbolo}) ${moeda.ativa ? 'ligada' : 'desligada'}`);
  emit('coin:change', { moeda, mudou });
  return moeda;
}

/** Atualiza a configuração geral (trava global, perfil, padrões). Fica salva no navegador. */
export function atualizarConfig(parcial) {
  const anterior = estado.config;
  estado.config = { ...anterior, ...parcial };
  const mudou = Object.keys(parcial).filter((k) => JSON.stringify(anterior[k]) !== JSON.stringify(estado.config[k]));
  if (!mudou.length) return estado.config;
  persist.set('config', estado.config);
  if (mudou.includes('travaGlobal')) {
    registrarLog(estado.config.travaGlobal ? 'Compras travadas para todos os clientes' : 'Trava global de compras retirada');
  }
  emit('config:change', { config: estado.config, mudou });
  return estado.config;
}

/**
 * Apura um período aberto: congela resultado e comissão e abre o período seguinte
 * (aplicando a troca de dia de fechamento, se o cliente pediu).
 */
export function apurarPeriodo(periodoId, agora = new Date()) {
  const p = estado.periodos.find((x) => x.id === periodoId);
  if (!p) throw new Error(`Período não encontrado: ${periodoId}`);
  if (p.status !== 'aberto') throw new Error('Este período já foi apurado');
  const cliente = estado.clientes[p.clienteId];
  Object.assign(p, apurar(p, estado.ordens, cliente, agora));

  if (cliente.status !== 'inativo') {
    let dia = cliente.diaFechamento;
    if (cliente.diaFechamentoProximo) {
      dia = cliente.diaFechamentoProximo;
      cliente.diaFechamento = dia;
      cliente.diaFechamentoProximo = null;
    }
    const inicio = somarDias(p.fim, 1);
    const fim = fimDoPeriodo(inicio, dia);
    estado.periodos.push({
      id: 'p' + String(++seqPeriodo).padStart(4, '0'),
      clienteId: cliente.id, inicio, fim, diaFechamento: dia,
      status: 'aberto', resultado: null, comissaoPct: cliente.comissaoPct, comissao: null,
      vencimento: vencimentoDe(fim, cliente.prazoPagamentoDias), apuradoEm: null, pagoEm: null, operacoes: null,
    });
  }
  registrarLog(`Período ${p.inicio} a ${p.fim} de ${cliente.nome} apurado: comissão ${p.comissao.toFixed(2)} USDT`, 'automatico', p.apuradoEm);
  emit('commission:closed', p);
  return p;
}

/**
 * Troca o dia de fechamento (10, 20 ou 30). Vale a partir do próximo período: o período aberto
 * mantém as datas e o novo dia é aplicado quando ele for apurado (apurarPeriodo).
 * Escolher de novo o dia atual desfaz a troca pendente.
 */
export function definirDiaFechamento(clienteId, dia, por = 'cliente') {
  const cliente = estado.clientes[clienteId];
  if (!cliente) throw new Error(`Cliente desconhecido: ${clienteId}`);
  if (!DIAS_FECHAMENTO.includes(dia)) throw new Error('O dia de fechamento precisa ser 10, 20 ou 30');
  const proximo = dia === cliente.diaFechamento ? null : dia;
  if (cliente.diaFechamentoProximo === proximo) return cliente;
  cliente.diaFechamentoProximo = proximo;
  const quem = por === 'cliente' ? cliente.nome : 'Admin';
  registrarLog(
    proximo
      ? `${quem}: fechamento de ${cliente.nome} passa para o dia ${dia} a partir do próximo período`
      : `${quem}: fechamento de ${cliente.nome} continua no dia ${cliente.diaFechamento}`,
    por,
  );
  emit('client:change', cliente);
  return cliente;
}

/**
 * "Apurar agora" (admin): fecha o período aberto do cliente em ontem e abre o seguinte a partir de hoje,
 * para nenhuma venda ficar sem período. Se o período aberto começou hoje, não há o que apurar.
 */
export function apurarAgora(clienteId, agora = new Date()) {
  const p = periodoAberto(clienteId);
  if (!p) throw new Error('Este cliente não tem período em aberto');
  const ontem = somarDias(diaISO(agora), -1);
  if (p.inicio > ontem) throw new Error('O período em aberto começou hoje: ainda não há dias fechados para apurar');
  const cliente = estado.clientes[clienteId];
  if (p.fim > ontem) p.fim = ontem;
  registrarLog(`Apuração manual do período de ${cliente.nome} (fechado em ${ontem.split('-').reverse().join('/')})`, 'admin', agora);
  return apurarPeriodo(p.id, agora);
}

/**
 * "Forçar vencimento" (demonstração): antecipa o vencimento de um período apurado para ontem e roda a
 * verificação, que marca o período como vencido e suspende as compras do cliente.
 */
export function forcarVencimento(periodoId, agora = new Date()) {
  const p = estado.periodos.find((x) => x.id === periodoId);
  if (!p) throw new Error(`Período não encontrado: ${periodoId}`);
  if (p.status !== 'apurado') throw new Error('Só períodos apurados e não pagos podem vencer');
  p.vencimento = somarDias(diaISO(agora), -1);
  registrarLog(`Vencimento da comissão de ${estado.clientes[p.clienteId].nome} antecipado (demonstração)`, 'admin', agora);
  verificarVencimentos(agora);
  return p;
}

/** Registra um depósito ou saque no caixa do cliente e emite `cash:new`. */
export function registrarMovimento(clienteId, tipo, valor, { observacao = '', em = new Date(), por = 'admin' } = {}) {
  const cliente = estado.clientes[clienteId];
  if (!cliente) throw new Error(`Cliente desconhecido: ${clienteId}`);
  if (tipo !== 'deposito' && tipo !== 'saque') throw new Error('Tipo de movimentação inválido');
  if (!(valor > 0)) throw new Error('O valor precisa ser maior que zero');
  const seq = estado.movimentos.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, '')) || 0), 0);
  const mov = { id: 'm' + String(seq + 1).padStart(4, '0'), clienteId, tipo, valor, data: new Date(em), observacao, origem: 'ao-vivo' };
  estado.movimentos.push(mov);
  const texto = tipo === 'deposito' ? 'Depósito' : 'Saque';
  registrarLog(`${texto} de ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT registrado para ${cliente.nome}`, por, mov.data);
  emit('cash:new', mov);
  return mov;
}

/** Marca uma comissão como paga. Sem outro período vencido, a trava por comissão sai sozinha. */
export function marcarPago(periodoId, em = new Date()) {
  const p = estado.periodos.find((x) => x.id === periodoId);
  if (!p) throw new Error(`Período não encontrado: ${periodoId}`);
  if (p.status !== 'apurado' && p.status !== 'vencido') throw new Error('Só períodos apurados ou vencidos podem ser pagos');
  p.status = 'pago';
  p.pagoEm = new Date(em);
  const cliente = estado.clientes[p.clienteId];
  const outroVencido = estado.periodos.some((x) => x.clienteId === cliente.id && x.status === 'vencido');
  if (cliente.travaPorComissao && !outroVencido) {
    cliente.travaPorComissao = false;
    registrarLog(`Comissão de ${cliente.nome} paga: compras liberadas`, 'automatico', p.pagoEm);
    emit('client:change', cliente);
  } else {
    registrarLog(`Comissão do período ${p.inicio} a ${p.fim} de ${cliente.nome} marcada como paga`, 'admin', p.pagoEm);
  }
  emit('commission:paid', p);
  return p;
}

/** Passa para 'vencido' os períodos apurados fora do prazo e trava as compras do cliente. */
export function verificarVencimentos(agora = new Date()) {
  const vencidos = [];
  for (const p of estado.periodos) {
    if (!estaVencido(p, agora)) continue;
    p.status = 'vencido';
    const cliente = estado.clientes[p.clienteId];
    if (!cliente.travaPorComissao) {
      cliente.travaPorComissao = true;
      registrarLog(`Compras de ${cliente.nome} travadas automaticamente: comissão vencida`, 'automatico', agora);
      emit('client:change', cliente);
    }
    vencidos.push(p);
    emit('commission:overdue', p);
  }
  return vencidos;
}

