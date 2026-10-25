// Esqueleto de carregamento enquanto o histórico de preços chega (~1–2 s com internet).

const bloco = (largura, altura = 10) =>
  `<span class="skeleton skeleton--block" style="width:${largura};height:${altura}px"></span>`;

export function renderCarregando(alvo, pagina) {
  const kpis = Array.from({ length: 4 }, () => `
    <div class="card loading__kpi">
      ${bloco('40%')}
      ${bloco('70%', 22)}
      ${bloco('50%')}
    </div>`).join('');
  const linhas = Array.from({ length: 6 }, (_, i) => `
    <div class="loading__row">
      ${bloco('14%')}${bloco(`${30 + ((i * 17) % 30)}%`)}${bloco('12%')}${bloco('16%')}
    </div>`).join('');

  alvo.innerHTML = `
    <section class="page" aria-busy="true">
      <header class="page-head">
        <div>
          ${pagina ? `<p class="label page-head__code">${pagina.codigo}</p><h1>${pagina.titulo}</h1>` : bloco('180px', 22)}
          <p class="loading__text" role="status">Baixando o histórico de preços da Binance…</p>
        </div>
      </header>
      <div class="loading__kpis">${kpis}</div>
      <div class="card loading__table">${linhas}</div>
    </section>
  `;
}
