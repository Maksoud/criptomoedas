// Inicialização: lê preferências salvas, monta o topo e o menu, liga as rotas e carrega os dados.
import * as store from './store.js';
import { getState, setState, on } from './store.js';
import * as persist from './persist.js';
import { iniciarRoteador, hashDe, lerConsulta } from './router.js';
import { iniciarScrim } from './ui/scrim.js';
import { iniciarTopbar } from './ui/topbar.js';
import { iniciarSidebar } from './ui/sidebar.js';
import { iniciarAvisos } from './ui/notices.js';
import { renderIcons } from './ui/icons.js';
import { renderCarregando } from './ui/loading.js';
import { renderPlaceholder } from './views/placeholder.js';
import { buscarPagina } from './views/routes.js';
import { iniciarDados } from './data/loader.js';
import { iniciarFeed } from './market/feed.js';
import * as feed from './market/feed.js';
import { iniciarTicker } from './ui/ticker.js';
import { iniciarSeletorCliente } from './ui/clientpicker.js';
import { TELAS_CLIENTE } from './views/client/index.js';
import { TELAS_ADMIN } from './views/admin/index.js';
import { iniciarMotor } from './engine/engine.js';
import * as motor from './engine/engine.js';
import { iniciarApuracao } from './engine/apuracao.js';
import { iniciarRegras } from './alerts/rules.js';
import { iniciarCentral } from './alerts/center.js';
import { iniciarAjustes } from './data/ajustes.js';
import { iniciarTour } from './ui/tour.js';

const view = document.getElementById('view');
const TELAS = { cliente: TELAS_CLIENTE, admin: TELAS_ADMIN };
let telaAtual = null; // contexto da tela montada (assinaturas, gráficos), desfeito ao trocar

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
  telaAtual?.destruir();
  telaAtual = null;
  if (getState().carregando) {
    renderCarregando(view, definicao);
  } else {
    const montar = TELAS[rota.visao]?.[rota.pagina];
    if (montar) {
      try {
        telaAtual = montar(view, { definicao, consulta: lerConsulta() });
      } catch (erro) {
        console.error(`[tela] erro ao montar ${rota.visao}/${rota.pagina}`, erro);
        renderPlaceholder(view, definicao);
      }
    } else {
      renderPlaceholder(view, definicao);
    }
  }
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
  iniciarFeed();   // antes da faixa: no data:ready o feed reaplica os últimos preços ao vivo
  iniciarTicker();
  iniciarSeletorCliente();
  // Motor, regras e apuração antes das telas: no data:ready eles acertam ordens e períodos primeiro,
  // e as telas desenham já com o estado final.
  iniciarMotor();
  iniciarRegras();
  iniciarApuracao();
  iniciarCentral();
  iniciarAjustes(); // depois do motor e da apuração: só grava o que muda após o carregamento

  iniciarTour();

  // "Pular para o conteúdo": foca o <main> sem mexer no hash (o hash é a rota).
  document.getElementById('skip-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('app').focus();
  });

  on('route:change', aoMudarRota);
  on('route:query', desenharTela);   // filtros mudados pelo endereço (voltar/avançar, link colado)
  on('data:ready', desenharTela);
  on('state:clienteAtual', (id) => {
    persist.set('clienteAtual', id);
    if (getState().visao === 'cliente') desenharTela();
  });

  iniciarRoteador(persist.get('rota'));
  renderIcons();

  await iniciarDados();
}

iniciar();

// Facilita inspecionar o estado e testar as mutações pelo console durante a demonstração.
window.criptoops = { ...store, feed, motor };
