# Importação padrão de lançamentos

Menu **Importar lançamentos** (todos os ambientes). Um arquivo por conta. O Dindin (Configurações ›
Dados › Importação, aba "Conta Corrente" do Importar Fatura, `account_mapping`) continua só no `vm`,
sem alteração; cartão de crédito continua no **Importar Fatura**.

## Fluxo

1. **Conta de destino** — Conta Corrente, Poupança ou Dinheiro (`TIPOS_CONTA_IMPORTAVEIS`).
2. **Planilha** — "Gerar Excel para preencher" (`src/lib/importacaoPadrao/excel.js`, exceljs) e envio do
   arquivo preenchido: `.xlsx` gerado, `.csv` (mesmas colunas, `;` ou `,`) ou `.ofx`.
3. **Prévia** (`previa.js`) — válidas, linhas com erro (número + motivo), possíveis duplicados
   (desmarcados), categorias sem correspondência (escolher / criar nova / sem categoria), totais.
4. **Confirmar** — gravação pelo app.

## Excel gerado

- **Lançamentos**: título travado (conta e ambiente), cabeçalho DATA | VALOR | DESCRIÇÃO | CATEGORIA |
  FAVORECIDO e 1.000 linhas preparadas com validação (data `dd/mm/yyyy` com Date de verdade; número
  `#,##0.00` — o Excel em português mostra 1.234,56; lista de categorias com aviso; lista de favorecidos
  que aceita texto novo). Só o título é protegido: as colunas inteiras ficam desbloqueadas (dá para
  passar da linha 1.000; a leitura importa todas as linhas preenchidas).
- **Instruções** (2 exemplos), **Listas** (oculta) e **_finup** (veryHidden: id/nome da conta e
  ambiente). Arquivo de outra conta ou de outro ambiente → aviso e confirmação.
- Categorias com nome repetido aparecem como "Nome (Grupo)".

## Leitura (`leitura.js`, `ofx.js`)

- `.xlsx` lido com SheetJS sem `cellDates`: data vem como série do Excel e é convertida em UTC (sem
  dia a mais/menos); valor como número ou texto ("1.234,56", "1234.56", "(12,30)", "12,30-").
- `.csv`: cabeçalho sem diferenciar maiúsculas/acentos; aspas; UTF-8 ou windows-1252.
- `.ofx`: 1.x (SGML) e 2.x (XML), UTF-8 ou windows-1252; DTPOSTED, TRNAMT, MEMO/NAME, FITID e
  BANKID/ACCTID (aviso "este extrato parece ser da conta X" se já foi importado em outra conta).

## Duplicados

- OFX: mesmo FITID já importado **nesta** conta, ou repetido no próprio arquivo (exato).
- Planilha/CSV: mesma conta, mesma data, mesmo valor com sinal e descrição parecida
  (`descSimilarity ≥ 0,6`) — contra os lançamentos da conta e dentro do arquivo.

## Gravação e desfazer

- `addTransaction` em blocos de 25 (barra "Gravando N de M"), origem `importacao_padrao`, grupo
  gerencial "D", `importacao_id` = id do lote, `fitid` do OFX; no fim `recalcularSaldo(conta)` (regra
  de sempre: data até hoje no saldo, futuras no projetado).
- Lote em `importacoes_lancamentos`: `em_andamento` → `concluida` quando o banco tem todos (o app
  espera o sync e confirma em `/api/importacoes-lancamentos?acao=concluir`). Página fechada no meio →
  fica `em_andamento` e a lista mostra "Importação incompleta (X de Y)"; um "Desfazer" que parou no
  meio aparece como "Desfazer interrompido: X de Y ainda no banco". Sair da página durante a gravação
  → aviso do navegador (`beforeunload`).
- **Desfazer**: `deleteTransaction` em cada lançamento do lote (barra "Desfazendo N de M"),
  `recalcularSaldo`, espera o banco ficar sem nenhum e marca `desfeita` (a rota recusa enquanto
  sobrar algum).
- De-para (`importacao_depara`, nome normalizado → categoria) salvo depois que o banco confirma;
  editável em Configurações › Cadastros › De-para de importação.

## Banco

Migração `supabase/migrations/2026-10-18_importacao_padrao.sql` (só cria): `importacoes_lancamentos`,
`importacao_depara`, `lancamentos.importacao_id` e `lancamentos.fitid`. Ambiente que ainda não rodou a
migração continua sincronizando: o upsert descarta as colunas ausentes (`COLUNAS_OPCIONAIS` em
`api/_db.js`).

## Acesso

Importar exige **incluir** lançamentos; desfazer exige **excluir** lançamentos; a conta tem de estar
nos perfis permitidos do usuário.

## Desempenho (teste real, teste1)

500 linhas: prévia em ~1 s; gravação no app 0,1 s; banco confirma em ~2,7 s. Desfazer 500: ~3,3 s.
