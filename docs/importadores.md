# Importadores de arquivos de banco (cartão e conta corrente)

Código em `src/lib/importers/`. Telas: Importar Fatura › **Cartão de Crédito** e › **Conta Corrente**.
(O menu **Importar lançamentos** tem o fluxo próprio — `docs/importacao-lancamentos.md`.)

## Interface única

Todo parser devolve registros `{ date, description, payee, amount, type, parcela_num, parcela_total, raw }`
(`registro.js`). Itaú e Dindin seguem a interface **sem mudar o comportamento**: o registro guarda em
`raw` a linha do parser de sempre, e a revisão continua usando essa linha. As origens novas (OFX e
planilha genérica) viram a mesma linha por `paraLinhaCartao` / `paraLinhaConta`, então tudo depois do
parser — classificação, gerenciais, parcelas futuras, cobrança recorrente, duplicatas, fatura aberta,
Resumo da Importação — vale para qualquer origem.

## Detecção no upload

| Arquivo | Cartão | Conta corrente |
|---|---|---|
| `.ofx` | `deOfx(tipo: 'cartao')`: compra negativa = despesa, crédito = estorno, pagamento da fatura fora | `deOfx(tipo: 'conta')`: vira uma "conta do arquivo" na tela de mapeamento de contas |
| `.csv` Itaú | parser do Itaú | — |
| `.xls`/`.xlsx` Itaú | parser do Itaú | — |
| Dindin | parser Dindin (cartão) | parser Dindin (conta) |
| outra planilha | modelo pela assinatura do cabeçalho; sem modelo, abre o mapeamento | idem |

**Duplicatas por FITID:** o `fitid` do OFX é gravado no lançamento (`lancamentos.fitid`). Na revisão
do cartão, o mesmo FITID já gravado no cartão é "Já existe"; na conta corrente, duplicata exata.

## Modelos

- **Prontos** (no código, `MODELOS_PRONTOS` em `generico.js`): Nubank cartão e conta.
- **Do usuário**: tabela `import_layouts` do banco do ambiente, por `user_id`, via
  `/api/import-layouts` (GET lista, POST upsert por usuário + tipo + assinatura, DELETE ?id=).
  PK TEXT `gen_random_uuid()::text`. Criada pelo endpoint (CREATE TABLE IF NOT EXISTS), pelo
  `schema.sql` e pela migração do kit (`supabase/migrations/2026-10-19b_import_layouts.sql`).
- **Assinatura**: nomes das colunas da linha de cabeçalho, sem acento e em minúsculas, separados por `|`.
- **Mapeamento** (JSONB): `linhaCabecalho`, `colData`, `colDescricao`, `colValor` ou
  `colDebito` + `colCredito`, `colFavorecido`, `formatoData` (`dmy`/`ymd`/`mdy`), `decimal`
  (`,`/`.`), `sinalDespesa` (`negativo`/`positivo`), `ignorar` (textos que descartam a linha).
- **Migração do localStorage** (`finup_csv_mappings`, o mapeador antigo): na primeira abertura do
  Importar Fatura, cada mapeamento é gravado na tabela; o localStorage só é limpo depois de conferir
  que todos estão lá. Falhou → fica no navegador e tenta de novo.
