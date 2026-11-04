import { useCallback, useEffect, useRef, useState } from 'react'
import { Sparkles, Mic, Square, Camera, ImagePlus, X, Loader2, FileText } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { comprimirImagem, imagemDoClipboard, MAX_IMAGEM_ORIGINAL, ehPdf, lerPdf } from '../../lib/assistente'
import { interpretar } from '../../lib/assistenteApi'
import { EXECUTORES } from './executores'
import LoteAssistente from './LoteAssistente'
import OfertaComposicaoBoleto from './OfertaComposicaoBoleto'
import { Pergunta } from './respostas'
import { useMicrofone, BARRAS, mensagemSemSuporte } from './useMicrofone'
import AjudaTela from '../BoasVindas/AjudaTela'
import { estadoBoasVindas, marcarEtapa } from '../../lib/boasVindasApi'
import { continuacaoDoTexto, aplicarMudanca, rotuloDoAlvo } from '../../lib/assistente/consultaMovimentos'
import { hojeStr } from '../../lib/saldos'

// ASSISTENTE IA: texto, voz (pt-BR), imagem (câmera, galeria ou Ctrl+V de um print) ou PDF (boleto,
// fatura, nota, comprovante, extrato) → /api/assistente. A imagem é reduzida no aparelho (lado maior
// ~1600 px, JPEG ~0,8); o PDF vai inteiro (até 3 MB). Nenhum dos dois é gravado em lugar nenhum: vai
// só ao modelo, para ler o lançamento. Texto junto é opcional.
// O backend só devolve a ferramenta e os parâmetros (registro central: src/lib/assistente/acoes.js). A resposta é
// renderizada pelo executor da ferramenta (executores.jsx): prévia nos formulários existentes,
// consulta calculada AQUI com as funções das telas (nunca valor da IA), ou abrir a tela certa
// (operações 🔴). NUNCA exclui nada. Recebe { onClose, onToast } (ação do "+" e modal do desktop).

const MAX_TEXTO = 1000
const BOLETO = new Set(['criar_agendamento', 'registrar_lancamento', 'baixar_agendamento'])
const juntar = (...partes) => partes.map(p => (p || '').trim()).filter(Boolean).join(' ')

