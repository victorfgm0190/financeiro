import { useState } from 'react'
import { Receipt, Loader2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { rotuloContrato } from '../../lib/contratos/parcelas'
import { parcelaDoBoleto, boletoDosParametros } from '../../lib/contratos/boletoParcela'
import { vencimentoParcela } from '../../lib/contratos/composicaoAberta'
import { extrairItensDeImagem } from '../../lib/contratos/imagemBoleto'

// Boleto recebido no chat do Assistente (foto/PDF) que corresponde a uma parcela de condomínio
// ABERTA de um contrato: oferece "Informar composição nesta parcela" — lê os itens do mesmo anexo e
// abre a MESMA prévia da ficha/Agendamentos (ComposicaoParcelaHost). Só parecida: apenas sugere.
// Nada é gravado sem o "Confirmar composição" da prévia.
export default function OfertaComposicaoBoleto({ parametros, imagem, onClose }) {
  const { contratosHabilitado, contratos, schedules, abrirComposicaoParcela, abrirFichaContrato, pode } = useApp()
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState('')
  if (!contratosHabilitado || !imagem?.base64 || !pode?.('contratos', 'editar')) return null
  const { forte, parecidas } = parcelaDoBoleto(boletoDosParametros(parametros), contratos, schedules)
  if (!forte && !parecidas.length) return null

  const informar = async () => {
    setLendo(true)
    setErro('')
    try {
      const leitura = await extrairItensDeImagem(imagem)
      abrirComposicaoParcela(forte.parcela.id, { leitura })
      onClose?.()
    } catch (err) {
      setErro(err?.message || 'Não consegui ler os itens do boleto.')
      setLendo(false)
    }
  }
  const desc = ({ parcela, contrato }) => `${rotuloContrato(contrato)} · condomínio de ${fmtDate(vencimentoParcela(parcela))} (${fmt(parcela.amount)})`

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5 text-xs space-y-2 mb-3" data-testid="oferta-composicao">
      {forte ? (
        <>
          <p className="text-texto-1">
            <Receipt size={12} className="inline mr-1 -mt-0.5" />
            Este boleto é da parcela aberta <strong>{desc(forte)}</strong>. Quer informar os itens dele nessa parcela?
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary text-xs inline-flex items-center gap-1.5 min-h-[40px]" disabled={lendo} onClick={informar}>
              {lendo ? <><Loader2 size={12} className="animate-spin" /> Lendo os itens…</> : 'Informar composição nesta parcela'}
            </button>
            {erro && (
              <button type="button" className="btn-secondary text-xs min-h-[40px]" onClick={() => { abrirComposicaoParcela(forte.parcela.id); onClose?.() }}>
                Abrir sem a leitura (digitar os itens)
              </button>
            )}
          </div>
          {erro && <p className="text-perigo">{erro}</p>}
        </>
      ) : (
        <p className="text-texto-2">
          Parece com {parecidas.length > 1 ? 'parcelas abertas de condomínio' : 'a parcela aberta de condomínio'}:{' '}
          {parecidas.map((c, i) => (
            <button key={c.parcela.id} type="button" className="text-primary-fg underline mr-1" onClick={() => { abrirFichaContrato(c.contrato.id); onClose?.() }}>
              {desc(c)}{i < parecidas.length - 1 ? ';' : ''}
            </button>
          ))}
          . Se for o boleto dela, informe a composição pela ficha do contrato ou em Agendamentos.
        </p>
      )}
    </div>
  )
}
