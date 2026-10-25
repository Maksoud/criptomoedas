# Plano do MVP — Painel de Operações Cripto

> Nome provisório do produto: **CriptoOps**.
> Criado em 24/10/2026 e revisado com as respostas do cliente na mesma data. O arquivo [CRYPTOBOT_MVP.md](CRYPTOBOT_MVP.md) descreve um projeto anterior e serve **só como consulta** de lógica. Ele não define regras deste MVP.

---

## 1. Objetivo

Demonstrar, em uma única página no navegador, como funciona a gestão de operações de criptomoedas feita por um robô para vários clientes:

- **Cliente** acompanha compras, vendas, posições em aberto, lucro e comissão, e emite relatórios por **período** e **moedas**.
- **Administrador** configura as moedas operadas, o caixa e a reserva de banca de cada cliente, o spread e a estratégia de cada moeda, e os alertas; apura e emite os relatórios dos clientes; trava novas compras; cancela compras e vendas programadas.

É um MVP de apresentação: **sem login, sem banco e sem servidor próprio**. As **cotações são reais** (API pública da Binance). Clientes, saldos e operações são fictícios e gerados no navegador. A página deve parecer "viva": cotações mudando e novas operações surgindo nos relatórios sem recarregar.

## 2. Princípios

| Princípio | Como aplicar |
|---|---|
| Zero infraestrutura | HTML + CSS + JavaScript (ES Modules). Abre direto no servidor estático do maksoud.dev, sem build. |
| Cotações reais, operações simuladas | Preços e histórico vêm da Binance (só endpoints públicos, sem chave). Nenhuma ordem é enviada à corretora. |
| Funciona sem internet | Se a Binance não responder, cai para cotações simuladas e avisa no topo ("Cotações simuladas"). |
| Dados reproduzíveis | Gerador com semente fixa sobre o histórico de preços em cache: no mesmo dia, todo carregamento começa igual. Botão "Restaurar dados" volta ao estado inicial. |
| Uma fonte de verdade | Um `store` central em memória. Telas só leem do store e reagem a eventos. |
| Cálculo separado da tela | Funções puras para relatórios, comissão, alertas e estratégias (fáceis de testar e de reaproveitar num back-end futuro). |
| Tudo configurável | Todo número das estratégias, alertas e regras de cliente pode ser alterado pelo admin; os valores deste documento são só padrões. |
| Entrega em fases | Cada fase termina com algo funcionando e visível (ver seção 9). |

## 3. Escopo

### 3.1 Barra superior (sempre visível)

- Logo/nome + selo "DEMO".
- **Seletor de visão**: `Cliente | Administrador` (controle segmentado). A troca é instantânea e mantém a URL coerente (`#/cliente/...` ou `#/admin/...`).
- Na visão Cliente: **"Visualizando como"** — lista de clientes fictícios (substitui o login).
- **Faixa de cotações** ao vivo (preço, variação 24h, seta ▲▼, piscar verde/vermelho ao mudar) e a origem: "Binance · ao vivo" ou "Cotações simuladas".
- **Robô**: `Ligado | Pausado` (pausa o motor de estratégias; as cotações continuam).
- **Central de alertas** (sino com contador) — ver seção 6.
- Alternar tema claro/escuro.
- Na visão Administrador, uma faixa de cor distinta indica o modo (ver identidade visual).

### 3.2 Visão do cliente

| # | Tela | Conteúdo |
|---|---|---|
| C1 | Visão geral | KPIs: patrimônio, caixa, reserva de banca, disponível para operar, em operação, resultado %, resultado do período de apuração atual, comissão prevista e data de fechamento. Gráfico de evolução do patrimônio. Últimas operações (atualiza ao vivo). |
| C2 | Operações | Tabela de compras e vendas executadas. Filtros: período (presets + personalizado), moedas (multisseleção), lado (compra/venda). Novas linhas entram no topo com destaque. |
| C3 | Posições em aberto | Compras ainda não vendidas: moeda, quantidade, preço de compra, alvo de venda, cotação atual, variação %, distância até o alvo, valor atual. Atualiza com a cotação. |
| C4 | Relatório de resultados | Por período livre e moedas: volume comprado/vendido, lucro bruto, taxas, resultado líquido, quebra por moeda e por dia. Exportar CSV e imprimir/PDF. |
| C5 | Comissões | Períodos de apuração (aberto, apurado, pago, vencido): datas, resultado, % e valor da comissão, vencimento. Escolha do dia de fechamento (10, 20 ou 30). Aviso de comissão a pagar e de serviço suspenso. Detalhe de cada período abre o relatório C4 daquele intervalo. |
| C6 | Movimentações do caixa | Aportes e saques, com totais. |

