# F4 — Motor de Estratégias e Alertas

**Objetivo:** o robô simulado cria e executa ordens a partir das cotações reais, as regras de alerta disparam, e tudo aparece nas telas sem recarregar.

**Depende de:** F3. **Referência:** [ESTRATEGIAS.md](../ESTRATEGIAS.md)

## Motor

- [ ] `engine/engine.js`: assina `prices:update` e `candle:close`; para cada cliente ativo × moeda ativa que ele opera, chama `estrategia.avaliar(...)`, passa os sinais pela confirmação e aplica as ações no store. Respeita o botão do robô (Pausado = não avalia).
- [ ] Executar ordens programadas: compra quando `preço ≤ preço da ordem`; venda quando `preço ≥ preço da ordem`.
- [ ] `podeComprar(cliente, moeda)` único, com as 6 verificações de ESTRATEGIAS §1.1 (caixa/reserva incluídos).
- [ ] Lucro mínimo e stop de perda aplicados no motor, não em cada estratégia.
- [ ] `engine/confirm.js`: modos `velas`, `tempo` e `volume`; sinal pendente fica como `aguardando-confirmação` com contagem; cancela se a condição deixar de valer.
- [ ] Perfis "Demonstração" (padrão ao abrir) e "Padrão" aplicáveis por moeda ou a todas.
- [ ] Estado do motor por cliente × moeda guardado no store (para A2/A4 mostrarem "armado", "rastreando topo", "canal confirmado" etc.).

## Estratégias

- [ ] **A — Reversão de picos** (`strategies/reversao-picos.js`).
- [ ] **B — Spread fixo** (`strategies/spread-fixo.js`), com reposicionamento.
- [ ] **G — Canal com confirmação** (`strategies/canal.js`), com ações de rompimento.
- [ ] Opcionais, nesta ordem: C escalonada, E DCA, D grade, F médias móveis.
- [ ] Testes com séries de preço fixas (sobe, cai, lateral, canal que rompe) verificando sinais, ações e eventos devolvidos.

## Alertas

- [ ] `alerts/rules.js`: as regras de ESTRATEGIAS §6.1 com limites, escopo, cooldown e ação automática.
- [ ] `alerts/center.js`: sino com contador de não lidos, painel com histórico (filtro por severidade), toasts, som opcional, notificação do navegador (pedir permissão só quando o admin ligar).
- [ ] Visibilidade: na visão Cliente só aparecem os alertas daquele cliente marcados "visível para cliente".
- [ ] Ações automáticas (travar moeda, travar cliente, pausar robô) registradas no log do admin.

## Apuração automática

- [ ] Ao virar o dia de fechamento de um cliente (verificar a cada minuto), apurar o período aberto, criar o próximo (aplicando `diaFechamentoProximo`, se houver) e disparar o alerta "Fechamento de período".
- [ ] Vencimento: passado o prazo de 5 dias sem pagamento → período `vencido`, `travaPorComissao = true`, alerta crítico "Comissão vencida". Ao marcar como pago → trava removida e registro no log.
- [ ] Alerta "Comissão a vencer" 2 dias antes do vencimento.

## Critérios de aceite

- Com o perfil Demonstração e 5 minutos de demo, surgem novas operações em C2, posições em C3 mudam e o resultado do período em C5 muda.
- Nenhuma compra viola a reserva de banca; quando o disponível acaba, aparece o alerta "Reserva de banca atingida".
- Nenhuma venda automática abaixo do lucro mínimo (exceto stop, que é identificado como tal).
- Com confirmação de 2 velas, um pico de 1 vela não gera compra.
- Toda venda gerada ao vivo aponta para uma compra existente.
- Robô pausado: nenhuma ordem nova nem execução; cotações continuam.
