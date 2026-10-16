# Saldo Principal ("Como chegamos aqui")

> ⚠ **Função protegida** (ver `CLAUDE.md`). `calcularSaldoPrincipalBreakdown()` em
> `src/lib/saldoPrincipal.js` e o wrapper `getSaldoPrincipalBreakdown()` em
> `src/context/AppContext.jsx` não podem ser alterados sem pedido explícito do usuário.

## Onde mora

| Peça | Arquivo | Papel |
|---|---|---|
| `calcularSaldoPrincipalBreakdown(dados, referenceDate)` | `src/lib/saldoPrincipal.js` | Cálculo inteiro, função pura (testável) |
| `getSaldoPrincipalBreakdown(referenceDate)` | `src/context/AppContext.jsx` | Wrapper: repassa `data.*`, `activeProfileId`, `getNextOccurrences`, `getFinancialPeriod` |
| Card "Saldo Principal" | `src/components/Dashboard/DashboardPanel.jsx`, `src/mobile/InicioMobile.jsx` | Lê `saldosPrincipais` (montado em `src/App.jsx`) |
| Modal "Como chegamos aqui" | `src/components/Dashboard/SaldoPrincipalBreakdownModal.jsx` | Seções e itens do breakdown |
| Testes | `src/lib/saldoPrincipal.test.js` | Identidade Tudo = Σ perfis e partição dos pools |

A extração para `src/lib` (15/10/2026) moveu o corpo sem mudar nenhuma lógica. Com o mesmo
dump do Neon, a saída do código antigo e a do novo foram comparadas campo a campo (1.619 campos,
0 diferenças). Só depois disso a regra do pool foi trocada.

## Regra do pool

```js
accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit' && (!profileId || a.profileId === profileId))
```

- **Só contas FC** (`contas.fluxo_caixa_principal = true`), nunca cartão, em **todos** os modos.
  Reserva, aplicação, ativo, passivo e conta Ger. só entram se estiverem marcados como FC.
- **Tudo** = todas as contas FC. **Perfil** = contas FC com `profile_id` daquele perfil.
- Os pools dos perfis formam uma partição do pool de Tudo, desde que toda conta FC tenha perfil.
  Uma conta FC sem perfil entra só em Tudo e quebra a identidade.

## Por que Tudo = Σ perfis

Todo valor é uma soma linear sobre o pool. Transferências contam pelo líquido
(`destino no pool ? +v : 0) − (origem no pool ? v : 0)`, agendamentos idem, e envelopes contam
pela `accountId` no pool. Com pools disjuntos, uma transferência entre dois perfis vale −x num
perfil, +x no outro e 0 em Tudo. Por isso Saldo base, Transferências gerenciais, Saldo Atual Ciclo,
Final Ciclo, Projetado, Atual Cal. e Final Cal. fecham: Tudo = Victor + Lumen.

## Valores

| Valor | Fórmula |
|---|---|
| Saldo base | Σ `initialBalance` do pool + lançamentos até o fim do ciclo − transferências gerenciais |
| Transf. gerenciais | Líquido das transferências com `grupoGerencial` ou com ponta em conta do grupo G / `Ger. …` |
| Saldo Atual Ciclo | Saldo base + Transf. gerenciais |
| Final Ciclo | Saldo Atual Ciclo + ocorrências não registradas de agendamentos com ponta no pool cuja data EFETIVA (override de data, `occEfetiva`) cai do início ao fim do ciclo; valor efetivo |
| Projetado | Final Ciclo − restante dos envelopes de contas do pool |
| Atual Cal. | Saldo Atual Ciclo + lançamentos depois do ciclo até o fim do mês-calendário (só no modo custom) |
| Final Cal. | Atual Cal. + agendamentos do início do ciclo até o fim do mês-calendário (só no modo custom) |

Perfil sem conta FC: o pool fica vazio e todos os valores dão 0. O card e o modal mostram
"Nenhuma conta de fluxo de caixa principal neste perfil" em vez de R$ 0,00 sem explicação.
