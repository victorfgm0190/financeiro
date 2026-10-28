import { useEffect, useRef, useState } from 'react'
import { Sparkles, Mic, MicOff, Camera, X, Send, Loader2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import { saldosDaConta, contaRecalculavel } from '../../lib/saldos'
import { comprimirImagem } from '../../lib/assistente'
import { interpretar } from '../../lib/assistenteApi'
import PreviaAssistente from './PreviaAssistente'

// ASSISTENTE IA (etapa 1): texto, voz (Web Speech API, pt-BR) ou foto → /api/assistente, que só
// devolve a ferramenta e os parâmetros. Lançamento/agendamento → prévia nos formulários existentes;
// saldo → calculado AQUI, com a mesma lógica das telas (nunca pela IA); pergunta → botões.
// Recebe { onClose, onToast } (ação do "+" do mobile e modal do desktop).

const MAX_TEXTO = 1000
const Reconhecimento = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

export default function Assistente({ onClose, onToast }) {
  const [fase, setFase] = useState({ tipo: 'entrada' }) // entrada | carregando | pergunta | previa | saldo
  const [texto, setTexto] = useState('')
  const [imagem, setImagem] = useState(null) // { base64, mimeType, preview }
  const [erro, setErro] = useState('')
  const [ouvindo, setOuvindo] = useState(false)
  const [outraResposta, setOutraResposta] = useState('')
  const reconhecimento = useRef(null)
  const arquivoRef = useRef(null)

  useEffect(() => () => { try { reconhecimento.current?.stop() } catch { /* já parado */ } }, [])
  useEffect(() => () => { if (imagem?.preview) URL.revokeObjectURL(imagem.preview) }, [imagem])

  const enviar = async (extra = {}) => {
    if (!texto.trim() && !imagem) { setErro('Escreva, fale ou envie uma foto.'); return }
    setErro('')
    setFase({ tipo: 'carregando' })
    try {
      const r = await interpretar({
        texto: texto.trim() || undefined,
        imagemBase64: imagem?.base64, mimeType: imagem?.mimeType,
        ...extra,
      })
      const p = r.parametros || {}
      if (r.ferramenta === 'registrar_lancamento' || r.ferramenta === 'criar_agendamento') setFase({ tipo: 'previa', ferramenta: r.ferramenta, sugestao: p })
      else if (r.ferramenta === 'consultar_saldo') setFase({ tipo: 'saldo', contaId: p.conta_id || '' })
      else setFase({ tipo: 'pergunta', pergunta: p.pergunta, opcoes: p.opcoes || [] })
    } catch (err) {
      setErro(err.message)
      setFase({ tipo: 'entrada' })
    }
  }

  const responder = (resposta) => {
    if (!resposta.trim()) return
    setOutraResposta('')
    enviar({ pergunta: fase.pergunta, respostaPergunta: resposta.trim() })
  }

  const alternarMicrofone = () => {
    if (!Reconhecimento) { setErro('Este navegador não reconhece voz. Digite o pedido.'); return }
    if (ouvindo) { reconhecimento.current?.stop(); return }
    const rec = new Reconhecimento()
    rec.lang = 'pt-BR'
    rec.interimResults = false
    rec.continuous = false
    const base = texto.trim()
    rec.onresult = (e) => {
      const falado = Array.from(e.results).map(r => r[0]?.transcript || '').join(' ').trim()
      setTexto(`${base ? `${base} ` : ''}${falado}`.slice(0, MAX_TEXTO))
    }
    rec.onerror = (e) => { if (e.error !== 'aborted' && e.error !== 'no-speech') setErro('Não consegui ouvir. Verifique a permissão do microfone.') }
    rec.onend = () => setOuvindo(false)
    reconhecimento.current = rec
    setErro('')
    setOuvindo(true)
    rec.start()
  }

  const escolherFoto = async (e) => {
    const arq = e.target.files?.[0]
    e.target.value = ''
    if (!arq) return
    if (!arq.type.startsWith('image/')) { setErro('Envie uma imagem (foto do comprovante ou boleto).'); return }
    try {
      const c = await comprimirImagem(arq)
      setImagem({ ...c, preview: URL.createObjectURL(arq) })
      setErro('')
    } catch (err) {
      setErro(err.message)
    }
  }

  if (fase.tipo === 'previa') {
    return <PreviaAssistente ferramenta={fase.ferramenta} sugestao={fase.sugestao} textoOriginal={texto.trim()} onClose={onClose} onToast={onToast} />
  }
  if (fase.tipo === 'saldo') return <SaldoAssistente contaInicial={fase.contaId} onClose={onClose} onNovo={() => { setTexto(''); setImagem(null); setFase({ tipo: 'entrada' }) }} />

  const carregando = fase.tipo === 'carregando'
  return (
    <div className="space-y-3">
      {fase.tipo === 'pergunta' ? (
        <div className="space-y-2">
          <p className="text-sm text-texto-1 flex items-start gap-2"><Sparkles size={15} className="mt-0.5 shrink-0 text-primary-fg" />{fase.pergunta}</p>
          {fase.opcoes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {fase.opcoes.map(o => (
                <button key={o} type="button" onClick={() => responder(o)} className="btn-secondary text-xs min-h-[40px] px-3">{o}</button>
              ))}
            </div>
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); responder(outraResposta) }}>
            <input className="input flex-1" value={outraResposta} onChange={e => setOutraResposta(e.target.value.slice(0, 300))} placeholder="Digite outra resposta" />
            <button className="btn-primary px-3" aria-label="Responder" disabled={!outraResposta.trim()}><Send size={15} /></button>
          </form>
          <p className="text-[11px] text-texto-3">Pedido: “{texto}”</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-texto-3">
            Descreva um lançamento, uma conta a pagar ou peça um saldo. Ex.: “gastei 600 de combustível”, “crie contas a pagar de 250 para Paulo Ferro”, “qual o saldo da conta Itaú”.
          </p>
          <div className="relative">
            <textarea
              className="input min-h-[96px] pr-10 resize-none"
              value={texto}
              onChange={e => setTexto(e.target.value.slice(0, MAX_TEXTO))}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !carregando) { e.preventDefault(); enviar() } }}
              placeholder="Digite o que você quer lançar ou consultar"
              disabled={carregando}
              autoFocus
            />
            <span className="absolute bottom-1.5 right-2 text-[10px] text-texto-3">{texto.length}/{MAX_TEXTO}</span>
          </div>
          {imagem && (
            <div className="flex items-center gap-2">
              <img src={imagem.preview} alt="Foto enviada" className="h-16 w-16 rounded-lg border border-borda object-cover" />
              <button type="button" onClick={() => setImagem(null)} className="inline-flex items-center gap-1 text-xs text-texto-2 hover:text-perigo min-h-[40px]">
                <X size={13} /> Remover foto
              </button>
            </div>
          )}
        </>
      )}

      {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}

      {fase.tipo !== 'pergunta' && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={alternarMicrofone} disabled={carregando}
            className={`w-11 h-11 rounded-full flex items-center justify-center border ${ouvindo ? 'border-perigo text-perigo bg-perigo-bg animate-pulse' : 'border-borda text-texto-2 bg-surface-2'}`}
            aria-label={ouvindo ? 'Parar de ouvir' : 'Falar'} title={ouvindo ? 'Parar de ouvir' : 'Falar (pt-BR)'}>
            {ouvindo ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button type="button" onClick={() => arquivoRef.current?.click()} disabled={carregando}
            className="w-11 h-11 rounded-full flex items-center justify-center border border-borda text-texto-2 bg-surface-2"
            aria-label="Foto ou arquivo" title="Foto do comprovante ou boleto">
            <Camera size={18} />
          </button>
          <input ref={arquivoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={escolherFoto} />
          <button type="button" onClick={() => enviar()} disabled={carregando || (!texto.trim() && !imagem)} className="btn-primary flex-1 min-h-[44px] inline-flex items-center justify-center gap-2">
            {carregando ? <><Loader2 size={16} className="animate-spin" /> Entendendo…</> : <><Sparkles size={16} /> Enviar</>}
          </button>
        </div>
      )}
      <p className="text-[10px] text-texto-3">O assistente só sugere: nada é salvo sem a sua confirmação na prévia.</p>
    </div>
  )
}

