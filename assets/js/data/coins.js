// Catálogo de moedas (docs/DADOS_FICTICIOS.md §2). Todos os pares são contra USDT.
// `precoRef` e `volatilidade` só são usados quando a Binance não responde (modo simulado).
// `precisao` é o valor de reserva; o real vem do exchangeInfo da Binance.

export const MOEDA_BASE = 'USDT';

export const MOEDAS = [
  { simbolo: 'BTC',  par: 'BTCUSDT',  nome: 'Bitcoin',   precoRef: 80000, volatilidade: 0.08, cor: '#F7931A', ativa: true,  precisao: { preco: 2, quantidade: 6, minimo: 5 } },
  { simbolo: 'ETH',  par: 'ETHUSDT',  nome: 'Ethereum',  precoRef: 3400,  volatilidade: 0.10, cor: '#8C8CF0', ativa: true,  precisao: { preco: 2, quantidade: 6, minimo: 5 } },
  { simbolo: 'BNB',  par: 'BNBUSDT',  nome: 'BNB',       precoRef: 600,   volatilidade: 0.09, cor: '#F3BA2F', ativa: true,  precisao: { preco: 2, quantidade: 4, minimo: 5 } },
  { simbolo: 'SOL',  par: 'SOLUSDT',  nome: 'Solana',    precoRef: 150,   volatilidade: 0.14, cor: '#14F195', ativa: true,  precisao: { preco: 2, quantidade: 4, minimo: 5 } },
  { simbolo: 'XRP',  par: 'XRPUSDT',  nome: 'XRP',       precoRef: 0.58,  volatilidade: 0.12, cor: '#9AA4B2', ativa: true,  precisao: { preco: 4, quantidade: 4, minimo: 5 } },
  { simbolo: 'ADA',  par: 'ADAUSDT',  nome: 'Cardano',   precoRef: 0.42,  volatilidade: 0.12, cor: '#3468D1', ativa: true,  precisao: { preco: 4, quantidade: 4, minimo: 5 } },
  { simbolo: 'DOGE', par: 'DOGEUSDT', nome: 'Dogecoin',  precoRef: 0.14,  volatilidade: 0.18, cor: '#C2A633', ativa: true,  precisao: { preco: 5, quantidade: 4, minimo: 5 } },
  { simbolo: 'LINK', par: 'LINKUSDT', nome: 'Chainlink', precoRef: 14.5,  volatilidade: 0.13, cor: '#2A5ADA', ativa: true,  precisao: { preco: 2, quantidade: 4, minimo: 5 } },
  { simbolo: 'LTC',  par: 'LTCUSDT',  nome: 'Litecoin',  precoRef: 78,    volatilidade: 0.11, cor: '#A6A9AA', ativa: false, precisao: { preco: 2, quantidade: 4, minimo: 5 } },
  { simbolo: 'DOT',  par: 'DOTUSDT',  nome: 'Polkadot',  precoRef: 6.2,   volatilidade: 0.13, cor: '#E6007A', ativa: false, precisao: { preco: 2, quantidade: 4, minimo: 5 } },
];

export const MOEDAS_ATIVAS = MOEDAS.filter((m) => m.ativa);

export function moedaPorSimbolo(simbolo) {
  return MOEDAS.find((m) => m.simbolo === simbolo) ?? null;
}

// Taxa por execução, em % do valor (só leitura no MVP).
export const TAXA_PCT = 0.1;

// Perfis de parâmetros (docs/ESTRATEGIAS.md §1.4). O perfil só preenche os campos.
export const PERFIS = {
  padrao: {
    nome: 'Padrão',
    spread: 2,
    recuoCompra: 3,
    recuoVenda: 3,
    lucro: 3,
    lucroMinimo: 0.5,
    confirmacao: { modo: 'velas', n: 2, intervaloSeg: 60 },
  },
  demo: {
    nome: 'Demonstração',
    spread: 0.4,
    recuoCompra: 0.4,
    recuoVenda: 0.4,
    lucro: 0.5,
    lucroMinimo: 0.15,
    confirmacao: { modo: 'velas', n: 2, intervaloSeg: 15 },
  },
};

/** Parâmetros de uma moeda para um perfil (estratégia B como padrão até a F4). */
export function parametrosDoPerfil(perfil = 'demo') {
  const p = PERFIS[perfil] ?? PERFIS.demo;
  return {
    estrategia: 'spread-fixo',
    params: {
      spread: p.spread,
      lucro: p.lucro,
      degraus: 3,
      reposicionar: true,
      recuoCompra: p.recuoCompra,
      recuoVenda: p.recuoVenda,
      lucroMinimo: p.lucroMinimo,
      maxPosicoes: 5,
      piso: null,
      teto: null,
      stopPerda: null,
      taxa: TAXA_PCT,
    },
    confirmacao: {
      ativa: false,
      modo: p.confirmacao.modo,
      n: p.confirmacao.n,
      intervaloSeg: p.confirmacao.intervaloSeg,
      aplicarEm: 'ambos',
    },
  };
}
