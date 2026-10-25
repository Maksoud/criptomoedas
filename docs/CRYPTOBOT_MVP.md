# Cryptobot — Documento de Análise e Base para o Novo Projeto (MVP)

> Levantamento feito em 24/10/2026 a partir das pastas `cryptobot_site/`, `cryptobot_server/` e dos dumps `.sql` da raiz.
> Objetivo: servir de referência para iniciar um **novo projeto** — um portal (front) onde o cliente acompanha suas contas, as moedas operadas no período, as operações pendentes e emite o relatório de comissão e ganhos.

---

## 1. Resumo

| Item | Sistema legado (2020–2022) |
|---|---|
| Produto | Robô de trade (Binance Spot) operando contas de vários clientes, com painel web para acompanhamento |
| `cryptobot_site` | WordPress com tema próprio (`my-theme`), jQuery + Bootstrap 4. Na prática era um **painel administrativo** (lista de clientes, botão "pânico", cadastro de moedas, saldos, ordens) |
| `cryptobot_server` | Node.js: servidor **WebSocket** (porta 3000) que conversa com a **API da Binance** (`node-binance-api`) e com o **MySQL** |
| Banco principal | `sl_xfirebot` (dump `sl_xfirebot_12052022.sql`, ~156 mil ordens registradas, nov/2020 → dez/2021) |
| Banco do site | `cryptobot_site` (dump `cryptobot_site_12052022.sql`): tabelas do WordPress + cópias antigas de tabelas do robô |
| Quem gravava as ordens | O **robô** (processo separado, versões 3.x/4.x, rodando em VPS por cliente — campo `usu_contas.servidor`). O `cryptobot_server` lia o banco e a Binance; ele **não** era quem gravava `reg_ordem` |

**Lacuna importante:** o relatório de comissão/ganhos **nunca foi implementado** no legado. Existem apenas os campos `comissao` (%) e `diaPgtoComissao` em `usu_contas` e as telas de cadastro. O cálculo do relatório é o principal item novo do MVP (ver seção 7).

---

## 2. Arquitetura legada

```
┌────────────────────────┐   WebSocket (JSON)   ┌──────────────────────────┐
│ cryptobot_site (WP)    │ ───────────────────▶ │ cryptobot_server (Node)  │
│ jQuery + Bootstrap     │ ◀─────────────────── │ index.js  (Controller)   │
│ assets/js/websocket.js │  {func: "..."}       │ apiconnection.js (Binance)│
└────────────────────────┘  {<func>: result}    │ dbconnection.js  (MySQL)  │
                                                └──────┬───────────┬───────┘
                                                       │           │
                                             MySQL sl_xfirebot   Binance API
                                                       ▲      (REST + WS depth)
                                                       │
                                      Robôs (VPS por cliente) gravam reg_ordem
                                      e atualizam saldoLivre/saldoTotal/dataSincronia
```

- **Sem API REST**: todo o tráfego era por WebSocket, mensagem `{ func: "<nome>", clientData: {...}, ... }` e resposta `{ "<nome>": <resultado> }`.
- A sessão do WebSocket guardava o **cliente selecionado** (apiUser + chaves da Binance) e o **período** (`daterange`, formato `DD-MM-YYYY - DD-MM-YYYY`).
- Cotações eram mantidas em memória via *market depth* da Binance (preço `bids`) para os pares do saldo do cliente + `BTCUSDT`, `BNBUSDT`, `ETHUSDT`, `USDTBRL`.
- Autenticação: login do WordPress (só administradores). O `index2.php` da raiz é um login antigo em PHP puro usando a tabela `login` (descontinuado).

---

## 3. Estrutura de pastas relevante

### 3.1 `cryptobot_server/`

| Arquivo | Papel |
|---|---|
| `index.js` (~3000 linhas) | Controller: cria o servidor HTTP/HTTPS + WebSocket, roteia `func`, monta respostas (dashboard, saldos convertidos, ordens abertas, histórico) |
| `apiconnection.js` | Wrapper Binance: `getBalance`, `getOpenOrders`, `getTrades`, `getOrderStatus`, `cancelOrder`, `setBuySell`, `getDepositHistory`, `getWithdrawHistory`, `getMarketDepthCache(Result)`, `getExchangeInfo`, `setWithdraw` |
| `dbconnection.js` | Acesso MySQL: CRUD de `usu_contas`, `usu_moedas`, `deposit_history`/`reg_aportes`, `reg_ordem_saved`, `currencies` |
| `keys/keys.js` | Credenciais do banco remoto (**versionado — não reaproveitar**) |
| `cryptobot.sql` | Versão antiga do schema (tabelas `currencies`, `deposit_history`, `real_conta`, `reg_ordem`) |
| `package.json` | `mysql`, `node-binance-api`, `ws`, `moment`, `md5` |

