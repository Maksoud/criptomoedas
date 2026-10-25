// Inicialização: lê preferências salvas, monta o topo e o menu, liga as rotas.
import { getState, setState, on } from './store.js';
import * as persist from './persist.js';
import { iniciarRoteador, hashDe } from './router.js';
import { iniciarScrim } from './ui/scrim.js';
import { iniciarTopbar } from './ui/topbar.js';
import { iniciarSidebar } from './ui/sidebar.js';
import { renderIcons } from './ui/icons.js';
import { renderPlaceholder } from './views/placeholder.js';

const app = document.getElementById('app');

function carregarPreferencias() {
  const tema = persist.get('tema');
  const visao = persist.get('visao');
  const robo = persist.get('robo');
  setState({
    tema: tema === 'light' || tema === 'dark' ? tema : null,
    visao: document.documentElement.dataset.view ?? (visao === 'admin' ? 'admin' : 'cliente'),
    robo: robo === 'pausado' ? 'pausado' : 'ligado',
    menuRecolhido: persist.get('menuRecolhido') === true,
  });
}

function renderizarRota({ visao, pagina, definicao }) {
  renderPlaceholder(app, definicao);
  renderIcons();
  document.title = `${definicao.titulo} · CriptoOps`;
  window.scrollTo(0, 0);
  persist.set('visao', visao);
  persist.set('rota', hashDe(visao, pagina));
}

function iniciar() {
  carregarPreferencias();
  iniciarScrim();
  iniciarTopbar();
  iniciarSidebar();

  on('route:change', renderizarRota);

  iniciarRoteador(persist.get('rota'));
  renderIcons();
}

iniciar();

// Facilita inspecionar o estado pelo console durante a demonstração.
window.criptoops = { getState };
