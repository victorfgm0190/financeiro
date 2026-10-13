// Quanto um bem vale no Patrimônio.
//
// Um bem tem dois números possíveis e eles raramente coincidem: o de contrato/nota fiscal e o
// efetivamente pago (IR, recibo). `patrimonio_use_method` na conta escolhe qual dos dois
// representa o bem — a escolha é por bem, não global, porque a origem do dado muda de um para
// outro. Bem antigo, sem movimentação nenhuma no app, tem saldo 0 e só existe no PL pelo número
// que alguém digitou.
//
// Mora em src/lib/ e não em components/Patrimonio/ porque não é só do painel de Patrimônio:
// o KPI de Patrimônio Líquido do painel de Contas lê daqui também, e um componente de Contas
// importando de components/Patrimonio/ seria uma dependência cruzada sem motivo.
//
// Todas as funções recebem a conta no formato do estado React (camelCase, rowToAccount), não o
// payload de /api/bem/[id].

const escolhido = (conta) => (
  conta?.patrimonioUseMethod === 'nota_fiscal' ? conta?.valorNotaFiscal : conta?.valorPagoManual
)

// `!= null` e não `||`: 0 é um valor legítimo. `valor || saldo` trocaria um bem zerado de
// propósito pelo saldo — justamente o número que o usuário quis substituir.
//
// FALLBACK: valor escolhido em branco cai no saldo em vez de devolver 0. Um bem sumindo do PL
// porque o método aponta para um campo vazio é pior — e mais silencioso — do que um bem avaliado
// pelo saldo. `valorPatrimonialEhFallback` diz quando isso está acontecendo, para a UI avisar.
export function valorPatrimonial(conta) {
  const v = escolhido(conta)
  return v != null ? Number(v) : (Number(conta?.balance) || 0)
}

export function valorPatrimonialEhFallback(conta) {
  return escolhido(conta) == null
}

// Soma o valor patrimonial da lista que RECEBE — sem filtrar por type aqui de propósito.
// "Bem" no app não é só `type === 'asset'`: conta de um grupo patrimonial com behavior 'bem'
// também conta, e um filtro interno por type as derrubaria em silêncio. Quem sabe o que é bem é
// quem categoriza (PatrimonioPanel), então o recorte fica com o chamador.
export function calcularPatrimonioTotal(contas) {
  return (contas || []).reduce((total, c) => total + valorPatrimonial(c), 0)
}

// Separa as contas nas categorias do Patrimônio. Mesma ordem de decisão que o painel sempre usou:
// vínculo Patrimônio → investimento; grupo patrimonial → pelo behavior; depois pelo type.
export function categorizarPatrimonio(accounts, accountGroups) {
  const cat = { bens: [], dividas: [], emprestimos: [], investimentos: [], contas: [], cartoes: [] }
  for (const a of (accounts || [])) {
    const group = (accountGroups || []).find(g => g.id === a.accountGroupId)
    if (a.vinculoTipo === 'patrimonio') cat.investimentos.push(a)
    else if (group?.type === 'patrimonial') {
      if (group.behavior === 'divida') cat.dividas.push(a)
      else if (group.behavior === 'emprestimo') cat.emprestimos.push(a)
      else cat.bens.push(a)
    } else if (a.type === 'asset') cat.bens.push(a)
    else if (a.type === 'liability') cat.dividas.push(a)
    else if (a.type === 'credit') cat.cartoes.push(a)
    else {
      const gName = (group?.name || '').toLowerCase()
      if (gName.includes('invest') || gName.includes('aplic')) cat.investimentos.push(a)
      else if (['checking', 'savings', 'cash'].includes(a.type)) cat.contas.push(a)
    }
  }
  return cat
}

// Totais do Patrimônio E os itens que formam cada total — fonte ÚNICA dos cards, do Resumo, do
// gráfico e do modal de composição (cada total é literalmente a soma dos seus itens).
// `creditUsage(cardId)` é o em aberto do cartão (AppContext → creditLimitUsage).
//
// Dívida entra pelo valor devido em POSITIVO: o passivo guarda o saldo devedor negativo
// (financiamento −63 mil) e o PL subtrai `dividas` — somar o balance cru somava a dívida.
export function totaisPatrimonio(categorized, creditUsage) {
  const item = (conta, valor) => ({ conta, valor })
  const itens = {
    bens: categorized.bens.map(a => item(a, valorPatrimonial(a))),
    investimentos: categorized.investimentos.map(a => item(a, a.balance || 0)),
    contas: categorized.contas.map(a => item(a, a.balance || 0)),
    dividas: categorized.dividas.map(a => item(a, -(a.balance || 0))),
    emprestimos: categorized.emprestimos.map(a => item(a, a.balance || 0)),
    cartao: categorized.cartoes.map(a => item(a, creditUsage(a.id))),
  }
  const soma = (lista) => lista.reduce((s, i) => s + i.valor, 0)
  const t = Object.fromEntries(Object.entries(itens).map(([k, lista]) => [k, soma(lista)]))
  const pl = t.bens + t.investimentos + t.contas - t.dividas - t.emprestimos - t.cartao
  return { ...t, pl, itens }
}
