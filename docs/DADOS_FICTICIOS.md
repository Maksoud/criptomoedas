# Dados Fictícios e Modelo em Memória

> As **cotações são reais** (Binance). Clientes, saldos, operações, comissões e alertas são **fictícios** e gerados no navegador por `assets/js/data/seed.js`, com semente fixa. Nenhum nome ou conta corresponde a pessoas reais. Não usar dados dos dumps do projeto antigo.

## 1. Volume inicial

| Item | Quantidade |
|---|---|
| Clientes | 8 (6 ativos, 1 pausado, 1 inativo) |
| Moedas no catálogo | 10 (8 ativas, 2 desligadas) |
| Histórico | 180 dias antes de agora |
| Operações executadas | ~3.000 a 5.000 |
| Ordens programadas abertas | ~40 a 80 |
| Movimentações de caixa | 2 a 6 por cliente |
| Períodos de apuração | ~6 por cliente (os passados já apurados; a maioria paga) |
| Alertas no histórico | ~20 dos últimos 2 dias |

## 2. Catálogo de moedas (`data/coins.js`)

Todos os pares são contra USDT e existem na Binance. O **preço de referência** só é usado no modo simulado (sem conexão).

| Símbolo | Par Binance | Nome | Preço ref. (fallback) | Volatilidade (simulado) | Cor do monograma | Ativa |
|---|---|---|---|---|---|---|
| BTC | BTCUSDT | Bitcoin | 80.000 | 0,08% | `#F7931A` | sim |
| ETH | ETHUSDT | Ethereum | 3.400 | 0,10% | `#8C8CF0` | sim |
| BNB | BNBUSDT | BNB | 600 | 0,09% | `#F3BA2F` | sim |
| SOL | SOLUSDT | Solana | 150 | 0,14% | `#14F195` | sim |
| XRP | XRPUSDT | XRP | 0,58 | 0,12% | `#9AA4B2` | sim |
| ADA | ADAUSDT | Cardano | 0,42 | 0,12% | `#3468D1` | sim |
| DOGE | DOGEUSDT | Dogecoin | 0,14 | 0,18% | `#C2A633` | sim |
| LINK | LINKUSDT | Chainlink | 14,50 | 0,13% | `#2A5ADA` | sim |
| LTC | LTCUSDT | Litecoin | 78 | 0,11% | `#A6A9AA` | não |
| DOT | DOTUSDT | Polkadot | 6,20 | 0,13% | `#E6007A` | não |

USDT é a moeda base: não entra no catálogo como moeda operada, é o saldo de onde as compras saem e para onde as vendas voltam.

Precisões (preço, quantidade e valor mínimo) vêm de `GET /api/v3/exchangeInfo?symbols=[...]`, com os valores acima como fallback: 6 casas de quantidade para BTC/ETH e 4 para as demais; preço com 2 casas acima de 1 USDT e 4–6 abaixo.

## 3. Clientes fictícios (`data/clients.js`)

| Campo | Exemplo | Observação |
|---|---|---|
| `id` | `c01` | |
| `nome` | Marina Albuquerque | Nomes inventados |
| `status` | `ativo` · `pausado` · `inativo` | |
| `aporteInicial` | 25.000 | 5.000 a 120.000 USDT |
| `inicioContrato` | 2026-04-27 | Dentro dos 180 dias |
| `caixa` | 26.380,15 | Valor que o robô pode operar (derivado das movimentações + resultado; ver §5) |
| `reservaPct` | 20 | Reserva de banca: 10 a 40 |
| `valorOrdem` | `{ tipo: 'percent', valor: 3 }` ou `{ tipo: 'fixo', valor: 500 }` | |
| `comissaoPct` | 25 | 15 a 30 |
| `diaFechamento` | 10 · 20 · 30 | Escolhido pelo cliente; distribuir entre os clientes |
| `diaFechamentoProximo` | `null` ou 10 · 20 · 30 | Troca pedida pelo cliente, aplicada ao abrir o próximo período |
| `prazoPagamentoDias` | 5 | Dias após o fechamento |
| `travaPorComissao` | `false` | Ligada automaticamente quando há período vencido |
| `moedas` | `['BTC','ETH','SOL']` | Subconjunto das ativas |
| `travaCompras` | `false` | |

## 4. Entidades do store

```js
store.state = {
  agora: Date,                    // relógio real
  visao: 'cliente' | 'admin',
  clienteAtual: 'c01',            // "Visualizando como"
  mercado: { fonte: 'binance' | 'simulado', conectado: true, ultimaMensagem: Date },
  robo:    { ligado: true },

  moedas:   { BTC: { simbolo, par, nome, ativa, travaCompras, estrategia, params, confirmacao, precisao } },
  precos:   { BTC: { atual, anterior, abertura24h, variacao24h, velas1m: [], velas15m: [], diario: [] } },
  clientes: { c01: { ...campos da seção 3 } },

  ordens:      [ Ordem ],         // todas as ordens, de todos os clientes
  movimentos:  [ Movimento ],     // aportes e saques
  periodos:    [ Periodo ],       // períodos de apuração de comissão
  alertas:     [ Alerta ],        // alertas disparados
  regrasAlerta:{ [id]: RegraAlerta },
  logAdmin:    [ { data, texto, origem: 'admin' | 'automatico' } ],
  estadoMotor: { 'c01:BTC': { ...estado interno da estratégia } },
  config:      { travaGlobal: false, perfil: 'demo' | 'padrao', reservaPadrao: 20, valorOrdemPadrao: {...} },
};
```

