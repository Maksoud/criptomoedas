// Peças comuns das telas do administrador (A1–A7): cabeçalho, nomes, status do motor, "ver como cliente"
// e o motivo de um cliente não estar comprando.

import { getState, setState } from '../../store.js';
import { irPara } from '../../router.js';
import { escapar } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { textoDaRegra } from '../../engine/checks.js';
import { podeComprar } from '../../engine/engine.js';

export { criarContexto, badgesDoCliente, vazioHTML } from '../client/comum.js';

/** Cabeçalho padrão do admin: código, título, resumo e ações à direita. */
export function cabecalhoAdmin(definicao, { acoes = '', sub = null } = {}) {
  return `
    <header class="page-head">
      <div class="page-head__text">
        <p class="label page-head__code">${definicao.codigo}</p>
        <h1>${definicao.titulo}</h1>
        <p class="page-head__sub">${sub ?? escapar(definicao.resumo)}</p>
      </div>
      ${acoes ? `<div class="page-head__actions no-print">${acoes}</div>` : ''}
    </header>`;
}

export function nomeCliente(id) {
  return getState().clientes[id]?.nome ?? id;
}

/** Clientes na ordem do cadastro. */
export function listaClientes() {
  return Object.values(getState().clientes);
}

/** Abre a visão Cliente já "visualizando como" este cliente. */
export function verComoCliente(clienteId, pagina = 'visao-geral') {
  if (!getState().clientes[clienteId]) return;
  setState({ clienteAtual: clienteId });
  irPara('cliente', pagina);
}

export function botaoVerComo(clienteId, { pequeno = true } = {}) {
  return `<button class="btn btn--secondary${pequeno ? ' btn--sm' : ''}" type="button" data-ver-como="${escapar(clienteId)}">${icon('eye')}<span>Ver como cliente</span></button>`;
}

/** Liga os botões "Ver como cliente" (data-ver-como) dentro de `raiz`. */
export function ligarVerComo(raiz) {
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ver-como]');
    if (b) verComoCliente(b.dataset.verComo);
  });
}

/**
 * Por que o cliente não compra agora (primeira moeda que ele opera e que dá uma resposta).
 * Devolve null se pode comprar em pelo menos uma moeda.
 */
export function motivoSemCompra(cliente) {
  const motivos = new Map();
  for (const m of cliente.moedas) {
    const r = podeComprar(cliente.id, m);
    if (r.ok) return null;
    motivos.set(r.regra, (motivos.get(r.regra) ?? 0) + 1);
  }
  if (!cliente.moedas.length) return 'Não opera nenhuma moeda';
  // A regra mais comum entre as moedas; as que valem para o cliente inteiro vêm primeiro.
  const ordem = ['trava-global', 'trava-comissao', 'trava-cliente', 'cliente-inativo', 'robo-pausado', 'reserva'];
  const regra = ordem.find((r) => motivos.has(r)) ?? [...motivos.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return textoDaRegra(regra);
}

/** Resumo do estado do motor numa moeda (todos os clientes): o rótulo mais comum + quantos aguardam confirmação. */
export function resumoMotor(simbolo) {
  const s = getState();
  const contagem = new Map();
  let aguardando = 0;
  for (const e of Object.values(s.estadoMotor)) {
    if (e.moeda !== simbolo) continue;
    const rotulo = /aguardando confirmação/i.test(e.rotulo) ? null : e.rotulo;
    if (e.pendentes?.length) aguardando++;
    if (rotulo) contagem.set(rotulo, (contagem.get(rotulo) ?? 0) + 1);
  }
  const lista = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  return { principal: lista[0]?.[0] ?? null, clientes: lista.reduce((n, x) => n + x[1], 0) + aguardando, outros: lista.length - 1, aguardando };
}

/** Pílula do estado do motor (docs/IDENTIDADE_VISUAL.md §7, "Estado do motor"). */
export function pilulaMotor(moeda) {
  if (!moeda.ativa) return '<span class="badge badge--faint">Desligada</span>';
  if (moeda.travaCompras) return `<span class="badge badge--warn">${icon('lock')}Compras travadas</span>`;
  if (getState().robo !== 'ligado') return '<span class="badge badge--faint">Robô pausado</span>';
  const r = resumoMotor(moeda.simbolo);
  if (!r.principal && !r.aguardando) return '<span class="badge badge--faint">Aguardando cotação</span>';
  const extra = r.aguardando ? ` <span class="badge badge--info">${r.aguardando} aguardando confirmação</span>` : '';
  return `${r.principal ? `<span class="badge badge--info" title="${escapar(`${r.principal}${r.outros > 0 ? ` (e mais ${r.outros} estados)` : ''}`)}">${escapar(r.principal)}</span>` : ''}${extra}`;
}

/** Lista de opções <option> com os clientes. */
export function opcoesClientes(selecionado = '', { todos = null } = {}) {
  const lista = listaClientes().map((c) => `<option value="${c.id}"${c.id === selecionado ? ' selected' : ''}>${escapar(c.nome)}${c.status !== 'ativo' ? ` (${c.status})` : ''}</option>`);
  if (todos) lista.unshift(`<option value=""${!selecionado ? ' selected' : ''}>${escapar(todos)}</option>`);
  return lista.join('');
}
