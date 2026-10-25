// Estado central em memória + eventos (pub/sub). Modelo em docs/DADOS_FICTICIOS.md §4.
// As telas só leem daqui e reagem aos eventos; nada guarda estado por conta própria.
// Os números derivados (caixa, posições, relatórios, comissões) vêm de calc/*, nunca são guardados.

import { TAXA_PCT } from './data/coins.js';
import { apurar, fimDoPeriodo, vencimentoDe, estaVencido } from './calc/commission.js';
import { estaProgramada } from './calc/positions.js';
import { diaISO, somarDias, paraDiaISO } from './utils/dates.js';
import * as persist from './persist.js';

const ouvintes = new Map();

export const CONFIG_PADRAO = {
  travaGlobal: false,
  perfil: 'demo',          // 'demo' | 'padrao'
  reservaPadrao: 20,
  valorOrdemPadrao: { tipo: 'percent', valor: 3 },
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
export function executarOrdem(id, { preco = null, em = new Date(), motivo = null } = {}) {
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
export function cancelarOrdem(id, por = 'admin', { motivo = null, status = 'cancelada', em = new Date() } = {}) {
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
  if (por === 'admin') {
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