### 3.2 `cryptobot_site/wp-content/themes/my-theme/`

| Arquivo | Tela / papel |
|---|---|
| `header.php` | Topo com seletor de período (daterangepicker), seletor de cliente, faixa de cotações (BTC, BNB, ETH, USDT/BRL) e menu lateral |
| `index.php` | **Dashboard**: cards por cliente (saldo total, em operação, disponível, aporte inicial e % de resultado), filtros Normais/Pausados/Inativos |
| `page-configuracoes.php` | Cadastro de contas de clientes (`usu_contas`) |
| `page-moedas-em-operacao.php` | Cadastro de moedas/estratégias (`usu_moedas`) |
| `page-ordens-abertas.php` | Ordens abertas na Binance agrupadas por moeda + cálculo de **preço médio** |
| `page-saldos.php` | Saldos por moeda convertidos para USDT, % disponível e % de participação |
| `page-trades.php` | Trades executados (Binance `getTrades`) |
| `page-depositos-bd.php` / `page-saques-bd.php` | Aportes e saques registrados no banco (`reg_aportes`) |
| `page-depositos-api.php` / `page-saques-api.php` | Histórico de depósitos/saques direto da Binance |
| `page-exchange.php` | Exchange Info (limites, símbolos, filtros) |
| `assets/js/websocket.js` | Cliente WebSocket (`wsClient.*`) e roteamento das respostas para as views |
| `includes/views/*.js` | Renderização de cada tela (jQuery montando tabelas, paginação manual) |
| `includes/*modal*.php` | Modais de cadastro (cliente, moeda, compra/venda, aporte, preço médio) |

Plugins WP: Advanced Custom Fields Pro, Advanced Access Manager, WP Fail2Ban.

---

## 4. Banco de dados (`sl_xfirebot`)

### 4.1 Diagrama

```
usu_contas (1) ──< reg_ordem      (codusu → usu_contas.id)
usu_contas (1) ──< reg_aportes    (codusu → usu_contas.id)
usu_contas.operacao = JSON array de usu_moedas.id   ex.: [3,9,7,8,2]
usu_moedas.nome  ≈ currencies.symbol                 ex.: "BTCUSDT"
```

Não há chaves estrangeiras declaradas; os vínculos são por convenção.

### 4.2 `usu_contas` — contas dos clientes

| Campo | Tipo | Significado |
|---|---|---|
| `id` | int | Código do cliente (`codusu`) — faixas usadas: 1–99, 1000, 2001+, 4001+, 5001+ |
| `situa` | char(1) | `N` Normal (operando), `P` Pausado, `I` Inativo, `X` (outro estado, ver robô) |
| `servidor` | varchar | URL da VPS onde o robô do cliente roda (ex.: `http://<host>:3051`) |
| `accountIP` | varchar | IP do cliente/VPS |
| `versao` | varchar | Versão do robô (3.0.1 … 4.4.0) |
| `usuario`, `nome`, `pass` | varchar | Login, nome e senha (hash MD5) do cliente |
| `multSpread`, `multVolume` | double | Multiplicadores da estratégia (ex.: 50 / 200) |
| `operacao` | longtext | **JSON array** com os ids de `usu_moedas` que a conta opera |
| `publica`, `privada` | varchar | API Key / Secret da Binance (**em texto puro**) |
| `codest`, `codmod`, `banca`, `mostrarSaldo` | — | Estratégia, modelo, banca, flag de exibição |
| `saldoLivre`, `saldoTotal` | double | Saldos em USDT atualizados pelo robô |
| `porcCrossMin`, `porcCrossMax`, `porcReserva` | int | Parâmetros de cruzamento e % de reserva de saldo |
| `dataSincronia` | datetime | Última sincronização do robô |
| `aporteInicial` | decimal(10,2) | Valor inicial investido (USDT) |
| `criacao` | timestamp | Início do contrato |
| `comissao` | decimal(10,2) | **% de comissão** cobrada sobre o ganho |
| `diaPgtoComissao` | varchar(20) | **Dia(s) de pagamento** da comissão |

