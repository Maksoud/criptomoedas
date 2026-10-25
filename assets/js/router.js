// Rotas por hash: #/cliente/<pagina> e #/admin/<pagina>, com filtros opcionais depois de "?"
// (#/cliente/relatorio?de=2026-10-01&ate=2026-10-24&moedas=BTC,ETH).
// Rota inválida → primeira tela da visão. Trocar de visão → primeira tela da outra visão.
// Mudar só os filtros pelo endereço emite `route:query`; as telas gravam os filtros com gravarConsulta().
import { getState, setState, emit } from './store.js';
import { VISOES, VISAO_PADRAO, paginaInicial, buscarPagina } from './views/routes.js';

export function hashDe(visao, pagina, consulta = '') {
  return `#/${visao}/${pagina}${consulta ? `?${consulta}` : ''}`;
}

function ler(hash) {
  const [caminho, consulta = ''] = hash.replace(/^#/, '').split('?');
  const [, visao = '', pagina = ''] = caminho.split('/');
  return { visao, pagina, consulta };
}

let consultaAtual = '';

/** Filtros da rota atual (o que vem depois de "?" no hash). */
export function lerConsulta() {
  return new URLSearchParams(ler(location.hash).consulta);
}

/** Texto da consulta, sem campos vazios e com as vírgulas legíveis. */
export function textoConsulta(campos) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(campos)) {
    if (v != null && v !== '') q.set(k, v);
  }
  return q.toString().replace(/%2C/gi, ',');
}

/** Grava os filtros na URL da tela atual, sem criar entrada no histórico nem redesenhar a tela. */
export function gravarConsulta(campos) {
  const rota = getState().rota;
  if (!rota) return;
  consultaAtual = textoConsulta(campos);
  const destino = hashDe(rota.visao, rota.pagina, consultaAtual);
  if (location.hash !== destino) history.replaceState(null, '', destino);
}


function resolver() {
  let { visao, pagina, consulta } = ler(location.hash);
  if (!VISOES[visao]) visao = VISOES[getState().visao] ? getState().visao : VISAO_PADRAO;
  if (!buscarPagina(visao, pagina)) {
    pagina = paginaInicial(visao);
    consulta = '';
  }

  const canonico = hashDe(visao, pagina, consulta);
  if (location.hash !== canonico) history.replaceState(null, '', canonico);

  const atual = getState().rota;
  if (atual && atual.visao === visao && atual.pagina === pagina) {
    if (consulta !== consultaAtual) {
      consultaAtual = consulta;
      emit('route:query', { ...atual, consulta });
    }
    return;
  }
  consultaAtual = consulta;

  const visaoAnterior = getState().visao;
  const rota = { visao, pagina };
  setState({ visao, rota });
  if (visaoAnterior !== visao) emit('view:change', visao);
  emit('route:change', { ...rota, definicao: buscarPagina(visao, pagina) });
}

export function irPara(visao, pagina = paginaInicial(visao), consulta = '') {
  const destino = hashDe(visao, pagina, consulta);
  if (location.hash === destino) return;
  location.hash = destino;
}

export function trocarVisao(visao) {
  if (visao === getState().visao) return;
  irPara(visao, paginaInicial(visao));
}

/** Liga o roteador. Sem hash na URL, usa a última rota salva (se houver). */
export function iniciarRoteador(rotaSalva) {
  if (!location.hash && rotaSalva) history.replaceState(null, '', rotaSalva);
  // gravarConsulta() usa replaceState, que não dispara hashchange: aqui só chegam mudanças de fora.
  window.addEventListener('hashchange', resolver);
  resolver();
}
