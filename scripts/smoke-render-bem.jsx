/* eslint-disable no-undef, react-refresh/only-export-components -- script Node, não é módulo do bundle */
// Smoke de renderização dos componentes de Bem/Financiamento com payloads no formato exato
// devolvido por api/bem/* e api/financiamento/*. Não precisa de banco nem de sessão.
//
// Uso:
//   npx vite build --ssr scripts/smoke-render-bem.jsx --outDir .smoke-out --logLevel error
//   node .smoke-out/smoke-render-bem.js

import { renderToString } from 'react-dom/server'
import BemInfoTab from '../src/components/Patrimonio/BemInfoTab'
import BemParcelasTab from '../src/components/Patrimonio/BemParcelasTab'
import BemHistoricoTab from '../src/components/Patrimonio/BemHistoricoTab'
import TradeInResumo from '../src/components/Patrimonio/TradeInResumo'
import PatrimonioEditavel from '../src/components/Patrimonio/PatrimonioEditavel'
import FinanciamentoModal from '../src/components/Patrimonio/FinanciamentoModal'
import PagarParcelaModal from '../src/components/Patrimonio/PagarParcelaModal'
import RegistrarEntradaModal from '../src/components/Patrimonio/RegistrarEntradaModal'
import ParametrizarBemModal from '../src/components/Patrimonio/ParametrizarBemModal'
import { calcularRateio, statusParcela, fmtData, montarAjustesEntrada, transferenciasElegiveisEntrada } from '../src/components/Patrimonio/bemUtils'
import { valorPatrimonial, valorPatrimonialEhFallback, calcularPatrimonioTotal } from '../src/lib/patrimonio'

// Payloads no formato EXATO devolvido por api/bem/* e api/financiamento/*.
const BEM = {
  id: 'acc_bem_1', nome: 'TIGGO 5X PRO', valor_nota_fiscal: 120000, saldo: 60000,
  tipo: 'bem_imobilizado', account_type: 'asset', descricao: 'Veículo agosto/2026',
  foi_vendido: false, data_venda: null, bem_destino_id: null,
  valor_pago_manual: null, patrimonio_use_method: 'valor_pago',
  categorias: {
    perda: { id: 'c1', nome: 'Perda de Venda de Bem' },
    ganho: { id: 'c2', nome: 'Ganho de Venda de Bem' },
    prestacao: { id: 'c3', nome: 'Prestação do Automóvel' },
    taxa_finan: { id: 'c4', nome: 'Taxa de Financiamento' },
  },
}

const PARCELA = (n, over = {}) => ({
  id: `fip_${n}`, numero: n,
  principal_provisioned: 1000, juros_provisioned: 342.33, total_provisioned: 1342.33,
  principal_pago: 0, juros_pago: 0, total_pago: 0, desvio_juros: 0,
  status: 'open', data_vencimento: '2026-09-15', data_pagamento: null, schedule_id: 's1',
  ...over,
})

const FIN = {
  id: 'fin_1', bem_id: 'acc_bem_1', bem_nome: 'TIGGO 5X PRO',
  valor_principal: 60000, juros_totais: 20539.8, valor_total: 80539.8,
  num_parcelas: 60, valor_parcela: 1342.33, banco: 'Safra', status: 'partial',
  conta_divida_id: 'acc_div_1', conta_origem_id: 'acc_cc_1',
  provisao: { principal: 60000, juros: 20539.8, total: 80539.8 },
  realizado: { principal: 1000, juros: 342.33, total: 1342.33 },
  analise: { principal_restante: 59000, juros_restantes: 20197.47, desvio_juros: 0, total_restante: 79197.47 },
  parcelas: [
    PARCELA(1, { status: 'paid', principal_pago: 1000, juros_pago: 342.33, total_pago: 1342.33, data_pagamento: '2026-09-15' }),
    PARCELA(2, { data_vencimento: '2026-10-15' }),
    PARCELA(3, { status: 'partial', principal_pago: 800, total_pago: 800, desvio_juros: 342.33, data_vencimento: '2026-11-15' }),
  ],
}

