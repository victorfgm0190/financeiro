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

## Atalhos (blindagem)

- F1 é fixa: aparece em Configurações › Atalhos como linha com cadeado e nenhum atalho pode usá-la.
  - Na captura de um atalho, a F1 chega à tela de captura e é recusada, sem abrir a ajuda.
- `RESERVED_KEYS` (`src/lib/atalhos/combinacao.js`) são recusadas com mensagem, na tela e na API:
  - F3, F5, F6, F7, F11, F12;
  - Ctrl+R/W/T/N/L/P/F/H/J/D/Tab;
  - Ctrl+Shift+R/T/N;
  - Alt+F4;
  - Alt+setas;
  - os menus do navegador: Alt+F, Alt+D, Alt+E.
- O atalho precisa de Ctrl ou Alt. Sozinhas, só F2, F4, F8, F9 e F10.
- Sem duplicados: a API recusa com 409 a combinação já usada no mesmo contexto ou numa ação global.
- O motor de atalhos:
  - não dispara durante composição de texto (IME);
  - com foco em campo de digitação, só dispara com Ctrl ou Alt (como o Alt+G de gravar);
  - nunca recebe a F1.
- Migração: ao carregar, atalho gravado que viola as regras volta ao padrão. Se o padrão estiver ocupado, é desativado. A correção é gravada no banco e mostra um aviso único (`AvisoAtalhosMigrados`).
