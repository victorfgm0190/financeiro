# Ajuda em 3 níveis — conteúdo da Central de Ajuda + tarefas "Faça comigo" (instruções comuns)

Projeto: C:\projetos\financeiro (React/Vite, app financeiro "Finup", multi-cliente, pt-BR).

Já existe `src/lib/ajudaTelas.js` → `AJUDA_TELAS`: por tela/subtela `{ titulo, descricao, itens: [{ chave, rotulo, texto, modulo? }], dicas }`.
Cada item corresponde a um botão/controle marcado no código com `data-guia="<tela>.<chave>"`. LEIA esse
arquivo inteiro (são os textos aprovados; mantenha o tom) e leia os componentes das suas telas.

Agora vamos ter: (1) um TOUR interativo por tela (usa o `texto` curto que já existe), (2) TAREFAS
GUIADAS "Faça comigo" (o app conduz o usuário a FAZER algo na tela real, piscando cada botão/campo e
esperando o clique/preenchimento/salvar), (3) uma CENTRAL DE AJUDA com explicação + exemplo de cada
função. Você produz o CONTEÚDO de (2) e (3) para as suas telas e marca os campos dos FORMULÁRIOS.

## 1. Arquivo de saída (módulo ES válido)
`C:\Users\victo\AppData\Local\Temp\claude\C--projetos-financeiro\786228f8-a100-460b-9eb3-5a4097d5fd5e\scratchpad\ajuda2\<seu-grupo>.js`:

```js
// Central de Ajuda: explicação e exemplo de CADA item já existente de AJUDA_TELAS das suas telas.
export const detalhes = {
  schedule: {
    errosComuns: ['Erro comum em 1 frase + como resolver.'],          // 1 a 3 por tela (opcional)
    itens: {
      novo: { detalhe: '2 ou 3 frases explicando melhor.', exemplo: 'Exemplo: …' },
      pagar: { detalhe: '…', exemplo: '…', porLinha: true },   // porLinha: o botão se repete em cada linha da lista
    },
  },
}
// Itens que FALTAM no inventário da tela (botões reais que o usuário vê e não estão em AJUDA_TELAS).
// Opcional. Se criar, marque o botão com data-guia="<tela>.<chave>" no componente.
export const novosItens = {
  schedule: [{ chave: 'x', rotulo: '…', texto: '1 frase curta', detalhe: '…', exemplo: '…', depoisDe: '<chave existente>' }],
}
// Tarefas "Faça comigo".
export const tarefas = [ /* ver formato abaixo */ ]
```
- Toda chave de `detalhes.<tela>.itens` precisa existir em AJUDA_TELAS (ou em `novosItens`). Cubra
  TODOS os itens das suas telas (cada um com `detalhe` e `exemplo`).
