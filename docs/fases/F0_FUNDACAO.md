# F0 — Fundação

**Objetivo:** esqueleto navegável com a identidade visual aplicada, troca de visão Cliente/Administrador e rotas, ainda sem dados.

**Depende de:** nada. **Referências:** [PLANO_MVP.md](../PLANO_MVP.md) §3.1, §4, §5 · [IDENTIDADE_VISUAL.md](../IDENTIDADE_VISUAL.md)

## Tarefas

- [ ] Criar a estrutura de pastas da seção 5 do plano.
- [ ] `.htaccess` com `DirectoryIndex index.html index.php`.
- [ ] `index.html` com fontes (Inter, JetBrains Mono), Lucide e Chart.js em versões fixas; `<main id="app">`.
- [ ] `tokens.css` com todas as cores, tipografia, espaçamentos e raios da identidade visual, tema escuro e claro (`[data-theme]` + `prefers-color-scheme`).
- [ ] `base.css`, `layout.css`: topo fixo, menu lateral (recolhível no celular), área de conteúdo.
- [ ] Barra superior: logo + "DEMO", seletor de visão (segmentado), espaços reservados para faixa de cotações, origem das cotações, botão do robô e sino de alertas; botão de tema; selo "Demonstração — dados fictícios".
- [ ] Faixa de modo admin (borda superior na cor `--mode-admin`) quando a visão é Administrador.
- [ ] `router.js`: rotas `#/cliente/{visao-geral|operacoes|posicoes|relatorio|comissoes|caixa}` e `#/admin/{painel|moedas|clientes|ordens|relatorios|comissoes|alertas}`; rota inválida → primeira tela da visão. Trocar de visão leva à primeira tela da outra visão.
- [ ] Menu lateral muda conforme a visão; item ativo destacado.
- [ ] Cada rota renderiza um título e um estado vazio provisório.
- [ ] `store.js` mínimo (estado + `on/emit`) e `persist.js` (get/set com `try/catch`) guardando tema e visão.
- [ ] `utils/format.js`: `usdt()`, `pct()` com sinal, `qtd()`, `preco()`, `data()`, `dataHora()` em pt-BR.

## Critérios de aceite

- Abrir `criptomoedas/` no servidor local carrega a página sem erros no console.
- Botão Cliente/Administrador troca menu, rota e faixa de modo sem recarregar.
- Recarregar a página mantém visão, rota e tema.
- Em 375 px de largura não há rolagem horizontal; o menu vira gaveta.
