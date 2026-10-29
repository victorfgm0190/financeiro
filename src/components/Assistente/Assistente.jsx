import { useEffect, useRef, useState } from 'react'
import { Sparkles, Mic, Square, Camera, X, Loader2 } from 'lucide-react'
import { comprimirImagem } from '../../lib/assistente'
import { interpretar } from '../../lib/assistenteApi'
import { EXECUTORES } from './executores'
import { Pergunta } from './respostas'
import { useMicrofone, BARRAS, mensagemSemSuporte } from './useMicrofone'

// ASSISTENTE IA: texto, voz (Web Speech API, pt-BR) ou foto → /api/assistente, que só devolve a
// ferramenta e os parâmetros (registro central: src/lib/assistente/acoes.js). A resposta é
// renderizada pelo executor da ferramenta (executores.jsx): prévia nos formulários existentes,
// consulta calculada AQUI com as funções das telas (nunca valor da IA), ou abrir a tela certa
// (operações 🔴). NUNCA exclui nada. Recebe { onClose, onToast } (ação do "+" e modal do desktop).

const MAX_TEXTO = 1000
const juntar = (...partes) => partes.map(p => (p || '').trim()).filter(Boolean).join(' ')

export default function Assistente({ onClose, onToast }) {
  // entrada | carregando | resultado { ferramenta, parametros, extra }
  const [fase, setFase] = useState({ tipo: 'entrada' })
  const [texto, setTexto] = useState('')
  // Trecho do ditado ainda provisório: já está DENTRO de `texto` (contador e Enviar usam `texto`);
  // aqui só para pintar o fim do campo de cinza enquanto grava.
  const [provisorio, setProvisorio] = useState('')
  const [imagem, setImagem] = useState(null) // { base64, mimeType, preview }
  const [erro, setErro] = useState('')
  const arquivoRef = useRef(null)
  const baseFala = useRef('')

  // Ditado → o MESMO estado do campo: texto digitado antes + final + provisório (o Safari às vezes
  // nem finaliza o trecho — ele fica no texto do mesmo jeito).
  const mic = useMicrofone({
    onTexto: (final, prov) => {
      setTexto(juntar(baseFala.current, final, prov).slice(0, MAX_TEXTO))
      setProvisorio(prov)
    },
    onErro: setErro,
  })
  const provisorioVisivel = mic.ouvindo ? provisorio : ''

  useEffect(() => () => { if (imagem?.preview) URL.revokeObjectURL(imagem.preview) }, [imagem])

  const alternarMicrofone = () => {
    if (mic.ouvindo) { mic.parar(); return }
    baseFala.current = texto
    setProvisorio('')
    setErro('')
    mic.iniciar()
  }

  const enviar = async (extra = {}) => {
    if (mic.ouvindo) mic.parar()
    const pedido = texto.trim()
    if (!pedido && !imagem) { setErro('Escreva, fale ou envie uma foto.'); return }
    setErro('')
    setFase({ tipo: 'carregando' })
    try {
      const r = await interpretar({
        texto: pedido || undefined,
        imagemBase64: imagem?.base64, mimeType: imagem?.mimeType,
        ...extra,
      })
      const { ferramenta, parametros, ...resto } = r
      setFase({ tipo: 'resultado', ferramenta: EXECUTORES[ferramenta] ? ferramenta : 'perguntar', parametros: parametros || {}, extra: resto })
    } catch (err) {
      setErro(err.message)
      setFase({ tipo: 'entrada' })
    }
  }

  const responder = (resposta, pergunta) => {
    if (!resposta.trim()) return
    enviar({ pergunta, respostaPergunta: resposta.trim() })
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

  const novoPedido = () => { setTexto(''); setImagem(null); setFase({ tipo: 'entrada' }) }

  if (fase.tipo === 'resultado' && fase.ferramenta !== 'perguntar') {
    const Executor = EXECUTORES[fase.ferramenta]
    return (
      <Executor
        ferramenta={fase.ferramenta} parametros={fase.parametros} extra={fase.extra} textoOriginal={texto.trim()}
        onClose={onClose} onToast={onToast} onNovo={novoPedido} onResponder={responder}
        onTrocar={(ferramenta, parametros) => setFase({ tipo: 'resultado', ferramenta, parametros, extra: {} })}
      />
    )
  }

  const carregando = fase.tipo === 'carregando'
  const ehPergunta = fase.tipo === 'resultado' && fase.ferramenta === 'perguntar'
  return (
    <div className="space-y-3 min-w-0">
      {ehPergunta ? (
        <Pergunta parametros={fase.parametros} textoOriginal={texto.trim()} onResponder={responder} onNovo={novoPedido} />
      ) : (
        <>
          <p className="text-xs text-texto-3">
            Descreva um lançamento, uma conta a pagar, uma baixa ou peça um saldo. Ex.: “gastei 600 de combustível”, “o Carlos me pagou 220 no Pix, dá baixa”, “qual o saldo da conta Itaú”.
          </p>
          <div className="relative">
            {mic.ouvindo ? (
              // Gravando: o campo mostra a transcrição ao vivo — final normal, provisória em cinza.
              <div className="input min-h-[96px] pr-10 whitespace-pre-wrap break-words" aria-live="polite">
                {(() => {
                  // `texto` já inclui o provisório no fim: a parte final sai em cinza.
                  const corte = provisorioVisivel && texto.endsWith(provisorioVisivel) ? texto.length - provisorioVisivel.length : texto.length
                  return texto
                    ? <><span className="text-texto-1">{texto.slice(0, corte)}</span><span className="text-texto-3">{texto.slice(corte)}</span></>
                    : <span className="text-texto-3">Pode falar…</span>
                })()}
              </div>
            ) : (
              <textarea
                className="input min-h-[96px] pr-10 resize-none"
                value={texto}
                onChange={e => setTexto(e.target.value.slice(0, MAX_TEXTO))}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !carregando) { e.preventDefault(); enviar() } }}
                placeholder="Digite o que você quer lançar ou consultar"
                disabled={carregando}
                autoFocus
              />
            )}
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

      {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">{erro}</p>}

      {!ehPergunta && (
        <div className="flex items-center gap-2">
          <span className="relative inline-flex shrink-0">
            {mic.ouvindo && mic.pulso && <span className="absolute inset-0 rounded-full bg-perigo/40 animate-ping" aria-hidden />}
            <button type="button" onClick={alternarMicrofone} disabled={carregando}
              className={`relative w-11 h-11 rounded-full flex items-center justify-center border transition-colors ${mic.ouvindo ? 'border-perigo bg-perigo text-white' : 'border-borda text-texto-2 bg-surface-2'}`}
              aria-label={mic.ouvindo ? 'Parar de ouvir' : 'Falar'} aria-pressed={mic.ouvindo} title={mic.ouvindo ? 'Parar de ouvir' : 'Falar (pt-BR)'}>
              {mic.ouvindo ? <Square size={16} /> : <Mic size={18} />}
            </button>
          </span>
          {mic.ouvindo && !mic.pulso && (
            <span className="flex items-center gap-0.5 h-8 shrink-0" aria-hidden>
              {Array.from({ length: BARRAS }, (_, i) => (
                <span key={i} className="w-1 rounded-full bg-perigo transition-[height] duration-75"
                  style={{ height: `${4 + Math.round((mic.niveis[i] || 0) * 24)}px` }} />
              ))}
            </span>
          )}
          {!mic.ouvindo && (
            <>
              <button type="button" onClick={() => arquivoRef.current?.click()} disabled={carregando}
                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center border border-borda text-texto-2 bg-surface-2"
                aria-label="Foto ou arquivo" title="Foto do comprovante ou boleto">
                <Camera size={18} />
              </button>
              <input ref={arquivoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={escolherFoto} />
            </>
          )}
          <button type="button" onClick={() => enviar()} disabled={carregando || (!texto.trim() && !imagem)} className="btn-primary flex-1 min-w-0 min-h-[44px] inline-flex items-center justify-center gap-2">
            {carregando ? <><Loader2 size={16} className="animate-spin" /> Entendendo…</> : <><Sparkles size={16} /> Enviar</>}
          </button>
        </div>
      )}
      {!mic.suportado && !ehPergunta && <p className="text-[11px] text-aviso whitespace-pre-wrap break-words">{mensagemSemSuporte()}</p>}
      {mic.ouvindo && <p className="text-[11px] text-texto-3">Ouvindo… toque no botão vermelho para parar (para sozinho após uns segundos de silêncio).</p>}
      <p className="text-[10px] text-texto-3">O assistente só sugere: nada é salvo sem a sua confirmação na prévia. Ele não exclui nada.</p>
    </div>
  )
}