- `exemplo`: começa com "Exemplo:" e é prático e FICTÍCIO/genérico (ex.: "Exemplo: aluguel de R$ 1.500,00
  todo dia 10."). Nunca nomes de pessoas reais, bancos reais com dados, ids, contas reais.
- Português simples, para leigo, frases curtas, sem jargão.

## 2. Formato das tarefas
```js
{
  id: 'schedule.conta-pagar',            // '<tela>.<slug>' único
  tela: 'schedule',                      // página do app onde a tarefa começa (o motor navega até ela)
  hash: null,                            // opcional: rota de Configurações, ex.: '#config/cadastros/categorias'
  titulo: 'Criar uma conta a pagar',
  descricao: 'Uma frase do que a pessoa vai aprender.',
  requer: ['pode:agendamentos:incluir'], // condições (TODAS): 'gerencial' | 'ia' | 'contratos' |
                                         // 'pode:<modulo>:<acao>' | 'pagina:<id>'  (módulos: src/lib/permissoes.js MODULOS)
  passos: [
    { alvo: 'schedule.novo', texto: 'Clique em "+ Novo agendamento".', espera: 'clique' },
    { alvo: 'agendamento-form.tipo', texto: 'Escolha "Saída": é dinheiro que vai sair.', espera: 'preencher' },
    { alvo: 'agendamento-form.recorrencia', texto: 'Única = uma vez; Mensal = todo mês; Parcelada = em N vezes.', espera: 'preencher' },
    { alvo: 'agendamento-form.salvar', texto: 'Confira e clique em Salvar.', espera: 'salvar' },
  ],
  // O que conta como "salvou" (espera 'salvar'): um item NOVO nesta coleção do useApp() de
  // src/context/AppContext.jsx (confira o nome exato no value do provider: accounts, schedules,
  // transactions, profiles, categories, accountGroups, cardImports…). filtro opcional.
  novoItem: { colecao: 'schedules', filtro: (s) => s.type === 'expense' },
  final: 'Pronto! Seu agendamento aparece no Fluxo de Caixa e no saldo previsto.',
}
```
- `alvo` = valor de um `data-guia` (da tela ou de formulário). `espera`:
  `'clique'` (espera clicar no alvo), `'preencher'` (avança quando o campo muda), `'salvar'` (espera o
  `novoItem` aparecer), `'nenhuma'` (só explica; a pessoa clica Próximo).
- Se o que a tarefa cria NÃO fica no useApp() (ex.: algo que só existe numa API própria), use
  `novoItem: null` e no último passo `espera: 'clique'` no botão salvar.
- Tarefa que não cria nada (ex.: "navegar entre faturas", "usar o filtro") → passos com 'clique'/'nenhuma'
  e `novoItem: null`.
- 4 a 9 passos por tarefa. O motor NUNCA preenche nem salva nada pela pessoa — os textos dizem o que ela faz.

## 3. Marcar os formulários
Adicione `data-guia` nos campos e botões dos FORMULÁRIOS usados pelas suas tarefas, com prefixo do
formulário (não da tela), ex.: `agendamento-form.tipo`, `agendamento-form.valor`, `conta-form.grupo`,
`lancamento-form.categoria`, `perfil-form.cpf`. Coloque no elemento DOM visível (o `<input>`, `<select>`,
`<button>`, ou o `<div>`/`<label>` que envolve o campo — prefira o contêiner do campo inteiro, rótulo +
controle). Componentes compartilhados (CategorySelect, SearchableSelect, DateInput, InputMoeda, Modal):
NÃO edite — ponha o atributo num `<div>` em volta que já exista no formulário (ou o `<div>` do campo).
**Só acrescente atributos `data-guia`** (e nada mais: nenhuma lógica, classe ou texto). Se o mesmo
formulário aparece em outra tela, as marcas valem lá também (tudo bem).

## Regras
- PROTEGIDO, não edite nada: `src/components/Patrimonio/PatrimonioEditavel.jsx`, `src/context/AppContext.jsx`,
  `src/lib/saldoPrincipal.js`. Também NÃO edite: `src/App.jsx`, `src/components/Layout/*`,
  `src/components/BoasVindas/*`, `src/lib/ajudaTelas.js`, `src/mobile/MobileShell.jsx`, `src/lib/*`
  (outra pessoa está mexendo). Edite só os arquivos listados na sua tarefa. Não rode git.
- Nada específico de um usuário/cliente.
- Ao terminar: `cd /c/projetos/financeiro && ./node_modules/.bin/eslint <arquivos editados>` (sem erro
  NOVO — os antigos podem ficar; compare com `git show HEAD:<arq> | ./node_modules/.bin/eslint --stdin --stdin-filename <arq>`)
  e `node -e "import('file:///<caminho do seu .js>').then(m=>console.log(Object.keys(m.detalhes), m.tarefas.length))"`.

## Resposta final (curta)
Telas cobertas (itens com detalhe/exemplo), tarefas criadas (id + título), formulários marcados
(arquivo + prefixo + campos), itens novos criados, e qualquer tarefa pedida que você não conseguiu fazer e por quê.
