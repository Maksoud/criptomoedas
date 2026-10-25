# F4 — Motor de Estratégias e Alertas

**Objetivo:** o robô simulado cria e executa ordens a partir das cotações reais, as regras de alerta disparam, e tudo aparece nas telas sem recarregar.

**Depende de:** F3. **Referência:** [ESTRATEGIAS.md](../ESTRATEGIAS.md)

## Motor

- [x] `engine/engine.js`: assina `prices:update` e `candle:close`; para cada cliente ativo × moeda ativa que ele opera, chama `estrategia.avaliar(...)`, passa os sinais pela confirmação e aplica as ações no store. Respeita o botão do robô (Pausado = não avalia).
- [x] Executar ordens programadas: compra quando `preço ≤ preço da ordem`; venda quando `preço ≥ preço da ordem`.
- [x] `podeComprar(cliente, moeda)` único, com as 6 verificações de ESTRATEGIAS §1.1 (caixa/reserva incluídos).
- [x] Lucro mínimo e stop de perda aplicados no motor, não em cada estratégia.
- [x] `engine/confirm.js`: modos `velas`, `tempo` e `volume`; sinal pendente fica como `aguardando-confirmação` com contagem; cancela se a condição deixar de valer.
- [x] Perfis "Demonstração" (padrão ao abrir) e "Padrão" aplicáveis por moeda ou a todas.
- [x] Estado do motor por cliente × moeda guardado no store (para A2/A4 mostrarem "armado", "rastreando topo", "canal confirmado" etc.).

## Estratégias

- [x] **A — Reversão de picos** (`strategies/reversao-picos.js`).
- [x] **B — Spread fixo** (`strategies/spread-fixo.js`), com reposicionamento.
- [x] **G — Canal com confirmação** (`strategies/canal.js`), com ações de rompimento.
- [x] Opcionais, nesta ordem: C escalonada, E DCA, D grade, F médias móveis.
- [x] Testes com séries de preço fixas (sobe, cai, lateral, canal que rompe) verificando sinais, ações e eventos devolvidos.

## Alertas

- [x] `alerts/rules.js`: as regras de ESTRATEGIAS §6.1 com limites, escopo, cooldown e ação automática.
- [x] `alerts/center.js`: sino com contador de não lidos, painel com histórico (filtro por severidade), toasts, som opcional, notificação do navegador (pedir permissão só quando o admin ligar).
- [x] Visibilidade: na visão Cliente só aparecem os alertas daquele cliente marcados "visível para cliente".
- [x] Ações automáticas (travar moeda, travar cliente, pausar robô) registradas no log do admin.

## Apuração automática

- [x] Ao virar o dia de fechamento de um cliente (verificar a cada minuto), apurar o período aberto, criar o próximo (aplicando `diaFechamentoProximo`, se houver) e disparar o alerta "Fechamento de período".
- [x] Vencimento: passado o prazo de 5 dias sem pagamento → período `vencido`, `travaPorComissao = true`, alerta crítico "Comissão vencida". Ao marcar como pago → trava removida e registro no log.
- [x] Alerta "Comissão a vencer" 2 dias antes do vencimento.

## Critérios de aceite

- Com o perfil Demonstração e 5 minutos de demo, surgem novas operações em C2, posições em C3 mudam e o resultado do período em C5 muda.
- Nenhuma compra viola a reserva de banca; quando o disponível acaba, aparece o alerta "Reserva de banca atingida".
- Nenhuma venda automática abaixo do lucro mínimo (exceto stop, que é identificado como tal).
- Com confirmação de 2 velas, um pico de 1 vela não gera compra.
- Toda venda gerada ao vivo aponta para uma compra existente.
- Robô pausado: nenhuma ordem nova nem execução; cotações continuam.

## Notas da entrega

- **Arquivos**: `engine/{engine,confirm,checks,params,apuracao}.js`, `engine/strategies/{index,comum,reversao-picos,spread-fixo,canal,escalonada,grade,dca,medias}.js`, `alerts/{rules,center}.js`. No store: venda dinâmica (`definirVendaDinamica`, `cancelarVendaDinamica`), `marcarAguardando`, `atualizarCliente`, `definirEstadoMotor`, `adicionarAlerta`, `marcarAlertasLidos`, `atualizarRegraAlerta`.
- **Venda dinâmica** (A, G, C, E, F) não cria ordem: fica na própria compra (`vendaDinamica: true`, `alvo` = referência mostrada em C3, atualizada ao vivo). A venda sai por sinal, como ordem `MARKET`, sempre com `compraId`. Cancelar a venda dinâmica deixa a posição "sem alvo".
- **Ordens LIMIT com confirmação**: quando a moeda tem confirmação ligada, a ordem atingida fica `aguardando-confirmacao` e volta para `programada` se a condição deixar de valer.
- **Lucro mínimo e stop** ficam no motor. Vendas por stop (ou rompimento de canal para baixo) têm o motivo começando por "stop".
- **Estratégia padrão por moeda** (catálogo em `data/coins.js`): B em BTC, XRP e DOGE; A em ETH, SOL e LINK; G em BNB e ADA. Ao carregar, o motor cancela as compras programadas do histórico (feitas pela B) nas moedas com outra estratégia.
- **Perfil Demonstração recalibrado** para as cotações reais andarem o bastante numa apresentação (ver [ESTRATEGIAS.md §1.4](../ESTRATEGIAS.md#14-perfis-de-parâmetros)). `aplicarPerfil(perfil, moeda | 'todas')` está em `engine/engine.js` (a tela A2 da F5 usa).
- **Alertas**: 13 regras com limites, escopo, canais, quem vê, ação automática e silêncio. A central abre com ~20 alertas das últimas 48 h refeitos dos dados gerados (`alertasIniciais`), todos lidos menos o crítico de comissão vencida. A primeira verificação periódica só arma o silêncio, para não repetir esses avisos em toasts. Som e notificação do navegador ligam no rodapé do painel (só na visão Administrador); a permissão só é pedida ao ligar.
- **Apuração automática** a cada minuto (`engine/apuracao.js`); "Comissão a vencer" é verificada pelas regras a cada 30 s.
- **Console**: `criptoops.motor` expõe `avaliarMoeda`, `podeComprar`, `aplicarPerfil` e `estadoInterno` para a demonstração.
- **Testes**: 21 asserções novas em `docs/testes.html` (105 no total), incluindo séries fixas para A, B e G, confirmação por velas/tempo/volume e o motor rodando 5 minutos simulados sobre os dados gerados.