### 4.3 `usu_moedas` — moedas/pares operados e parâmetros

| Campo | Significado |
|---|---|
| `id`, `situa` | `N` ativa, `I` inativa, `B` base (ex.: USDTBRL) |
| `nome`, `sigla` | Par (`BTCUSDT`) e ativo (`BTC`) |
| `codcon`, `codmod`, `codbase`, `codmoe` | Códigos internos do robô |
| `teto`, `piso` | Faixa de preço em que o robô opera |
| `spread` | JSON `{"spread":400,"tipo":1}` |
| `variacao` | JSON `{"dvolume":5,"dvalor":2,"lucro":3,"inicio":200,"maxspread":800}` |
| `nivel` | JSON `{"nv1":{"multiplicador":0,"menor":15,"spread":1},"nv2":{...},"last":{...}}` |

Pares existentes no dump: BTC, ETH, LTC, XRP, LINK, XLM, DASH, XEM, THETA, TWT, DOGE, LIT (ativos) e ADA, DODO, ALICE (inativos) — todos contra USDT.

### 4.4 `reg_ordem` — operações executadas (fonte do relatório)

| Campo | Significado |
|---|---|
| `id` | PK |
| `situa` | `N` normal (válida), `D` desconsiderada/excluída |
| `codusu` | Cliente |
| `extcod` | `orderId` da Binance. **Uma ordem pode ter várias linhas** (um registro por *fill*) |
| `tipo` | `LIMIT` ou `MARKET` |
| `moeda` | Par, ex.: `BTCUSDT` |
| `valor` | Total da execução na moeda de cotação (USDT) = `quantidade × cotacao` |
| `lucro` | **Multiplicador-alvo** da compra (ex.: `1.03` = vender com +3%) |
| `quantidade` | Quantidade do ativo base |
| `cotacao` | Preço executado |
| `operacao` | `BUY` ou `SELL` |
| `taxa`, `tmoeda` | Taxa paga e a moeda da taxa (geralmente `BNB`) |
| `tconta` | JSON com as taxas da conta `{"ALL":0.001,"BNB":0.0007}` |
| `data` | Data/hora da execução |
| `time` | Timestamp (estourou o int — vale `2147483647`; **usar `data`**) |
| `criacao` | Data de gravação no banco |
| `hash` | (só na versão do `cryptobot.sql`) |

Volume: ~82 mil BUY e ~74,5 mil SELL. A diferença entre compras e vendas é, em essência, o **estoque pendente** (comprado aguardando valorização).

### 4.5 `reg_aportes` — depósitos e saques do cliente

| Campo | Significado |
|---|---|
| `tipo` | `D` depósito, `S` saque |
| `codusu`, `data` | Cliente e data |
| `moedaoperacao` | Moeda do aporte (BTC, USDT…) |
| `montante` | Quantidade |
| `cotacaoUSDT`, `totalUSDT` | Cotação na data e total convertido |

### 4.6 Outras tabelas

- `currencies`: catálogo de pares da Binance (`symbol`, `baseAsset`, `quoteAsset`, precisões).
- `reg_ordem_saved`: usada pelo `saveOrderDB` do servidor para salvar ordens manuais (não está nos dumps).
- `deposit_history`, `real_conta`, `login` (em `cryptobot_site*.sql`): versões antigas/legadas; não são necessárias no MVP.
- `wp_*`: WordPress.

---

## 5. Protocolo WebSocket legado (referência para a futura API)

| `func` enviada | Resposta / efeito |
|---|---|
| `getDashboard` (situa opcional) | Lista de contas com saldos e parâmetros |
| `setApiData` | Seleciona o cliente na sessão (carrega chaves Binance) |
| `getUserDataDB` / `setUserDataDB` / `changeSituaUserDataDB` / `deleteUserDataDB` | CRUD de contas |
| `panicUserDataDB` | Pausa **todas** as contas (`situa N → P`) |
| `getOpMoedaDB` / `setOpMoedaDB` / `changeSituaOpMoedaDB` | CRUD de moedas |
| `getBalance` | Saldos Binance convertidos para USDT/BRL |
| `getOpenOrders` | Ordens abertas + `toFinish` (% que falta para executar) |
| `getTrades` | Trades executados no período |
| `getDepositHistory(DB)` / `getWithdrawHistory(DB)` / `set…` / `delete…` | Aportes e saques (API e banco) |
| `getMarketDepthCache`, `getUSDT`, `getAllCurrenciesPairs`, `getExchangeInfo` | Cotações e metadados |
| `setBuySell`, `cancelOrder`, `saveOrderDB` | Operação manual |
| `gitPull`, `stopReload`, `ServerStatus` | Manutenção do servidor |

