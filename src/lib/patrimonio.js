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
