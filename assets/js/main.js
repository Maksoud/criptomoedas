// Inicialização: lê preferências salvas, monta o topo e o menu, liga as rotas e carrega os dados.
import * as store from './store.js';
import { getState, setState, on } from './store.js';
import * as persist from './persist.js';
import { iniciarRoteador, hashDe } from './router.js';
import { iniciarScrim } from './ui/scrim.js';
import { iniciarTopbar } from './ui/topbar.js';
import { iniciarSidebar } from './ui/sidebar.js';
import { iniciarAvisos } from './ui/notices.js';
import { renderIcons } from './ui/icons.js';
import { renderCarregando } from './ui/loading.js';
import { renderPlaceholder } from './views/placeholder.js';
import { buscarPagina } from './views/routes.js';
import { iniciarDados } from './data/loader.js';

const view = document.getElementById('view');

function carregarPreferencias() {
  const tema = persist.get('tema');
  const visao = persist.get('visao');
  const robo = persist.get('robo');
  const clienteAtual = persist.get('clienteAtual');
  setState({
    tema: tema === 'light' || tema === 'dark' ? tema : null,
    visao: document.documentElement.dataset.view ?? (visao === 'admin' ? 'admin' : 'cliente'),
    robo: robo === 'pausado' ? 'pausado' : 'ligado',
    menuRecolhido: persist.get('menuRecolhido') === true,
    ...(typeof clienteAtual === 'string' ? { clienteAtual } : {}),
  });
}

function desenharTela() {
  const rota = getState().rota;
  if (!rota) return;
  const definicao = buscarPagina(rota.visao, rota.pagina);
  if (getState().carregando) renderCarregando(view, definicao);
  else renderPlaceholder(view, definicao);
  renderIcons();
}

function aoMudarRota({ visao, pagina, definicao }) {
  desenharTela();
  document.title = `${definicao.titulo} · CriptoOps`;
  window.scrollTo(0, 0);
  persist.set('visao', visao);
  persist.set('rota', hashDe(visao, pagina));
}

async function iniciar() {
  carregarPreferencias();
  iniciarScrim();
  iniciarTopbar();
  iniciarSidebar();
  iniciarAvisos();

  on('route:change', aoMudarRota);
  on('data:ready', desenharTela);
  on('state:clienteAtual', (id) => persist.set('clienteAtual', id));

  iniciarRoteador(persist.get('rota'));
  renderIcons();

  await iniciarDados();
}

iniciar();

// Facilita inspecionar o estado e testar as mutações pelo console durante a demonstração.
window.criptoops = store;
