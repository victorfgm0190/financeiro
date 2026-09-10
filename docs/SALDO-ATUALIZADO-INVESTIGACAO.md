# Investigação: coluna "Saldo Atualizado" (Contas Reserva)

Data: 2026-09-10 · Escopo: `src/components/Reservas/ReservasPanel.jsx`, `api/load.js`, `api/reserve-snapshots.js`

## Resposta curta

**"Saldo Atualizado" NÃO existe no banco para a tela de Contas Reserva.** Ele é calculado
em tempo real no React, a cada render, e é um **rateio proporcional do saldo REAL da conta
bancária entre as funções de reserva vinculadas àquela conta**.

A divergência entre `Saldo` e `Saldo Atualizado` não é bug nem dado desatualizado: é
exatamente a informação que a coluna existe para mostrar — *o quanto o dinheiro que
realmente está na conta difere da soma dos saldos teóricos das funções*.

## ETAPA 1 — Onde é renderizado

| Local | Linha |
|---|---|
| Cabeçalho da coluna (desktop) | `src/components/Reservas/ReservasPanel.jsx:769` |
| Valor por linha | `ReservasPanel.jsx:777-778` (cálculo) e `:823-825` (célula) |
| Card mobile | `ReservasPanel.jsx:641-642` e `:666` |
| Export XLSX | `ReservasPanel.jsx:540, 545` |
| Aba Fluxo Futuro | `ReservasPanel.jsx:1510, 1655-1656, 1757-1758` |
| Aba Histórico (outro caminho, ver ETAPA 4) | `ReservasPanel.jsx:1877, 1891` |

Variável: `const atualizado = saldosAtualizados[f.id] ?? saldo` — vem do mapa
`saldosAtualizados`, não de nenhum campo de `f`.

## ETAPA 2 — AppContext

`AppContext` **não tem** `saldoAtualizado` / `updated_balance`. Ele expõe apenas
`reserveFunctions` (tabela `reserve_functions`), `reservePeriods`, `reserveAdjustments`
e `accounts`.

O hook local `useReservas()` (`ReservasPanel.jsx:33-54`) é quem junta as peças. Detalhe
importante: **`accountBalances` (o "Saldo real da conta") vive em `localStorage`**, chave
`finup_reserve_balances` (`ReservasPanel.jsx:38, 43`) — é um override *por dispositivo*,
não sincronizado com o Neon.

## ETAPA 3 — API serverless

Não existe `api/reserve-functions.js` nem `api/contas-reserva.js` com esse campo.

- `api/load.js:388` — `SELECT * FROM reserve_functions ORDER BY ordem, name`. Sem JOIN,
  sem coluna calculada.
- `api/reserve-snapshots.js` — único endpoint que trafega `saldo_atualizado`, e apenas
  para **gravar o congelamento** da virada de saldo (linhas 11, 23, 45).

## ETAPA 4 — Schema

`reserve_functions` (`api/load.js:120-132`):

```
id, name, account_id, saldo_inicial, entradas, saidas,
despesa_anual, deposito_mensal, mes_vencimento, ordem, created_at
+ ALTERs: entradas_override, saidas_override, ajuste_override (JSONB),
          category_id, exibir_como_despesa
```

→ **Não há `saldo_atualizado` nem qualquer coluna de "última atualização".**

A coluna `saldo_atualizado` existe em **uma** tabela só:
`reserve_period_snapshots` (`api/load.js:199-212`) — o snapshot congelado do período
que se encerra numa virada de saldo. É daí que a **aba Histórico** lê
(`ReservasPanel.jsx:1891`), e ali sim o valor é um dado gravado, não calculado.

Query de confirmação no console do Neon:

```sql
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'reserve_functions'
 ORDER BY ordinal_position;
-- resultado esperado: nenhuma linha com 'saldo_atualizado'

SELECT column_name FROM information_schema.columns
 WHERE table_name = 'reserve_period_snapshots' AND column_name = 'saldo_atualizado';
-- resultado esperado: 1 linha
```

(Não foi possível executar daqui: a connection string do Neon não está no repo — fica no
Vercel Dashboard como `NEON_DATABASE_URL`, e não existe `.env.local` nesta máquina.)

## ETAPA 5 — Fluxo completo

```
┌─ Neon PostgreSQL ────────────────────────────────────────────────┐
│ reserve_functions   → nome, conta vinculada, saldo_inicial legado│
│ reserve_periods     → saldo_inicial do período ATIVO             │
│ reserve_adjustments → ajustes ± do período                       │
│ lancamentos         → transferências/receitas da conta reserva   │
│ contas.balance      → saldo real da conta (mutado a cada lçto)   │
└──────────────────────────┬───────────────────────────────────────┘
                           │ GET /api/load
                           ▼
                   AppContext (estado global)
                           │
                           ▼
        useReservas()  ──  localStorage['finup_reserve_balances']
                           │        (override manual do saldo real)
                           ▼
  ┌── ReservasPanel (useMemo, recalculado a cada render) ──────────┐
  │ activePeriodByFn  = período de data_inicio mais recente        │
  │ computedMovs      = entradas/saídas dos lançamentos DENTRO     │
  │                     da janela do período ativo                 │
  │ effectiveFunctions= { saldoInicial, entradas, saidas, ajuste } │
  │                                                                │
  │ computeSaldo(f)   = saldoInicial + entradas − saidas + ajuste  │  ← linha 1933
  │                                                                │
  │ saldosAtualizados: para cada CONTA com funções vinculadas      │  ← linha 2050
  │   totalSaldo = Σ computeSaldo(f) das funções daquela conta     │
  │   saldoReal  = accountBalances[conta] ?? conta.balance         │
  │   f.atualizado = computeSaldo(f) × (saldoReal / totalSaldo)    │
  │                                                                │
  │   funções SEM conta vinculada: atualizado = computeSaldo(f)    │
  └────────────────────────────────────────────────────────────────┘
                           ▼
                    <td>{fmt(atualizado)}</td>
```

