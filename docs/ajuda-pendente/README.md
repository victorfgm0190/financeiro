# Ajuda — material do levantamento das telas (já aplicado)

Produzido em 01/11/2026 pelo levantamento das telas, para o sistema de ajuda em 3 níveis. **Tudo daqui
já está no app** (fases 2, 3a, 3b e 4). A pasta fica como fonte/histórico: não é lida pelo app.

- `BRIEF.md` — as instruções usadas no levantamento (formato dos detalhes e das tarefas guiadas).
- `agenda.js`, `contas.js`, `movimento.js`, `config.js` — conteúdo por grupo de telas:
  - `detalhes` (explicação, exemplo, `porLinha`, `errosComuns`) e `novosItens` → juntados em
    `src/lib/ajudaTelas.js` na fase 4 (Central de Ajuda);
  - `tarefas` — as 38 tarefas "Faça comigo" → `src/lib/tarefasGuiadas.js` (fases 3a/3b; mais 3 do
    Assistente escritas à mão);
  - `provisaoFeita` (agenda.js) e `tourGeralSettings` (config.js) → fases 2 e 3a.
- `patch-agentes.diff` — as marcas `data-guia` nos formulários e botões que as tarefas usam. Aplicado
  na fase 3a.

Para mudar um texto, edite `src/lib/ajudaTelas.js`, `src/lib/tarefasGuiadas.js` ou
`src/lib/perguntasFrequentes.js` — não estes arquivos. Revisão: `docs/guia-telas-revisao.md`,
`docs/tarefas-guiadas-revisao.md`, `docs/central-ajuda-revisao.md`.
