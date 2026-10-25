// Apuração automática dos períodos de comissão (PLANO_MVP.md §8.3), verificada a cada minuto:
//   - virou o dia de fechamento de um cliente → apura o período aberto e abre o seguinte (aplicando a
//     troca de dia pedida pelo cliente, se houver); o alerta "Fechamento de período" sai do evento
//     `commission:closed`;
//   - passou o prazo de pagamento sem pagamento → período vencido e compras do cliente travadas
//     (`commission:overdue` → alerta crítico "Comissão vencida").
// O alerta "Comissão a vencer" é verificado pelas regras (alerts/rules.js). Marcar como pago (F5)
// usa store.marcarPago, que tira a trava e registra no log.

import { getState, on, apurarPeriodo, verificarVencimentos } from '../store.js';
import { diaISO } from '../utils/dates.js';

export const INTERVALO_APURACAO_MS = 60_000;

/** Apura os períodos encerrados e marca os vencidos. Devolve o que mudou. */
export function verificarApuracao(agora = new Date()) {
  const s = getState();
  if (s.carregando) return { apurados: [], vencidos: [] };
  const hoje = diaISO(agora);
  const apurados = [];
  // Um cliente pode ter mais de um período para fechar (página aberta por dias): repete até acabar.
  for (let volta = 0; volta < 24; volta++) {
    const encerrados = s.periodos.filter((p) => p.status === 'aberto' && p.fim < hoje);
    if (!encerrados.length) break;
    for (const p of encerrados) apurados.push(apurarPeriodo(p.id, agora));
  }
  const vencidos = verificarVencimentos(agora);
  return { apurados, vencidos };
}

let iniciado = false;
export function iniciarApuracao() {
  if (iniciado) return;
  iniciado = true;
  on('data:ready', () => verificarApuracao(new Date()));
  setInterval(() => verificarApuracao(new Date()), INTERVALO_APURACAO_MS);
}