**Quando é atualizado:** a cada render em que mudem `effectiveFunctions`, `accounts` ou
`accountBalances`. Ou seja: **sempre**. Nunca fica "velho".

## Por que diverge

A fórmula é um rateio:

```
saldoAtualizado(f) = saldo(f) × ( saldoReal_da_conta / Σ saldo(todas as funções da conta) )
```

O fator de rateio é o mesmo para todas as funções da conta. Portanto:

- **`saldoReal == totalSaldo`** → fator 1,0 → `Saldo Atualizado == Saldo` para todas as
  funções daquela conta.
- **`saldoReal != totalSaldo`** → todas as funções daquela conta são escaladas pelo mesmo
  fator, proporcionalmente ao próprio saldo.

Conferindo com os números da tela:

- **Seguro Residencial**: 2.443,04 → 2.413,17. Fator = 2413,17 / 2443,04 ≈ **0,98777**.
  A conta desta função tem ~1,22% **menos** dinheiro do que a soma dos saldos teóricos
  das funções que moram nela.
- **IPVA**: 1.343,06 = 1.343,06. Fator = 1,0. Se IPVA estivesse na mesma conta do Seguro
  Residencial, teria sido escalado por 0,98777 e daria 1.326,63. Como não foi, **IPVA está
  em outra conta** (onde `saldoReal == totalSaldo`) **ou não tem conta vinculada**
  (`ReservasPanel.jsx:2068`, caminho que devolve `computeSaldo` puro).

**O evento que criou a divergência** é um destes, na conta do Seguro Residencial:

1. Um lançamento na conta que **não foi vinculado a nenhuma função de reserva**
   (`reservaFuncaoId` vazio) — entra em `contas.balance` mas não em `entradas`/`saidas` de
   nenhuma função. Causa mais provável.
2. Um lançamento vinculado a uma função, mas com `date` **fora da janela do período ativo**
   (`ReservasPanel.jsx:1996`) — o dinheiro moveu a conta, mas foi ignorado no saldo da função.
3. Uma despesa de cartão vinculada à função: por desenho ela é só provisão e **não** conta
   como saída de reserva (`ReservasPanel.jsx:1997-1999`).
4. Rendimento/juros creditados na conta sem função associada.
5. O campo "Saldo real da conta" foi digitado à mão nesta tela e ficou no `localStorage`
   deste navegador, divergindo do `contas.balance`.

O próprio painel já mostra a diferença bruta: o `diff` ao lado do input "Saldo real da conta"
(`ReservasPanel.jsx:596-599`), em azul se sobra e laranja se falta.

## Sobre a cor

A cor não sinaliza divergência. A célula é `text-despesa` (coral `#F0997B`) quando o valor
é **negativo** e `text-receita` (azul claro `#85B7EB`) quando positivo —
`ReservasPanel.jsx:823`. É condicional puramente pelo sinal. O `--color-despesa` é coral,
não vermelho; a paleta evita verde/vermelho de propósito (`src/index.css:6`).

## Sobre o "Último fechamento: 15/07/2026"

É a `data_inicio` mais recente entre todos os `reserve_periods` (`ReservasPanel.jsx:2133-2139`).
Ter 55 dias **não afeta em nada** o Saldo Atualizado — ele não é um snapshot. O que essa data
faz é definir a janela em que entradas/saídas são somadas.

## É preciso "Virar Saldo"?

**Não para corrigir o número.** A virada (`handleVirar`, `ReservasPanel.jsx:2083`) não
recalcula nem concilia nada: ela grava um snapshot do estado atual em
`reserve_period_snapshots` e cria um novo `reserve_period` com
`saldo_inicial = saldoAtualizado atual`. Isso **absorve** a divergência para dentro do saldo
inicial do novo período — o rateio passa a dar 1,0 e as colunas voltam a bater, mas a causa
raiz (o lançamento não vinculado) some do radar sem ter sido entendida.

Ordem correta:

1. Identificar a conta com fator ≠ 1 (a que mostra `diff` diferente de zero no cabeçalho).
2. Extrato da conta desde `15/07/2026`, procurando lançamentos sem `reservaFuncaoId`.
3. Vincular / criar o ajuste correspondente em `reserve_adjustments`.
4. **Depois disso** virar o saldo, se quiser fechar o período.

## Próximos passos sugeridos

1. **Tooltip na coluna** explicando a fórmula do rateio — hoje o usuário não tem como saber
   que é proporcional.
2. **Indicador de divergência por conta**: quando `|saldoReal − totalSaldo| > 0,01`, marcar
   o grupo com um aviso clicável que liste os lançamentos da conta sem `reservaFuncaoId`
   dentro da janela do período. Resolve a investigação em um clique, sem extrato manual.
3. **Migrar `accountBalances` do localStorage para o Neon.** Hoje o "Saldo real da conta"
   é por dispositivo (`ReservasPanel.jsx:38`): o mesmo usuário vê Saldo Atualizado diferente
   no celular e no desktop. É a inconsistência mais séria encontrada.
4. Considerar **derivar `saldoReal` sempre de `contas.balance`** e tratar o override manual
   como exceção explícita, em vez de silenciosamente preferir o localStorage.
5. Avaliar se a janela do período ativo deveria ser aberta à direita (hoje entradas/saídas
   filtram por `data <= b.end`), para não perder lançamentos futuros já efetivados.