const MOVS = [
  { movimentacao_id: 'm1', tipo: 'entrada_trade_in', data: '2026-08-15', descricao: 'Recebido HB20S como entrada', bem_origem_id: 'acc_bem_0', bem_origem: 'HB20S', valor_entrada: 45000, perda_ganho: -35000, saldo_origem_anterior: 80000, categoria: 'Perda de Venda de Bem', lancamento_id: 'tx1' },
  { movimentacao_id: 'm2', tipo: 'entrada_venda', data: '2026-08-15', descricao: 'Entrada Nubank', valor: 15000, categoria: 'Prestação do Automóvel', lancamento_id: 'tx2' },
  { movimentacao_id: 'm3', tipo: 'pagamento_parcela', data: '2026-09-15', descricao: 'Parcela 1/60 - TIGGO 5X PRO', parcela_id: 'fip_1', numero_parcela: 1, num_parcelas: 60, principal: 1000, juros: 342.33, total: 1342.33, categoria_principal: 'Prestação do Automóvel', categoria_juros: 'Taxa de Financiamento', lancamento_id: 'tx3' },
]

const CONTAS = [
  { id: 'acc_cc_1', name: 'Nubank', type: 'checking', contaCorrentePrincipal: true, isMain: true, balance: 5000 },
  { id: 'acc_bem_0', name: 'HB20S', type: 'asset', balance: 80000, acquisitionValue: 80000 },
]
const TXS = [
  { id: 'tx2', type: 'transfer', amount: 15000, date: '2026-08-15', description: 'Entrada Nubank', accountId: 'acc_cc_1', toAccountId: 'acc_bem_1' },
]
const CATEGORIAS = [
  { id: 'c1', name: 'Perda de Venda de Bem', type: 'expense', group: 'Patrimônio' },
  { id: 'c2', name: 'Ganho de Venda de Bem', type: 'income', group: 'Patrimônio' },
  { id: 'c3', name: 'Prestação do Automóvel', type: 'expense', group: 'Transporte' },
  { id: 'c4', name: 'Taxa de Financiamento', type: 'expense', group: 'Transporte' },
]

const noop = () => {}
let falhas = 0

function render(nome, elemento, esperados = []) {
  try {
    // renderToString separa nós de texto adjacentes com <!-- -->; remove antes de asserir.
    const html = renderToString(elemento).replace(/<!--\s*-->/g, '')
    const faltando = esperados.filter(t => !html.includes(t))
    if (faltando.length) {
      falhas++
      console.log(`FAIL ${nome} — não renderizou: ${faltando.join(' | ')}`)
    } else {
      console.log(`ok   ${nome}`)
    }
  } catch (err) {
    falhas++
    console.log(`FAIL ${nome} — ${err.message}`)
  }
}

render('BemInfoTab (com financiamento)',
  <BemInfoTab bem={BEM} financiamento={FIN} parcelasResumo={{ pagas: 1, proxima: FIN.parcelas[1] }} onCriarFinanciamento={noop} onRegistrarEntrada={noop} />,
  ['TIGGO 5X PRO', 'Prestação do Automóvel', 'Safra', 'Ativo', '1/60'])

render('BemInfoTab (sem financiamento)',
  <BemInfoTab bem={BEM} financiamento={null} parcelasResumo={null} onCriarFinanciamento={noop} onRegistrarEntrada={noop} />,
  ['Registrar Entrada', 'Criar Financiamento', 'ainda não tem financiamento'])

render('BemInfoTab (vendido, sem categorias)',
  <BemInfoTab bem={{ ...BEM, foi_vendido: true, data_venda: '2026-08-15', categorias: {} }} financiamento={null} parcelasResumo={null} onCriarFinanciamento={noop} onRegistrarEntrada={noop} />,
  ['VENDIDO', 'Não parametrizado', '15/ago/2026'])

// Bem antigo: nenhuma movimentação, saldo zero, os dois valores digitados à mão.
const BEM_ANTIGO = {
  ...BEM, id: 'acc_bem_2', nome: 'GABRIEL TANIOS IASBIK 191', saldo: 0,
  valor_nota_fiscal: 500000, valor_pago_manual: 300000, patrimonio_use_method: 'nota_fiscal',
}

render('PatrimonioEditavel (sem movimentações → editável)',
  <PatrimonioEditavel bem={BEM_ANTIGO} temMovimentacoes={false} onSalvar={noop} onErro={noop} />,
  ['Valores do Bem', 'Editar', 'Contrato / Nota Fiscal', 'Valor Pago / IR', 'Usar no Patrimônio'])

