// API pública da Binance: REST (histórico, variação 24 h, precisões) e WebSocket (cotação ao vivo).
// Domínios só de dados de mercado, sem chave e com CORS liberado.

export const REST = 'https://data-api.binance.vision';
export const WS = 'wss://data-stream.binance.vision';
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

// ---------------------------------------------------------------------------
// WebSocket: cotação ao vivo (miniTicker, ~1 atualização/s por moeda)
// ---------------------------------------------------------------------------

export const ESPERAS_MS = [1000, 2000, 5000, 10000]; // espera crescente entre tentativas
export const FALHAS_PARA_SIMULADO = 3;
export const SINAL_DE_VIDA_MS = 15000;              // sem mensagem nesse tempo = desconectado
const PRIMEIRA_MENSAGEM_MS = 6000;                  // tempo para abrir e receber a 1ª mensagem

/** wss://…/stream?streams=btcusdt@miniTicker/ethusdt@miniTicker */
export function urlDoFluxo(pares) {
  return `${WS}/stream?streams=${pares.map((p) => `${p.toLowerCase()}@miniTicker`).join('/')}`;
}

/** Mensagem do fluxo combinado → { par, atual, abertura24h, variacao24h, maxima, minima, volume24h, em } ou null. */
export function lerMiniTicker(msg) {
  const d = msg?.data ?? msg;
  if (!d || d.e !== '24hrMiniTicker' || !d.s) return null;
  const atual = +d.c;
  const abertura24h = +d.o;
  if (!(atual > 0)) return null;
  return {
    par: d.s,
    atual,
    abertura24h,
    variacao24h: abertura24h > 0 ? (atual / abertura24h - 1) * 100 : 0,
    maxima: +d.h,
    minima: +d.l,
    volume24h: +d.q, // volume em USDT nas últimas 24 h
    em: +d.E || Date.now(),
  };
}

/**
 * Conexão ao vivo com reconexão automática.
 * Estados: 'fechado' → 'conectando' → 'aovivo'; ao cair, 'reconectando' (espera 1, 2, 5, 10 s);
 * após 3 falhas seguidas, 'falhou' (continua tentando a cada 10 s até voltar a 'aovivo').
 * Uma falha é: não abrir/receber a 1ª mensagem a tempo, a conexão fechar, ou 15 s sem mensagem.
 */
export function criarFluxo({
  aoPreco,
  aoEstado = () => {},
  WebSocketImpl = globalThis.WebSocket,
  esperas = ESPERAS_MS,
  falhasParaSimulado = FALHAS_PARA_SIMULADO,
  sinalDeVidaMs = SINAL_DE_VIDA_MS,
  primeiraMensagemMs = PRIMEIRA_MENSAGEM_MS,
} = {}) {
  let pares = [];
  let ws = null;
  let geracao = 0;          // invalida eventos de conexões antigas
  let ativo = false;
  let estado = 'fechado';
  let falhas = 0;
  let ultimaMensagem = 0;
  let timerReabrir = null;
  let timerPrimeira = null;
  let timerVida = null;

  function mudar(novo, motivo = null) {
    if (novo === estado) return;
    estado = novo;
    aoEstado({ estado, falhas, motivo });
  }

  function limparTimers() {
    clearTimeout(timerReabrir);
    clearTimeout(timerPrimeira);
    clearInterval(timerVida);
    timerReabrir = timerPrimeira = timerVida = null;
  }

  function descartar() {
    if (!ws) return;
    const velho = ws;
    ws = null;
    velho.onopen = velho.onmessage = velho.onclose = velho.onerror = null;
    try { velho.close(); } catch { /* já fechado */ }
  }

  function conectar() {
    limparTimers();
    descartar();
    if (!ativo || !pares.length) return;
    const minha = ++geracao;
    if (estado !== 'falhou') mudar(falhas ? 'reconectando' : 'conectando');

    let socket;
    try {
      socket = new WebSocketImpl(urlDoFluxo(pares));
    } catch {
      falhar(minha, 'erro ao abrir');
      return;
    }
    ws = socket;
    let recebeu = false;
    timerPrimeira = setTimeout(() => falhar(minha, 'sem resposta'), primeiraMensagemMs);

    socket.onmessage = (ev) => {
      if (minha !== geracao) return;
      ultimaMensagem = Date.now();
      if (!recebeu) {
        recebeu = true;
        clearTimeout(timerPrimeira);
        falhas = 0;
        mudar('aovivo');
        timerVida = setInterval(() => {
          if (Date.now() - ultimaMensagem > sinalDeVidaMs) falhar(minha, 'sem sinal');
        }, Math.min(1000, sinalDeVidaMs / 2));
      }
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      const tick = lerMiniTicker(msg);
      if (tick) aoPreco(tick);
    };
    socket.onclose = () => falhar(minha, 'conexão fechada');
    socket.onerror = () => { /* o close vem em seguida */ };
  }

  function falhar(minha, motivo) {
    if (minha !== geracao || !ativo) return;
    geracao++;
    limparTimers();
    descartar();
    falhas++;
    mudar(falhas >= falhasParaSimulado ? 'falhou' : 'reconectando', motivo);
    const espera = esperas[Math.min(falhas - 1, esperas.length - 1)];
    timerReabrir = setTimeout(conectar, espera);
  }

  return {
    /** Abre (ou reabre) a conexão com estes pares. */
    abrir(novosPares) {
      const lista = [...new Set(novosPares)].sort();
      const igual = ativo && lista.join() === pares.join() && (ws || timerReabrir);
      pares = lista;
      ativo = true;
      if (igual) return;
      if (!pares.length) { limparTimers(); descartar(); mudar('fechado'); return; }
      conectar();
    },
    fechar() {
      ativo = false;
      geracao++;
      limparTimers();
      descartar();
      mudar('fechado');
    },
    /** Força uma falha agora (ex.: o navegador avisou que ficou sem internet). */
    derrubar(motivo = 'sem internet') {
      if (ativo && estado !== 'falhou') falhar(geracao, motivo);
    },
    /** Tenta de novo já, sem esperar (ex.: a internet voltou). */
    tentarJa() {
      if (ativo && estado !== 'aovivo' && pares.length) conectar();
    },
    get estado() { return estado; },
    get falhas() { return falhas; },
    get pares() { return [...pares]; },
  };
}