### 3.3 Visão do administrador

| # | Tela | Conteúdo |
|---|---|---|
| A1 | Painel geral | Cards por cliente (patrimônio, resultado %, em operação, uso da banca, status), totais da casa (volume, resultado, comissões apuradas e a apurar), feed de operações de todos os clientes, últimos alertas. Filtro por status. |
| A2 | Moedas e estratégias | Liga/desliga e trava de compras por moeda. Para cada moeda: **spread**, estratégia, todos os parâmetros dela e a confirmação de sinal (ver [ESTRATEGIAS.md](ESTRATEGIAS.md)). Perfil de parâmetros "Demonstração" ou "Padrão". |
| A3 | Clientes | Por cliente: status, **caixa** (valor que o robô pode operar), **reserva de banca** (%), valor por ordem, % de comissão, **dia de fechamento** (10, 20 ou 30), moedas que opera, trava de compras. |
| A4 | Ordens programadas | Compras, vendas programadas e vendas dinâmicas de todos os clientes, com filtros. Cancelar uma, várias ou todas (com confirmação). Definir novo alvo para posições "sem alvo". |
| A5 | Relatórios | Emitir o relatório C4 de um cliente ou consolidado de todos. Exportar CSV/imprimir. |
| A6 | Apuração de comissões | Períodos por cliente com status; fechamento automático no dia escolhido e "Apurar agora" manual; marcar como paga; vencidas em destaque (clientes com compras suspensas); consolidado a receber. |
| A7 | Alertas | Regras de alerta (seção 6): liga/desliga, limites, canal de aviso e ação automática. Histórico de alertas disparados. |
| — | Botão **Travar compras** | Trava global (no topo da visão admin), por cliente (A3) e por moeda (A2). Vendas continuam. |

### 3.4 Fora do escopo

Login e permissões, banco de dados, envio de ordens reais à corretora, chaves de API, envio de alertas por e-mail/Telegram (os canais externos aparecem só como opção desabilitada "em breve"), multi-idioma.

## 4. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Estrutura | HTML único (`index.html`) + roteamento por hash | Funciona em hospedagem estática sem regras de rewrite |
| Estilo | CSS puro com variáveis (tokens) | Tema claro/escuro e identidade em um só lugar |
| Lógica | JavaScript ES Modules, sem framework | Mesmo padrão dos outros projetos do portfólio; sem build |
| Cotações | API pública da Binance: REST `https://data-api.binance.vision` e WebSocket `wss://data-stream.binance.vision` | Domínios só de dados de mercado, sem chave, com CORS liberado (testado em 24/10/2026) |
| Gráficos | Chart.js 4.4.x via cdnjs (versão fixa) | Leve, bom com séries temporais |
| Ícones | Lucide via unpkg (versão fixa) | Traço fino, combina com a identidade |
| Fontes | Inter + JetBrains Mono (Google Fonts) | Números tabulares e leitura de preços |
| Persistência | `localStorage` para configurações do admin, preferências e cache do histórico de preços | "Sem banco", mas a demo não perde ajustes ao recarregar. Sempre com `try/catch` e fallback. |

Hospedagem: pasta `criptomoedas/` do maksoud.dev. Incluir `.htaccess` com `DirectoryIndex index.html index.php`, senão a pasta estática dá 404 no servidor.

### 4.1 Uso da Binance

| Uso | Endpoint | Quando |
|---|---|---|
| Histórico para gerar as operações passadas | `GET /api/v3/klines?symbol=BTCUSDT&interval=4h&limit=1000` (2 chamadas por moeda = 180 dias) | Ao abrir, se não houver cache do dia |
| Gráficos intradiários | `GET /api/v3/klines?interval=15m&limit=192` (últimas 48 h) | Ao abrir |
| Variação 24h inicial | `GET /api/v3/ticker/24hr?symbols=[...]` | Ao abrir |
| Cotação ao vivo | `wss://data-stream.binance.vision/stream?streams=btcusdt@miniTicker/ethusdt@miniTicker/...` (1 atualização/s por moeda) | Contínuo |

