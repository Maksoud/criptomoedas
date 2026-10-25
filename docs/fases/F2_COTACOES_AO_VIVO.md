# F2 — Cotações ao Vivo (Binance)

**Objetivo:** preços reais mudando sozinhos na faixa do topo, com reconexão e queda automática para o modo simulado.

**Depende de:** F1. **Referência:** [PLANO_MVP.md](../PLANO_MVP.md) §4.1 e §4.2

## Tarefas

- [x] `market/binance.js` (parte WebSocket): conexão em `wss://data-stream.binance.vision/stream?streams=<par>@miniTicker/...` para as moedas ativas (todos os pares contra USDT). Reabrir a conexão quando o admin ligar/desligar moedas.
- [x] Reconexão com espera crescente (1, 2, 5, 10 s). Após 3 falhas seguidas → `market/simulated.js` assume e o topo mostra "Cotações simuladas". Ao reconectar, volta para a Binance e registra no log.
- [x] Sinal de vida: se nenhuma mensagem chegar em 15 s, considerar desconectado.
- [x] `market/feed.js`: publica `prices:update` com `{ moeda, atual, anterior, variacao24h }`, independente da fonte.
- [x] Montagem de velas de 1 min (e de 15 s para o perfil Demonstração) a partir das atualizações; publica `candle:close`.
- [x] Limitar memória: no máximo 500 velas por moeda e por intervalo.
- [x] `ui/ticker.js`: faixa com monograma, símbolo, preço, variação 24h com ▲▼; célula pisca verde/vermelho (600 ms) ao mudar; rolagem horizontal contínua no celular.
- [x] Indicador de origem: "Binance · ao vivo" (ponto verde pulsando) / "Cotações simuladas" (ponto âmbar) / "Reconectando…".
- [x] Botão do robô `Ligado | Pausado` (só guarda o estado nesta fase; o motor chega na F4).
- [x] Pausar a renderização da faixa quando a aba fica oculta (`visibilitychange`), sem perder a conexão.
- [x] Componente de minigráfico (sparkline) reaproveitável para KPIs e cards.

## Critérios de aceite

- Os preços da faixa batem com os da Binance (conferir BTC no site da Binance) e mudam a cada ~1 s.
- Derrubar a internet: em até ~20 s aparece "Cotações simuladas" e os preços continuam mudando; ao voltar a internet, volta para a Binance sozinho.
- 30 minutos aberta sem travar e sem crescer memória sem limite.
- O piscar respeita `prefers-reduced-motion` (sem animação, só a cor da seta).

## Notas da entrega

- Arquivos: `market/binance.js` (parte WebSocket: `criarFluxo`, `lerMiniTicker`), `market/simulated.js` (parte ao vivo: `criarSimuladorAoVivo`), `market/candles.js` (montagem das velas), `market/feed.js`, `ui/ticker.js`, `ui/sparkline.js`. Nova mutação no store: `atualizarMoeda(simbolo, campos)`, que emite `coin:change` (a tela de moedas da F5 vai usá-la).
- Estado da origem em `store.mercado.estado`: `carregando` → `conectando` → `aovivo`; `reconectando` enquanto tenta; `simulado` após 3 falhas seguidas. `mercado.historicoFonte` diz de onde veio o histórico.
- Uma falha é: a conexão não abrir e mandar a 1ª mensagem em 6 s, a conexão fechar, 15 s sem mensagem ou o navegador avisar que ficou sem internet (`offline`). Quando a internet volta (`online`), tenta na hora.
- No simulado, os preços continuam dos últimos valores reais, e a conexão segue tentando a cada 10 s. Entrada e saída do simulado vão para o log (`logAdmin`, origem automática).
- Se o próprio histórico foi simulado (abriu sem internet), as cotações ao vivo ficam simuladas até recarregar a página, para não saltarem dos preços simulados para os reais. O aviso oferece "Recarregar".
- Velas de 15 s e 1 min ficam em `precos[moeda].velas15s` e `velas1m` (no máximo 500 cada). As de 15 s são montadas sempre, não só no perfil Demonstração: custa pouco e a troca de perfil não precisa esperar velas novas. O volume da vela é a diferença do volume de 24 h entre o início e o fim dela.
- "Restaurar dados" não derruba a conexão: o feed reaplica os últimos preços ao vivo sobre os dados gerados de novo.
- O botão do robô já guardava o estado desde a F0 (`store.robo` + `localStorage`); nada mudou nele.
- O minigráfico (`sparkline(valores, { altura, tendencia, rotulo })`) ainda não aparece em nenhuma tela: as telas com KPIs chegam na F3.
- Para testar a queda sem desligar a internet: `criptoops.feed.simularQueda(30)` no console. Em ~3 s entra "Cotações simuladas"; depois dos 30 s a Binance volta sozinha (até 10 s a mais).
- Testes em `docs/testes.html` (grupo "Cotações ao vivo"): leitura do miniTicker, reconexão com WebSocket falso (3 falhas → simulado → volta), sinal de vida, troca de moedas, velas, limite de 500, simulador e minigráfico.

### Conferido no navegador (24/10/2026)

- BTC na faixa igual ao `ticker/price` da Binance no mesmo instante (80.973,10).
- Queda simulada: "Reconectando…" na hora, "Cotações simuladas" em 3 s com os preços mudando, volta para "Binance · ao vivo" sozinha e registra as duas passagens no log.
- Ligar LTC reabre a conexão e a moeda entra na faixa com preço; desligar tira.
- Em 375 px a faixa rola sozinha e a página não tem rolagem horizontal.
- O teste de 30 minutos não foi feito ao vivo. A memória é limitada por construção: 500 velas por série, a fila da faixa guarda no máximo uma entrada por moeda e o log só cresce nas trocas de fonte.
