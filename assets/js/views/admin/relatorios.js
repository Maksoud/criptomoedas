// A5 · Relatórios: o mesmo relatório da C4 para um cliente escolhido ou "Todos — consolidado" (uma
// linha por cliente, com a comissão dos períodos). Período e moedas pelos filtros; CSV e impressão.

import { getState } from '../../store.js';
import { irPara, textoConsulta } from '../../router.js';
import { criarRelatorio } from '../client/relatorio.js';
import { cabecalhoAdmin, opcoesClientes } from './comum.js';

export function montarRelatorios(alvo, { definicao, consulta }) {
  const id = consulta.get('cliente');
  const cliente = getState().clientes[id] ?? null;

  const topo = (acoes) => cabecalhoAdmin(definicao, {
    sub: cliente ? 'Relatório de resultados de um cliente, igual ao que ele vê na C4.' : 'Consolidado de todos os clientes, com uma linha por cliente.',
    acoes: `
      <label class="field field--inline">
        <span class="field__label">Cliente</span>
        <select class="input" data-ref="cliente">${opcoesClientes(cliente?.id ?? '', { todos: 'Todos — consolidado' })}</select>
      </label>
      ${acoes}`,
  });

  const ctx = criarRelatorio(alvo, { definicao, consulta, cliente, topo, consultaExtra: { cliente: cliente?.id ?? '' } });

  alvo.querySelector('[data-ref="cliente"]').addEventListener('change', (e) => {
    // Mantém período e moedas ao trocar de cliente (as moedas que não existirem no outro caem fora).
    const atual = new URLSearchParams(location.hash.split('?')[1] ?? '');
    irPara('admin', definicao.id, textoConsulta({ cliente: e.target.value, de: atual.get('de'), ate: atual.get('ate'), moedas: atual.get('moedas') }));
  });
  return ctx;
}
