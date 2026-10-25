// Tela provisória: título + estado vazio. Cada tela real substitui esta a partir da fase indicada.
import { icon } from '../ui/icons.js';

const NOMES_FASE = {
  F3: 'F3 · Visão do cliente',
  F5: 'F5 · Visão do administrador',
};

export function renderPlaceholder(alvo, pagina) {
  alvo.innerHTML = `
    <section class="page">
      <header class="page-head">
        <div>
          <p class="label page-head__code">${pagina.codigo}</p>
          <h1>${pagina.titulo}</h1>
          <p>${pagina.resumo}</p>
        </div>
      </header>
      <div class="card">
        <div class="empty">
          <span class="empty__icon">${icon(pagina.icone)}</span>
          <p class="empty__title">Tela em construção</p>
          <p class="empty__text">O conteúdo desta tela chega na fase ${NOMES_FASE[pagina.fase] ?? pagina.fase}. Por enquanto, use o menu para conhecer as demais telas.</p>
        </div>
      </div>
    </section>
  `;
}
