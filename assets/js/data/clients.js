// Clientes fictícios (docs/DADOS_FICTICIOS.md §3). Nomes inventados.
// As datas são relativas ao dia de hoje para o histórico caber sempre nos 180 dias:
//   inicioDiasAtras     → início do contrato (e do aporte inicial)
//   pausadoDiasAtras    → desde quando o cliente está pausado (sem novas compras)
//   encerradoDiasAtras  → quando o contrato terminou (posições vendidas e saldo sacado)
//   cenario 'comissao-vencida' → o último período vencido fica sem pagamento e trava as compras
// O caixa não é guardado: é calculado a partir das movimentações e do resultado (calc/bank.js).

import { somarDias } from '../utils/dates.js';

export const CLIENTES = [
  {
    id: 'c01', nome: 'Marina Albuquerque', status: 'ativo',
    aporteInicial: 25000, inicioDiasAtras: 180,
    reservaPct: 20, valorOrdem: { tipo: 'percent', valor: 3 }, comissaoPct: 25,
    diaFechamento: 10, moedas: ['BTC', 'ETH', 'SOL'],
  },
  {
    id: 'c02', nome: 'Rafael Monteiro', status: 'ativo',
    aporteInicial: 60000, inicioDiasAtras: 166,
    reservaPct: 25, valorOrdem: { tipo: 'fixo', valor: 2500 }, comissaoPct: 20,
    diaFechamento: 20, moedas: ['BTC', 'ETH', 'BNB', 'LINK'],
  },
  {
    id: 'c03', nome: 'Beatriz Kaminski', status: 'ativo',
    aporteInicial: 12000, inicioDiasAtras: 151,
    reservaPct: 15, valorOrdem: { tipo: 'percent', valor: 4 }, comissaoPct: 30,
    diaFechamento: 30, diaFechamentoProximo: 10, moedas: ['SOL', 'XRP', 'ADA', 'DOGE'],
  },
  {
    id: 'c04', nome: 'Thiago Nascimento', status: 'ativo',
    aporteInicial: 120000, inicioDiasAtras: 175,
    reservaPct: 30, valorOrdem: { tipo: 'percent', valor: 2 }, comissaoPct: 15,
    diaFechamento: 10, moedas: ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'LINK'],
  },
  {
    id: 'c05', nome: 'Lívia Carvalho', status: 'ativo',
    aporteInicial: 8000, inicioDiasAtras: 122,
    reservaPct: 10, valorOrdem: { tipo: 'fixo', valor: 250 }, comissaoPct: 25,
    diaFechamento: 10, moedas: ['ETH', 'SOL', 'DOGE'],
    cenario: 'comissao-vencida',
  },
  {
    id: 'c06', nome: 'Eduardo Vasconcelos', status: 'ativo',
    aporteInicial: 35000, inicioDiasAtras: 93,
    reservaPct: 20, valorOrdem: { tipo: 'percent', valor: 3 }, comissaoPct: 20,
    diaFechamento: 30, moedas: ['ETH', 'SOL', 'ADA', 'LINK', 'DOGE'],
  },
  {
    id: 'c07', nome: 'Camila Fontes', status: 'pausado', pausadoDiasAtras: 18,
    aporteInicial: 18000, inicioDiasAtras: 140,
    reservaPct: 40, valorOrdem: { tipo: 'percent', valor: 3 }, comissaoPct: 25,
    diaFechamento: 20, moedas: ['BTC', 'XRP', 'ADA'],
  },
  {
    id: 'c08', nome: 'Gustavo Rezende', status: 'inativo', encerradoDiasAtras: 50,
    aporteInicial: 5000, inicioDiasAtras: 178,
    reservaPct: 20, valorOrdem: { tipo: 'fixo', valor: 200 }, comissaoPct: 30,
    diaFechamento: 30, moedas: ['BTC', 'ETH', 'DOGE'],
  },
];

/** Monta os clientes do store para o dia `hoje` (AAAA-MM-DD). */
export function montarClientes(hoje) {
  const clientes = {};
  for (const c of CLIENTES) {
    const { inicioDiasAtras, pausadoDiasAtras, encerradoDiasAtras, ...campos } = c;
    clientes[c.id] = {
      ...campos,
      inicioContrato: somarDias(hoje, -inicioDiasAtras),
      pausadoEm: pausadoDiasAtras != null ? somarDias(hoje, -pausadoDiasAtras) : null,
      encerradoEm: encerradoDiasAtras != null ? somarDias(hoje, -encerradoDiasAtras) : null,
      diaFechamentoProximo: c.diaFechamentoProximo ?? null,
      prazoPagamentoDias: 5,
      travaPorComissao: false,
      travaCompras: false,
      moedas: [...c.moedas],
      valorOrdem: { ...c.valorOrdem },
      cenario: c.cenario ?? null,
    };
  }
  return clientes;
}