### Ordem

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | `o000123` |
| `clienteId` | string | |
| `moeda` | string | `BTC` |
| `lado` | `compra` · `venda` | |
| `tipo` | `LIMIT` · `MARKET` | |
| `status` | `programada` · `aguardando-confirmacao` · `executada` · `cancelada` · `reposicionada` | |
| `preco` | number | Preço programado ou executado |
| `quantidade` | number | |
| `total` | number | `preco × quantidade` (USDT) |
| `taxa` | number | USDT, só quando executada |
| `estrategia` | string | id da estratégia que gerou |
| `motivo` | string | Ex.: `recuo após topo`, `alvo atingido`, `stop`, `rompimento de canal` |
| `compraId` | string \| null | Em vendas: a compra de origem |
| `alvo` | number \| null | Em compras: preço de venda planejado (`null` = sem alvo) |
| `vendaDinamica` | boolean | Estratégias A e G |
| `criadaEm` | Date | |
| `executadaEm` | Date \| null | |
| `canceladaPor` | `admin` · `sistema` · null | |
| `origem` | `historico` · `ao-vivo` | Para destacar o que surgiu durante a demo |

### Movimento (caixa)

`{ id, clienteId, tipo: 'deposito' | 'saque', valor, data, observacao }`

### Período de apuração

| Campo | Descrição |
|---|---|
| `id`, `clienteId` | |
| `inicio`, `fim` | Datas (fim = dia de fechamento, inclusive) |
| `status` | `aberto` · `apurado` · `pago` · `vencido` |
| `resultado` | Lucro das vendas executadas no período − taxas (só operações fechadas; congelado ao apurar) |
| `comissaoPct` | Copiado do cliente ao apurar |
| `comissao` | `max(resultado, 0) × comissaoPct / 100` |
| `vencimento` | `fim + prazoPagamentoDias` |
| `apuradoEm`, `pagoEm` | |
| `operacoes` | Quantidade de vendas consideradas |

Só existe **um** período `aberto` por cliente; os números dele são calculados ao vivo e só são gravados ao apurar.

### Alerta

`{ id, regraId, severidade: 'info' | 'atencao' | 'critico', titulo, texto, moeda?, clienteId?, data, lido, acaoAutomatica? }`

### Regra de alerta

`{ id, ligada, limites: {...}, escopo: { moedas: 'todas' | [...], clientes: 'todos' | [...] }, canais: { toast, som, navegador }, acaoAutomatica, cooldownMin }`

## 5. Derivados (calculados em `calc/`, nunca guardados)

| Derivado | Regra |
|---|---|
| Posição aberta | Compra `executada` sem venda `executada` com `compraId` igual |
| Valor em operação | Σ posições × cotação atual |
| Compras programadas | Σ valor das compras com status `programada` (dinheiro reservado) |
| Saldo livre | `aporte + depósitos − saques + Σ vendas − Σ compras − Σ taxas` |
| Caixa | `saldo livre + custo das posições abertas` (não muda com a oscilação de preço; muda com resultado realizado e movimentações) |
| Reserva de banca | `caixa × reservaPct / 100` |
| Disponível para operar | `caixa − reserva − custo das posições abertas − compras programadas` |
| Patrimônio | `saldo livre + valor em operação` (a mercado) |
| Resultado % | `(patrimônio ÷ (aporte + depósitos − saques) − 1) × 100` |
| Lucro de uma venda | `venda.total − compra.total × (venda.qtd ÷ compra.qtd) − venda.taxa − compra.taxa proporcional` |
| Período de uma data | Pelo `diaFechamento`: se o dia ≤ fechamento, o período termina neste mês; senão, no próximo (dia 30 vira último dia em fevereiro) |
| Evolução do patrimônio | Recalculada por dia a partir das ordens + preço diário real |

## 6. Gerador (`data/seed.js`)

1. **Preços**: baixa velas de 4 h (180 dias) e de 15 min (48 h) da Binance; usa o cache do dia se existir. Sem conexão, gera um passeio aleatório a partir do preço de referência.
2. **PRNG com semente** (`utils/random.js`, mulberry32, semente `20261024`) para tudo que é fictício. Nunca usar `Math.random()` no seed.
3. **Operações**: para cada cliente × moeda, roda a estratégia B (perfil Padrão) sobre as velas de 4 h — usando máxima e mínima de cada vela para decidir se uma ordem programada foi atingida — respeitando caixa e reserva. Assim o histórico é coerente com as regras e sobram posições abertas no fim.
4. **Ordens programadas**: as que sobram no fim do histórico viram a fila inicial da tela A4.
5. **Movimentos**: depósito inicial na data de início do contrato + 1 a 5 movimentos aleatórios.
6. **Períodos**: cria todos os períodos desde o início do contrato; os antigos ficam `pago`; o último encerrado fica `apurado` se ainda estiver no prazo; o atual fica `aberto`. Um cliente fica com um período `vencido` (e compras travadas) para demonstrar a suspensão.
7. **Alertas**: replica as regras de alerta sobre as velas de 15 min das últimas 48 h para a central não começar vazia.
8. Validar ao final (só em modo dev, `console.assert`): nenhum saldo livre negativo; nenhuma compra acima do disponível; toda venda tem compra; soma das comissões dos períodos = recálculo.

Meta: gerar as operações em < 300 ms depois que os preços chegaram (o download inicial pode levar ~1–2 s; mostrar esqueleto de carregamento).
