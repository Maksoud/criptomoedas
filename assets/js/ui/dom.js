// Pequenos utilitários de DOM compartilhados pelas telas.

const ENTIDADES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para entrar em HTML (nomes, observações, motivos). */
export function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c]);
}

/** Primeira letra maiúscula: "alvo atingido" → "Alvo atingido". */
export function capitalizar(texto) {
  const t = String(texto ?? '');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Troca o HTML de um elemento só se mudou (evita repintar à toa). */
export function trocarHTML(el, html) {
  if (el && el.innerHTML !== html) el.innerHTML = html;
}

export function trocarTexto(el, texto) {
  if (el && el.textContent !== texto) el.textContent = texto;
}

/** Classe de cor para um resultado: lucro → up, prejuízo → down, zero → nenhuma. */
export function classeResultado(v, eps = 0.005) {
  if (!(Math.abs(v) >= eps)) return '';
  return v > 0 ? 'up' : 'down';
}

/**
 * Junta várias chamadas num único quadro de animação, no máximo uma a cada `intervalo` ms.
 * Com a aba oculta não roda; ao voltar, roda uma vez se algo ficou pendente.
 */
export function criarAgendador(fn, intervalo = 0) {
  let pendente = false;
  let ultimo = 0;
  let timer = null;
  let quadro = null;

  function rodar() {
    quadro = null;
    if (document.hidden) return;
    pendente = false;
    ultimo = performance.now();
    fn();
  }

  function pedir() {
    pendente = true;
    if (timer || quadro || document.hidden) return;
    const espera = ultimo + intervalo - performance.now();
    if (espera > 0) {
      timer = setTimeout(() => { timer = null; quadro = requestAnimationFrame(rodar); }, espera);
    } else {
      quadro = requestAnimationFrame(rodar);
    }
  }

  const aoVoltar = () => { if (!document.hidden && pendente) pedir(); };
  document.addEventListener('visibilitychange', aoVoltar);

  return {
    pedir,
    parar() {
      clearTimeout(timer);
      if (quadro) cancelAnimationFrame(quadro);
      timer = quadro = null;
      document.removeEventListener('visibilitychange', aoVoltar);
    },
  };
}

/** Rola até o elemento: suave, ou direto com prefers-reduced-motion. */
export function rolarAte(el, block = 'start') {
  const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block });
}
