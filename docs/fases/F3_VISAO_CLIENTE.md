# F3 — Visão do Cliente

**Objetivo:** telas C1–C6 completas, com filtros por período e moedas, relatório exportável, comissões por período de apuração e atualização ao vivo dos números que dependem da cotação.

**Depende de:** F2. **Referências:** [PLANO_MVP.md](../PLANO_MVP.md) §3.2 e §8 · decisões em aberto nº 8 a 11.

## Componentes compartilhados (`ui/`)

- [x] **Filtro de período**: presets `Hoje`, `7 dias`, `30 dias`, `Período de apuração atual`, `Período anterior`, `Mês atual`, `Desde o início`, `Personalizado` (dois campos de data).
- [x] **Filtro de moedas**: chips de multisseleção com monograma; "Todas".
- [x] **Tabela**: cabeçalho fixo, ordenação por coluna, paginação de 50, números à direita em fonte mono, linha nova entra no topo com destaque (`order:new`).
- [x] **KPI card**: rótulo, valor, variação, minigráfico opcional.
- [x] **Barra de uso da banca**: em operação · programado · disponível · reserva, numa única barra empilhada.
- [x] Os filtros ficam na URL (`?de=2026-10-01&ate=2026-10-24&moedas=BTC,ETH`) para o relatório poder ser recarregado.

## Telas

- [x] **Seletor "Visualizando como"** no topo (lista de clientes). Trocar recarrega os dados da tela atual.
- [x] **C1 Visão geral**: KPIs (patrimônio, caixa, reserva de banca, disponível para operar, em operação, resultado %, resultado do período atual, comissão prevista, próximo fechamento); barra de uso da banca; gráfico de evolução do patrimônio com linha de aportes; distribuição por moeda; últimas 10 operações.
- [x] **C2 Operações**: tabela data/hora, moeda, lado (badge), tipo, motivo, preço, quantidade, total, taxa, lucro (só vendas). Filtros: período, moedas, lado.
- [x] **C3 Posições em aberto**: moeda, data da compra, quantidade, preço de compra, cotação atual (viva), variação %, alvo (fixo, dinâmico ou "sem alvo"), distância até o alvo (barra), valor atual. Total no rodapé.
- [x] **C4 Relatório de resultados**:
  - cabeçalho com cliente, período, moedas e data de emissão;
  - resumo: volume comprado, volume vendido, nº de operações, lucro bruto, taxas, resultado líquido, posições em aberto no fim do período (informativo);
  - tabela por moeda com as mesmas colunas;
  - gráfico de resultado por dia;
  - botões **Exportar CSV** e **Imprimir/PDF** (`print.css`: fundo branco, sem menu, selo "dados fictícios" no rodapé).
- [x] **C5 Comissões**:
  - período aberto em destaque (resultado das operações fechadas até agora, comissão prevista, dias para o fechamento, atualiza ao vivo);
  - comissão apurada a pagar com vencimento e contagem de dias; se vencida, faixa crítica "Compras suspensas até o pagamento";
  - lista dos períodos (datas, resultado, %, comissão, vencimento, status). Clicar abre o C4 com o intervalo do período;
  - **escolha do dia de fechamento** (10, 20 ou 30) com o texto "Vale a partir do próximo período".
- [x] **C6 Movimentações do caixa**: depósitos e saques com totais no período.
- [x] Todos os valores em USDT (moeda base); quantidades das moedas operadas com a sigla ao lado.

## Critérios de aceite

- Mudar período ou moedas atualiza todos os números da tela em menos de 100 ms.
- O resultado do C4 para o intervalo exato de um período bate com o resultado desse período em C5.
- Período com prejuízo mostra comissão 0,00 (já como paga) e o período seguinte começa do zero.
- Posições em aberto não alteram o resultado do período.
- Trocar o dia de fechamento não muda as datas do período aberto; o próximo período usa o novo dia.
- Cotação mudando atualiza C3, patrimônio e KPIs dependentes de preço sem redesenhar a tabela inteira.
- CSV abre corretamente no Excel em pt-BR (separador `;`, decimal `,`, UTF-8 com BOM).
- A impressão cabe em A4 retrato.

## Notas da entrega

