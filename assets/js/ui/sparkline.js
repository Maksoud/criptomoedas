// Minigráfico (sparkline) em SVG, para KPIs e cards. Sem eixos nem rótulos: só a forma da série.
// A cor vem da tendência (primeiro → último valor): alta usa --up, baixa usa --down, estável usa --text-muted.
// O SVG estica na largura do contêiner; a altura padrão é 32 px (docs/IDENTIDADE_VISUAL.md, KPI card).

const LARGURA = 100; // unidades do viewBox (o SVG estica para a largura real)

function tendenciaDe(valores) {
  if (valores.length < 2) return 'flat';
  const a = valores[0];
  const b = valores.at(-1);
  if (a === b) return 'flat';
  return b > a ? 'up' : 'down';
}

/** Pontos [x, y] no viewBox, com 2 px de folga em cima e embaixo para o traço não cortar. */
export function pontosDaSerie(valores, altura = 32) {
  const n = valores.length;
  if (!n) return [];
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const faixa = max - min || 1;
  const folga = 2;
  return valores.map((v, i) => [
    n === 1 ? LARGURA : (i / (n - 1)) * LARGURA,
    max === min ? altura / 2 : folga + (1 - (v - min) / faixa) * (altura - 2 * folga),
  ]);
}

const fmt = (n) => Math.round(n * 100) / 100;

/**
 * SVG de minigráfico.
 * @param {number[]} valores série em ordem cronológica (valores não numéricos são ignorados)
 * @param {{ altura?: number, tendencia?: 'auto'|'up'|'down'|'flat', rotulo?: string, area?: boolean }} opcoes
 */
export function sparkline(valores, { altura = 32, tendencia = 'auto', rotulo = '', area = true } = {}) {
  const serie = (valores ?? []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const dir = tendencia === 'auto' ? tendenciaDe(serie) : tendencia;
  const aria = rotulo ? `role="img" aria-label="${rotulo.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  const abrir = `<svg class="spark" data-dir="${dir}" viewBox="0 0 ${LARGURA} ${altura}" preserveAspectRatio="none" style="height:${altura}px" ${aria}>`;
  if (serie.length < 2) {
    return `${abrir}<line class="spark__line" x1="0" x2="${LARGURA}" y1="${altura / 2}" y2="${altura / 2}"/></svg>`;
  }
  const pts = pontosDaSerie(serie, altura);
  const linha = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`).join('');
  const preenchimento = area ? `<path class="spark__area" d="${linha}L${LARGURA} ${altura}L0 ${altura}Z"/>` : '';
  return `${abrir}${preenchimento}<path class="spark__line" d="${linha}"/></svg>`;
}

/** Desenha (ou redesenha) o minigráfico dentro de `el`. */
export function desenharSparkline(el, valores, opcoes) {
  if (el) el.innerHTML = sparkline(valores, opcoes);
}