// Com movimentações o cadeado tem que aparecer e o botão Editar sumir — a trava real é o 409
// do endpoint, mas a UI não pode oferecer o que o servidor vai recusar.
render('PatrimonioEditavel (com movimentações → bloqueado)',
  <PatrimonioEditavel bem={BEM} temMovimentacoes onSalvar={noop} onErro={noop} />,
  ['calculado pelo histórico', 'somado pelas movimentações do bem', 'Usar no Patrimônio'])

// Valor pago em branco + método valor_pago: o Patrimônio cai no saldo e precisa dizer isso.
render('PatrimonioEditavel (valor escolhido em branco → avisa fallback)',
  <PatrimonioEditavel bem={BEM} temMovimentacoes={false} onSalvar={noop} onErro={noop} />,
  ['não preenchido', 'o Patrimônio usa o saldo'])

render('BemInfoTab (com card de valores)',
  <BemInfoTab
    bem={BEM_ANTIGO} financiamento={null} parcelasResumo={null}
    onCriarFinanciamento={noop} onRegistrarEntrada={noop}
    temMovimentacoes={false} onSalvarValores={noop} onErro={noop}
  />,
  ['GABRIEL TANIOS IASBIK 191', 'Valores do Bem', 'Editar'])

render('BemParcelasTab',
  <BemParcelasTab financiamento={FIN} parcelas={FIN.parcelas} page={1} totalPages={3} totalParcelas={60} loading={false} onPage={noop} onPagar={noop} />,
  ['1/60 parcelas pagas', 'PAGO', 'PARCIAL', 'Página 1 de 3', 'Pagar'])

render('BemParcelasTab (sem financiamento)',
  <BemParcelasTab financiamento={null} parcelas={[]} page={1} totalPages={1} totalParcelas={0} loading={false} onPage={noop} onPagar={noop} />,
  ['ainda não tem financiamento'])

render('BemHistoricoTab',
  <BemHistoricoTab movimentacoes={MOVS} loading={false} erro={null} />,
  ['Entrada (Trade-in)', 'HB20S', 'Pagamento de Parcela', 'Taxa de Financiamento', '1/60'])

render('BemHistoricoTab (vazio)',
  <BemHistoricoTab movimentacoes={[]} loading={false} erro={null} />,
  ['Nenhuma movimentação'])

render('TradeInResumo',
  <TradeInResumo movimentacoes={MOVS} saldoBem={BEM.saldo} contas={CONTAS} estornando={false} onEstornar={noop} />,
  ['Entrada registrada', 'Entrada Nubank', 'HB20S', 'Perda de capital', 'Total da entrada',
    'Estornar entrada', 'continuam no'])

// Sem o saldo original guardado (movimentação anterior à coluna), o painel precisa avisar que
// o estorno vai chutar pela nota fiscal — senão o usuário confia num número que pode não bater.
render('TradeInResumo (entrada sem saldo original)',
  <TradeInResumo
    movimentacoes={[{ ...MOVS[0], saldo_origem_anterior: null }]}
    saldoBem={BEM.saldo} contas={CONTAS} estornando={false} onEstornar={noop}
  />,
  ['volta pela nota fiscal'])

render('TradeInResumo (estornando)',
  <TradeInResumo movimentacoes={MOVS} saldoBem={BEM.saldo} contas={CONTAS} estornando onEstornar={noop} />,
  ['Estornando...'])

// Só pagamento de parcela: não há entrada para estornar, o painel não pode aparecer.
render('TradeInResumo (sem entrada → não renderiza)',
  <div data-vazio>
    <TradeInResumo movimentacoes={[MOVS[2]]} saldoBem={BEM.saldo} contas={CONTAS} onEstornar={noop} />
  </div>,
  ['<div data-vazio="true"></div>'])

render('FinanciamentoModal',
  <FinanciamentoModal bem={BEM} contasCorrentes={CONTAS.filter(c => c.type === 'checking')} onCancel={noop} onSuccess={noop} onErro={noop} />,
  ['Valor a Financiar', 'Número de Parcelas', 'Nubank', 'Criar Financiamento'])