---

## 6. Regras de negócio já existentes (reaproveitar)

1. **Conversão para USDT** (`index.js › getBalance`), usando o preço `bids`:
   - BTC, BNB, ETH: `qtd × <ATIVO>USDT`
   - BRL: `qtd ÷ USDTBRL`; USDT → BRL: `qtd × USDTBRL`
   - Demais: tenta `ATIVO/BTC × BTCUSDT`, depois `ATIVO/BNB × BNBUSDT`, depois `ATIVO/USDT`.
2. **% disponível** = `available ÷ total × 100`; **participação** = `totalUSDT da moeda ÷ total geral × 100`.
3. **Dashboard por cliente** (`getDashboardView.js`):
   - Em operação = `saldoTotal − saldoLivre`
   - % disponível = `saldoLivre ÷ saldoTotal × 100` (verde > 20%)
   - Resultado da banca = `(saldoTotal ÷ aporteInicial − 1) × 100` (verde > 5%, amarelo 0–5%, vermelho < 0)
4. **Distância para executar** uma ordem aberta (`toFinish`):
   - BUY: `−((preço ÷ cotação atual) − 1) × 100`
   - SELL: `−((cotação atual ÷ preço) − 1) × 100`
5. **Preço médio** (`getOpenOrdersView.js › precoMedio`): soma das ordens selecionadas, cotação média, e simulação de "liberação" de parte da posição (50% fixo).
6. **Alvo de venda** de uma compra = `cotacao × lucro` (ex.: 1.03 → +3%).

---

## 7. Proposta do MVP (novo projeto)

### 7.1 Escopo

Portal **do cliente** (e visão admin simples) só de leitura, com dados reais do banco:

| # | Tela | Conteúdo | Fonte |
|---|---|---|---|
| 1 | Login | Usuário/senha do cliente | nova tabela `users` (ou `usu_contas.usuario`/`pass` migrados com bcrypt) |
| 2 | Visão geral | Saldo total, em operação, disponível, aporte inicial, resultado %, data da última sincronia | `usu_contas`, `reg_aportes` |
| 3 | Moedas operadas no período | Por par: nº de compras, nº de vendas, volume comprado/vendido (USDT), lucro realizado, taxas | `reg_ordem` filtrado por `codusu` + período |
| 4 | Operações pendentes | Compras ainda não vendidas: par, quantidade, preço de compra, alvo (`cotacao × lucro`), cotação atual, variação %, valor atual | `reg_ordem` (BUY sem SELL correspondente) + cotação |
| 5 | Relatório de comissão e ganhos | Período, ganho bruto, taxas, ganho líquido, % comissão, valor da comissão, data de pagamento; exportar PDF | `reg_ordem`, `usu_contas.comissao/diaPgtoComissao` |
| 6 | Aportes e saques | Lista e totais em USDT | `reg_aportes` |
| 7 | (Admin) Lista de clientes | Cards do dashboard legado, filtro por situação | `usu_contas` |

Fora do MVP: operação manual (comprar/vender/cancelar), cadastro de moedas/estratégias, Exchange Info, `gitPull`/pânico.

### 7.2 Regras a definir/validar (pontos em aberto)

1. **Pareamento compra × venda** — o banco não liga uma venda à compra de origem. Opções:
   - **FIFO por par** (recomendado para o MVP): cada SELL consome as BUYs mais antigas do mesmo `codusu`+`moeda`; lucro = `valor_venda − custo_FIFO − taxas`.
   - Preço médio por par.
   - Confirmar com a lógica do robô se a venda corresponde a uma compra específica (alvo `cotacao × lucro`).
2. **Agrupar fills**: somar linhas com o mesmo `extcod` antes de exibir.
3. **Considerar só `situa = 'N'`** em `reg_ordem` (ignorar `D`).
4. **Taxas**: `taxa` vem em `tmoeda` (normalmente BNB) → converter para USDT pela cotação da data (ou aproximar com a cotação atual no MVP).
5. **Base da comissão**: lucro realizado líquido no período (vendas fechadas) — confirmar se inclui ou exclui pendentes e se considera prejuízo de períodos anteriores.
6. **Período de cobrança**: `diaPgtoComissao` é texto livre (ex.: "5", "0") — normalizar para dia do mês.
7. **Cotação atual** para pendentes: API pública da Binance (`/api/v3/ticker/price`), sem precisar das chaves do cliente.

