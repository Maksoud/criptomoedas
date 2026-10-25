# F3 — Visão do Cliente

**Objetivo:** telas C1–C6 completas, com filtros por período e moedas, relatório exportável, comissões por período de apuração e atualização ao vivo dos números que dependem da cotação.

**Depende de:** F2. **Referências:** [PLANO_MVP.md](../PLANO_MVP.md) §3.2 e §8 · decisões em aberto nº 8 a 11.

## Componentes compartilhados (`ui/`)

- [ ] **Filtro de período**: presets `Hoje`, `7 dias`, `30 dias`, `Período de apuração atual`, `Período anterior`, `Mês atual`, `Desde o início`, `Personalizado` (dois campos de data).
- [ ] **Filtro de moedas**: chips de multisseleção com monograma; "Todas".
- [ ] **Tabela**: cabeçalho fixo, ordenação por coluna, paginação de 50, números à direita em fonte mono, linha nova entra no topo com destaque (`order:new`).
- [ ] **KPI card**: rótulo, valor, variação, minigráfico opcional.
- [ ] **Barra de uso da banca**: em operação · programado · disponível · reserva, numa única barra empilhada.
- [ ] Os filtros ficam na URL (`?de=2026-10-01&ate=2026-10-24&moedas=BTC,ETH`) para o relatório poder ser recarregado.

## Telas

- [ ] **Seletor "Visualizando como"** no topo (lista de clientes). Trocar recarrega os dados da tela atual.
- [ ] **C1 Visão geral**: KPIs (patrimônio, caixa, reserva de banca, disponível para operar, em operação, resultado %, resultado do período atual, comissão prevista, próximo fechamento); barra de uso da banca; gráfico de evolução do patrimônio com linha de aportes; distribuição por moeda; últimas 10 operações.
- [ ] **C2 Operações**: tabela data/hora, moeda, lado (badge), tipo, motivo, preço, quantidade, total, taxa, lucro (só vendas). Filtros: período, moedas, lado.
- [ ] **C3 Posições em aberto**: moeda, data da compra, quantidade, preço de compra, cotação atual (viva), variação %, alvo (fixo, dinâmico ou "sem alvo"), distância até o alvo (barra), valor atual. Total no rodapé.
- [ ] **C4 Relatório de resultados**:
  - cabeçalho com cliente, período, moedas e data de emissão;
  - resumo: volume comprado, volume vendido, nº de operações, lucro bruto, taxas, resultado líquido, posições em aberto no fim do período (informativo);
  - tabela por moeda com as mesmas colunas;
  - gráfico de resultado por dia;
  - botões **Exportar CSV** e **Imprimir/PDF** (`print.css`: fundo branco, sem menu, selo "dados fictícios" no rodapé).
- [ ] **C5 Comissões**:
  - período aberto em destaque (resultado das operações fechadas até agora, comissão prevista, dias para o fechamento, atualiza ao vivo);
  - comissão apurada a pagar com vencimento e contagem de dias; se vencida, faixa crítica "Compras suspensas até o pagamento";
  - lista dos períodos (datas, resultado, %, comissão, vencimento, status). Clicar abre o C4 com o intervalo do período;
  - **escolha do dia de fechamento** (10, 20 ou 30) com o texto "Vale a partir do próximo período".
- [ ] **C6 Movimentações do caixa**: depósitos e saques com totais no período.
- [ ] Todos os valores em USDT (moeda base); quantidades das moedas operadas com a sigla ao lado.

## Critérios de aceite

- Mudar período ou moedas atualiza todos os números da tela em menos de 100 ms.
- O resultado do C4 para o intervalo exato de um período bate com o resultado desse período em C5.
- Período com prejuízo mostra comissão 0,00 (já como paga) e o período seguinte começa do zero.
- Posições em aberto não alteram o resultado do período.
- Trocar o dia de fechamento não muda as datas do período aberto; o próximo período usa o novo dia.
- Cotação mudando atualiza C3, patrimônio e KPIs dependentes de preço sem redesenhar a tabela inteira.
- CSV abre corretamente no Excel em pt-BR (separador `;`, decimal `,`, UTF-8 com BOM).
- A impressão cabe em A4 retrato.