render('PagarParcelaModal (parcela aberta)',
  <PagarParcelaModal bem={BEM} financiamento={FIN} parcela={FIN.parcelas[1]} contasCorrentes={CONTAS.filter(c => c.type === 'checking')} onCancel={noop} onSuccess={noop} onErro={noop} />,
  ['Provisionado', 'Rateio', 'Juros em falta', '2/60'])

render('PagarParcelaModal (parcela parcial)',
  <PagarParcelaModal bem={BEM} financiamento={FIN} parcela={FIN.parcelas[2]} contasCorrentes={CONTAS.filter(c => c.type === 'checking')} onCancel={noop} onSuccess={noop} onErro={noop} />,
  ['Já pago', '3/60'])

render('RegistrarEntradaModal',
  <RegistrarEntradaModal bem={BEM} transacoes={TXS} contas={CONTAS} onCancel={noop} onSuccess={noop} onErro={noop} />,
  ['Transferências Disponíveis', 'Entrada Nubank', 'trade-in', 'Total da Entrada'])

// `favorecidos` tem default [] — o caso acima cobre a ausência da prop.
render('RegistrarEntradaModal (com favorecidos)',
  <RegistrarEntradaModal bem={BEM} transacoes={TXS} contas={CONTAS} favorecidos={['Shopping Car Londrina', 'Banco Itaú']} onCancel={noop} onSuccess={noop} onErro={noop} />,
  ['Favorecido', 'Shopping Car Londrina', 'que estão SEM favorecido'])

// Já vinculada: continua na lista, com selo e desmarcada por padrão.
render('RegistrarEntradaModal (transferência já vinculada)',
  <RegistrarEntradaModal
    bem={BEM}
    transacoes={[{ ...TXS[0], bemId: 'acc_bem_1', payee: 'Fornecedor X' }]}
    contas={CONTAS} onCancel={noop} onSuccess={noop} onErro={noop}
  />,
  ['Já vinculada', 'Fornecedor X', 'Entrada Nubank'])

// Sem candidatas, o modal precisa explicar o critério — senão a lista vazia parece bug.
render('RegistrarEntradaModal (sem transferências elegíveis)',
  <RegistrarEntradaModal bem={BEM} transacoes={[]} contas={CONTAS} onCancel={noop} onSuccess={noop} onErro={noop} />,
  ['Nenhuma transferência disponível', 'TIGGO 5X PRO', 'feitas '])

render('ParametrizarBemModal',
  <ParametrizarBemModal conta={CONTAS[1]} categorias={CATEGORIAS} onCancel={noop} onSuccess={noop} onErro={noop} />,
  ['Valor da Nota Fiscal', 'Perda de Venda de Bem', 'Patrimônio', 'Transporte'])

