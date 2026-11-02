# Ajuda — material guardado para as fases 2 a 4

Produzido em 01/11/2026 pelo levantamento das telas, para o sistema de ajuda em 3 níveis. **Nada daqui
está aplicado no app**: cada parte entra na fase em que se encaixa, e então sai desta pasta.

- `BRIEF.md` — as instruções usadas no levantamento (formato dos detalhes e das tarefas guiadas).
- `agenda.js`, `contas.js`, `movimento.js`, `config.js` — conteúdo por grupo de telas:
  - `detalhes` — explicação (`detalhe`) e exemplo fictício (`exemplo`) de cada item de `AJUDA_TELAS`,
    `porLinha` (botão repetido em cada linha) e `errosComuns` por tela → Central de Ajuda (fase 4);
  - `novosItens` / `novasTelas` — botões que faltavam no inventário (`import:conciliacao` já entrou na fase 1);
  - `tarefas` — as tarefas guiadas "Faça comigo" (38 no total) → fase 3;
  - `provisaoFeita` (agenda.js) e `tourGeralSettings` (config.js).
- `patch-agentes.diff` — as marcas `data-guia` nos FORMULÁRIOS e botões que as tarefas usam (20
  arquivos). Só atributos; aplicar com `git apply` na fase 3 (a parte do ImportPanel da Conciliação já
  foi aplicada na fase 1 — use `--exclude` nela).
