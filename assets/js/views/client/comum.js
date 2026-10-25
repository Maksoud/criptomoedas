// Peças comuns das telas do cliente: ciclo de vida (assinaturas desfeitas ao sair da tela),
// cabeçalho da página com o status do cliente e estados vazios.

import { on, getState, periodosDoCliente } from '../../store.js';
import { escapar } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { contextoDoCliente } from '../../ui/filters.js';
import { data } from '../../utils/format.js';

/** Assinaturas e recursos de uma tela; `destruir()` desfaz tudo ao trocar de tela. */
export function criarContexto() {
  const limpezas = [];
  return {
    on(evento, fn) { limpezas.push(on(evento, fn)); },
    aoDestruir(fn) { limpezas.push(fn); },
    destruir() {
      while (limpezas.length) {
        try { limpezas.pop()(); } catch (erro) { console.error('[tela] erro ao sair', erro); }
      }
    },
  };
}

export function clienteAtual() {
  const s = getState();
  return s.clientes[s.clienteAtual] ?? null;
}

/** A ordem é deste cliente e já foi executada? (linhas novas ao vivo) */
export function execucaoDoCliente(ordem, cliente) {
  return ordem && ordem.clienteId === cliente.id && ordem.status === 'executada';
}

/** Moedas que o cliente opera mais as que aparecem nas ordens dele (se o admin tirou alguma). */
export function moedasDoCliente(cliente) {
  const usadas = new Set(cliente.moedas);
  for (const o of getState().ordens) if (o.clienteId === cliente.id) usadas.add(o.moeda);
  const catalogo = Object.keys(getState().moedas);
  return catalogo.filter((m) => usadas.has(m));
}

export function contextoFiltros(cliente) {
  return contextoDoCliente(cliente, periodosDoCliente(cliente.id));
}

const STATUS = {
  ativo: { texto: 'Ativo', classe: 'badge--up' },
  pausado: { texto: 'Pausado', classe: 'badge--warn' },
  inativo: { texto: 'Inativo', classe: 'badge--faint' },
};

export function badgesDoCliente(cliente) {
  const st = STATUS[cliente.status] ?? STATUS.ativo;
  const lista = [`<span class="badge ${st.classe}">${st.texto}</span>`];
  if (cliente.travaPorComissao) lista.push(`<span class="badge badge--down">${icon('lock')}Compras suspensas</span>`);
  else if (cliente.travaCompras) lista.push(`<span class="badge badge--warn">${icon('lock')}Compras travadas</span>`);
  return lista.join('');
}

/** Cabeçalho padrão: código, título, cliente e ações à direita. */
export function cabecalho(definicao, cliente, { acoes = '', subtitulo = null } = {}) {
  const linha = subtitulo ?? `${escapar(cliente.nome)} · cliente desde ${data(cliente.inicioContrato)}${cliente.encerradoEm ? ` · contrato encerrado em ${data(cliente.encerradoEm)}` : ''}`;
  return `
    <header class="page-head">
      <div class="page-head__text">
        <p class="label page-head__code">${definicao.codigo}</p>
        <h1>${definicao.titulo}</h1>
        <p class="page-head__sub">${linha}<span class="page-head__badges">${badgesDoCliente(cliente)}</span></p>
      </div>
      ${acoes ? `<div class="page-head__actions no-print">${acoes}</div>` : ''}
    </header>`;
}

export function semCliente(alvo, definicao) {
  alvo.innerHTML = `
    <section class="page">
      <header class="page-head"><div><p class="label page-head__code">${definicao.codigo}</p><h1>${definicao.titulo}</h1></div></header>
      <div class="card"><div class="empty">
        <span class="empty__icon">${icon('user')}</span>
        <p class="empty__title">Nenhum cliente selecionado</p>
        <p class="empty__text">Escolha um cliente em "Visualizando como", no topo.</p>
      </div></div>
    </section>`;
}

export function vazioHTML(iconeNome, titulo, texto = '') {
  return `<div class="empty">
    <span class="empty__icon">${icon(iconeNome)}</span>
    <p class="empty__title">${escapar(titulo)}</p>
    ${texto ? `<p class="empty__text">${escapar(texto)}</p>` : ''}
  </div>`;
}
