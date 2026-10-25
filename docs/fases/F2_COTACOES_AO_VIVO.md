# F2 — Cotações ao Vivo (Binance)

**Objetivo:** preços reais mudando sozinhos na faixa do topo, com reconexão e queda automática para o modo simulado.

**Depende de:** F1. **Referência:** [PLANO_MVP.md](../PLANO_MVP.md) §4.1 e §4.2

## Tarefas

- [ ] `market/binance.js` (parte WebSocket): conexão em `wss://data-stream.binance.vision/stream?streams=<par>@miniTicker/...` para as moedas ativas (todos os pares contra USDT). Reabrir a conexão quando o admin ligar/desligar moedas.
- [ ] Reconexão com espera crescente (1, 2, 5, 10 s). Após 3 falhas seguidas → `market/simulated.js` assume e o topo mostra "Cotações simuladas". Ao reconectar, volta para a Binance e registra no log.
- [ ] Sinal de vida: se nenhuma mensagem chegar em 15 s, considerar desconectado.
- [ ] `market/feed.js`: publica `prices:update` com `{ moeda, atual, anterior, variacao24h }`, independente da fonte.
- [ ] Montagem de velas de 1 min (e de 15 s para o perfil Demonstração) a partir das atualizações; publica `candle:close`.
- [ ] Limitar memória: no máximo 500 velas por moeda e por intervalo.
- [ ] `ui/ticker.js`: faixa com monograma, símbolo, preço, variação 24h com ▲▼; célula pisca verde/vermelho (600 ms) ao mudar; rolagem horizontal contínua no celular.
- [ ] Indicador de origem: "Binance · ao vivo" (ponto verde pulsando) / "Cotações simuladas" (ponto âmbar) / "Reconectando…".
- [ ] Botão do robô `Ligado | Pausado` (só guarda o estado nesta fase; o motor chega na F4).
- [ ] Pausar a renderização da faixa quando a aba fica oculta (`visibilitychange`), sem perder a conexão.
- [ ] Componente de minigráfico (sparkline) reaproveitável para KPIs e cards.

## Critérios de aceite

- Os preços da faixa batem com os da Binance (conferir BTC no site da Binance) e mudam a cada ~1 s.
- Derrubar a internet: em até ~20 s aparece "Cotações simuladas" e os preços continuam mudando; ao voltar a internet, volta para a Binance sozinho.
- 30 minutos aberta sem travar e sem crescer memória sem limite.
- O piscar respeita `prefers-reduced-motion` (sem animação, só a cor da seta).
