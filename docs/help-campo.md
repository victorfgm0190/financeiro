# Help de campo (F1 / ⓘ)

Camada de ajuda por **campo**, ao lado do help de tela (`src/lib/ajudaTelas.js`, botão "?") e da jornada guiada.

## Conteúdo — `src/help/`

- Um arquivo por tela (`contratos.js`, `agendamentos.js`, …) exportando `campos` e `formularios`; `index.js` junta tudo.
- Campo `'tela.campo'`: `{ titulo, paraQueServe, relacaoComTela, oQueAconteceAoSalvar?, obrigatorio, quandoUsar?, atencao?, exemplo?, pendente? }`.
  - `paraQueServe` é o texto curto do ícone ⓘ (1–2 frases, sem exemplo).
  - `relacaoComTela` é o principal: como o campo mexe nos outros e no resultado.
  - `pendente`: conteúdo só migrado, falta completar.
- Formulário: `{ objetivo, preRequisitos: [{ id, texto }], ordemCampos, resumoAoSalvar }`.
- `src/lib/helpCampos.js` é só um adaptador (`HELP_CAMPOS`, `textoHelpCampo`) que lê de `src/help`.

## Marcação na tela

- `data-help-id="tela.campo"` no campo ou no contêiner dele (o help acha pelo `closest`).
- Componentes de campo aceitam `helpId`: `InputMoeda`, `CampoValor` e `CategorySelect` (contêiner `display: contents`).
- O `Campo` do wizard de contrato tem dois props:
  - `help`: ⓘ + F1;
  - `ajuda`: só F1, quando a explicação já está escrita na tela.
- `data-help-form="<form>"` no contêiner do formulário (para a F1 sem campo e para o "Preencher com guia").

## Comportamento

- **F1** (`src/help/teclaF1.js`): ouvinte global na captura, sempre `preventDefault` + `stopPropagation`.
  - Campo com foco: help do campo.
  - Sem campo, dentro de um formulário: help do formulário.
  - Fora de formulário: o "?" da tela (evento `finup:ajuda-tela`). Sem ele, o painel aponta para a Central de Ajuda.
  - Com modificador: nada.
  - No Mac: fn+F1.
- **Painel** (`HelpCampoPainel`, montado no App):
  - Computador: drawer lateral que não bloqueia. O foco fica no campo, o painel acompanha a troca de campo e o Esc fecha só ele.
  - Celular: bottom sheet aberto pelo ⓘ (área de toque de 44px). Tocar no campo só abre o teclado.
  - Rodapé: "Ajuda da tela" e "Preencher com guia" (evento `finup:preencher-guia`, atendido pelo formulário guiado).
- **ⓘ**:
  - Passar o mouse mostra o texto curto.
  - Clicar ou tocar abre o painel completo.
  - Não colocar ⓘ quando a explicação já está escrita visível ao lado do campo (a F1 continua funcionando).
