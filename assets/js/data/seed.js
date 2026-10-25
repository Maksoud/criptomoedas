// Gerador do histórico fictício (docs/DADOS_FICTICIOS.md §6).
//
// Sobre as velas de 4 h reais (ou simuladas), roda a estratégia B — spread fixo com venda programada,
// perfil Padrão — para cada cliente × moeda, respeitando caixa e reserva de banca. Assim o histórico
// segue as mesmas regras do robô e sobram posições abertas e ordens programadas no fim.
//
// Tudo que é fictício usa o PRNG com semente (utils/random.js). Mesmo histórico de preços + mesma
// semente + mesmo dia = exatamente os mesmos dados.

import { MOEDAS, TAXA_PCT } from './coins.js';
import { parametrosDoPerfil } from '../engine/params.js';
import { montarClientes } from './clients.js';
import { criarRandom, SEMENTE_PADRAO } from '../utils/random.js';
import { diaISO, somarDias, inicioDoDia, fimDoDia, diasEntre, MS_HORA, MS_MIN, MS_DIA } from '../utils/dates.js';
import { arredondar, truncar } from '../utils/env.js';
import { valorDaOrdem } from '../calc/bank.js';
import { datasDosPeriodos, vencimentoDe, calcularComissao, resultadoDoPeriodo } from '../calc/commission.js';
import { serieDiaria } from '../calc/equity.js';

const DUR_4H = 4 * MS_HORA;

// Estratégia B com o perfil Padrão (docs/ESTRATEGIAS.md §3). O histórico usa sempre estes valores.
const HIST = { spread: 2, lucro: 3, degraus: 3, maxPosicoes: 5, taxa: TAXA_PCT };

/**
 * @param historico { fonte, baixadoEm, moedas: { BTC: { velas4h, velas15m, precisao } } }
 * @param ticker    { BTCUSDT: { atual, abertura, variacaoPct } } | null (só para os preços atuais)
 * @param agora     instante de referência (padrão: quando o histórico foi baixado)
 * @param config    { perfil } — perfil aplicado aos parâmetros ao vivo das moedas
 */
