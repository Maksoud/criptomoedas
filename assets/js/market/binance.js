// API pública da Binance — parte REST (a parte WebSocket chega na F2).
// Domínio só de dados de mercado, sem chave e com CORS liberado.

export const REST = 'https://data-api.binance.vision';
export const TIMEOUT_MS = 8000;
const LIMITE_POR_CHAMADA = 1000;

export const DURACAO_INTERVALO = {
  '1m': 60_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

export class ErroBinance extends Error {
  constructor(mensagem, { status = null, url = null, cause } = {}) {
    super(mensagem, { cause });
    this.name = 'ErroBinance';
    this.status = status;
    this.url = url;
  }
}

async function pedir(caminho, params = {}) {
  const url = new URL(caminho, REST);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new ErroBinance(`A Binance respondeu ${resp.status}`, { status: resp.status, url: String(url) });
    return await resp.json();
  } catch (erro) {
    if (erro instanceof ErroBinance) throw erro;
    const tempo = erro?.name === 'AbortError';
    throw new ErroBinance(tempo ? 'A Binance não respondeu em 8 s' : 'Sem conexão com a Binance', { url: String(url), cause: erro });
  } finally {
    clearTimeout(timer);
  }
}

/** Kline da Binance → vela. `t` é a abertura (ms). */
function paraVela(k) {
  return { t: k[0], abertura: +k[1], maxima: +k[2], minima: +k[3], fechamento: +k[4], volume: +k[5] };
}

/** Até 1000 velas terminando em `fimEm` (ms, opcional). */
export async function velas(par, intervalo, limite = 500, fimEm = null) {
  const dados = await pedir('/api/v3/klines', {
    symbol: par,
    interval: intervalo,
    limit: Math.min(limite, LIMITE_POR_CHAMADA),
    endTime: fimEm ?? undefined,
  });
  return dados.map(paraVela);
}

/** Qualquer quantidade de velas, fazendo quantas chamadas forem precisas (da mais nova para a mais antiga). */
export async function velasEmLote(par, intervalo, total, fimEm = null) {
  let restantes = total;
  let fim = fimEm;
  let lista = [];
  while (restantes > 0) {
    const pedido = Math.min(restantes, LIMITE_POR_CHAMADA);
    const lote = await velas(par, intervalo, pedido, fim);
    lista = lote.concat(lista);
    restantes -= lote.length;
    if (lote.length < pedido) break; // não há mais histórico
    fim = lote[0].t - 1;
  }
  return lista;
}

/** Variação de 24 h: { BTCUSDT: { atual, abertura, variacaoPct, maxima, minima, volume } } */
export async function ticker24h(pares) {
  const dados = await pedir('/api/v3/ticker/24hr', { symbols: pares });
  const porPar = {};
  for (const t of dados) {
    porPar[t.symbol] = {
      atual: +t.lastPrice,
      abertura: +t.openPrice,
      variacaoPct: +t.priceChangePercent,
      maxima: +t.highPrice,
      minima: +t.lowPrice,
      volume: +t.quoteVolume,
    };
  }
  return porPar;
}

/** '0.00010000' → 4 casas decimais. */
export function casasDoPasso(passo) {
  const [, dec = ''] = String(passo).split('.');
  const util = dec.replace(/0+$/, '');
  return util.length;
}

/** Precisão de cada par: { BTCUSDT: { preco: casas, quantidade: casas, minimo: USDT } } */
export async function exchangeInfo(pares) {
  const dados = await pedir('/api/v3/exchangeInfo', { symbols: pares });
  const porPar = {};
  for (const s of dados.symbols ?? []) {
    const filtro = (tipo) => s.filters.find((f) => f.filterType === tipo);
    const preco = filtro('PRICE_FILTER');
    const lote = filtro('LOT_SIZE');
    const nocional = filtro('NOTIONAL') ?? filtro('MIN_NOTIONAL');
    porPar[s.symbol] = {
      preco: preco ? casasDoPasso(preco.tickSize) : null,
      quantidade: lote ? casasDoPasso(lote.stepSize) : null,
      minimo: nocional ? +nocional.minNotional : null,
    };
  }
  return porPar;
}
