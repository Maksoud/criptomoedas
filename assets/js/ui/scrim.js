// Fundo escurecido compartilhado pela gaveta do menu e pelo painel de alertas.
// Só uma camada fica aberta por vez; clicar no fundo ou apertar Esc fecha.

const scrim = () => document.getElementById('scrim');
let fecharAtual = null;

export function abrirCamada(fechar) {
  if (fecharAtual && fecharAtual !== fechar) fecharAtual();
  fecharAtual = fechar;
  scrim().classList.add('is-visible');
}

export function fecharCamada(fechar) {
  if (fecharAtual !== fechar) return;
  fecharAtual = null;
  scrim().classList.remove('is-visible');
}

export function iniciarScrim() {
  scrim().addEventListener('click', () => fecharAtual?.());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fecharAtual) fecharAtual();
  });
}