export function gerarDados({ historico, ticker = null, agora = null, semente = SEMENTE_PADRAO, config = {} }) {
  const inicioGeracao = typeof performance !== 'undefined' ? performance.now() : Date.now();
  agora = agora ? new Date(agora) : new Date(historico.baixadoEm);
  const rnd = criarRandom(semente);
  const hoje = diaISO(agora);
  const limite = agora.getTime() - MS_MIN; // nenhuma operação histórica depois disso
  const clientes = montarClientes(hoje);
  const perfil = config.perfil ?? 'demo';

  // ---------- Moedas ----------
  const moedas = {};
  for (const m of MOEDAS) {
    const h = historico.moedas[m.simbolo];
    moedas[m.simbolo] = {
      simbolo: m.simbolo,
      par: m.par,
      nome: m.nome,
      cor: m.cor,
      ativa: m.ativa,
      travaCompras: false,
      ...parametrosDoPerfil(perfil, m.estrategia ?? 'spread-fixo'),
      precisao: { ...(h?.precisao ?? m.precisao) },
      precoRef: m.precoRef,
      volatilidade: m.volatilidade,
    };
  }

  const comHistorico = MOEDAS.filter((m) => historico.moedas[m.simbolo]?.velas4h?.length);
  const velaEm = {};
  const tempos = new Set();
  for (const m of comHistorico) {
    velaEm[m.simbolo] = new Map();
    for (const v of historico.moedas[m.simbolo].velas4h) {
      velaEm[m.simbolo].set(v.t, v);
      tempos.add(v.t);
    }
  }
  const linhaDoTempo = [...tempos].filter((t) => t <= limite).sort((a, b) => a - b);

  // ---------- Ordens ----------
  const ordens = [];
  let seqOrdem = 0;
  function novaOrdem(campos) {
    const o = {
      id: 'o' + String(++seqOrdem).padStart(6, '0'),
      clienteId: null,
      moeda: null,
      lado: 'compra',
      tipo: 'LIMIT',
      status: 'programada',
      preco: 0,
      quantidade: 0,
      total: 0,
      taxa: 0,
      estrategia: 'spread-fixo',
      motivo: '',
      compraId: null,
      alvo: null,
      vendaDinamica: false,
      criadaEm: null,
      executadaEm: null,
      canceladaEm: null,
      canceladaPor: null,
      motivoCancelamento: null,
      origem: 'historico',
      ...campos,
    };
    ordens.push(o);
    return o;
  }

  const movimentos = [];
  const logAdmin = [];
  const stats = { bloqueiosReserva: 0 };

  // ---------- Contas (estado da simulação por cliente) ----------
  const contas = Object.values(clientes).map((c) => {
    const conta = {
      cliente: c,
      inicioMs: inicioDoDia(c.inicioContrato).getTime() + 9 * MS_HORA,
      pausaMs: c.pausadoEm ? inicioDoDia(c.pausadoEm).getTime() + 10 * MS_HORA : null,
      encerraMs: c.encerradoEm ? inicioDoDia(c.encerradoEm).getTime() + 10 * MS_HORA : null,
      travaMs: null,
      periodoVencido: null,
      vencidoConfirmado: false,
      saldo: 0,
      custo: 0,
      prog: 0,
      compras: {},   // moeda → compras programadas
      vendas: {},    // moeda → vendas programadas
      posicoes: {},  // moeda → Map(id → compra executada)
      ultimoPreco: {},
      bloqueado: null,
      encerrado: false,
      planoMovimentos: [],
    };
    for (const s of c.moedas) {
      conta.compras[s] = [];
      conta.vendas[s] = [];
      conta.posicoes[s] = new Map();
    }
    planejarMovimentos(conta);
    planejarVencimento(conta);
    return conta;
  });

  function planejarMovimentos(conta) {
    const c = conta.cliente;
    conta.planoMovimentos.push({ tipo: 'deposito', valor: c.aporteInicial, em: conta.inicioMs, observacao: 'Aporte inicial' });
    const fimContrato = c.encerradoEm ?? hoje;
    const dias = diasEntre(c.inicioContrato, fimContrato);
    const extras = rnd.inteiro(1, 5);
    for (let i = 0; i < extras && dias > 14; i++) {
      const dia = somarDias(c.inicioContrato, rnd.inteiro(7, dias - 3));
      const em = inicioDoDia(dia).getTime() + rnd.inteiro(10, 17) * MS_HORA + rnd.inteiro(0, 59) * MS_MIN;
      const deposito = rnd.chance(0.65);
      const fator = deposito ? rnd.entre(0.05, 0.3) : rnd.entre(0.05, 0.2);
      conta.planoMovimentos.push({ tipo: deposito ? 'deposito' : 'saque', valor: Math.round((c.aporteInicial * fator) / 100) * 100, em });
    }
    conta.planoMovimentos.sort((a, b) => a.em - b.em);
  }

  // Cliente do cenário "comissão vencida": o último período cujo prazo já passou fica sem pagamento.
  function planejarVencimento(conta) {
    const c = conta.cliente;
    if (c.cenario !== 'comissao-vencida') return;
    const datas = datasDosPeriodos({ inicioContrato: c.inicioContrato, diaFechamento: c.diaFechamento, ate: hoje });
    const vencidos = datas.filter((p) => fimDoDia(vencimentoDe(p.fim, c.prazoPagamentoDias)) < agora);
    const alvo = vencidos.at(-1);
    if (!alvo) return;
    conta.periodoVencido = alvo;
    conta.travaMs = inicioDoDia(somarDias(vencimentoDe(alvo.fim, c.prazoPagamentoDias), 1)).getTime();
  }

  // ---------- Operações ----------
  const precisao = (s) => moedas[s].precisao;
  const taxaDe = (total) => (total * HIST.taxa) / 100;

  function registrarMovimento(conta, tipo, valor, em, observacao) {
    movimentos.push({ id: null, clienteId: conta.cliente.id, tipo, valor, data: new Date(em), observacao });
    conta.saldo += tipo === 'deposito' ? valor : -valor;
  }

  function disponivel(conta) {
    const caixa = conta.saldo + conta.custo;
    return caixa * (1 - conta.cliente.reservaPct / 100) - conta.custo - conta.prog;
  }

  function aplicarMovimentos(conta, t, span) {
    // Cada movimento entra no começo da primeira vela depois do horário planejado,
    // antes de qualquer execução da vela (as execuções começam em 6% da vela).
    while (conta.planoMovimentos.length && conta.planoMovimentos[0].em <= t) {
      const m = conta.planoMovimentos.shift();
      const em = t + Math.min(5 * MS_MIN, 0.03 * span);
      if (m.tipo === 'deposito') {
        registrarMovimento(conta, 'deposito', m.valor, em, m.observacao ?? 'Aporte adicional');
        continue;
      }
      // Saque: nunca acima do disponível nem do saldo livre.
      const maximo = Math.min(disponivel(conta), conta.saldo) * 0.9;
      const valor = Math.floor(Math.min(m.valor, maximo) / 50) * 50;
      if (valor >= 100) registrarMovimento(conta, 'saque', valor, em, 'Saque solicitado pelo cliente');
      else registrarMovimento(conta, 'deposito', m.valor, em, 'Aporte adicional');
    }
  }

  function cancelar(conta, ordem, em, por, motivo, status = 'cancelada') {
    ordem.status = status;
    ordem.canceladaEm = new Date(em);
    ordem.canceladaPor = por;
    ordem.motivoCancelamento = motivo;
    if (ordem.lado === 'compra') {
      conta.prog -= ordem.total;
    } else {
      const compra = conta.posicoes[ordem.moeda].get(ordem.compraId);
      if (compra) compra.alvo = null;
    }
  }

  function executarCompra(conta, c, em) {
    const s = c.moeda;
    c.status = 'executada';
    c.executadaEm = new Date(em);
    c.taxa = taxaDe(c.total);
    conta.prog -= c.total;
    conta.saldo -= c.total + c.taxa;
    conta.custo += c.total;
    conta.posicoes[s].set(c.id, c);

    const alvo = arredondar(c.preco * (1 + HIST.lucro / 100), precisao(s).preco);
    const venda = novaOrdem({
      clienteId: c.clienteId,
      moeda: s,
      lado: 'venda',
      preco: alvo,
      quantidade: c.quantidade,
      total: alvo * c.quantidade,
      motivo: 'alvo de lucro',
      compraId: c.id,
      criadaEm: new Date(em),
    });
    c.alvo = alvo;
    conta.vendas[s].push(venda);
  }

  function executarVenda(conta, v, em, motivo = 'alvo atingido') {
    const compra = conta.posicoes[v.moeda].get(v.compraId);
    v.status = 'executada';
    v.executadaEm = new Date(em);
    v.taxa = taxaDe(v.total);
    v.motivo = motivo;
    conta.saldo += v.total - v.taxa;
    conta.custo -= compra.total;
    conta.posicoes[v.moeda].delete(v.compraId);
  }

  /** Horários crescentes e aleatórios dentro de uma fração da vela. */
  function horarios(n, t, span, de, ate) {
    const lista = [];
    for (let i = 0; i < n; i++) lista.push(t + rnd.entre(de, ate) * span);
    return lista.sort((a, b) => a - b);
  }

  function executarCompras(conta, s, minima, t, span, de, ate) {
    const lista = conta.compras[s];
    const atingidas = lista.filter((c) => c.preco >= minima).sort((a, b) => b.preco - a.preco);
    if (!atingidas.length) return;
    const quando = horarios(atingidas.length, t, span, de, ate);
    atingidas.forEach((c, i) => executarCompra(conta, c, quando[i]));
    conta.compras[s] = lista.filter((c) => c.status === 'programada');
  }

  function executarVendas(conta, s, maxima, t, span, de, ate) {
    const lista = conta.vendas[s];
    const atingidas = lista.filter((v) => v.preco <= maxima).sort((a, b) => a.preco - b.preco);
    if (!atingidas.length) return;
    const quando = horarios(atingidas.length, t, span, de, ate);
    atingidas.forEach((v, i) => {
      const em = Math.max(quando[i], +v.criadaEm + MS_MIN);
      if (em <= t + span) executarVenda(conta, v, em);
    });
    conta.vendas[s] = lista.filter((v) => v.status === 'programada');
  }

  // Caminho dentro da vela: em alta, abertura → mínima → máxima → fechamento; em baixa, o inverso.
  function preencher(conta, s, v, t, span) {
    conta.ultimoPreco[s] = v.fechamento;
    if (v.fechamento >= v.abertura) {
      executarCompras(conta, s, v.minima, t, span, 0.06, 0.45);
      executarVendas(conta, s, v.maxima, t, span, 0.5, 0.97);
    } else {
      executarVendas(conta, s, v.maxima, t, span, 0.06, 0.45);
      executarCompras(conta, s, v.minima, t, span, 0.5, 0.97);
    }
  }

  function manterEscada(conta, s, referencia, em) {
    const c = conta.cliente;
    const sp = HIST.spread / 100;
    const prec = precisao(s);
    let lista = conta.compras[s].sort((a, b) => b.preco - a.preco);

    // Reposiciona quando o preço sobe mais que um spread acima do nível de onde a escada partiu.
    if (lista.length && referencia > (lista[0].preco / (1 - sp)) * (1 + sp)) {
      for (const o of lista) cancelar(conta, o, em, 'sistema', 'preço subiu acima da escada', 'reposicionada');
      lista = [];
    }

    const posicoes = conta.posicoes[s].size;
    let base = lista.length ? lista.at(-1).preco : referencia;
    while (lista.length < HIST.degraus && posicoes + lista.length < HIST.maxPosicoes) {
      const preco = arredondar(base * (1 - sp), prec.preco);
      const valor = valorDaOrdem(c, conta.saldo + conta.custo);
      const quantidade = truncar(valor / preco, prec.quantidade);
      const total = preco * quantidade;
      if (quantidade <= 0 || total < prec.minimo) break;
      if (total > disponivel(conta) + 1e-9) {
        stats.bloqueiosReserva++;
        break;
      }
      const o = novaOrdem({
        clienteId: c.id,
        moeda: s,
        lado: 'compra',
        preco,
        quantidade,
        total,
        motivo: 'degrau do spread',
        criadaEm: new Date(em),
      });
      conta.prog += total;
      lista.push(o);
      base = preco;
    }
    conta.compras[s] = lista;
  }

  function bloquear(conta, t, motivo, texto) {
    conta.bloqueado = motivo;
    for (const s of conta.cliente.moedas) {
      for (const o of conta.compras[s]) cancelar(conta, o, t + MS_MIN, 'sistema', motivo);
      conta.compras[s] = [];
    }
    logAdmin.push({ data: new Date(t + MS_MIN), texto, origem: 'automatico' });
  }

  function verificarVencimento(conta, t) {
    conta.travaMs = null;
    const c = conta.cliente;
    const p = conta.periodoVencido;
    const { resultado } = resultadoDoPeriodo(ordens, c.id, p.inicio, p.fim);
    if (calcularComissao(resultado, c.comissaoPct) <= 0) return;
    conta.vencidoConfirmado = true;
    bloquear(conta, t, 'comissão vencida', `Compras de ${c.nome} travadas automaticamente: comissão do período ${p.inicio} a ${p.fim} vencida`);
  }

  function encerrar(conta, t) {
    const c = conta.cliente;
    for (const s of c.moedas) {
      for (const o of conta.compras[s]) cancelar(conta, o, t + MS_MIN, 'sistema', 'encerramento do contrato');
      for (const o of conta.vendas[s]) cancelar(conta, o, t + MS_MIN, 'sistema', 'encerramento do contrato');
      conta.compras[s] = [];
      conta.vendas[s] = [];
      const preco = arredondar(velaEm[s].get(t)?.abertura ?? conta.ultimoPreco[s], precisao(s).preco);
      for (const compra of [...conta.posicoes[s].values()]) {
        const em = t + 2 * MS_MIN;
        const venda = novaOrdem({
          clienteId: c.id, moeda: s, lado: 'venda', tipo: 'MARKET',
          preco, quantidade: compra.quantidade, total: preco * compra.quantidade,
          motivo: 'encerramento do contrato', compraId: compra.id, criadaEm: new Date(em),
        });
        executarVenda(conta, venda, em, 'encerramento do contrato');
      }
    }
    const saldo = Math.floor(conta.saldo * 100) / 100;
    if (saldo > 0) registrarMovimento(conta, 'saque', saldo, t + 10 * MS_MIN, 'Encerramento do contrato — saldo devolvido');
    conta.encerrado = true;
    logAdmin.push({ data: new Date(t + 10 * MS_MIN), texto: `Contrato de ${c.nome} encerrado: posições vendidas e saldo devolvido`, origem: 'admin' });
  }

  // ---------- Linha do tempo ----------
  for (const t of linhaDoTempo) {
    const span = Math.min(DUR_4H, limite - t);
    if (span <= MS_MIN) continue;
    for (const conta of contas) {
      if (conta.encerrado || t < conta.inicioMs) continue;
      const c = conta.cliente;
      aplicarMovimentos(conta, t, span);
      if (conta.encerraMs && t >= conta.encerraMs) {
        encerrar(conta, t);
        continue;
      }
      if (conta.pausaMs && t >= conta.pausaMs && !conta.bloqueado) {
        bloquear(conta, t, 'cliente pausado', `Cliente ${c.nome} pausado: novas compras suspensas`);
      }
      if (conta.travaMs && t >= conta.travaMs && !conta.bloqueado) verificarVencimento(conta, t);

      // Primeiro todas as execuções da vela, depois as novas ordens (que nascem no fechamento).
      for (const s of c.moedas) {
        const v = velaEm[s]?.get(t);
        if (v) preencher(conta, s, v, t, span);
      }
      if (conta.bloqueado) continue;
      for (const s of c.moedas) {
        const v = velaEm[s]?.get(t);
        if (v) manterEscada(conta, s, v.fechamento, t + span);
      }
    }
  }

  // ---------- Movimentos (ids na ordem do tempo) ----------
  movimentos.sort((a, b) => a.data - b.data);
  movimentos.forEach((m, i) => { m.id = 'm' + String(i + 1).padStart(4, '0'); });

  // ---------- Períodos de apuração ----------
  const periodos = [];
  for (const conta of contas) {
    const c = conta.cliente;
    const datas = datasDosPeriodos({ inicioContrato: c.inicioContrato, diaFechamento: c.diaFechamento, ate: c.encerradoEm ?? hoje });
    for (const d of datas) {
      const vencimento = vencimentoDe(d.fim, c.prazoPagamentoDias);
      const base = {
        id: null, clienteId: c.id, inicio: d.inicio, fim: d.fim, diaFechamento: d.diaFechamento,
        status: 'aberto', resultado: null, comissaoPct: c.comissaoPct, comissao: null,
        vencimento, apuradoEm: null, pagoEm: null, operacoes: null,
      };
      if (d.fim >= hoje) {
        periodos.push(base);
        continue;
      }
      const { resultado, operacoes } = resultadoDoPeriodo(ordens, c.id, d.inicio, d.fim);
      const comissao = calcularComissao(resultado, c.comissaoPct);
      const apuradoEm = new Date(inicioDoDia(somarDias(d.fim, 1)).getTime() + 5 * MS_MIN);
      const p = { ...base, resultado: arredondar(resultado), comissao, operacoes, apuradoEm };
      const ehVencido = conta.vencidoConfirmado && conta.periodoVencido?.fim === d.fim;
      if (comissao === 0) {
        p.status = 'pago';
        p.pagoEm = apuradoEm;
      } else if (ehVencido) {
        p.status = 'vencido';
      } else if (agora <= fimDoDia(vencimento)) {
        p.status = 'apurado';
      } else {
        p.status = 'pago';
        const pago = +apuradoEm + rnd.inteiro(0, c.prazoPagamentoDias - 1) * MS_DIA + rnd.inteiro(9, 18) * MS_HORA;
        p.pagoEm = new Date(Math.min(pago, +fimDoDia(vencimento), +agora));
      }
      periodos.push(p);
    }
    if (conta.vencidoConfirmado) c.travaPorComissao = true;
  }
  periodos.forEach((p, i) => { p.id = 'p' + String(i + 1).padStart(4, '0'); });

  // ---------- Preços para as telas ----------
  const precos = {};
  for (const m of comHistorico) {
    const h = historico.moedas[m.simbolo];
    const ultima = h.velas15m.at(-1) ?? h.velas4h.at(-1);
    const tk = ticker?.[m.par];
    const atual = tk?.atual ?? ultima.fechamento;
    const ref24h = h.velas15m.length >= 96 ? h.velas15m.at(-96).abertura : h.velas4h.at(-6)?.abertura ?? atual;
    const abertura24h = tk?.abertura ?? ref24h;
    precos[m.simbolo] = {
      atual,
      anterior: atual,
      abertura24h,
      variacao24h: tk?.variacaoPct ?? (atual / abertura24h - 1) * 100,
      velas1m: [],
      velas15m: h.velas15m,
      velas4h: h.velas4h,
      diario: serieDiaria(h.velas4h),
    };
  }

  logAdmin.sort((a, b) => a.data - b.data);

  const fimGeracao = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const contagem = (status) => ordens.filter((o) => o.status === status).length;
  return {
    agora,
    moedas,
    precos,
    clientes,
    ordens,
    movimentos,
    periodos,
    alertas: [],
    regrasAlerta: {},
    logAdmin,
    estadoMotor: {},
    estatisticas: {
      fonte: historico.fonte,
      executadas: contagem('executada'),
      programadas: contagem('programada'),
      canceladas: contagem('cancelada'),
      reposicionadas: contagem('reposicionada'),
      bloqueiosReserva: stats.bloqueiosReserva,
      duracaoMs: Math.round(fimGeracao - inicioGeracao),
    },
  };
}
