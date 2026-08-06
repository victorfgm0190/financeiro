import { Landmark, AlertTriangle, Wallet, Tag } from 'lucide-react'
import { fmt } from '../shared/utils'
import { fmtData } from './bemUtils'

function Linha({ label, children, destaque }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-800 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm text-right ${destaque || 'text-gray-200'}`}>{children}</span>
    </div>
  )
}

function Categoria({ label, categoria }) {
  return (
    <Linha label={label}>
      {categoria?.nome
        ? categoria.nome
        : <span className="text-gray-600 italic text-xs">Não parametrizado</span>}
    </Linha>
  )
}

export default function BemInfoTab({
  bem, financiamento, parcelasResumo, onCriarFinanciamento, onRegistrarEntrada,
}) {
  const categorias = bem.categorias || {}
  const semCategorias = !categorias.perda?.nome && !categorias.ganho?.nome
    && !categorias.prestacao?.nome && !categorias.taxa_finan?.nome

  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <Landmark size={14} className="text-teal-400" /> Bem (Ativo)
        </h3>
        <Linha label="Nome">{bem.nome}</Linha>
        <Linha label="Valor da Nota Fiscal">{fmt(bem.valor_nota_fiscal)}</Linha>
        <Linha label="Saldo Atual" destaque="text-teal-400 font-semibold">{fmt(bem.saldo)}</Linha>
        <Linha label="Status">
          {bem.foi_vendido
            ? <span className="text-despesa font-semibold">VENDIDO</span>
            : <span className="text-receita">Ativo</span>}
        </Linha>
        {bem.foi_vendido && <Linha label="Data da Venda">{fmtData(bem.data_venda)}</Linha>}
        {bem.descricao && <Linha label="Descrição">{bem.descricao}</Linha>}
      </div>

      {financiamento ? (
        <div className="card border border-red-500/10">
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400" /> Contas a Pagar
          </h3>
          <Linha label="Banco">{financiamento.banco || '—'}</Linha>
          <Linha label="Valor Financiado">{fmt(financiamento.valor_principal)}</Linha>
          <Linha label="Juros Totais">{fmt(financiamento.juros_totais)}</Linha>
          <Linha label="Valor Total">{fmt(financiamento.valor_total)}</Linha>
          <Linha label="Saldo Devedor" destaque="text-despesa font-semibold">
            {fmt(-(financiamento.analise?.total_restante ?? financiamento.valor_total))}
          </Linha>
          {parcelasResumo && (
            <>
              <Linha label="Parcelas Pagas">
                {parcelasResumo.pagas}/{financiamento.num_parcelas}
              </Linha>
              <Linha label="Próxima Parcela">
                {parcelasResumo.proxima
                  ? `${parcelasResumo.proxima.numero}/${financiamento.num_parcelas} · ${fmtData(parcelasResumo.proxima.data_vencimento)}`
                  : 'Nenhuma pendente'}
              </Linha>
            </>
          )}
          {financiamento.analise?.desvio_juros > 0 && (
            <Linha label="Juros não pagos" destaque="text-amber-400">
              {fmt(financiamento.analise.desvio_juros)}
            </Linha>
          )}
        </div>
      ) : (
        <div className="card">
          <p className="text-sm text-gray-400">Este bem ainda não tem financiamento.</p>
          <p className="text-xs text-gray-600 mt-1">
            Registre a entrada à vista e depois crie o financiamento do saldo restante.
          </p>
        </div>
      )}

      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
          <Tag size={14} className="text-blue-400" /> Categorias Parametrizadas
        </h3>
        <Categoria label="Perda de Bem" categoria={categorias.perda} />
        <Categoria label="Ganho de Bem" categoria={categorias.ganho} />
        <Categoria label="Principal (Prestação)" categoria={categorias.prestacao} />
        <Categoria label="Juros (Taxa)" categoria={categorias.taxa_finan} />
        {semCategorias && (
          <p className="text-xs text-amber-400/80 mt-3">
            Nenhuma categoria parametrizada. Use “Parametrizar bem” para definir as quatro
            categorias antes de criar o financiamento.
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {!financiamento && (
          <button className="btn-secondary flex-1 flex items-center justify-center gap-2" onClick={onRegistrarEntrada}>
            <Wallet size={14} /> Registrar Entrada à Vista
          </button>
        )}
        {!financiamento && (
          <button className="btn-primary flex-1" onClick={onCriarFinanciamento}>
            Criar Financiamento
          </button>
        )}
      </div>
    </div>
  )
}