- Arquivos: `ui/{filters,table,kpi,bankbar,chart,clientpicker,coin,dom,download}.js`, `views/client/{comum,visao-geral,operacoes,posicoes,relatorio,comissoes,caixa,index}.js`, `utils/csv.js`, `css/views.css` (e o bloco "Componentes da visão Cliente" em `components.css`), `print.css` refeito.
- **Filtros na URL**: ficam depois do `?` no hash (`#/cliente/relatorio?de=2026-10-11&ate=2026-11-10&moedas=BTC,ETH`). As telas gravam com `history.replaceState` (sem entrada nova no histórico); mudar o endereço à mão ou voltar/avançar emite `route:query` e a tela é refeita. Ao recarregar, o preset é reconhecido pelas datas (se nenhum bate, fica "Personalizado"). Padrões: C2 "30 dias", C4 "Período de apuração atual", C6 "Desde o início". C3 aceita só o filtro de moedas.
- **Ciclo das telas**: cada tela devolve um contexto que desfaz as assinaturas, os gráficos e os temporizadores ao sair (`main.js`). Trocar o cliente em "Visualizando como" refaz a tela atual mantendo os filtros da URL.
- **"Visualizando como"** fica no topo, ao lado do selo DEMO. Abaixo de 1100 px vira só o avatar com as iniciais (o `<select>` nativo continua por cima). Abaixo de 480 px, na visão Cliente, o botão provisório "Restaurar dados" some para caber (ele vai para o admin na F5).
- **Ao vivo**: C3 troca só as células de cotação, variação, distância e valor das linhas da moeda que mudou (no máximo 4×/s), mais rodapé e KPIs. C1 atualiza patrimônio, resultado, em operação, distribuição e o último ponto do gráfico 1×/s. Operação nova (`order:executed` ou `order:new` já executada) entra no topo de C2 e das últimas operações do C1 com destaque de 2 s, e refaz C4 e o período aberto do C5. Enquanto o motor da F4 não existe, dá para testar pelo console: `o = criptoops.adicionarOrdem({ clienteId: 'c01', moeda: 'ETH', lado: 'compra', preco: 2400, quantidade: 0.1 }); criptoops.executarOrdem(o.id)`.
- **Barra de uso da banca**: as quatro fatias somam o caixa; "em operação" é o custo das posições (o valor a mercado fica no KPI, porque oscila).
- **C4**: "posições em aberto no fim do período" usa `posicoesAbertasEm` (compras executadas até o fim sem venda até o fim), pelo custo, fora do resultado. O gráfico preenche com zero os dias sem venda, do início do contrato até hoje.
- **CSV**: cabeçalho (cliente, período, moedas, emissão), uma linha por operação fechada e a linha de total; BOM UTF-8, `;`, vírgula decimal, sem separador de milhar e hífen como sinal (o Excel não entende o `−`). Sem a linha `sep=;`, que faz o Excel ignorar o BOM.
- **Impressão**: A4 retrato com margens de 16 mm; topo, menu, filtros e botões somem; cabeçalho com logo; selo "Demonstração — dados fictícios" e "Página X de Y" nas margens de cada página (Chrome/Edge ≥ 131) e rodapé com a data de emissão no fim. Os gráficos são refeitos com as cores de papel (`--print-*` em `tokens.css`) numa largura de 640 px.
- **C5**: a troca do dia usa a nova mutação `definirDiaFechamento(clienteId, dia, por)`, que grava `diaFechamentoProximo` (escolher de novo o dia atual desfaz) e emite `client:change`; `apurarPeriodo` já aplicava o novo dia ao abrir o período seguinte. A troca não fica salva no navegador: "Restaurar dados" ou recarregar voltam ao dia original.
- `utils/format.js`: datas `'AAAA-MM-DD'` agora são lidas no dia local (antes `data('2026-10-24')` mostraria 23/10 no fuso do Brasil). Novos: `dataCurta`, `intervalo`, `pctSimples`, `compacto`, `plural`.
- Testes em `docs/testes.html` (grupo "Visão do cliente"): presets, leitura e escrita dos filtros, formato do CSV, C4 = C5 em todos os períodos fechados, prejuízo → comissão 0,00 paga, posições em aberto fora do resultado, troca do dia de fechamento, tempo de filtro, distância até o alvo e fatias da banca. 84 testes passando.

### Conferido no navegador (25/10/2026)

- As seis telas abrem sem erro no console, com Binance ao vivo, nos temas escuro e claro.
- C1: resultado do período (+140,93) igual ao do C4 com o período aberto e ao do C5.
- C2: trocar o lado leva ~8 ms; uma ordem criada pelo console entra no topo.
- C3: em 4 s de cotação mudando, nenhuma linha da tabela foi recriada; só os textos das células.
- C4 × C5: os 41 períodos fechados batem no centavo; o único período com prejuízo está com comissão 0,00 e "Pago".
- C5: Lívia Carvalho mostra a faixa "Compras suspensas até o pagamento" e a comissão vencida; trocar para o dia 20 mantém o período aberto (11/10 a 10/11) e mostra o próximo como 11/11 a 20/11.
- Em 375 px nenhuma tela tem rolagem horizontal (as tabelas rolam dentro do cartão).
- Não conferido: a impressão em papel/PDF de verdade (o diálogo de impressão não abre na automação) e a abertura do CSV no Excel; o formato do arquivo foi verificado pelos testes.
