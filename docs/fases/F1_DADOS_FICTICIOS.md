# F1 — Histórico de Preços, Dados Fictícios e Store

**Objetivo:** baixar o histórico real de preços, gerar sobre ele os clientes e operações fictícios e deixar o store e os cálculos prontos para as telas.

**Depende de:** F0. **Referências:** [DADOS_FICTICIOS.md](../DADOS_FICTICIOS.md) · [PLANO_MVP.md](../PLANO_MVP.md) §4.1 e §8

## Tarefas

- [ ] `market/binance.js` (parte REST): `velas(par, intervalo, limite, fimEm)`, `ticker24h(pares)`, `exchangeInfo(pares)`, com timeout de 8 s e erro tratado.
- [ ] Cache do histórico por dia no `localStorage` (`historico:AAAA-MM-DD`), limpando dias antigos.
- [ ] `market/simulated.js` (parte histórica): passeio aleatório para quando a Binance não responder.
- [ ] Tela de carregamento com esqueleto enquanto os preços chegam.
- [ ] `utils/random.js`: mulberry32 com semente, `entre(min,max)`, `escolher(lista)`, `normal()`.
- [ ] `data/coins.js` e `data/clients.js` conforme o documento de dados (inclui caixa, reserva, `diaFechamento` 10/20/30).
- [ ] `data/seed.js`:
  - [ ] operações por cliente × moeda com a estratégia B (perfil Padrão) sobre as velas de 4 h, respeitando caixa e reserva;
  - [ ] ordens programadas restantes como fila inicial;
  - [ ] movimentações de caixa;
  - [ ] períodos de apuração (passados apurados/pagos, atual aberto);
  - [ ] validações em modo dev (`console.assert`).
- [ ] `store.js` completo: estado da seção 4, seletores (`ordensDoCliente`, `ordensNoPeriodo`, `ordensProgramadas`, `periodosDoCliente`), mutações (`adicionarOrdem`, `executarOrdem`, `cancelarOrdem`, `definirAlvo`, `atualizarConfig`, `apurarPeriodo`, `marcarPago`) que emitem eventos.
- [ ] Funções puras em `calc/`: `positions.js`, `bank.js` (caixa, reserva, disponível), `reports.js`, `commission.js` (cálculo de período por data e dia de fechamento, incluindo fevereiro), `equity.js`.
- [ ] Botão "Restaurar dados" (temporário no topo; vai para o admin na F5).
- [ ] `docs/testes.html` simples rodando asserções: soma do relatório = soma das linhas; nenhum saldo negativo; períodos de 10/20/30 corretos em fev/2026 e fev/2028 (bissexto).

## Critérios de aceite

- Com internet: histórico vem da Binance; no mesmo dia, recarregar gera exatamente os mesmos totais.
- Sem internet (simular bloqueando o domínio): a página carrega com histórico simulado e avisa no topo.
- Cada cliente ativo tem posições abertas, ordens programadas e um período aberto.
- Nenhuma compra do histórico usou mais que o disponível para operar.
- A comissão de um período apurado bate com o cálculo manual de uma amostra.
