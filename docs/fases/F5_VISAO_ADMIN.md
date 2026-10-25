# F5 — Visão do Administrador

**Objetivo:** telas A1–A7 e as ações de controle (configurar, travar, cancelar, apurar, configurar alertas, emitir relatório) refletindo em tempo real no motor e na visão do cliente.

**Depende de:** F4. **Referências:** [PLANO_MVP.md](../PLANO_MVP.md) §3.3, §6 e §8 · [ESTRATEGIAS.md](../ESTRATEGIAS.md)

## Tarefas

- [x] **Botão Travar compras (global)** no topo da visão admin, com estado visível (cadeado + faixa "Compras travadas"). Trava também por cliente e por moeda.
- [x] **A1 Painel geral**: totais da casa (caixa sob gestão, patrimônio, volume no período, resultado, comissões apuradas a receber e previstas), cards por cliente (patrimônio, resultado %, barra de uso da banca, status, minigráfico), filtro por status, feed ao vivo de operações de todos, últimos alertas.
- [x] **A2 Moedas e estratégias**:
  - tabela de moedas com liga/desliga, trava de compras, spread, estratégia e estado do motor;
  - painel da moeda com formulário gerado a partir de `estrategia.parametros` (validação de mín/máx, texto de ajuda), parâmetros gerais (lucro mínimo, stop, piso/teto, máx. posições) e **confirmação de sinal**;
  - botões "Aplicar perfil Demonstração / Padrão" (nesta moeda ou em todas);
  - prévia: "Próxima compra em ~X USDT, venda em ~Y USDT"; para a estratégia G, gráfico do canal com zonas;
  - atalho **Alertas desta moeda** (variação brusca, preço alvo, canal) sem sair da tela.
- [x] **A3 Clientes**: lista + painel de edição: status, caixa (somente leitura, com histórico), **reserva de banca %**, valor por ordem (fixo/%), % comissão, **dia de fechamento (10/20/30)**, prazo de pagamento, moedas operadas, trava de compras, atalho **Alertas deste cliente** (uso da banca, posição em queda). Botão "Ver como cliente". Registrar depósito/saque.
- [x] **A4 Ordens programadas**: compras, vendas programadas, vendas dinâmicas e sinais aguardando confirmação de todos os clientes; filtros por cliente, moeda, lado, estratégia; seleção múltipla; **Cancelar selecionadas** e **Cancelar todas as compras** com modal mostrando quantidade e valor afetado. Posições "sem alvo" com ação **Definir novo alvo** (preço ou %).
- [x] **A5 Relatórios**: cliente (ou "Todos — consolidado"), período e moedas; reaproveita o componente do C4; consolidado com uma linha por cliente. CSV e impressão.
- [x] **A6 Apuração de comissões**: tabela de períodos de todos os clientes (filtros por status e fechamento 10/20/30); **Apurar agora** e **Forçar vencimento** (com confirmação, para a demo); **Marcar como pago** (libera as compras do cliente); vencidas no topo com o cliente marcado "compras suspensas"; totais: apurado a receber, pago no mês, previsto nos períodos abertos; relatório de apuração imprimível.
- [x] **A7 Alertas**: lista de regras com liga/desliga, limites, escopo, canais (toast, som, navegador; e-mail/Telegram "em breve"), ação automática e cooldown; botão "Testar alerta"; histórico de alertas disparados com filtro.
- [x] Persistir configurações e ações do admin no `localStorage`; "Restaurar dados" aqui, com confirmação.
- [x] Log de ações do admin e automáticas (ex.: "24/10 14:32 — Compras de BTC travadas") exibido no A1.

## Critérios de aceite

- Travar compras globalmente: nenhuma compra nova nos 2 minutos seguintes; vendas continuam.
- Desligar uma moeda: motor para de comprar nela; posições existentes continuam visíveis no cliente.
- Cancelar uma compra programada: some de A4, aparece como cancelada no histórico do cliente e o disponível aumenta.
- Mudar spread ou parâmetro de estratégia afeta as próximas ordens, não as já executadas.
- Baixar a reserva de banca de um cliente bloqueado libera novas compras dele.
- Mudar o dia de fechamento vale a partir do próximo período (o aberto mantém as datas).
- "Apurar agora" congela o período, cria o próximo, e o cliente vê o novo status em C5 sem recarregar.
- Uma regra de alerta com ação "travar compras da moeda" trava de fato e aparece no log.
- "Forçar vencimento" trava as compras do cliente; "Marcar como pago" destrava, e o cliente vê a mudança em C5 sem recarregar.
- Consolidado: soma das comissões por cliente = total exibido.
