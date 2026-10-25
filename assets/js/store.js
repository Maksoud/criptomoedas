// Estado central em memória + eventos (pub/sub).
// As telas só leem daqui e reagem aos eventos; nada guarda estado por conta própria.

const ouvintes = new Map();

const estado = {
  visao: 'cliente',      // 'cliente' | 'admin'
  rota: null,            // { visao, pagina }
  tema: null,            // 'dark' | 'light' | null (segue o sistema)
  robo: 'ligado',        // 'ligado' | 'pausado'
  menuRecolhido: false,
};

export function getState() {
  return estado;
}

/** Atualiza o estado e emite `state:<chave>` para cada chave que mudou. */
export function setState(parcial) {
  const mudou = [];
  for (const [chave, valor] of Object.entries(parcial)) {
    if (estado[chave] !== valor) {
      estado[chave] = valor;
      mudou.push(chave);
    }
  }
  for (const chave of mudou) emit(`state:${chave}`, estado[chave]);
  return mudou;
}

/** Assina um evento. Retorna a função que cancela a assinatura. */
export function on(evento, fn) {
  if (!ouvintes.has(evento)) ouvintes.set(evento, new Set());
  ouvintes.get(evento).add(fn);
  return () => ouvintes.get(evento)?.delete(fn);
}

export function emit(evento, dados) {
  const lista = ouvintes.get(evento);
  if (!lista) return;
  for (const fn of [...lista]) {
    try {
      fn(dados);
    } catch (erro) {
      console.error(`[store] erro no ouvinte de "${evento}"`, erro);
    }
  }
}
