// Ícones Lucide: as telas escrevem <i data-lucide="nome"> e chamam renderIcons() depois.
// Se o script do Lucide não carregar (sem internet), os ícones só não aparecem.

export function icon(nome, classe = 'icon') {
  return `<i data-lucide="${nome}" class="${classe}" aria-hidden="true"></i>`;
}

export function renderIcons() {
  const lucide = window.lucide;
  if (!lucide?.createIcons) return;
  try {
    lucide.createIcons({ attrs: { 'stroke-width': 1.75, 'aria-hidden': 'true' } });
  } catch (erro) {
    console.warn('[icons] falha ao desenhar ícones', erro);
  }
}