- Reconexão automática com espera crescente (1 s, 2 s, 5 s, 10 s). Após 3 falhas seguidas, ativa o modo simulado até a conexão voltar.
- Cache do histórico no `localStorage` por dia (chave `historico:AAAA-MM-DD`), para carregar rápido e o histórico fictício ser o mesmo durante o dia.
- Limites da Binance são folgados para esse uso (~25 chamadas REST no carregamento).

### 4.2 Movimento suficiente para a demonstração

Preços reais mudam devagar: com spread de 2–3%, o robô faria poucas operações durante uma apresentação. Por isso o admin escolhe um **perfil de parâmetros**:

| Perfil | Spread / recuos típicos | Uso |
|---|---|---|
| Demonstração (padrão ao abrir) | 0,3% a 0,6% | Gera operações a cada poucos segundos, somando todos os clientes |
| Padrão | 2% a 3% | Valores realistas, como no briefing |

O perfil só preenche os campos; cada valor continua editável. O histórico de 180 dias é sempre gerado com o perfil Padrão.

## 5. Estrutura de pastas

```
criptomoedas/
├── index.html
├── .htaccess
├── assets/
│   ├── css/
│   │   ├── tokens.css        # cores, tipografia, espaçamentos (claro/escuro)
│   │   ├── base.css          # reset, tipografia, utilitários
│   │   ├── layout.css        # topo, menu lateral, grade
│   │   ├── components.css    # botões, cards, tabelas, badges, modais, toasts
│   │   └── print.css         # relatório impresso
│   └── js/
│       ├── main.js           # inicialização
│       ├── router.js         # rotas por hash
│       ├── store.js          # estado + eventos (pub/sub)
│       ├── persist.js        # localStorage com fallback
│       ├── data/
│       │   ├── coins.js      # catálogo de moedas
│       │   ├── clients.js    # clientes fictícios
│       │   └── seed.js       # gera histórico de operações com semente fixa
│       ├── market/
│       │   ├── binance.js    # REST + WebSocket públicos
│       │   ├── simulated.js  # cotações simuladas (fallback)
│       │   └── feed.js       # escolhe a fonte e publica prices:update
│       ├── engine/
│       │   ├── engine.js     # roda as estratégias a cada atualização de preço
│       │   ├── confirm.js    # confirmação de sinal (comum a todas)
│       │   └── strategies/   # um arquivo por estratégia
│       ├── alerts/
│       │   ├── rules.js      # regras de alerta
│       │   └── center.js     # central de alertas (sino, histórico, toasts)
│       ├── calc/
│       │   ├── positions.js  # posições em aberto
│       │   ├── bank.js       # caixa, reserva, disponível
│       │   ├── reports.js    # relatório de resultados
│       │   ├── commission.js # períodos de apuração e comissão
│       │   └── equity.js     # patrimônio e evolução
│       ├── views/
│       │   ├── client/       # C1..C6
│       │   └── admin/        # A1..A7
│       ├── ui/               # componentes: tabela, filtros, modal, toast, gráfico, ticker
│       └── utils/
│           ├── format.js     # moeda, %, datas (pt-BR)
│           └── random.js     # PRNG com semente (mulberry32)
└── docs/
```

## 6. Alertas

