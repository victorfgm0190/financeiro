import { FileText, Wallet, Landmark, Scale } from 'lucide-react'
import { fmt } from '../shared/utils'
import { fmtData } from './bemUtils'

// Como o bem foi pago: contrato (fixo), o que já foi investido (acumulativo), o que ainda é
// dívida, e a sobra entre os dois.
//
// Tudo vem derivado do backend (`bem.composicao`) — movimentações + parcelas. Nada aqui é
// digitado nem guardado em coluna própria, então cada baixa de parcela move os números sozinha.

function Linha({ label, children, destaque, sub }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1.5 ${sub ? '' : 'border-b border-gray-800 last:border-0'}`}>
      <span className={sub ? 'text-xs text-gray-600 pl-4' : 'text-xs text-gray-500'}>{label}</span>
      <span className={`text-sm text-right ${destaque || (sub ? 'text-gray-400' : 'text-gray-200')}`}>
        {children}
      </span>
    </div>
  )
}

export default function BemComposicao({ composicao }) {
  if (!composicao) return null
  const { valor_contrato: contrato, pago, financiamento, patrimonio } = composicao

  // Quanto do contrato ainda não foi coberto por nada — nem por dinheiro, nem por troca, nem
  // por parcela paga, nem pelo saldo devedor. Diferente de zero costuma ser bem provisionado
  // pela metade (entrada registrada sem financiamento, por exemplo).
  const coberto = Math.round((pago.total + financiamento.saldo_devedor) * 100) / 100
  const descoberto = Math.round((contrato - coberto) * 100) / 100

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <FileText size={14} className="text-gray-400" /> Valor do Contrato
        </h3>
        <Linha label="Valor original (nota/contrato)" destaque="text-gray-200 font-semibold">
          {fmt(contrato)}
        </Linha>
        <p className="text-xs text-gray-600 mt-2">
          Referência fixa — não muda com os pagamentos.
        </p>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <Wallet size={14} className="text-teal-400" /> Pago até agora
        </h3>

        <Linha label="Dinheiro">{fmt(pago.dinheiro)}</Linha>
        {pago.dinheiro_detalhe?.map((d, i) => (
          <Linha key={i} sub label={`${d.descricao || 'Entrada'} · ${fmtData(d.data)}`}>
            {fmt(d.valor)}
          </Linha>
        ))}

        <Linha label="Bem dado na troca">{fmt(pago.bens_troca)}</Linha>
        {pago.bens_troca_detalhe?.map((t, i) => (
          <div key={i}>
            <Linha sub label={`${t.descricao || 'Troca'} · valia antes`}>{fmt(t.valia_antes)}</Linha>
            <Linha sub label="valor da troca">{fmt(t.valor_troca)}</Linha>
            <Linha
              sub
              label={t.perda_ganho >= 0 ? 'ganho de capital' : 'perda de capital'}
              destaque={t.perda_ganho >= 0 ? 'text-receita' : 'text-despesa'}
            >
              {fmt(t.perda_ganho)}
            </Linha>
          </div>
        ))}

        <Linha label="Parcelas (só principal)">{fmt(pago.parcelas_principal)}</Linha>

        <div className="mt-2 pt-2 border-t border-gray-700">
          <Linha label="TOTAL PAGO" destaque="text-teal-400 font-semibold">{fmt(pago.total)}</Linha>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Juros não entram: são custo do crédito, lançados na categoria de taxa. Já foram pagos{' '}
          {fmt(financiamento.juros_pago)} de juros.
        </p>
      </div>

      <div className="card border border-red-500/10">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <Landmark size={14} className="text-red-400" /> Financiamento
        </h3>
        <Linha label="Valor financiado (principal)">{fmt(financiamento.valor_principal)}</Linha>
        <Linha label="Principal já amortizado">{fmt(financiamento.principal_pago)}</Linha>
        <Linha label="Saldo devedor" destaque="text-despesa font-semibold">
          {fmt(financiamento.saldo_devedor)}
        </Linha>
        <Linha label="Parcelas">
          {financiamento.parcelas_pagas}/{financiamento.num_parcelas} pagas
        </Linha>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <Scale size={14} className="text-blue-400" /> Saldo Patrimonial
        </h3>
        <Linha label="Investido no bem">{fmt(patrimonio.investido)}</Linha>
        <Linha label="Menos dívida" destaque="text-despesa">
          {fmt(-patrimonio.divida)}
        </Linha>
        <div className="mt-2 pt-2 border-t border-gray-700">
          <Linha
            label="= Patrimônio (equity)"
            destaque={patrimonio.equity >= 0 ? 'text-receita font-semibold' : 'text-despesa font-semibold'}
          >
            {fmt(patrimonio.equity)}
          </Linha>
        </div>
        {patrimonio.perda_ganho_troca !== 0 && (
          <p className="text-xs text-gray-600 mt-2">
            A {patrimonio.perda_ganho_troca >= 0 ? 'ganho' : 'perda'} de capital da troca
            ({fmt(patrimonio.perda_ganho_troca)}) não é descontada aqui: o bem antigo entrou pelo
            valor negociado, e a diferença já virou lançamento na categoria de{' '}
            {patrimonio.perda_ganho_troca >= 0 ? 'ganho' : 'perda'} na data da entrada.
          </p>
        )}
        {descoberto > 0.01 && (
          <p className="text-xs text-amber-400/80 mt-2">
            {fmt(descoberto)} do contrato ainda não tem origem registrada — falta entrada ou
            financiamento.
          </p>
        )}
      </div>
    </div>
  )
}
