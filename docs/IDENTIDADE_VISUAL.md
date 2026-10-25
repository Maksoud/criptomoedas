# Identidade Visual — CriptoOps

> Guia de marca e interface do MVP. Todos os valores abaixo viram variáveis em `assets/css/tokens.css`; nenhuma cor ou tamanho deve ser escrito direto nos componentes.

## 1. Conceito

**"Mesa de operações calma."** Um painel financeiro que transmite controle e transparência: fundo escuro e sóbrio, números em destaque, cor usada com economia. Verde e vermelho existem **só** para alta/baixa e lucro/prejuízo — nunca para decoração ou botões. A cor da marca é um âmbar (referência ao ouro e ao "valor guardado"), separado das cores de mercado.

Atributos: **confiável · preciso · vivo · direto**.
Evitar: visual de cassino/aposta, neon exagerado, gradientes chamativos, foguetes e "to the moon".

## 2. Logotipo

- **Símbolo**: dois chevrons sobrepostos formando um "C" aberto, um para cima e outro para baixo (compra e venda), em âmbar.
- **Lettering**: `Cripto` em peso 600 + `Ops` em peso 400, Inter, espaçamento −0,01em.
- Versões: horizontal (símbolo + nome), só símbolo (favicon, menu recolhido).
- Área de proteção: altura do "C" em volta. Tamanho mínimo: 20 px de altura.
- Ao lado do logo, sempre o selo **"DEMO"** enquanto for MVP.

## 3. Cores

### 3.1 Tema escuro (padrão)

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#0B0F17` | Fundo da página |
| `--surface` | `#121826` | Cards, tabelas, topo |
| `--surface-2` | `#1A2233` | Hover, linhas alternadas, inputs |
| `--border` | `#243047` | Bordas e divisórias |
| `--text` | `#E6EAF2` | Texto principal |
| `--text-muted` | `#8A96AD` | Rótulos, legendas |
| `--text-faint` | `#5B6780` | Texto desabilitado, eixos de gráfico |
| `--brand` | `#F5B83D` | Marca, ação primária, item ativo do menu |
| `--brand-contrast` | `#1A1203` | Texto sobre `--brand` |
| `--up` | `#22C55E` | Alta, compra, lucro |
| `--up-bg` | `rgba(34,197,94,.12)` | Fundo de badge/flash de alta |
| `--down` | `#F05252` | Baixa, venda com prejuízo, erro |
| `--down-bg` | `rgba(240,82,82,.12)` | Fundo de badge/flash de baixa |
| `--warn` | `#F59E0B` | Avisos, "compras travadas" |
| `--info` | `#38BDF8` | Ordens programadas, informações |
| `--mode-admin` | `#8B7CF6` | Faixa e destaques exclusivos da visão Administrador |

### 3.2 Tema claro

| Token | Hex |
|---|---|
| `--bg` | `#F5F7FB` |
| `--surface` | `#FFFFFF` |
| `--surface-2` | `#EEF1F7` |
| `--border` | `#DCE2EC` |
| `--text` | `#0F172A` |
| `--text-muted` | `#55627A` |
| `--text-faint` | `#8C97AB` |
| `--brand` | `#D99A1E` (fundos) · `#9A6A0B` (texto/links) |
| `--brand-contrast` | `#1A1203` |
| `--up` | `#15803D` |
| `--down` | `#C81E1E` |
| `--warn` | `#B45309` |
| `--info` | `#0369A1` |
| `--mode-admin` | `#6D28D9` |

Contraste: todo texto sobre `--bg`/`--surface` deve atingir **WCAG AA** (4,5:1). No tema claro, âmbar nunca é usado como cor de texto pequeno — usar a variante escura.

### 3.3 Regras de uso

- **Alta/baixa sempre com sinal e seta** além da cor: `▲ +2,31%` / `▼ −0,84%`. Daltônicos precisam entender sem a cor.
- **Compra** = badge `--up` com texto "Compra"; **Venda** = badge neutro (`--surface-2`) com texto "Venda". O lucro da venda é que recebe verde/vermelho.
- **Visão Administrador**: borda superior de 3 px em `--mode-admin` na página toda, rótulo "Administrador" no seletor em `--mode-admin`, e botões destrutivos (cancelar ordens) em `--down`. Assim nunca se confunde em qual visão se está durante a apresentação.
- **Monogramas de moeda**: círculo de 24 px com a cor da moeda ([DADOS_FICTICIOS.md](DADOS_FICTICIOS.md) §2) a 18% de opacidade e a sigla em cima, na cor cheia. Não usar logotipos oficiais.

