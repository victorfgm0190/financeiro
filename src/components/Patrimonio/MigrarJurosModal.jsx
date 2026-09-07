import { useEffect, useState } from 'react'
import { Loader2, Split, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { fmt } from '../shared/utils'
import { previewSplitAgendamentos, splitAgendamentos } from '../../lib/bemApi'

// Separa os agendamentos ANTIGOS deste bem — um por parcela, com o valor cheio — nos dois que a
// criação passou a gerar: principal (transferência p/ a dívida, categoria de prestação) e juros
// (despesa, categoria de taxa de financiamento).
//
// O preview vem do GET do mesmo endpoint, e não de uma conta feita aqui: quem decide o que é
// candidato é o backend (agendamento ainda marcado como 'financiamento' e com juros > 0), e
// duplicar esse critério no React daria uma tela que promete um número e entrega outro.
//
// A migração é in-place e idempotente — o agendamento existente vira o de principal, preservando
// `registered`/`skipped`. Rodar de novo não encontra mais candidatos.

export default function MigrarJurosModal({ bem, onCancel, onSuccess, onErro }) {
  const [preview, setPreview] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)

  // `carregando` já nasce true — o modal é montado por bem e o efeito roda uma vez só, então
  // marcar de novo aqui seria um setState síncrono dentro do efeito, sem mudar nada.
  useEffect(() => {
    let ativo = true
    previewSplitAgendamentos(bem.id)
      .then(r => { if (ativo) setPreview(r) })
      .catch(err => { if (ativo) setErro(err.message) })
      .finally(() => { if (ativo) setCarregando(false) })
    return () => { ativo = false }
  }, [bem.id])

  const info = preview?.bens?.[0] || null
  const pendentes = preview?.pendentes ?? 0
  const semCategoria = !!info && !info.categoria_taxa_ok

  const enviar = async () => {
    setEnviando(true)
    try {
      onSuccess(await splitAgendamentos({ bem_id: bem.id }))
    } catch (err) {
      onErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-500 gap-2 text-sm">
        <Loader2 size={16} className="animate-spin" /> Verificando agendamentos...
      </div>
    )
  }

  if (erro) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-despesa">{erro}</p>
        <button type="button" className="btn-secondary w-full" onClick={onCancel}>Fechar</button>
      </div>
    )
  }

  if (pendentes === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-3 flex gap-2">
          <CheckCircle2 size={15} className="text-teal-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-gray-200">Nada a separar</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Os agendamentos deste bem já estão separados em principal e juros, ou o
              financiamento não tem juros provisionados.
            </p>
          </div>
        </div>
        <button type="button" className="btn-secondary w-full" onClick={onCancel}>Fechar</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-3">
        <p className="text-sm text-gray-200">
          {pendentes} agendamento(s) viram {pendentes * 2}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Cada parcela passa a ter uma linha de principal e uma de juros, cada uma na sua
          categoria.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <div>
            <p className="text-gray-600">Principal (prestação)</p>
            <p className="text-gray-300">{fmt(info?.total_principal)}</p>
          </div>
          <div>
            <p className="text-gray-600">Juros (taxa)</p>
            <p className="text-gray-300">{fmt(info?.total_juros)}</p>
          </div>
        </div>
      </div>

      {semCategoria ? (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-3 flex gap-2">
          <AlertTriangle size={15} className="text-despesa shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-gray-200">Categoria de Taxa de Financiamento não definida</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Sem ela os agendamentos de juros nasceriam sem categoria — que é justamente o que
              esta separação existe para resolver. Parametrize o bem antes.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-600">
          O agendamento existente vira o de principal, então o histórico de parcelas já baixadas é
          preservado. Rodar de novo não duplica nada. Recarregue o app depois para ver as linhas
          novas nas outras telas.
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={enviando}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn-primary flex-1 flex items-center justify-center gap-2"
          onClick={enviar}
          disabled={enviando || semCategoria}
        >
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Split size={14} />}
          Separar
        </button>
      </div>
    </div>
  )
}
