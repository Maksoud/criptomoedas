# Estratégias de Operação e Alertas

> Especificação do que o motor simulado (`assets/js/engine/`) executa e do que as regras de alerta (`assets/js/alerts/`) observam. O admin escolhe uma estratégia **por moeda** e ajusta **todos** os parâmetros na tela A2; os alertas ficam em A7. Os números deste documento são apenas padrões.

## 1. Conceitos comuns

| Termo | Definição |
|---|---|
| Atualização de preço | Cada mensagem da Binance (≈1 por segundo por moeda). |
| Vela (candle) | Agrupamento de preços por intervalo (o motor monta velas de 1 min a partir das atualizações). Usada pela confirmação de sinal e pelos canais. |
| Caixa | Valor em USDT que o robô pode operar para o cliente. |
| Reserva de banca | % do caixa que nunca é usado em compras. |
| Disponível para operar | `caixa × (1 − reserva%) − em operação − compras programadas`. |
| Valor por ordem | Quanto, em USDT, cada compra usa (fixo ou % do caixa, por cliente). |
| Spread | Distância percentual entre níveis de compra. **Por moeda.** |
| Alvo | Preço de venda programado para uma compra. |
| Ordem programada | Ordem `LIMIT` aguardando o preço chegar. |
| Venda dinâmica | Venda sem preço fixo, que acompanha o topo (estratégias A e G). |
| Posição | Compra executada que ainda não foi vendida. |

### 1.1 Verificações antes de qualquer compra

Ficam num único ponto (`podeComprar(cliente, moeda)`). A compra só é criada se **todas** forem verdadeiras:

1. Moeda ativa e com a estratégia ligada.
2. Sem trava de compras global, do cliente ou da moeda (inclui a trava automática por comissão vencida).
3. Cliente com status `ativo` e robô ligado.
4. Valor da ordem ≤ disponível para operar (respeita a reserva de banca).
5. Posições abertas do cliente na moeda < `maxPosicoes`.
6. Preço dentro da faixa `piso`/`teto`, se definida.

Quando a regra 4 bloqueia uma compra, dispara o alerta **Reserva de banca atingida** (seção 6).

### 1.2 Parâmetros gerais (todas as estratégias, por moeda)

| Parâmetro | Padrão | Descrição |
|---|---|---|
| `spread` | 2% (Demo: 0,4%) | Distância entre compras. Usado pelas estratégias que montam níveis. |
| `lucroMinimo` | 0,5% | Nenhuma venda automática acontece abaixo de `preço de compra × (1 + lucroMinimo)` |
| `maxPosicoes` | 5 | Limite de posições abertas por cliente na moeda |
| `piso` / `teto` | vazio | Faixa de preço fora da qual não compra |
| `stopPerda` | desligado | Se ligado (ex.: 8%), vende a mercado quando a posição cai esse tanto. **Ignora** o lucro mínimo e sempre pede confirmação de sinal. |
| `taxa` | 0,1% | Taxa por execução (só leitura no MVP) |

### 1.3 Confirmação de sinal

Disponível em **todas** as estratégias, ligada por padrão em A e G. Evita agir num movimento de poucos segundos.

| Parâmetro | Padrão | Descrição |
|---|---|---|
| `confirmacao.ativa` | sim | Liga/desliga |
| `confirmacao.modo` | `velas` | `velas`: a condição precisa valer no fechamento de N velas seguidas · `tempo`: precisa valer por N segundos sem interrupção · `volume`: a vela que confirma precisa ter volume acima da média das últimas 20 |
| `confirmacao.n` | 2 | Quantidade de velas (ou segundos) |
| `confirmacao.aplicarEm` | compra e venda | `compra`, `venda` ou ambos |

Enquanto a confirmação corre, a tela A4 mostra o sinal como **"aguardando confirmação"** (com contagem, ex.: 1/2).

### 1.4 Perfis de parâmetros

O admin aplica um perfil a uma moeda ou a todas. O perfil só preenche os campos; cada valor continua editável.

