// Caixa, reserva de banca e disponível para operar (docs/DADOS_FICTICIOS.md §5, PLANO_MVP.md §8.1).
//
//   saldo livre  = depósitos − saques + Σ vendas − Σ compras − Σ taxas   (o aporte inicial é o 1º depósito)
//   caixa        = saldo livre + custo das posições abertas
//   reserva      = caixa × reserva% / 100
//   disponível   = caixa − reserva − custo das posições abertas − compras programadas
//   patrimônio   = saldo livre + valor a mercado das posições

import { posicoesAbertas, valorAtual } from './positions.js';

/** Valor em USDT de cada compra para um cliente, dado o caixa atual. */
export function valorDaOrdem(cliente, caixa) {
  const { tipo, valor } = cliente.valorOrdem;
  return tipo === 'percent' ? (caixa * valor) / 100 : valor;
}

export function totaisMovimentos(movimentos, clienteId) {
  let depositos = 0;
  let saques = 0;
  for (const m of movimentos) {
    if (clienteId && m.clienteId !== clienteId) continue;
    if (m.tipo === 'deposito') depositos += m.valor;
    else if (m.tipo === 'saque') saques += m.valor;
  }
  return { depositos, saques, aportado: depositos - saques };
}

/**
 * Resumo da banca de um cliente. `precos` é opcional (sem ele, valores a mercado = custo).
 */
export function resumoBanca(cliente, ordens, movimentos, precos = null) {
  const id = cliente.id;
  const { depositos, saques, aportado } = totaisMovimentos(movimentos, id);

  let comprado = 0;
  let vendido = 0;
  let taxas = 0;
  let comprasProgramadas = 0;
  let qtdProgramadas = 0;
  for (const o of ordens) {
    if (o.clienteId !== id) continue;
    if (o.status === 'executada') {
      if (o.lado === 'compra') comprado += o.total;
      else vendido += o.total;
      taxas += o.taxa ?? 0;
    } else if (o.status === 'programada' || o.status === 'aguardando-confirmacao') {
      qtdProgramadas++;
      if (o.lado === 'compra') comprasProgramadas += o.total;
    }
  }

  const posicoes = posicoesAbertas(ordens, { clienteId: id });
  const custoPosicoes = posicoes.reduce((s, p) => s + p.custo, 0);
  const emOperacao = posicoes.reduce((s, p) => s + valorAtual(p, precos), 0);

  const saldoLivre = depositos - saques + vendido - comprado - taxas;
  const caixa = saldoLivre + custoPosicoes;
  const reserva = (caixa * cliente.reservaPct) / 100;
  const operavel = caixa - reserva;
  const disponivel = operavel - custoPosicoes - comprasProgramadas;
  const patrimonio = saldoLivre + emOperacao;

  return {
    depositos,
    saques,
    aportado,
    saldoLivre,
    caixa,
    reserva,
    operavel,
    custoPosicoes,
    emOperacao,
    comprasProgramadas,
    ordensProgramadas: qtdProgramadas,
    disponivel,
    patrimonio,
    resultado: patrimonio - aportado,
    resultadoPct: aportado > 0 ? (patrimonio / aportado - 1) * 100 : 0,
    usoBancaPct: operavel > 0 ? ((custoPosicoes + comprasProgramadas) / operavel) * 100 : 0,
    posicoes: posicoes.length,
    valorOrdem: valorDaOrdem(cliente, caixa),
  };
}
