// Gráficos com Chart.js (carregado no index.html). As cores vêm dos tokens do tema; ao trocar o tema
// o gráfico é refeito com as cores novas. Na impressão é refeito com as cores de papel (--print-*) e
// numa largura que cabe na A4. Sem o Chart.js (sem internet), mostra um aviso no lugar.

import { getState, on } from '../store.js';

const temaClaroMQ = window.matchMedia('(prefers-color-scheme: light)');
const LARGURA_IMPRESSAO = 640; // px: ~170 mm, dentro dos 178 mm úteis da A4 retrato com margens de 16 mm

const ativos = new Set();
let imprimindo = false;

/** Cores atuais do tema (ou de papel, durante a impressão). */
export function lerCores() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const serie = [1, 2, 3, 4, 5, 6, 7].map((i) => v(`--chart-${i}`));
  if (imprimindo) {
    return {
      texto: v('--print-text'), muted: v('--print-muted'), faint: v('--print-muted'), borda: v('--print-border'),
      fundo: v('--print-bg'), brand: v('--print-brand'), up: v('--print-up'), down: v('--print-down'), serie,
    };
  }
  return {
    texto: v('--text'), muted: v('--text-muted'), faint: v('--text-faint'), borda: v('--border'),
    fundo: v('--surface'), brand: v('--brand'), up: v('--up'), down: v('--down'), serie,
  };
}

/** '#F5B83D' (ou 'rgb(...)') com transparência. */
export function comAlfa(cor, alfa) {
  const c = String(cor).trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = [...h].map((x) => x + x).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((x) => x.trim());
    return `rgba(${r}, ${g}, ${b}, ${alfa})`;
  }
  return c;
}

/** Opções comuns: sem animação, eixos discretos, dica com as cores do tema. */
export function opcoesBase(cores, { eixoY = (v) => v, dica = null, legenda = true } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: legenda, align: 'end', labels: { color: cores.muted, boxWidth: 12, boxHeight: 12 } },
      tooltip: {
        backgroundColor: cores.fundo,
        titleColor: cores.texto,
        bodyColor: cores.texto,
        borderColor: cores.borda,
        borderWidth: 1,
        padding: 10,
        ...(dica ? { callbacks: dica } : {}),
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: cores.borda }, ticks: { color: cores.faint, maxRotation: 0, autoSkipPadding: 16 } },
      y: { grid: { color: cores.borda }, border: { display: false }, ticks: { color: cores.faint, callback: eixoY, maxTicksLimit: 6 } },
    },
  };
}

function aviso(canvas) {
  const caixa = canvas.parentElement;
  if (caixa && !caixa.querySelector('.chart-off')) {
    caixa.insertAdjacentHTML('beforeend', '<p class="chart-off">Gráfico indisponível: a biblioteca de gráficos não carregou (sem internet?).</p>');
  }
}

/**
 * Cria um gráfico. `montar(cores)` devolve a configuração do Chart.js com os dados atuais;
 * é chamado de novo ao trocar o tema e ao imprimir.
 */
export function criarGrafico(canvas, montar) {
  const Chart = window.Chart;
  if (!Chart) {
    aviso(canvas);
    return { grafico: null, atualizar() {}, refazer() {}, destruir() {} };
  }
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;

  const item = {
    grafico: null,
    refazer() {
      item.grafico?.destroy();
      item.grafico = new Chart(canvas, montar(lerCores()));
      if (imprimindo) item.grafico.resize(LARGURA_IMPRESSAO, canvas.parentElement.clientHeight || 240);
    },
    /** Troca os dados (`mudar(grafico)`) e redesenha sem refazer o gráfico. */
    atualizar(mudar) {
      if (!item.grafico) return;
      mudar?.(item.grafico);
      item.grafico.update('none');
    },
    destruir() {
      ativos.delete(item);
      item.grafico?.destroy();
      item.grafico = null;
    },
  };
  item.refazer();
  ativos.add(item);
  return item;
}

function refazerTodos() {
  for (const item of ativos) item.refazer();
}

// Tema: o topo aplica o data-theme no mesmo evento; no quadro seguinte as cores novas já valem.
on('state:tema', () => requestAnimationFrame(refazerTodos));
temaClaroMQ.addEventListener('change', () => { if (!getState().tema) requestAnimationFrame(refazerTodos); });

window.addEventListener('beforeprint', () => { imprimindo = true; refazerTodos(); });
window.addEventListener('afterprint', () => { imprimindo = false; refazerTodos(); });