Fórmula proposta para o relatório:

```
ganho_bruto     = Σ (valor_venda − custo_compra_FIFO)   no período
taxas_usdt      = Σ taxa convertida para USDT           no período
ganho_liquido   = ganho_bruto − taxas_usdt
comissao_valor  = max(ganho_liquido, 0) × comissao% / 100
ganho_cliente   = ganho_liquido − comissao_valor
```

### 7.3 Modelo de dados sugerido (novo)

Manter a semântica, com nomes claros e chaves estrangeiras:

```sql
clients        (id, name, username, password_hash, status ENUM('active','paused','inactive'),
                initial_deposit_usdt, commission_pct, commission_day, started_at,
                balance_free_usdt, balance_total_usdt, synced_at)
coins          (id, symbol, base_asset, quote_asset, status)
client_coins   (client_id FK, coin_id FK)                 -- substitui o JSON usu_contas.operacao
orders         (id, client_id FK, exchange_order_id, symbol, type, side,
                quantity, price, total_quote, target_multiplier,
                fee, fee_asset, executed_at, status)       -- de reg_ordem (fills agregados ou não)
deposits       (id, client_id FK, kind ENUM('deposit','withdraw'), asset,
                amount, price_usdt, total_usdt, occurred_at) -- de reg_aportes
commission_reports (id, client_id FK, period_start, period_end, gross, fees,
                net, commission_pct, commission_value, due_date, generated_at)
```

API keys da Binance **não** entram no portal do cliente (ficam só no robô, criptografadas).

### 7.4 API sugerida (REST)

```
POST /auth/login
GET  /me/summary?from=&to=
GET  /me/coins?from=&to=            -- moedas operadas no período
GET  /me/pending                    -- operações pendentes
GET  /me/reports/commission?from=&to=
GET  /me/reports/commission.pdf?from=&to=
GET  /me/deposits?from=&to=
GET  /admin/clients?status=
```

### 7.5 Stack sugerida (a decidir)

- Front: React + Vite (ou Next.js) + Tailwind; gráficos com Recharts/Chart.js.
- Back: Node.js (Express/Fastify) + MySQL/MariaDB — mantém compatibilidade com o banco atual para importar os dumps.
- Para começar só o front: usar **dados mock** gerados a partir de uma amostra anonimizada de `reg_ordem`/`usu_contas`.

### 7.6 Passos para iniciar o novo projeto

1. Importar `sl_xfirebot_12052022.sql` num MySQL local (ambiente de estudo).
2. Gerar amostra **anonimizada** (nomes, usuários, IPs, chaves) para mock/seed.
3. Escrever as consultas de: moedas no período, pendentes (FIFO) e comissão — validar números com um cliente real.
4. Construir as telas 2 → 5 com mock; depois ligar à API.
5. Exportação do relatório em PDF.

---

## 8. Riscos e cuidados herdados

- **Dados sensíveis nos dumps**: nomes reais, hashes MD5 de senha e **API Key/Secret da Binance em texto puro** (`usu_contas.publica/privada`, `real_conta`). Não versionar no novo repositório; revogar as chaves na Binance se ainda existirem.
- `cryptobot_server/keys/keys.js` e `cryptobot_site/wp-config.php` contêm credenciais.
- SQL montado por concatenação em `dbconnection.js` (risco de SQL injection) — usar consultas parametrizadas/ORM.
- Senhas em MD5 → migrar para bcrypt/argon2.
- O WebSocket recebia comandos como `gitPull` sem autenticação — não replicar.
- Campo `reg_ordem.time` estourado (`2147483647`) — usar `data`.
- Nada de chaves de exchange no front; cotações via endpoints públicos.

---

## 9. Glossário

| Termo | Significado |
|---|---|
| `codusu` | Código do cliente (`usu_contas.id`) |
| `situa` | Situação do registro (N/P/I/X em contas; N/I/B em moedas; N/D em ordens) |
| Aporte | Depósito do cliente na conta operada |
| Saldo livre | USDT disponível (não alocado em moedas) |
| Em operação | Valor alocado em moedas compradas e ordens abertas |
| Pendente | Compra realizada aguardando valorização para venda |
| Spread / Volume | Multiplicadores da estratégia do robô |
| Reserva (%) | Percentual do saldo que deve ficar livre |
