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
import FinanciamentoModal from '../src/components/Patrimonio/FinanciamentoModal'
import PagarParcelaModal from '../src/components/Patrimonio/PagarParcelaModal'
import RegistrarEntradaModal from '../src/components/Patrimonio/RegistrarEntradaModal'
import ParametrizarBemModal from '../src/components/Patrimonio/ParametrizarBemModal'
import { calcularRateio, statusParcela, fmtData, montarAjustesEntrada } from '../src/components/Patrimonio/bemUtils'

// Payloads no formato EXATO devolvido por api/bem/* e api/financiamento/*.
const BEM = {
  id: 'acc_bem_1', nome: 'TIGGO 5X PRO', valor_nota_fiscal: 120000, saldo: 60000,
  tipo: 'bem_imobilizado', account_type: 'asset', descricao: 'Veículo agosto/2026',
  foi_vendido: false, data_venda: null, bem_destino_id: null,
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
  { movimentacao_id: 'm1', tipo: 'entrada_trade_in', data: '2026-08-15', descricao: 'Recebido HB20S como entrada', bem_origem_id: 'acc_bem_0', bem_origem: 'HB20S', valor_entrada: 45000, perda_ganho: -35000, categoria: 'Perda de Venda de Bem', lancamento_id: 'tx1' },
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
  ['Favorecido', 'Shopping Car Londrina', 'Aplicado a todas as transferências selecionadas'])

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

console.log(falhas === 0 ? '\nSMOKE DE RENDER OK' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
