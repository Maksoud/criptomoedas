# F6 — Polimento e Publicação

**Objetivo:** deixar a demo pronta para apresentar e publicar no maksoud.dev.

**Depende de:** F5.

## Tarefas

- [ ] Revisão responsiva em 375, 768, 1280 e 1920 px; tabelas viram cartões empilhados no celular.
- [ ] Acessibilidade: navegação por teclado, foco visível, `aria-live="polite"` para toasts e KPIs, contraste AA, nunca só cor para alta/baixa (sempre sinal e seta).
- [ ] Estados vazios e de carregamento em todas as telas (ex.: "Nenhuma operação neste período").
- [ ] `prefers-reduced-motion` em todas as animações.
- [ ] Desempenho: 1 hora aberta em 5× sem crescer memória sem limite (limitar histórico intradiário e o feed a N itens).
- [ ] Tour rápido opcional ("Como apresentar"): 5 passos destacando troca de visão, cotações, relatório, trava e alertas.
- [ ] Testar a demo na rede de onde será apresentada (a Binance pode estar bloqueada) e o fallback simulado.
- [ ] Rodapé: "Cotações: Binance (dados públicos). Operações, clientes e valores são fictícios."
- [ ] Favicon, `<title>`, meta description e imagem de compartilhamento.
- [ ] Atualizar README com instruções e capturas de tela.
- [ ] Incluir o projeto na página de projetos do portfólio.

## Critérios de aceite

- Nenhum erro no console em Chrome, Firefox e Safari (iOS).
- Lighthouse: Acessibilidade ≥ 95, Desempenho ≥ 90 no desktop.
- Roteiro de apresentação de 5 minutos executável do início ao fim sem recarregar.
