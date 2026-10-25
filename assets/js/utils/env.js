// Modo de desenvolvimento: servidor local ou ?dev na URL. Liga as validações do gerador.
export const DEV = (() => {
  if (typeof location === 'undefined') return true;
  if (/^(localhost|127\.|\[::1\]|192\.168\.)/.test(location.hostname)) return true;
  return new URLSearchParams(location.search).has('dev');
})();

/** Arredonda para `casas` decimais (padrão: centavos). */
export function arredondar(v, casas = 2) {
  const f = 10 ** casas;
  return Math.round((v + Number.EPSILON) * f) / f;
}

/** Trunca para baixo em `casas` decimais (quantidade que cabe no valor). */
export function truncar(v, casas) {
  const f = 10 ** casas;
  return Math.floor(v * f + 1e-9) / f;
}
