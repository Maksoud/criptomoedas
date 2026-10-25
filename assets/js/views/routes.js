// Mapa das telas de cada visão. A primeira página de cada lista é a tela inicial da visão.
// `fase` indica quando o conteúdo de verdade chega (usado no estado vazio provisório).

export const VISOES = {
  cliente: {
    nome: 'Cliente',
    icone: 'user',
    paginas: [
      { id: 'visao-geral', codigo: 'C1', titulo: 'Visão geral', icone: 'layout-dashboard', fase: 'F3',
        resumo: 'Patrimônio, caixa, reserva de banca, resultado e comissão prevista.' },
      { id: 'operacoes', codigo: 'C2', titulo: 'Operações', icone: 'arrow-left-right', fase: 'F3',
        resumo: 'Compras e vendas executadas, com filtro por período, moedas e lado.' },
      { id: 'posicoes', codigo: 'C3', titulo: 'Posições em aberto', icone: 'wallet', fase: 'F3',
        resumo: 'Compras aguardando venda, com cotação atual e distância até o alvo.' },
      { id: 'relatorio', codigo: 'C4', titulo: 'Relatório de resultados', icone: 'file-bar-chart', fase: 'F3',
        resumo: 'Lucro bruto, taxas e resultado líquido por período e moedas.' },
      { id: 'comissoes', codigo: 'C5', titulo: 'Comissões', icone: 'receipt', fase: 'F3',
        resumo: 'Período em aberto, períodos apurados e pagos, e o dia de fechamento.' },
      { id: 'caixa', codigo: 'C6', titulo: 'Movimentações do caixa', icone: 'piggy-bank', fase: 'F3',
        resumo: 'Aportes e saques, com totais.' },
    ],
  },
  admin: {
    nome: 'Administrador',
    icone: 'shield',
    paginas: [
      { id: 'painel', codigo: 'A1', titulo: 'Painel geral', icone: 'layout-dashboard', fase: 'F5',
        resumo: 'Totais da casa, cards de cada cliente, feed de operações e últimos alertas.' },
      { id: 'moedas', codigo: 'A2', titulo: 'Moedas e estratégias', icone: 'coins', fase: 'F5',
        resumo: 'Moedas operadas, spread, estratégia e parâmetros de cada moeda.' },
      { id: 'clientes', codigo: 'A3', titulo: 'Clientes', icone: 'users', fase: 'F5',
        resumo: 'Caixa, reserva de banca, valor por ordem, comissão e dia de fechamento.' },
      { id: 'ordens', codigo: 'A4', titulo: 'Ordens programadas', icone: 'list-ordered', fase: 'F5',
        resumo: 'Compras e vendas aguardando execução; cancelar e definir novo alvo.' },
      { id: 'relatorios', codigo: 'A5', titulo: 'Relatórios', icone: 'file-bar-chart', fase: 'F5',
        resumo: 'Relatório de um cliente ou consolidado de todos.' },
      { id: 'comissoes', codigo: 'A6', titulo: 'Apuração de comissões', icone: 'receipt', fase: 'F5',
        resumo: 'Fechar períodos, marcar como pago e ver o total a receber.' },
      { id: 'alertas', codigo: 'A7', titulo: 'Alertas', icone: 'bell', fase: 'F5',
        resumo: 'Regras, limites, canais de aviso e ações automáticas.' },
    ],
  },
};

export const VISAO_PADRAO = 'cliente';

export function paginaInicial(visao) {
  return VISOES[visao].paginas[0].id;
}

export function buscarPagina(visao, id) {
  return VISOES[visao]?.paginas.find((p) => p.id === id) ?? null;
}
