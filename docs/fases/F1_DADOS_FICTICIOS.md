# F1 — Histórico de Preços, Dados Fictícios e Store

**Objetivo:** baixar o histórico real de preços, gerar sobre ele os clientes e operações fictícios e deixar o store e os cálculos prontos para as telas.

**Depende de:** F0. **Referências:** [DADOS_FICTICIOS.md](../DADOS_FICTICIOS.md) · [PLANO_MVP.md](../PLANO_MVP.md) §4.1 e §8

## Tarefas

- [x] `market/binance.js` (parte REST): `velas(par, intervalo, limite, fimEm)`, `ticker24h(pares)`, `exchangeInfo(pares)`, com timeout de 8 s e erro tratado.
- [x] Cache do histórico por dia no `localStorage` (`historico:AAAA-MM-DD`), limpando dias antigos.
- [x] `market/simulated.js` (parte histórica): passeio aleatório para quando a Binance não responder.
- [x] Tela de carregamento com esqueleto enquanto os preços chegam.
- [x] `utils/random.js`: mulberry32 com semente, `entre(min,max)`, `escolher(lista)`, `normal()`.
- [x] `data/coins.js` e `data/clients.js` conforme o documento de dados (inclui caixa, reserva, `diaFechamento` 10/20/30).
- [x] `data/seed.js`:
  - [x] operações por cliente × moeda com a estratégia B (perfil Padrão) sobre as velas de 4 h, respeitando caixa e reserva;
  - [x] ordens programadas restantes como fila inicial;
  - [x] movimentações de caixa;
  - [x] períodos de apuração (passados apurados/pagos, atual aberto);
  - [x] validações em modo dev (`console.assert`).
- [x] `store.js` completo: estado da seção 4, seletores (`ordensDoCliente`, `ordensNoPeriodo`, `ordensProgramadas`, `periodosDoCliente`), mutações (`adicionarOrdem`, `executarOrdem`, `cancelarOrdem`, `definirAlvo`, `atualizarConfig`, `apurarPeriodo`, `marcarPago`) que emitem eventos.
- [x] Funções puras em `calc/`: `positions.js`, `bank.js` (caixa, reserva, disponível), `reports.js`, `commission.js` (cálculo de período por data e dia de fechamento, incluindo fevereiro), `equity.js`.
- [x] Botão "Restaurar dados" (temporário no topo; vai para o admin na F5).
- [x] `docs/testes.html` simples rodando asserções: soma do relatório = soma das linhas; nenhum saldo negativo; períodos de 10/20/30 corretos em fev/2026 e fev/2028 (bissexto).

## Critérios de aceite

- Com internet: histórico vem da Binance; no mesmo dia, recarregar gera exatamente os mesmos totais.
- Sem internet (simular bloqueando o domínio): a página carrega com histórico simulado e avisa no topo.
- Cada cliente ativo tem posições abertas, ordens programadas e um período aberto.
- Nenhuma compra do histórico usou mais que o disponível para operar.
- A comissão de um período apurado bate com o cálculo manual de uma amostra.

## Notas da entrega

- Arquivos: `market/{binance,simulated,history}.js`, `data/{coins,clients,seed,validate,loader}.js`, `calc/*`, `utils/{random,dates,env}.js`, `ui/{loading,notices}.js`.
- Com o histórico real de 24/10/2026: ~2.500 operações, 132 ordens programadas, geração em ~50–100 ms. Com o simulado: ~4.100.
- O mercado caiu no período, então os clientes terminam com o limite de 5 posições por moeda cheio ou sem disponível: as ordens programadas no fim são quase todas vendas. Na F4, o perfil Demonstração precisa levar isso em conta para haver compras ao vivo.
- O aporte inicial é o primeiro depósito das movimentações (não é somado duas vezes no saldo livre).
- Resultado do período = lucro líquido das vendas (a taxa da compra entra na proporção vendida).
- Os alertas do histórico (§6.7 do documento de dados) ficam para a F4, junto com as regras.
- Validações: em modo dev (localhost ou `?dev`) o console mostra `[seed] … — validações ok`. Testes: `docs/testes.html`.