// Lógica pura usada pela UI
const eq = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    falhas++
    console.log(`FAIL ${label} — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
  } else console.log(`ok   ${label}`)
}
// valorPatrimonial recebe a conta no formato do estado React (camelCase), não o payload da API.
const conta = (over = {}) => ({ balance: 75000, valorNotaFiscal: 114900, valorPagoManual: null, patrimonioUseMethod: 'valor_pago', ...over })
eq('patrimônio: método nota_fiscal usa a NF', valorPatrimonial(conta({ patrimonioUseMethod: 'nota_fiscal' })), 114900)
eq('patrimônio: método valor_pago sem valor cai no saldo', valorPatrimonial(conta()), 75000)
eq('patrimônio: valor pago informado ganha do saldo', valorPatrimonial(conta({ valorPagoManual: 60000 })), 60000)
// 0 é um valor legítimo: `|| saldo` devolveria o saldo justamente no caso que o usuário zerou.
eq('patrimônio: zero informado é respeitado', valorPatrimonial(conta({ valorPagoManual: 0 })), 0)
// Bem antigo: saldo 0, só existe no PL pelo número digitado.
eq('patrimônio: bem sem saldo entra pela NF', valorPatrimonial({ balance: 0, valorNotaFiscal: 500000, patrimonioUseMethod: 'nota_fiscal' }), 500000)
// NF em branco com método nota_fiscal cai no saldo em vez de sumir do PL como 0.
eq('patrimônio: NF em branco cai no saldo', valorPatrimonial({ balance: 4200, valorNotaFiscal: null, patrimonioUseMethod: 'nota_fiscal' }), 4200)
eq('patrimônio: fallback sinalizado', valorPatrimonialEhFallback(conta()), true)
eq('patrimônio: sem fallback quando preenchido', valorPatrimonialEhFallback(conta({ valorPagoManual: 60000 })), false)
// Total: cada bem entra pelo SEU método. Aqui 114900 (NF) + 300000 (pago) + 0 (saldo puro).
eq('patrimônio: total soma por método de cada bem', calcularPatrimonioTotal([
  conta({ patrimonioUseMethod: 'nota_fiscal' }),
  { balance: 0, valorPagoManual: 300000, patrimonioUseMethod: 'valor_pago' },
  { balance: 0, valorNotaFiscal: null, valorPagoManual: null, patrimonioUseMethod: 'valor_pago' },
]), 414900)
// Conta comum (sem nada do módulo de bem) entra pelo saldo — é o que permite usar a mesma
// função no KPI do painel de Contas sem ramificar por tipo.
eq('patrimônio: conta comum entra pelo saldo', calcularPatrimonioTotal([{ balance: 5000 }]), 5000)
eq('patrimônio: lista vazia', calcularPatrimonioTotal([]), 0)
eq('patrimônio: lista ausente', calcularPatrimonioTotal(undefined), 0)

eq('rateio: cobre tudo', calcularRateio(1342.33, 1000, 342.33), { principalPago: 1000, jurosPago: 342.33, desvioJuros: 0 })
eq('rateio: só principal', calcularRateio(800, 1000, 342.33), { principalPago: 800, jurosPago: 0, desvioJuros: 342.33 })
eq('rateio: sobra parcial', calcularRateio(1200, 1000, 342.33), { principalPago: 1000, jurosPago: 200, desvioJuros: 142.33 })
eq('status: paga', statusParcela({ status: 'paid', data_vencimento: '2020-01-01' }), 'paga')
eq('status: vencida', statusParcela({ status: 'open', data_vencimento: '2020-01-01' }), 'vencida')
eq('status: aberta', statusParcela({ status: 'open', data_vencimento: '2099-01-01' }), 'aberta')
eq('status: parcial', statusParcela({ status: 'partial', data_vencimento: '2099-01-01' }), 'parcial')
eq('data sem shift de fuso', fmtData('2026-09-15'), '15/set/2026')
eq('data nula', fmtData(null), '—')

// Ajustes aplicados às transferências ao registrar a entrada (favorecido + categoria).
const TXS_AJUSTE = [{ id: 'tx1' }, { id: 'tx2' }, { id: 'tx3' }]
eq('ajustes: favorecido + categoria',
  montarAjustesEntrada({ transacoes: TXS_AJUSTE, escolhidas: { tx1: 'c3', tx2: 'c1' }, favorecido: 'Shopping Car' }),
  [{ id: 'tx1', mudancas: { payee: 'Shopping Car', categoryId: 'c3' } },
    { id: 'tx2', mudancas: { payee: 'Shopping Car', categoryId: 'c1' } }])
eq('ajustes: só categoria (favorecido vazio)',
  montarAjustesEntrada({ transacoes: TXS_AJUSTE, escolhidas: { tx1: 'c3' }, favorecido: '   ' }),
  [{ id: 'tx1', mudancas: { categoryId: 'c3' } }])
eq('ajustes: só favorecido (categoria vazia)',
  montarAjustesEntrada({ transacoes: TXS_AJUSTE, escolhidas: { tx1: '' }, favorecido: 'Shopping Car' }),
  [{ id: 'tx1', mudancas: { payee: 'Shopping Car' } }])
eq('ajustes: nada preenchido não gera update',
  montarAjustesEntrada({ transacoes: TXS_AJUSTE, escolhidas: { tx1: '', tx2: '' }, favorecido: '' }), [])
eq('ajustes: ignora transferência não selecionada',
  montarAjustesEntrada({ transacoes: TXS_AJUSTE, escolhidas: { tx3: 'c4' }, favorecido: '' }),
  [{ id: 'tx3', mudancas: { categoryId: 'c4' } }])
eq('ajustes: bemId marca a transferência como vinculada',
  montarAjustesEntrada({ transacoes: TXS_AJUSTE, escolhidas: { tx1: 'c3' }, favorecido: 'Shopping Car', bemId: 'acc_bem_1' }),
  [{ id: 'tx1', mudancas: { payee: 'Shopping Car', categoryId: 'c3', bemId: 'acc_bem_1' } }])
eq('ajustes: bemId sozinho já gera update (vínculo é mudança real)',
  montarAjustesEntrada({ transacoes: TXS_AJUSTE, escolhidas: { tx1: '' }, favorecido: '', bemId: 'acc_bem_1' }),
  [{ id: 'tx1', mudancas: { bemId: 'acc_bem_1' } }])

// Regra "preenche só o que está em branco" — tem que casar com o COALESCE(category_id, $3)
// do endpoint, senão o sync diferencial reenvia por cima do que o banco preservou.
const TXS_PREENCHIDAS = [
  { id: 'p1', payee: 'Fornecedor X', categoryId: 'cat_do_usuario', bemId: null },
  { id: 'p2', payee: '', categoryId: '', bemId: null },
  { id: 'p3', payee: 'Fornecedor X', categoryId: '', bemId: null },
  { id: 'p4', payee: 'Fornecedor X', categoryId: 'cat_do_usuario', bemId: 'acc_bem_1' },
]
const todas = { p1: 'c3', p2: 'c3', p3: 'c3', p4: 'c3' }
eq('regra: não sobrescreve payee nem categoria já preenchidos',
  montarAjustesEntrada({ transacoes: TXS_PREENCHIDAS, escolhidas: { p1: 'c3' }, favorecido: 'Shopping Car', bemId: 'acc_bem_1' }),
  [{ id: 'p1', mudancas: { bemId: 'acc_bem_1' } }])
eq('regra: preenche os dois quando ambos vazios',
  montarAjustesEntrada({ transacoes: TXS_PREENCHIDAS, escolhidas: { p2: 'c3' }, favorecido: 'Shopping Car', bemId: 'acc_bem_1' }),
  [{ id: 'p2', mudancas: { payee: 'Shopping Car', categoryId: 'c3', bemId: 'acc_bem_1' } }])
eq('regra: preenche só a categoria quando o payee já existe',
  montarAjustesEntrada({ transacoes: TXS_PREENCHIDAS, escolhidas: { p3: 'c3' }, favorecido: 'Shopping Car', bemId: 'acc_bem_1' }),
  [{ id: 'p3', mudancas: { categoryId: 'c3', bemId: 'acc_bem_1' } }])
eq('regra: já vinculada e completa não gera update nenhum',
  montarAjustesEntrada({ transacoes: TXS_PREENCHIDAS, escolhidas: { p4: 'c3' }, favorecido: 'Shopping Car', bemId: 'acc_bem_1' }), [])
eq('regra: lote misto aplica caso a caso',
  montarAjustesEntrada({ transacoes: TXS_PREENCHIDAS, escolhidas: todas, favorecido: 'Shopping Car', bemId: 'acc_bem_1' })
    .map(a => [a.id, Object.keys(a.mudancas).sort().join('+')]),
  [['p1', 'bemId'], ['p2', 'bemId+categoryId+payee'], ['p3', 'bemId+categoryId']])

// Recorte das transferências oferecidas pelo modal (a mesma função que BemDetail usa).
const TXS_FILTRO = [
  { id: 'a', type: 'transfer', toAccountId: 'acc_bem_1', bemId: null },
  { id: 'b', type: 'transfer', toAccountId: 'acc_cc_1', bemId: null },   // credita outra conta
  { id: 'c', type: 'transfer', toAccountId: 'acc_bem_1', bemId: 'acc_bem_1' }, // já vinculada
  { id: 'd', type: 'expense', toAccountId: 'acc_bem_1', bemId: null },   // não é transferência
  { id: 'e', type: 'transfer', toAccountId: 'acc_bem_1', bemId: null },
]
eq('filtro: só transfer para a conta do bem — inclui as já vinculadas',
  transferenciasElegiveisEntrada(TXS_FILTRO, 'acc_bem_1').map(t => t.id), ['a', 'c', 'e'])
eq('filtro: bem sem transferências fica vazio',
  transferenciasElegiveisEntrada(TXS_FILTRO, 'acc_bem_9').map(t => t.id), [])

console.log(falhas === 0 ? '\nSMOKE DE RENDER OK' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
