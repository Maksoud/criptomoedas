// Validações do histórico gerado (docs/DADOS_FICTICIOS.md §6.8). Rodam em modo dev e em docs/testes.html.
// Refazem as contas de forma independente do gerador, reproduzindo a linha do tempo de cada cliente.

import { calcularComissao, resultadoDoPeriodo, vencimentoDe } from '../calc/commission.js';
import { somarDias } from '../utils/dates.js';

const EPS = 0.01; // 1 centavo de tolerância para arredondamentos

/**
 * @returns { ok, problemas: string[], avisos: string[], minimos: { [clienteId]: { saldo, disponivel } } }
 */
export function validarDados({ clientes, ordens, movimentos, periodos }) {
  const problemas = [];
  const avisos = [];
  const porId = new Map(ordens.map((o) => [o.id, o]));

  // 1. Toda venda executada tem uma compra executada, do mesmo cliente e moeda, e cada compra vende uma vez só.
  const vendasPorCompra = new Map();
  for (const v of ordens) {
    if (v.lado !== 'venda' || v.status !== 'executada') continue;
    const c = porId.get(v.compraId);
    if (!c || c.lado !== 'compra' || c.status !== 'executada') {
      problemas.push(`Venda ${v.id} sem compra executada de origem`);
      continue;
    }
    if (c.clienteId !== v.clienteId || c.moeda !== v.moeda) problemas.push(`Venda ${v.id} aponta para compra de outro cliente/moeda`);
    if (v.quantidade > c.quantidade + 1e-12) problemas.push(`Venda ${v.id} vende mais que a compra ${c.id}`);
    if (v.executadaEm < c.executadaEm) problemas.push(`Venda ${v.id} executada antes da compra ${c.id}`);
    vendasPorCompra.set(c.id, (vendasPorCompra.get(c.id) ?? 0) + 1);
  }
  for (const [id, n] of vendasPorCompra) if (n > 1) problemas.push(`Compra ${id} vendida ${n} vezes`);

  // 2 e 3. Linha do tempo de cada cliente: saldo livre nunca negativo; nenhuma compra acima do disponível.
  const minimos = {};
  for (const cliente of Object.values(clientes)) {
    const eventos = [];
    for (const m of movimentos) {
      if (m.clienteId === cliente.id) eventos.push({ t: +m.data, ordem: 3, tipo: m.tipo, valor: m.valor });
    }
    for (const o of ordens) {
      if (o.clienteId !== cliente.id) continue;
      if (o.lado === 'compra') {
        eventos.push({ t: +o.criadaEm, ordem: 4, tipo: 'criar-compra', o });
        if (o.status === 'executada') eventos.push({ t: +o.executadaEm, ordem: 2, tipo: 'executar-compra', o });
        if (o.canceladaEm) eventos.push({ t: +o.canceladaEm, ordem: 0, tipo: 'cancelar-compra', o });
      } else if (o.status === 'executada') {
        eventos.push({ t: +o.executadaEm, ordem: 1, tipo: 'executar-venda', o });
      }
    }
    // No mesmo instante: libera dinheiro antes de reservar.
    eventos.sort((a, b) => a.t - b.t || a.ordem - b.ordem);

    let saldo = 0;
    let custo = 0;
    let prog = 0;
    let minSaldo = Infinity;
    let minDisp = Infinity;
    for (const e of eventos) {
      switch (e.tipo) {
        case 'deposito': saldo += e.valor; break;
        case 'saque': saldo -= e.valor; break;
        case 'cancelar-compra': prog -= e.o.total; break;
        case 'executar-compra':
          prog -= e.o.total;
          custo += e.o.total;
          saldo -= e.o.total + e.o.taxa;
          break;
        case 'executar-venda': {
          const c = porId.get(e.o.compraId);
          saldo += e.o.total - e.o.taxa;
          custo -= c.total * (e.o.quantidade / c.quantidade);
          break;
        }
        case 'criar-compra': {
          const caixa = saldo + custo;
          const disp = caixa * (1 - cliente.reservaPct / 100) - custo - prog;
          minDisp = Math.min(minDisp, disp - e.o.total);
          if (e.o.total > disp + EPS) {
            problemas.push(`Compra ${e.o.id} (${cliente.id}) de ${e.o.total.toFixed(2)} acima do disponível ${disp.toFixed(2)}`);
          }
          prog += e.o.total;
          break;
        }
      }
      if (saldo < -EPS) {
        problemas.push(`Saldo livre negativo para ${cliente.id} em ${new Date(e.t).toISOString()}: ${saldo.toFixed(2)}`);
        saldo = 0;
      }
      minSaldo = Math.min(minSaldo, saldo);
    }
    minimos[cliente.id] = { saldo: minSaldo, disponivel: minDisp };
  }

  // 4. Comissão dos períodos apurados = recálculo; períodos contínuos; um só aberto por cliente.
  for (const cliente of Object.values(clientes)) {
    const lista = periodos.filter((p) => p.clienteId === cliente.id).sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
    if (!lista.length) {
      problemas.push(`${cliente.id} sem períodos de apuração`);
      continue;
    }
    if (lista[0].inicio !== cliente.inicioContrato) problemas.push(`${cliente.id}: 1º período não começa no início do contrato`);
    for (let i = 1; i < lista.length; i++) {
      if (lista[i].inicio !== somarDias(lista[i - 1].fim, 1)) problemas.push(`${cliente.id}: buraco entre ${lista[i - 1].fim} e ${lista[i].inicio}`);
    }
    const abertos = lista.filter((p) => p.status === 'aberto');
    if (abertos.length > 1) problemas.push(`${cliente.id}: ${abertos.length} períodos abertos`);
    if (cliente.status !== 'inativo' && abertos.length !== 1) problemas.push(`${cliente.id}: sem período aberto`);

    for (const p of lista) {
      if (p.status === 'aberto') continue;
      const { resultado } = resultadoDoPeriodo(ordens, cliente.id, p.inicio, p.fim);
      const esperado = calcularComissao(resultado, p.comissaoPct);
      if (Math.abs(esperado - p.comissao) > EPS) problemas.push(`Período ${p.id}: comissão ${p.comissao} ≠ recálculo ${esperado}`);
      if (p.vencimento !== vencimentoDe(p.fim, cliente.prazoPagamentoDias)) problemas.push(`Período ${p.id}: vencimento errado`);
      if (p.status === 'vencido' && !cliente.travaPorComissao) problemas.push(`${cliente.id}: período vencido sem trava de compras`);
    }
  }

  // Avisos: o que a demonstração espera encontrar em cada cliente ativo.
  for (const cliente of Object.values(clientes)) {
    if (cliente.status !== 'ativo') continue;
    const minhas = ordens.filter((o) => o.clienteId === cliente.id);
    const vendidas = new Set(minhas.filter((o) => o.lado === 'venda' && o.status === 'executada').map((o) => o.compraId));
    const posicoes = minhas.filter((o) => o.lado === 'compra' && o.status === 'executada' && !vendidas.has(o.id)).length;
    const programadas = minhas.filter((o) => o.status === 'programada').length;
    if (!posicoes) avisos.push(`${cliente.id} sem posições abertas`);
    if (!programadas) avisos.push(`${cliente.id} sem ordens programadas`);
  }

  return { ok: problemas.length === 0, problemas, avisos, minimos };
}

/** Roda as validações e registra no console com console.assert. */
export function validarNoConsole(dados) {
  const r = validarDados(dados);
  console.assert(r.ok, `[seed] ${r.problemas.length} problema(s) no histórico gerado`, r.problemas);
  for (const p of r.problemas.slice(0, 20)) console.assert(false, '[seed]', p);
  for (const a of r.avisos) console.warn('[seed]', a);
  return r;
}
