// Catálogo de moedas (docs/DADOS_FICTICIOS.md §2). Todos os pares são contra USDT.
// `precoRef` e `volatilidade` só são usados quando a Binance não responde (modo simulado).
// `precisao` é o valor de reserva; o real vem do exchangeInfo da Binance.
// `estrategia` é a estratégia ao vivo ao abrir (o histórico é sempre gerado com a B): as moedas são
// distribuídas entre A, B e G para a demonstração mostrar as três. Perfis e parâmetros: engine/params.js.

export const MOEDA_BASE = 'USDT';

export const MOEDAS = [
  { simbolo: 'BTC',  par: 'BTCUSDT',  nome: 'Bitcoin',   precoRef: 80000, volatilidade: 0.08, cor: '#F7931A', ativa: true, estrategia: 'spread-fixo', precisao: { preco: 2, quantidade: 6, minimo: 5 } },
  { simbolo: 'ETH',  par: 'ETHUSDT',  nome: 'Ethereum',  precoRef: 3400,  volatilidade: 0.10, cor: '#8C8CF0', ativa: true, estrategia: 'reversao-picos', precisao: { preco: 2, quantidade: 6, minimo: 5 } },
  { simbolo: 'BNB',  par: 'BNBUSDT',  nome: 'BNB',       precoRef: 600,   volatilidade: 0.09, cor: '#F3BA2F', ativa: true, estrategia: 'canal', precisao: { preco: 2, quantidade: 4, minimo: 5 } },
  { simbolo: 'SOL',  par: 'SOLUSDT',  nome: 'Solana',    precoRef: 150,   volatilidade: 0.14, cor: '#14F195', ativa: true, estrategia: 'reversao-picos', precisao: { preco: 2, quantidade: 4, minimo: 5 } },
  { simbolo: 'XRP',  par: 'XRPUSDT',  nome: 'XRP',       precoRef: 0.58,  volatilidade: 0.12, cor: '#9AA4B2', ativa: true, estrategia: 'spread-fixo', precisao: { preco: 4, quantidade: 4, minimo: 5 } },
  { simbolo: 'ADA',  par: 'ADAUSDT',  nome: 'Cardano',   precoRef: 0.42,  volatilidade: 0.12, cor: '#3468D1', ativa: true, estrategia: 'canal', precisao: { preco: 4, quantidade: 4, minimo: 5 } },
  { simbolo: 'DOGE', par: 'DOGEUSDT', nome: 'Dogecoin',  precoRef: 0.14,  volatilidade: 0.18, cor: '#C2A633', ativa: true, estrategia: 'spread-fixo', precisao: { preco: 5, quantidade: 4, minimo: 5 } },
  { simbolo: 'LINK', par: 'LINKUSDT', nome: 'Chainlink', precoRef: 14.5,  volatilidade: 0.13, cor: '#2A5ADA', ativa: true, estrategia: 'reversao-picos', precisao: { preco: 2, quantidade: 4, minimo: 5 } },
  { simbolo: 'LTC',  par: 'LTCUSDT',  nome: 'Litecoin',  precoRef: 78,    volatilidade: 0.11, cor: '#A6A9AA', ativa: false, estrategia: 'spread-fixo', precisao: { preco: 2, quantidade: 4, minimo: 5 } },
  { simbolo: 'DOT',  par: 'DOTUSDT',  nome: 'Polkadot',  precoRef: 6.2,   volatilidade: 0.13, cor: '#E6007A', ativa: false, estrategia: 'spread-fixo', precisao: { preco: 2, quantidade: 4, minimo: 5 } },
];

export const MOEDAS_ATIVAS = MOEDAS.filter((m) => m.ativa);

export function moedaPorSimbolo(simbolo) {
  return MOEDAS.find((m) => m.simbolo === simbolo) ?? null;
}

// Taxa por execução, em % do valor (só leitura no MVP).
export const TAXA_PCT = 0.1;
