// Montagem de velas a partir das atualizações de preço: 1 min (gráficos e estratégias) e 15 s
// (confirmação de sinal no perfil Demonstração). Guarda no máximo 500 velas por moeda e intervalo.
// A vela fecha quando chega um preço do intervalo seguinte ou quando o relógio passa do fim dela.

export const INTERVALOS_VELA = { '15s': 15_000, '1m': 60_000 };
export const MAX_VELAS = 500;

export function criarMontador({ aoFechar = () => {}, intervalos = INTERVALOS_VELA, maxVelas = MAX_VELAS } = {}) {
  const series = new Map();   // 'BTC:1m' → [velas fechadas]
  const abertas = new Map();  // 'BTC:1m' → { vela, volumeInicial }

  const chave = (moeda, intervalo) => `${moeda}:${intervalo}`;

  /** Lista (sempre o mesmo array) das velas fechadas de uma moeda num intervalo. */
  function serie(moeda, intervalo) {
    const k = chave(moeda, intervalo);
    if (!series.has(k)) series.set(k, []);
    return series.get(k);
  }

  function fechar(moeda, intervalo) {
    const k = chave(moeda, intervalo);
    const aberta = abertas.get(k);
    if (!aberta) return;
    abertas.delete(k);
    const lista = serie(moeda, intervalo);
    lista.push(aberta.vela);
    if (lista.length > maxVelas) lista.splice(0, lista.length - maxVelas);
    aoFechar({ moeda, intervalo, vela: aberta.vela });
  }

  /** Registra um preço. `volume24h` (opcional) é o volume acumulado de 24 h, usado para o volume da vela. */
  function registrar(moeda, preco, em = Date.now(), volume24h = null) {
    for (const [intervalo, duracao] of Object.entries(intervalos)) {
      const k = chave(moeda, intervalo);
      const inicio = Math.floor(em / duracao) * duracao;
      let aberta = abertas.get(k);
      if (aberta && aberta.vela.t !== inicio) {
        if (inicio < aberta.vela.t) continue; // preço atrasado: ignora
        fechar(moeda, intervalo);
        aberta = null;
      }
      if (!aberta) {
        aberta = {
          vela: { t: inicio, abertura: preco, maxima: preco, minima: preco, fechamento: preco, volume: 0 },
          volumeInicial: volume24h,
        };
        abertas.set(k, aberta);
      }
      const v = aberta.vela;
      if (preco > v.maxima) v.maxima = preco;
      if (preco < v.minima) v.minima = preco;
      v.fechamento = preco;
      if (volume24h != null && aberta.volumeInicial != null) v.volume = Math.max(0, volume24h - aberta.volumeInicial);
    }
  }

  /** Fecha as velas cujo intervalo já terminou (chamar a cada segundo). */
  function fecharVencidas(em = Date.now()) {
    for (const [k, aberta] of [...abertas]) {
      const [moeda, intervalo] = k.split(':');
      if (em >= aberta.vela.t + intervalos[intervalo]) fechar(moeda, intervalo);
    }
  }

  /** Vela ainda em formação (ou null). */
  function aberta(moeda, intervalo) {
    return abertas.get(chave(moeda, intervalo))?.vela ?? null;
  }

  return { registrar, fecharVencidas, serie, aberta };
}
