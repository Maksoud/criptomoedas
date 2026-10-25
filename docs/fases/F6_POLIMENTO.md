# F6 — Polimento e Publicação

**Objetivo:** deixar a demo pronta para apresentar e publicar no maksoud.dev.

**Depende de:** F5.

## Tarefas

- [x] Revisão responsiva em 375, 768, 1280 e 1920 px; tabelas viram cartões empilhados no celular (`data-label` em cada célula, `components.css`). No celular, um aviso por vez e o botão do tour só no rodapé.
- [x] Acessibilidade: navegação por teclado, foco visível, "Pular para o conteúdo", linhas clicáveis com Enter/espaço, `aria-live="polite"` para toasts e KPIs, contraste AA (tons `--text-faint`, `--mode-admin` e cores do tema claro ajustados), nunca só cor para alta/baixa (sempre sinal e seta).
- [x] Estados vazios e de carregamento em todas as telas (ex.: "Nenhuma operação neste período").
- [x] `prefers-reduced-motion` em todas as animações (CSS global + rolagens suaves via `rolarAte`).
- [x] Desempenho: memória limitada — velas ao vivo (500 por moeda/intervalo), alertas (500), log de ações (500), feed do painel (12) e lista da central (100).
- [x] Tour rápido opcional ("Como apresentar"): 5 passos destacando troca de visão, cotações, relatório, trava e alertas (`ui/tour.js`; botão no topo, link no rodapé ou `?tour`).
- [ ] Testar a demo na rede de onde será apresentada (a Binance pode estar bloqueada). O fallback simulado foi testado (queda no meio com `criptoops.feed.simularQueda` e Binance bloqueada desde a abertura); falta conferir na rede do local — roteiro no README.
- [x] Rodapé: "Cotações: Binance (dados públicos). Operações, clientes e valores são fictícios."
- [x] Favicon (SVG + PNG 32 e 180), `<title>`, meta description e imagem de compartilhamento (`assets/img/og.png`, Open Graph e Twitter).
- [x] Atualizar README com instruções, roteiro de apresentação e capturas de tela (`docs/img/`).
- [x] Incluir o projeto na página de projetos do portfólio.

## Critérios de aceite

- Nenhum erro no console em Chrome, Firefox e Safari (iOS).
- Lighthouse: Acessibilidade ≥ 95, Desempenho ≥ 90 no desktop.
- Roteiro de apresentação de 5 minutos executável do início ao fim sem recarregar.