| Parâmetro | Padrão | Demonstração |
|---|---|---|
| Spread | 2% | 0,1% |
| Recuos (A) | 3% | 0,1% |
| Queda mínima para armar (A) | 2% | 0,12% |
| Lucro (B) | 3% | 0,25% |
| Lucro sobre o preço médio (C / E) | 2% / 4% | 0,3% |
| Lucro mínimo | 0,5% | 0,22% |
| Máximo de posições | 5 | 10 |
| Canal (G): velas · largura · tolerância · rompimento | 60 · 1–6% · 0,15% · 0,5% | 20 · 0,05–1% · 0,02% · 0,05% |
| Confirmação | 2 velas de 1 min | 2 velas de 15 s |

Os valores de Demonstração foram recalibrados na F4 (24–25/10/2026) com as cotações reais: num mercado calmo os preços andam só 0,01% a 0,1% em 3 a 5 minutos, então spreads de 0,4% não geravam operações durante uma apresentação. O lucro mínimo fica acima das taxas de ida e volta (2 × 0,1%), para a demonstração não fechar operações no prejuízo. O máximo de posições sobe para 10 porque o histórico (sempre no perfil Padrão) deixa os clientes perto do limite de 5. Os valores de cada parâmetro ficam nas listas `parametros` de cada estratégia e em `engine/params.js`.

---

## 2. Estratégia A — Reversão de picos (trailing)

Pedida no briefing: **compra 3% acima do menor preço recente e vende 3% abaixo do maior preço recente**.

O robô não tenta adivinhar o fundo. Espera o preço cair, acompanha o ponto mais baixo e só compra quando o preço **volta a subir** X% a partir dele. Depois da compra, acompanha o ponto mais alto e vende quando o preço **cai** Y% a partir dele, desde que o lucro mínimo esteja garantido.

### Parâmetros

| Parâmetro | Padrão | Descrição |
|---|---|---|
| `recuoCompra` | 3% | Quanto o preço precisa subir a partir do menor preço para comprar |
| `recuoVenda` | 3% | Quanto o preço precisa cair a partir do maior preço para vender |
| `quedaMinima` | 2% | Só arma a compra se o preço caiu pelo menos isso desde a última máxima (evita comprar em lateralização) |
| `janela` | 24 h | Período considerado para o "menor preço recente" ao armar |
| + gerais e confirmação | | |

### Máquina de estados (por cliente × moeda)

```
          preço cai ≥ quedaMinima          preço ≥ mínimo × (1 + recuoCompra)  [+ confirmação]
 [Aguardando] ───────────────▶ [Armado: rastreia mínimo] ───────────────────────────▶ COMPRA (MARKET)
      ▲                                                                                  │
      │   preço ≤ máximo × (1 − recuoVenda)  E  preço ≥ compra × (1 + lucroMinimo)      ▼
      └──────────────────────────── VENDA (MARKET) ◀──── [+ confirmação] ──── [Posição: rastreia máximo]
```

- **Armado**: a cada atualização, `minimo = min(minimo, preço)`.
- **Em posição**: a cada atualização, `maximo = max(maximo, preço)`.
- Se o recuo acontecer mas o lucro mínimo não estiver garantido, a venda **não** ocorre; a posição continua e dispara o alerta "Venda bloqueada por lucro mínimo" (se ligado).
- Tela C3 mostra o "alvo dinâmico": `max(maximo × (1 − recuoVenda), compra × (1 + lucroMinimo))`.
- Na tela A4 a posição aparece como **venda dinâmica** e pode ser cancelada (fica "sem alvo").

---

## 3. Estratégia B — Spread fixo com venda programada

Pedida no briefing: **compra com spread fixo e programa a venda com percentual definido**.

Monta uma escada de compras abaixo do preço. Cada degrau fica `spread%` abaixo do anterior. Sempre que uma compra executa, o robô programa a venda daquela quantidade com `lucro%` acima.

### Parâmetros

| Parâmetro | Padrão | Descrição |
|---|---|---|
| `spread` | 2% | Distância entre compras (parâmetro geral da moeda) |
| `lucro` | 3% | Alvo de venda de cada compra (nunca menor que `lucroMinimo`) |
| `degraus` | 3 | Quantas compras programadas ficam abertas abaixo do preço |
| `reposicionar` | sim | Acompanha o preço quando ele sobe |
| + gerais e confirmação | | Confirmação desligada por padrão (ordens LIMIT já são o "gatilho") |

### Fluxo