Configurados em A7 (regras gerais) e também atalhos dentro de A2 (por moeda) e A3 (por cliente). Detalhes de cada regra em [ESTRATEGIAS.md §6](ESTRATEGIAS.md#6-alertas).

- **Onde aparecem**: central de alertas (sino), toast na tela e, opcionalmente, notificação do navegador (com permissão). E-mail/Telegram aparecem como "em breve".
- **Quem vê**: alertas de operação do cliente aparecem para ele; alertas de risco e de sistema só para o admin.
- **Ação automática** (opcional por regra): nenhuma · travar compras da moeda · travar compras do cliente · pausar o robô.

## 7. Arquitetura

```
 ┌──────────────────┐ prices:update ┌───────────────┐  avalia  ┌──────────────┐
 │ market/feed      │ ────────────▶ │     store     │ ───────▶ │ engine       │
 │ Binance WS/REST  │               │ prices, orders│ ◀─────── │ estratégias  │
 │ (ou simulado)    │               │ clients, cfg  │  ordens  └──────────────┘
 └──────────────────┘               └──────┬────────┘
                                           │  eventos   ┌──────────────┐
                                           ├──────────▶ │ alerts/rules │ → alert:new
                                           │            └──────────────┘
                 eventos: prices:update, order:new, order:executed, order:canceled,
                          config:change, view:change, alert:new, commission:closed
                                           │
                           ┌───────────────┴───────────────┐
                           ▼                               ▼
                    views/client/*                   views/admin/*
                (usam calc/* para números)        (alteram config via store)
```

- **Relógio**: tempo real. Cada mensagem `miniTicker` (≈1 s por moeda) é uma atualização de preço.
- O **engine** verifica, para cada cliente × moeda ativa, se a estratégia manda comprar, programar venda ou executar uma ordem programada cujo preço foi atingido.
- As **regras de alerta** observam preços, ordens e saldos e publicam `alert:new`.
- As telas assinam os eventos e atualizam **só o trecho afetado** (linha nova na tabela, célula de preço, KPI), sem redesenhar a página.

Detalhes do modelo de dados e do gerador: [DADOS_FICTICIOS.md](DADOS_FICTICIOS.md).
Regras de cada estratégia e dos alertas: [ESTRATEGIAS.md](ESTRATEGIAS.md).

## 8. Regras de negócio principais

### 8.1 Caixa e reserva de banca

1. **Caixa** (por cliente): valor em USDT que o robô pode operar. Começa igual ao aporte e muda com o resultado e as movimentações.
2. **Reserva de banca** (% do caixa, por cliente): parte que nunca é usada em compras. Serve de proteção em quedas longas.
3. **Disponível para operar** = `caixa × (1 − reserva%) − valor em operação − compras programadas`.
4. Uma compra só ocorre se o seu valor couber no disponível. Quando o disponível acaba, o robô para de comprar para aquele cliente e dispara o alerta "Reserva de banca atingida".
5. **Valor por ordem** (por cliente): fixo em USDT ou % do caixa.
6. **Spread** e estratégia são **por moeda** e valem para todos os clientes que operam aquela moeda.

### 8.2 Operações

**Moeda base USDT**: o robô opera várias moedas, sempre em pares contra USDT. Toda compra sai do saldo em USDT e toda venda volta para USDT; uma operação só "fecha" quando volta para USDT. Caixa, resultado, comissão e relatórios são sempre em USDT.

7. **Venda vinculada**: toda venda aponta para a compra de origem (`compraId`). O lucro é calculado por par compra → venda, sem precisar de FIFO.
8. **Taxas**: 0,1% do valor de cada execução, registradas em USDT.
9. **Lucro de uma venda** = `valor da venda − custo da compra correspondente − taxas das duas pontas`.
10. **Trava de compras**: impede novas compras (global, por cliente ou por moeda). Vendas programadas continuam executando.
11. **Cancelar compra programada**: a ordem fica com status `cancelada` e o valor reservado volta ao disponível.
12. **Cancelar venda programada**: a posição continua aberta, marcada como **"sem alvo"**, e o admin pode definir um novo alvo.

### 8.3 Comissão por período de apuração

13. Cada cliente **escolhe** o seu **dia de fechamento** do mês: 10, 20 ou 30. Em meses sem dia 30 (fevereiro), o fechamento é no último dia do mês. O cliente pode trocar o dia na tela C5; a troca vale a partir do próximo período (o período aberto mantém as datas). O admin também pode alterar na A3.
14. **Período de apuração** = do dia seguinte ao fechamento anterior até o dia de fechamento (inclusive). Ex.: fechamento 10 → 11/09 a 10/10. O primeiro período começa na data de início do contrato.
15. **Resultado do período** = soma do lucro das vendas executadas no período − taxas do período.
16. **Comissão** = `max(resultado do período, 0) × comissão% / 100`. Cada período é independente: prejuízo não passa para o período seguinte.
17. Estados de um período: **aberto** (comissão prevista, muda ao vivo) → **apurado** (no dia de fechamento os valores são congelados e a comissão é contabilizada) → **pago** (marcado pelo admin) ou **vencido** (não pago no prazo).
18. Operações executadas depois do fechamento entram no período seguinte, mesmo que a compra seja anterior.
19. **Prazo de pagamento**: até 5 dias após o fechamento. Comissão 0,00 (período sem lucro) já nasce como paga.
20. **Continuidade do serviço**: o pagamento da comissão libera a continuação do serviço no período seguinte. Se o prazo vence sem pagamento, o período fica **vencido**, as **novas compras do cliente são travadas automaticamente** (vendas programadas e dinâmicas continuam executando até o admin decidir cancelá-las na A4) e o alerta "Comissão vencida" vai para o admin e o cliente. Ao marcar como pago, a trava sai sozinha (se não houver outra trava manual).

## 9. Fases

Cada fase tem um arquivo próprio com tarefas e critérios de aceite. Fazer na ordem; cada uma depende da anterior.

| Fase | Arquivo | Entrega visível |
|---|---|---|
| F0 | [fases/F0_FUNDACAO.md](fases/F0_FUNDACAO.md) | Esqueleto: topo, troca de visão, menu, rotas, tema claro/escuro |
| F1 | [fases/F1_DADOS_FICTICIOS.md](fases/F1_DADOS_FICTICIOS.md) | Histórico real de preços + clientes e operações fictícios; store funcionando |
| F2 | [fases/F2_COTACOES_AO_VIVO.md](fases/F2_COTACOES_AO_VIVO.md) | Faixa de cotações da Binance ao vivo, com fallback simulado |
| F3 | [fases/F3_VISAO_CLIENTE.md](fases/F3_VISAO_CLIENTE.md) | Telas C1–C6 com filtros, relatório, comissões e exportação |
| F4 | [fases/F4_MOTOR_ESTRATEGIAS.md](fases/F4_MOTOR_ESTRATEGIAS.md) | Novas operações surgindo ao vivo; alertas disparando |
| F5 | [fases/F5_VISAO_ADMIN.md](fases/F5_VISAO_ADMIN.md) | Telas A1–A7, travas, cancelamentos, apuração e configuração de alertas |
| F6 | [fases/F6_POLIMENTO.md](fases/F6_POLIMENTO.md) | Responsivo, acessibilidade, estados vazios, publicação |

Ponto de demonstração mínimo: **F0 → F3** já permite apresentar a visão do cliente com histórico e cotações reais.

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Binance fora do ar, lenta ou bloqueada na rede da apresentação | Fallback para cotações simuladas + cache do histórico + aviso no topo |
| Poucas operações ao vivo com preços reais | Perfil "Demonstração" com spreads menores (seção 4.2) |
| Tabelas grandes travarem o navegador | Paginação (50 linhas) e inserção incremental de linhas novas |
| Números incoerentes entre telas | Todos os números vêm das mesmas funções em `calc/` |
| Parecer um sistema real com dinheiro real | Selo "Demonstração — dados fictícios" visível no topo e no relatório impresso; texto explica que as cotações são reais e as operações simuladas |

## 11. Decisões

### 11.1 Confirmadas (24/10/2026)

| # | Tema | Decisão |
|---|---|---|
| 1 | Cotações | API pública da Binance, com fallback simulado |
| 2 | Parâmetros das estratégias | Todos configuráveis pelo admin, incluindo lucro mínimo e confirmação de sinal; alertas configuráveis no mesmo menu; estratégia de canais com confirmação |
| 3 | Venda programada cancelada | Posição fica "sem alvo"; admin define novo alvo |
| 4 | Caixa, reserva e spread | Spread por moeda; caixa e reserva de banca por cliente |
| 5 | Trava de compras | Global, por cliente e por moeda |
| 6 | Comissão | Por resultado do período de apuração; fechamento no dia 10, 20 ou 30; contabilizada após o fechamento |
| 7 | Nome | "CriptoOps" provisório |
| 8 | Resultado do período | Só operações fechadas (vendas executadas no período); posições em aberto não entram |
| 9 | Fechamento | Dia do mês (10, 20 ou 30) escolhido pelo cliente, para pagamento da comissão e continuidade do serviço |
| 10 | Prazo de pagamento | Até 5 dias após o fechamento |
| 11 | Moeda de operação | USDT é a moeda base: compras saem de USDT, vendas voltam para USDT, e caixa, resultado, comissão e relatórios são sempre em USDT. Sem conversão para BRL no MVP. |
| 12 | Comissão vencida | Suspende só as novas compras. Vendas programadas e dinâmicas continuam até o admin decidir cancelar. |

### 11.2 Em aberto

Nenhuma no momento.