### 3.4 Paleta de gráficos

Séries categóricas (quando não for alta/baixa), nesta ordem: `#F5B83D`, `#38BDF8`, `#A78BFA`, `#34D399`, `#F472B6`, `#FB923C`, `#94A3B8`. Patrimônio = `--brand` com área a 12%; aporte (linha de referência) = `--text-faint` tracejado.

## 4. Tipografia

| Papel | Fonte | Peso | Tamanho / altura |
|---|---|---|---|
| Display (KPI grande) | Inter | 600 | 28 / 34 px |
| Título de página (h1) | Inter | 600 | 22 / 28 px |
| Título de seção (h2) | Inter | 600 | 16 / 24 px |
| Corpo | Inter | 400 | 14 / 20 px |
| Rótulo / legenda | Inter | 500 | 12 / 16 px, `--text-muted`, maiúsculas com +0,04em |
| Números, preços, quantidades | JetBrains Mono | 500 | 13 / 20 px |

- Todos os números com `font-variant-numeric: tabular-nums` para não "dançarem" ao atualizar.
- Números alinhados à direita em tabelas.
- Fontes via Google Fonts com `display=swap`; fallback `system-ui, sans-serif` e `ui-monospace, monospace`.

## 5. Formatação de números e datas (pt-BR)

| Dado | Formato | Exemplo |
|---|---|---|
| Valor em USDT | 2 casas, separador de milhar | `12.345,67 USDT` |
| Preço ≥ 1 | 2 casas | `68.012,40` |
| Preço < 1 | 4 a 6 casas significativas | `0,1423` |
| Quantidade | até 8 casas, sem zeros à direita | `0,0123` BTC |
| Percentual | 2 casas com sinal | `+3,00%` · `−1,25%` |
| Data | `dd/mm/aaaa` | `24/10/2026` |
| Data e hora | `dd/mm HH:mm` (ano só se diferente) | `24/10 14:32` |

Usar o sinal de menos tipográfico (`−`), não o hífen.

## 6. Espaçamento, grade e forma

- Base de **4 px**: `--space-1: 4px` · `-2: 8px` · `-3: 12px` · `-4: 16px` · `-5: 24px` · `-6: 32px` · `-7: 48px`.
- Raios: `--radius-sm: 6px` (badges, inputs) · `--radius: 10px` (cards) · `--radius-lg: 14px` (modais).
- Sombras quase ausentes no escuro (usar borda); no claro `0 1px 2px rgba(15,23,42,.06)`.
- Layout: topo 56 px fixo + faixa de cotações 36 px; menu lateral 232 px (64 px recolhido); conteúdo com máx. 1440 px; grade de 12 colunas, gutter 16 px (24 px ≥ 1280 px); margem lateral 16 px no celular.

## 7. Componentes