export default function Assistente({ onClose, onToast }) {
  // entrada | carregando | resultado { ferramenta, parametros, extra }
  const [fase, setFase] = useState({ tipo: 'entrada' })
  const [demorando, setDemorando] = useState(false)
  useEffect(() => {
    if (fase.tipo !== 'carregando') return
    const t = setTimeout(() => setDemorando(true), 5000)
    return () => { clearTimeout(t); setDemorando(false) }
  }, [fase.tipo])
  // Perfil ativo: a Conta favorita dele é a conta que a IA pode sugerir sozinha (além dos cartões).
  const { activeProfileId } = useApp()
  const [texto, setTexto] = useState('')
  // Trecho do ditado ainda provisório: já está DENTRO de `texto` (contador e Enviar usam `texto`);
  // aqui só para pintar o fim do campo de cinza enquanto grava.
  const [provisorio, setProvisorio] = useState('')
  // Anexo: imagem { base64, mimeType, preview } ou PDF { base64, mimeType: 'application/pdf', nome, paginas }.
  const [imagem, setImagem] = useState(null)
  const [erro, setErro] = useState('')
  const arquivoRef = useRef(null)
  const galeriaRef = useRef(null)
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
    if (!pedido && !imagem) { setErro('Escreva, fale ou envie uma foto ou PDF.'); return }
    setErro('')
    // Continuação da última consulta ("e no mês passado?", "e em aberto?", "e do Fulano?"): troca só
    // o filtro citado e recalcula no app — sem chamar a IA.
    const mudanca = contexto && !imagem && !extra.respostaPergunta ? continuacaoDoTexto(pedido, hojeStr()) : null
    if (mudanca) {
      setFase({ tipo: 'resultado', ferramenta: 'consultar_movimentos', parametros: { _filtro: aplicarMudanca(contexto.filtro, mudanca) }, extra: {} })
      return
    }
    setFase({ tipo: 'carregando' })
    try {
      const r = await interpretar({
        texto: pedido || undefined,
        imagemBase64: imagem?.base64, mimeType: imagem?.mimeType,
        perfilAtivo: activeProfileId || undefined,
        ...extra,
      })
      const { ferramenta, parametros, ...resto } = r
      // Primeiros passos: "Usar o Assistente uma vez" fica feita no 1º pedido que deu certo.
      const bv = estadoBoasVindas()
      if (bv && bv.progresso?.etapas?.assistente?.estado !== 'feita') marcarEtapa('assistente', 'feita')
      // 'lote': vários lançamentos/agendamentos num pedido (LoteAssistente) — não é ação do registro.
      setFase({ tipo: 'resultado', ferramenta: EXECUTORES[ferramenta] || ferramenta === 'lote' ? ferramenta : 'perguntar', parametros: parametros || {}, extra: resto })
    } catch (err) {
      setErro(err.message)
      setFase({ tipo: 'entrada' })
    }
  }

  const responder = (resposta, pergunta) => {
    if (!resposta.trim()) return
    enviar({ pergunta, respostaPergunta: resposta.trim() })
  }

  // Um anexo por vez (câmera, galeria, arquivo ou colado). Imagem: reduz no aparelho e mostra a
  // miniatura. PDF: vai inteiro (até o limite), com ícone, nome e nº de páginas.
  const carregarImagem = async (arq) => {
    if (!arq) return
    if (ehPdf(arq)) {
      try {
        setImagem(await lerPdf(arq))
        setErro('')
      } catch (err) { setErro(err.message) }
      return
    }
    if (!arq.type.startsWith('image/')) { setErro('Envie uma imagem (foto, print) ou um PDF (boleto, fatura, nota, comprovante).'); return }
    if (arq.size > MAX_IMAGEM_ORIGINAL) { setErro('Imagem muito grande (máximo 20 MB). Tire outra foto ou recorte o print.'); return }
    try {
      const c = await comprimirImagem(arq)
      setImagem({ ...c, preview: URL.createObjectURL(arq) })
      setErro('')
    } catch (err) {
      setErro(err.message)
    }
  }
  const escolherFoto = (e) => {
    const arq = e.target.files?.[0]
    e.target.value = ''
    carregarImagem(arq)
  }
  // Ctrl+V de um print no campo de texto (desktop); colar texto segue normal.
  const colar = (e) => {
    const arq = imagemDoClipboard(e.clipboardData)
    if (!arq) return
    e.preventDefault()
    carregarImagem(arq)
  }

  const novoPedido = () => { setTexto(''); setImagem(null); setFase({ tipo: 'entrada' }) }
  // Contexto da última consulta (filtro resolvido), para continuar por texto/voz. As consultas avisam
  // a cada filtro aplicado (botões inclusive). "Nova consulta" esquece.
  const [contexto, setContexto] = useState(null)
  const aoContexto = useCallback((c) => setContexto(c), [])

  if (fase.tipo === 'resultado' && fase.ferramenta === 'lote') {
    return <LoteAssistente itens={fase.extra?.itens || []} faltantes={fase.extra?.faltantes || null} textoOriginal={texto.trim()} onClose={onClose} onToast={onToast} onNovo={novoPedido} />
  }
  if (fase.tipo === 'resultado' && fase.ferramenta !== 'perguntar') {
    const Executor = EXECUTORES[fase.ferramenta]
    // Boleto (foto/PDF) de uma parcela de condomínio aberta: oferece informar a composição nela.
    const boleto = imagem && BOLETO.has(fase.ferramenta)
    return (
      <>
        {boleto && <OfertaComposicaoBoleto parametros={fase.parametros} imagem={imagem} onClose={onClose} />}
        <Executor
          ferramenta={fase.ferramenta} parametros={fase.parametros} extra={fase.extra} textoOriginal={texto.trim()}
          onClose={onClose} onToast={onToast} onNovo={novoPedido} onResponder={responder} onContexto={aoContexto}
          onTrocar={(ferramenta, parametros) => setFase({ tipo: 'resultado', ferramenta, parametros, extra: {} })}
        />
      </>
    )
  }

  const carregando = fase.tipo === 'carregando'
  // Pedido com vários movimentos demora mais (até ~1 min): passado o tempo de um pedido simples,
  // o botão troca "Entendendo…" por "Lendo…".
  const ehPergunta = fase.tipo === 'resultado' && fase.ferramenta === 'perguntar'
  return (
    <div className="space-y-3 min-w-0">
      {ehPergunta ? (
        <Pergunta parametros={fase.parametros} textoOriginal={texto.trim()} onResponder={responder} onNovo={novoPedido} />
      ) : (
        <>
          <div className="flex items-start gap-1">
          <p className="text-xs text-texto-3 flex-1 min-w-0">
            Descreva um lançamento, uma conta a pagar, uma baixa ou peça um saldo — ou envie foto, print ou PDF de um boleto, fatura, nota ou comprovante. Ex.: “gastei 600 de combustível”, “recebi 220 no Pix do aluguel, dá baixa”, “qual o saldo da conta corrente”.
          </p>
          <AjudaTela pagina="assistente" className="-mt-1.5" />
          </div>
          {contexto && (
            <div className="flex items-center gap-2 rounded-lg border border-borda bg-surface-2 px-3 py-2 text-xs text-texto-2">
              <span className="flex-1 min-w-0 break-words">Continuando a consulta{rotuloDoAlvo(contexto.filtro) ? ` ${rotuloDoAlvo(contexto.filtro)}` : ''}: pode dizer “e no mês passado?”, “e em aberto?”…</span>
              <button type="button" className="shrink-0 text-primary-fg underline" onClick={() => setContexto(null)}>Nova consulta</button>
            </div>
          )}
          <div className="relative">
            {mic.ouvindo ? (
              // Gravando: o campo mostra a transcrição ao vivo — final normal, provisória em cinza.
              <div className="input min-h-[96px] pr-10 whitespace-pre-wrap break-words" aria-live="polite" data-guia="assistente.texto">
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
                data-guia="assistente.texto"
                className="input min-h-[96px] pr-10 resize-none"
                value={texto}
                onChange={e => setTexto(e.target.value.slice(0, MAX_TEXTO))}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !carregando) { e.preventDefault(); enviar() } }}
                onPaste={colar}
                placeholder="Digite o que você quer lançar ou consultar (ou cole um print)"
                disabled={carregando}
                autoFocus
              />
            )}
            <span className="absolute bottom-1.5 right-2 text-[10px] text-texto-3">{texto.length}/{MAX_TEXTO}</span>
          </div>
          {imagem && (
            <div className="flex items-center gap-2 min-w-0">
              {imagem.mimeType === 'application/pdf' ? (
                <span data-testid="anexo-pdf" className="flex items-center gap-2 min-w-0 rounded-lg border border-borda bg-surface-2 px-2.5 py-2">
                  <FileText size={22} className="text-perigo shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-xs text-texto-1 font-medium truncate max-w-[14rem]" title={imagem.nome}>{imagem.nome}</span>
                    <span className="block text-[11px] text-texto-2">PDF{imagem.paginas ? ` · ${imagem.paginas} página${imagem.paginas !== 1 ? 's' : ''}` : ''}</span>
                  </span>
                </span>
              ) : (
                <img src={imagem.preview} alt="Foto enviada" className="h-16 w-16 rounded-lg border border-borda object-cover" />
              )}
              <button type="button" onClick={() => setImagem(null)} className="inline-flex items-center gap-1 text-xs text-texto-2 hover:text-perigo min-h-[40px] shrink-0">
                <X size={13} /> {imagem.mimeType === 'application/pdf' ? 'Remover PDF' : 'Remover foto'}
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
            <button type="button" data-guia="assistente.microfone" onClick={alternarMicrofone} disabled={carregando || mic.transcrevendo}
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
              <button type="button" data-guia="assistente.camera" onClick={() => arquivoRef.current?.click()} disabled={carregando}
                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center border border-borda text-texto-2 bg-surface-2"
                aria-label="Tirar foto" title="Tirar foto (cupom, nota, comprovante, boleto)">
                <Camera size={18} />
              </button>
              <input ref={arquivoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={escolherFoto} />
              <button type="button" data-guia="assistente.anexar" onClick={() => galeriaRef.current?.click()} disabled={carregando}
                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center border border-borda text-texto-2 bg-surface-2"
                aria-label="Anexar imagem ou PDF" title="Anexar imagem ou PDF (print, comprovante Pix, boleto, fatura, nota…)">
                <ImagePlus size={18} />
              </button>
              <input ref={galeriaRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={escolherFoto} />
            </>
          )}
          <button type="button" data-guia="assistente.enviar" onClick={() => enviar()} disabled={carregando || mic.transcrevendo || (!texto.trim() && !imagem)} className="btn-primary flex-1 min-w-0 min-h-[44px] inline-flex items-center justify-center gap-2">
            {carregando ? <><Loader2 size={16} className="animate-spin" /> {demorando ? 'Lendo…' : 'Entendendo…'}</> : <><Sparkles size={16} /> Enviar</>}
          </button>
        </div>
      )}
      {!mic.suportado && !ehPergunta && <p className="text-[11px] text-aviso whitespace-pre-wrap break-words">{mensagemSemSuporte()}</p>}
      {mic.ouvindo && (
        <p className="text-[11px] text-texto-3" aria-live="polite">
          {mic.modo === 'gravacao' ? 'Gravando… toque no botão vermelho para parar (até 2 minutos; para sozinho após uns segundos de silêncio).' : 'Ouvindo… toque no botão vermelho para parar (para sozinho após uns segundos de silêncio).'}
          {mic.restante != null && <span className="text-aviso font-medium"> ⚠ Faltam {mic.restante} s.</span>}
        </p>
      )}
      {mic.transcrevendo && (
        <p className="flex items-center gap-1.5 text-[11px] text-texto-2" aria-live="polite"><Loader2 size={12} className="animate-spin" /> Transcrevendo o áudio…</p>
      )}
      <p className="text-[10px] text-texto-3">O assistente só sugere: nada é salvo sem a sua confirmação na prévia. Ele não exclui nada.</p>
    </div>
  )
}