1. Sem compras programadas, cria `degraus` ordens `LIMIT` de compra em `preço × (1 − spread)`, `preço × (1 − spread)²`, ...
2. Preço cruza uma compra programada → executa → cria a **venda programada** em `preço de compra × (1 + lucro)` com `compraId`.
3. Repõe o degrau abaixo da mais baixa existente (respeitando disponível e `maxPosicoes`).
4. Se o preço subir mais que `spread` acima da compra programada mais alta e `reposicionar` estiver ligado, as compras são canceladas e recriadas acompanhando o preço (status `reposicionada`, não conta como cancelamento do admin).

---

## 4. Estratégia G — Operação em canal com confirmação

Sugerida pelo cliente ("trabalhar em canais após confirmação"). O robô identifica um **canal** (preço oscilando entre um suporte e uma resistência), só começa a operar depois que o canal é **confirmado**, compra perto do fundo e vende perto do topo. Sai quando o canal rompe.

### Parâmetros

| Parâmetro | Padrão | Descrição |
|---|---|---|
| `janelaCanal` | 60 velas | Velas usadas para calcular suporte (mínima) e resistência (máxima) |
| `larguraMin` / `larguraMax` | 1% / 6% | Largura aceitável do canal: `(resistência ÷ suporte − 1)` |
| `toquesConfirmacao` | 2 | Toques mínimos em **cada** borda para confirmar o canal |
| `toleranciaToque` | 0,15% | Distância da borda que conta como toque |
| `zonaCompra` | 20% | Compra quando o preço está nos 20% inferiores do canal |
| `zonaVenda` | 20% | Vende quando está nos 20% superiores (respeitando `lucroMinimo`) |
| `rompimento` | 0,5% | Preço fecha essa distância fora do canal = rompimento |
| `acaoRompimentoBaixa` | vender e pausar | `vender e pausar` · `só pausar` · `manter` |
| `acaoRompimentoAlta` | manter e pausar | `manter e pausar` · `vender` · `manter` |
| + gerais e confirmação | | Confirmação aplicada à entrada na zona e ao rompimento |

### Estados

```
 [Procurando canal] ─ largura ok + toques ok ─▶ [Canal confirmado] ─ zona de compra + confirmação ─▶ COMPRA
        ▲                                             │    ▲                                           │
        │                                             │    └──────── VENDA ◀─ zona de venda + conf. ───┘
        └──────── rompimento (aplica a ação configurada) ◀┘
```

- Canal recalculado a cada vela fechada enquanto não há posição; com posição, suporte/resistência ficam fixos.
- Tela A2 mostra um gráfico pequeno com as duas bordas e as zonas.
- Dispara alertas "Canal confirmado" e "Rompimento de canal" (se ligados).

---

## 5. Outras estratégias sugeridas

Implementar na F4 só se der tempo, nesta ordem. A, B e G são obrigatórias.

### C — Escalonada por níveis (preço médio)

Cada nova compra, se o preço continuar caindo `spread%`, é **maior** que a anterior (`multiplicador`), baixando o preço médio. Vende **tudo** quando o preço supera o preço médio + `lucro%`.

| Parâmetro | Padrão |
|---|---|
| `multiplicador` | 1,5× |
| `niveis` | 4 |
| `lucro` | 2% sobre o preço médio |

Consome a reserva rápido em quedas longas — bom para mostrar a trava e o alerta de reserva.

### D — Grade (grid) em faixa

Divide a faixa `piso`–`teto` em N linhas. Compra ao tocar uma linha descendo e vende na linha de cima.

| Parâmetro | Padrão |
|---|---|
| `piso` / `teto` | −8% / +8% do preço ao ligar |
| `linhas` | 10 |

### E — Compra periódica (DCA) com alvo no preço médio

Compra um valor fixo a cada intervalo, independente do preço. Vende tudo quando o preço passa do preço médio + `lucro%`.

| Parâmetro | Padrão |
|---|---|
| `intervalo` | 6 h (Demo: 2 min) |
| `lucro` | 4% |

### F — Cruzamento de médias móveis

Compra quando a média curta cruza a longa para cima; vende no cruzamento para baixo (respeitando lucro mínimo, salvo stop).

| Parâmetro | Padrão |
|---|---|
| `mediaCurta` / `mediaLonga` | 9 / 21 velas |

---

## 6. Alertas