| Componente | Especificação |
|---|---|
| **Seletor de visão** | Controle segmentado no centro do topo: `Cliente` / `Administrador`, com ícone (`user` / `shield`). Segmento ativo: fundo `--surface-2`, texto `--text`; quando admin, texto e ícone em `--mode-admin`. |
| **Faixa de cotações** | Altura 36 px, fundo `--surface`, itens separados por divisória. Ao mudar o preço, o fundo do item faz flash `--up-bg`/`--down-bg` por 600 ms. |
| **Origem das cotações** | Ponto de 8 px + texto: "Binance · ao vivo" (`--up`, pulsando a cada 2 s), "Reconectando…" (`--warn`, piscando), "Cotações simuladas" (`--warn`, fixo). |
| **Botão do robô** | Alternador `Ligado` (ícone `bot`, `--up`) / `Pausado` (ícone `pause`, `--text-faint`). |
| **Sino de alertas** | Ícone `bell` 20 px; contador em pílula `--down` (crítico não lido) ou `--brand` (demais). Painel lateral de 360 px com a lista, filtro por severidade e "Marcar todos como lidos". |
| **Item de alerta** | Ícone e borda esquerda pela severidade (`info` `--info`, `atenção` `--warn`, `crítico` `--down`), título, texto curto, moeda/cliente e hora; ação automática aparece como linha extra com ícone `zap`. |
| **Barra de uso da banca** | Barra empilhada de 8 px: em operação (`--brand`), programado (`--info` a 60%), disponível (`--surface-2`), reserva (listras diagonais `--text-faint`). Legenda abaixo com valores. |
| **Estado do motor** | Pílula pequena ao lado da moeda: "Aguardando", "Armado", "Rastreando topo", "Canal confirmado", "Aguardando confirmação 1/2" — cor `--info`; travado em `--warn` com cadeado. |
| **Formulário de parâmetros** | Rótulo + campo numérico com sufixo (%, USDT, velas) + texto de ajuda `--text-muted` abaixo; valor diferente do perfil mostra ponto âmbar e "Restaurar". |
| **KPI card** | Rótulo (legenda), valor display, variação com seta, minigráfico opcional de 32 px de altura. Padding 16 px. |
| **Botões** | Primário: fundo `--brand`, texto `--brand-contrast`. Secundário: borda `--border`, texto `--text`. Perigo: fundo `--down`, texto branco. Altura 36 px (32 px compacto). Ícone à esquerda 16 px. |
| **Badges** | Altura 20 px, raio sm, peso 500, 12 px. Status: `ativo` (up), `pausado` (warn), `inativo` (faint), `programada` (info), `cancelada` (faint riscado), `sem alvo` (warn). Comissões: `aberto` (info), `apurado` (warn), `pago` (up), `vencido` (down). |
| **Chips de filtro** | Altura 28 px, raio total, monograma à esquerda. Selecionado: borda e texto `--brand`. |
| **Tabelas** | Cabeçalho 12 px maiúsculo `--text-muted`, linhas de 40 px (32 px compacto), divisórias `--border`, hover `--surface-2`. **Linha nova**: fundo `--brand` a 10% desvanecendo em 2 s + pequena barra âmbar à esquerda. |
| **Barra de distância até o alvo** | 4 px de altura, trilho `--surface-2`, preenchimento `--info`; 100% vira `--up`. |
| **Toast** | Canto inferior direito, fundo `--surface`, borda esquerda colorida pelo resultado, some em 4 s, no máximo 3 empilhados. |
| **Modal de confirmação** | Título, resumo do impacto ("12 ordens · 4.380,00 USDT"), botões Cancelar (secundário) e Confirmar (perigo). |
| **Faixa de alerta "Compras travadas"** | Abaixo do topo, fundo `--warn` a 14%, ícone `lock`, texto e botão "Destravar". |
| **Selo de demonstração** | "Demonstração — dados fictícios" em legenda `--text-muted` no topo e no rodapé do relatório impresso. |

## 8. Ícones

Lucide, traço 1,75, tamanhos 16/20 px, cor herdada do texto. Principais: `layout-dashboard`, `arrow-left-right` (operações), `wallet` (posições), `file-bar-chart` (relatório), `piggy-bank` (aportes), `coins` (moedas), `users` (clientes), `list-ordered` (ordens), `receipt` (comissões), `bell` (alertas), `bot` (robô), `zap` (ação automática), `lock`/`unlock`, `x-circle` (cancelar), `download`, `printer`, `pause`/`play`, `sun`/`moon`, `user`, `shield`.

## 9. Movimento

- Durações: 120 ms (hover), 200 ms (abrir menus/modais), 600 ms (flash de preço), 2 s (destaque de linha nova).
- Curva: `cubic-bezier(.2,.8,.2,1)`.
- O movimento só comunica mudança de dado; nada se mexe "por enfeite".
- Com `prefers-reduced-motion: reduce`: sem flash, sem pulso, sem deslizamento — só a troca de cor/valor.

## 10. Tom de voz

- Português do Brasil, frases curtas, sem jargão de trader quando houver palavra comum: "Posições em aberto" em vez de "bags"; "Alvo de venda" em vez de "TP".
- Ações no infinitivo: "Travar compras", "Cancelar ordens", "Exportar CSV".
- Confirmações dizem o efeito: "Cancelar 12 compras programadas? O valor de 4.380,00 USDT volta ao saldo livre."
- Mensagens vazias orientam: "Nenhuma operação neste período. Tente ampliar as datas."

## 11. Impressão (relatório)

Fundo branco, texto `#0F172A`, verde `#15803D` e vermelho `#C81E1E`, sem menu/topo/faixa de cotações, logo em preto + âmbar no cabeçalho, rodapé com selo de demonstração, data de emissão e paginação. A4 retrato, margens de 16 mm.