// Saldo da conta: mesma fonte das telas — saldosDaConta (a do recalcularSaldo: saldo até hoje e com
// os lançamentos futuros) e getAccountSaldos (final do ciclo, com os agendamentos pendentes).
function SaldoAssistente({ contaInicial, onClose, onNovo }) {
  const { accounts, transactions, getAccountSaldos } = useApp()
  const [contaId, setContaId] = useState(contaInicial)
  const ativas = (accounts || []).filter(a => a.active !== false)
  const conta = ativas.find(a => a.id === contaId) || null
  const s = conta && contaRecalculavel(conta) ? saldosDaConta(conta.id, conta.initialBalance, transactions) : null
  const ciclo = conta ? getAccountSaldos(conta) : null

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Conta{!contaInicial && <span className="ml-1.5 text-[11px] font-medium text-aviso">● escolha</span>}</label>
        <select className="input" value={contaId} onChange={e => setContaId(e.target.value)}>
          <option value="">Selecione a conta...</option>
          {ativas.map(a => <option key={a.id} value={a.id}>{a.apelido || a.name}</option>)}
        </select>
      </div>
      {conta && (s ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-borda bg-surface-2 px-3 py-2">
            <p className="text-[11px] text-texto-3">Saldo atual (hoje)</p>
            <p className={`text-lg font-semibold ${s.balance < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(s.balance)}</p>
          </div>
          <div className="rounded-lg border border-borda bg-surface-2 px-3 py-2">
            <p className="text-[11px] text-texto-3">Saldo futuro (lançamentos à frente)</p>
            <p className={`text-lg font-semibold ${s.projected < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(s.projected)}</p>
          </div>
          {ciclo?.applicable && (
            <div className="col-span-2 rounded-lg border border-borda bg-surface-2 px-3 py-2">
              <p className="text-[11px] text-texto-3">Final do ciclo (com agendamentos pendentes até {ciclo.cycleEnd.split('-').reverse().join('/')})</p>
              <p className={`text-base font-semibold ${ciclo.saldoFinalCiclo < 0 ? 'text-despesa' : 'text-texto-1'}`}>{fmt(ciclo.saldoFinalCiclo)}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-texto-3">Esta conta não tem saldo de conta corrente ({conta.type === 'credit' ? 'é cartão de crédito — veja a fatura na tela Cartão' : 'tipo sem saldo calculado'}).</p>
      ))}
      <div className="flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onNovo}>Novo pedido</button>
        <button type="button" className="btn-primary flex-1" onClick={onClose}>Fechar</button>
      </div>
    </div>
  )
}