Regras avaliadas em `alerts/rules.js`. Cada regra tem: **ligada**, **limite(s)**, **escopo** (todas as moedas/clientes ou uma lista), **canais** e **ação automática**. Ficam na tela A7; os alertas de moeda também aparecem como atalho na tela A2 e os de cliente na A3.

### 6.1 Regras

| Regra | Dispara quando | Limite padrão | Visível para | Ação automática padrão |
|---|---|---|---|---|
| Variação brusca | Preço varia mais que X% em Y minutos | 3% em 15 min | admin | nenhuma (opção: travar compras da moeda) |
| Preço alvo | Preço cruza um valor definido pelo admin | — | admin | nenhuma |
| Reserva de banca atingida | Compra bloqueada por falta de disponível | — | admin + cliente | nenhuma |
| Uso da banca alto | Em operação ≥ X% do caixa operável | 80% | admin | nenhuma (opção: travar compras do cliente) |
| Posição em queda | Posição aberta cai X% abaixo do preço de compra | 5% | admin + cliente | nenhuma |
| Venda bloqueada por lucro mínimo | Sinal de venda ignorado pelo lucro mínimo | — | admin | nenhuma |
| Posição sem alvo | Venda programada cancelada e nenhum alvo novo há X min | 10 min | admin | nenhuma |
| Canal confirmado / rompimento | Estratégia G muda de estado | — | admin | conforme a estratégia |
| Ordem executada | Compra ou venda executada | — | cliente (desligado para admin) | nenhuma |
| Fechamento de período | Período de apuração foi apurado | — | admin + cliente | nenhuma |
| Comissão a vencer | Faltam X dias para o vencimento e não foi paga | 2 dias | admin + cliente | nenhuma |
| Comissão vencida | Prazo de 5 dias passou sem pagamento | — | admin + cliente (crítico) | travar compras do cliente (fixa, não desligável) |
| Conexão com a Binance | Caiu para modo simulado ou voltou | — | admin | pausar o robô (opção) |

### 6.2 Canais

| Canal | MVP |
|---|---|
| Central de alertas (sino + histórico) | sim, sempre |
| Toast na tela | sim, configurável por regra |
| Som curto | sim, desligado por padrão |
| Notificação do navegador | sim, pede permissão ao ligar |
| E-mail / Telegram / WhatsApp | aparecem desabilitados com "em breve" |

### 6.3 Comportamento

- **Silêncio** (`cooldown`) por regra: o mesmo alerta para a mesma moeda/cliente não repete dentro de X minutos (padrão 10).
- Severidade: `info` (azul), `atenção` (âmbar), `crítico` (vermelho). Crítico fica fixo na central até ser lido.
- Ações automáticas sempre registram no log do admin ("Compras de SOL travadas automaticamente por Variação brusca").

---

## 7. Contrato de uma estratégia (para o código)

Cada arquivo em `engine/strategies/` exporta o mesmo formato, para o motor e a tela A2 tratarem todas igual:

```js
export default {
  id: 'reversao-picos',
  nome: 'Reversão de picos',
  descricao: 'Compra na retomada após o fundo e vende no recuo após o topo.',
  // A tela A2 monta o formulário a partir desta lista
  parametros: [
    { chave: 'recuoCompra', rotulo: 'Recuo para compra', tipo: 'percent', padrao: 3, demo: 0.4,
      min: 0.1, max: 20, ajuda: 'Quanto o preço precisa subir a partir do fundo para comprar.' },
    // ...
  ],
  usaConfirmacao: { padrao: true },
  // Estado interno por cliente × moeda (guardado pelo motor)
  estadoInicial: () => ({ fase: 'aguardando', minimo: null, maximo: null }),
  // Chamado a cada atualização de preço ou vela fechada. Não altera nada: devolve ações.
  avaliar({ preco, vela, velas, estado, params, posicoes, ordensProgramadas, podeComprar }) {
    return {
      estado,
      sinais: [ /* { tipo: 'compra' | 'venda', motivo } — passam pela confirmação */ ],
      acoes:  [ /* { tipo: 'programar' | 'cancelar' | 'reposicionar', ... } — imediatas */ ],
      eventos:[ /* { alerta: 'canal-confirmado', dados } */ ],
    };
  },
};
```

O motor passa os `sinais` pelo `engine/confirm.js`, aplica as ações no store e repassa os `eventos` às regras de alerta. Assim a estratégia é uma função pura e fácil de testar.
