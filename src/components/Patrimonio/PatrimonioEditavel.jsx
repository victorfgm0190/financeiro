import { useState } from 'react'
import { Pencil, Lock, Loader2, Wallet } from 'lucide-react'
import { fmt } from '../shared/utils'

// Card "Valores do Bem" da aba Informações: os dois números do bem e qual deles entra no
// Patrimônio.
//
// Os VALORES só são editáveis num bem sem movimentação. Com histórico eles deixam de ser
// digitados e passam a ser consequência: a nota fiscal é a base de que a perda/ganho de um
// trade-in já registrado foi calculada, e o valor pago é o saldo, somado entrada por entrada.
// Quem garante isso é o 409 de POST /atualizar-valores — aqui o cadeado é só o aviso.
//
// O MÉTODO é editável sempre: escolher qual número o Patrimônio lê não reescreve nada.

function Valor({ label, children, hint }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-gray-800 last:border-0">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-right">
        <span className="text-sm text-gray-200 block">{children}</span>
        {hint && <span className="text-[11px] text-gray-600 block mt-0.5">{hint}</span>}
      </span>
    </div>
  )
}

function Opcao({ ativa, onClick, titulo, valor, indefinido, cor }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
        ativa ? `${cor.borda} ${cor.fundo}` : 'border-gray-800 hover:border-gray-700'
      }`}
    >
      <span className="flex items-center gap-2.5">
        <span className={`w-3 h-3 rounded-full shrink-0 border ${
          ativa ? `${cor.pino} ${cor.borda}` : 'bg-transparent border-gray-700'
        }`} />
        <span className="min-w-0 flex-1">
          <span className={`text-xs block ${ativa ? cor.texto : 'text-gray-400'}`}>{titulo}</span>
          <span className="text-sm text-gray-200 block">
            {indefinido ? <span className="text-gray-600 italic text-xs">não preenchido</span> : fmt(valor)}
          </span>
        </span>
      </span>
    </button>
  )
}

const COR_NF = { borda: 'border-blue-500/40', fundo: 'bg-blue-500/5', pino: 'bg-blue-500', texto: 'text-blue-400' }
const COR_PAGO = { borda: 'border-teal-500/40', fundo: 'bg-teal-500/5', pino: 'bg-teal-500', texto: 'text-teal-400' }

// String vazia = "limpar o campo" (null), e não 0 — são coisas diferentes para o backend.
const paraNumero = (s) => (String(s).trim() === '' ? null : Number(s))
const paraInput = (v) => (v == null ? '' : String(v))

export default function PatrimonioEditavel({ bem, temMovimentacoes, onSalvar, onErro }) {
  const [editando, setEditando] = useState(false)
  const [nf, setNf] = useState(paraInput(bem.valor_nota_fiscal))
  const [pago, setPago] = useState(paraInput(bem.valor_pago_manual))
  const [salvando, setSalvando] = useState(false)

  const metodo = bem.patrimonio_use_method || 'valor_pago'
  const podeEditar = !temMovimentacoes

  // Enquanto edita, a prévia usa o que está sendo digitado; fora da edição, o que está gravado.
  const nfAtual = editando ? paraNumero(nf) : bem.valor_nota_fiscal
  const pagoAtual = editando ? paraNumero(pago) : bem.valor_pago_manual

  const valorEmUso = metodo === 'nota_fiscal' ? nfAtual : pagoAtual
  const usandoSaldo = valorEmUso == null

  const abrirEdicao = () => {
    setNf(paraInput(bem.valor_nota_fiscal))
    setPago(paraInput(bem.valor_pago_manual))
    setEditando(true)
  }

  const salvar = async (payload, { fechar = false } = {}) => {
    setSalvando(true)
    try {
      await onSalvar(payload)
      if (fechar) setEditando(false)
    } catch (err) {
      onErro?.(err.message)
    } finally {
      setSalvando(false)
    }
  }

  const salvarValores = () => {
    const nfNum = paraNumero(nf)
    const pagoNum = paraNumero(pago)
    if ((nfNum != null && !(nfNum >= 0)) || (pagoNum != null && !(pagoNum >= 0))) {
      onErro?.('Os valores precisam ser números maiores ou iguais a zero.')
      return
    }
    salvar({ valor_nota_fiscal: nfNum, valor_pago_manual: pagoNum }, { fechar: true })
  }

  const trocarMetodo = (novo) => {
    if (novo === metodo || salvando) return
    salvar({ patrimonio_use_method: novo })
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
          <Wallet size={14} className="text-teal-400" /> Valores do Bem
        </h3>
        {podeEditar && !editando && (
          <button
            type="button"
            onClick={abrirEdicao}
            className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1.5"
          >
            <Pencil size={12} /> Editar
          </button>
        )}
        {!podeEditar && (
          <span className="text-[11px] text-gray-600 flex items-center gap-1.5" title="Bem com movimentações registradas">
            <Lock size={11} /> calculado pelo histórico
          </span>
        )}
      </div>

      {editando ? (
        <div className="space-y-3">
          <div>
            <label className="label">Valor de Contrato / Nota Fiscal (R$)</label>
            <input
              className="input" type="number" step="0.01" min="0" placeholder="Deixe vazio se não souber"
              value={nf} onChange={e => setNf(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Valor Pago / IR (R$)</label>
            <input
              className="input" type="number" step="0.01" min="0" placeholder="Deixe vazio para usar o saldo"
              value={pago} onChange={e => setPago(e.target.value)}
            />
            <p className="text-[11px] text-gray-600 mt-1">
              Em branco, o Patrimônio usa o saldo da conta ({fmt(bem.saldo)}).
            </p>
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1 text-xs py-1.5" onClick={() => setEditando(false)} disabled={salvando}>
              Cancelar
            </button>
            <button type="button" className="btn-primary flex-1 text-xs py-1.5 flex items-center justify-center gap-2" onClick={salvarValores} disabled={salvando}>
              {salvando && <Loader2 size={12} className="animate-spin" />} Salvar
            </button>
          </div>
        </div>
      ) : (
        <div>
          <Valor label="Contrato / Nota Fiscal">
            {bem.valor_nota_fiscal == null
              ? <span className="text-gray-600 italic text-xs">não preenchido</span>
              : fmt(bem.valor_nota_fiscal)}
          </Valor>
          <Valor
            label="Valor Pago / IR"
            hint={bem.valor_pago_manual == null ? 'sem valor informado — o Patrimônio usa o saldo' : null}
          >
            {bem.valor_pago_manual == null
              ? <span className="text-gray-600 italic text-xs">não preenchido</span>
              : fmt(bem.valor_pago_manual)}
          </Valor>
          <Valor label="Saldo Atual" hint={temMovimentacoes ? 'somado pelas movimentações do bem' : null}>
            <span className="text-teal-400 font-semibold">{fmt(bem.saldo)}</span>
          </Valor>
        </div>
      )}

      <div className="border-t border-gray-800 mt-3 pt-3 space-y-2">
        <p className="text-xs text-gray-500">Usar no Patrimônio</p>
        <Opcao
          ativa={metodo === 'nota_fiscal'} cor={COR_NF} titulo="Contrato / Nota Fiscal"
          valor={nfAtual} indefinido={nfAtual == null}
          onClick={() => trocarMetodo('nota_fiscal')}
        />
        <Opcao
          ativa={metodo === 'valor_pago'} cor={COR_PAGO} titulo="Valor Pago / IR"
          valor={pagoAtual} indefinido={pagoAtual == null}
          onClick={() => trocarMetodo('valor_pago')}
        />
        {usandoSaldo && (
          <p className="text-[11px] text-amber-400/80">
            O valor escolhido está em branco, então o Patrimônio usa o saldo ({fmt(bem.saldo)}).
            Preencha-o para o bem entrar pelo número certo.
          </p>
        )}
      </div>
    </div>
  )
}
