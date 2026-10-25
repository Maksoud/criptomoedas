// Rotas por hash: #/cliente/<pagina> e #/admin/<pagina>.
// Rota inválida → primeira tela da visão. Trocar de visão → primeira tela da outra visão.
import { getState, setState, emit } from './store.js';
import { VISOES, VISAO_PADRAO, paginaInicial, buscarPagina } from './views/routes.js';

export function hashDe(visao, pagina) {
  return `#/${visao}/${pagina}`;
}

function ler(hash) {
  const [, visao = '', pagina = ''] = hash.replace(/^#/, '').split('/');
  return { visao, pagina };
}

function resolver() {
  let { visao, pagina } = ler(location.hash);
  if (!VISOES[visao]) visao = VISOES[getState().visao] ? getState().visao : VISAO_PADRAO;
  if (!buscarPagina(visao, pagina)) pagina = paginaInicial(visao);

  const canonico = hashDe(visao, pagina);
  if (location.hash !== canonico) history.replaceState(null, '', canonico);

  const atual = getState().rota;
  if (atual && atual.visao === visao && atual.pagina === pagina) return;

  const visaoAnterior = getState().visao;
  const rota = { visao, pagina };
  setState({ visao, rota });
  if (visaoAnterior !== visao) emit('view:change', visao);
  emit('route:change', { ...rota, definicao: buscarPagina(visao, pagina) });
}

export function irPara(visao, pagina = paginaInicial(visao)) {
  const destino = hashDe(visao, pagina);
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
  window.addEventListener('hashchange', resolver);
  resolver();
}
