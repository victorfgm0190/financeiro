import { useEffect, useRef, useState } from 'react'
import { Sparkles, Mic, Square, Camera, X, Send, Loader2, ChevronRight } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { saldosDaConta, contaRecalculavel } from '../../lib/saldos'
import { rotuloParcela } from '../../lib/numeroParcela'
import { comprimirImagem, candidatosValidos, sugestaoLancamentoDaBaixa } from '../../lib/assistente'
import { interpretar } from '../../lib/assistenteApi'
import PreviaAssistente from './PreviaAssistente'
import PreviaBaixa from './PreviaBaixa'
import { useMicrofone, BARRAS, mensagemSemSuporte } from './useMicrofone'

// ASSISTENTE IA (etapas 1 e 1.1): texto, voz (Web Speech API, pt-BR) ou foto → /api/assistente, que
// só devolve a ferramenta e os parâmetros. Lançamento/agendamento → prévia nos formulários
// existentes; baixa → o modal Registrar Agendamento da tela de Agendamentos; saldo → calculado AQUI,
// com a mesma lógica das telas (nunca pela IA); pergunta → botões. NUNCA exclui nada.
// Recebe { onClose, onToast } (ação do "+" do mobile e modal do desktop).

const MAX_TEXTO = 1000
const juntar = (...partes) => partes.map(p => (p || '').trim()).filter(Boolean).join(' ')

export default function Assistente({ onClose, onToast }) {
  const { schedules, getNextOccurrences } = useApp()
  // entrada | carregando | pergunta | previa | baixa | saldo
  const [fase, setFase] = useState({ tipo: 'entrada' })
  const [texto, setTexto] = useState('')
  // Trecho do ditado ainda provisório: já está DENTRO de `texto` (contador e Enviar usam `texto`);
  // aqui só para pintar o fim do campo de cinza enquanto grava.
  const [provisorio, setProvisorio] = useState('')
  const [imagem, setImagem] = useState(null) // { base64, mimeType, preview }
  const [erro, setErro] = useState('')
  const [outraResposta, setOutraResposta] = useState('')
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
      const p = r.parametros || {}
      if (r.ferramenta === 'registrar_lancamento' || r.ferramenta === 'criar_agendamento') setFase({ tipo: 'previa', ferramenta: r.ferramenta, sugestao: p })
      else if (r.ferramenta === 'baixar_agendamento') {
        const candidatos = candidatosValidos(r.candidatos, schedules, getNextOccurrences)
        setFase(candidatos.length === 1
          ? { tipo: 'baixa', criterio: p, candidato: candidatos[0] }
          : { tipo: 'baixa', criterio: p, candidatos })
      } else if (r.ferramenta === 'consultar_saldo') setFase({ tipo: 'saldo', contaId: p.conta_id || '' })
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

  if (fase.tipo === 'previa') {
    return <PreviaAssistente ferramenta={fase.ferramenta} sugestao={fase.sugestao} textoOriginal={texto.trim()} onClose={onClose} onToast={onToast} />
  }
  if (fase.tipo === 'baixa' && fase.candidato) {
    return <PreviaBaixa criterio={fase.criterio} candidato={fase.candidato} textoOriginal={texto.trim()} onClose={onClose} onToast={onToast} />
  }
  if (fase.tipo === 'baixa') {
    return (
      <EscolherBaixa
        criterio={fase.criterio}
        candidatos={fase.candidatos}
        onEscolher={(c) => setFase({ ...fase, candidato: c })}
        onLancamento={() => setFase({ tipo: 'previa', ferramenta: 'registrar_lancamento', sugestao: sugestaoLancamentoDaBaixa(fase.criterio) })}
        onNovo={novoPedido}
      />
    )
  }
  if (fase.tipo === 'saldo') return <SaldoAssistente contaInicial={fase.contaId} onClose={onClose} onNovo={novoPedido} />

  const carregando = fase.tipo === 'carregando'
  return (
    <div className="space-y-3 min-w-0">
      {fase.tipo === 'pergunta' ? (
        <div className="space-y-2">
          <div className="flex items-start gap-2 text-sm text-texto-1">
            <Sparkles size={15} className="mt-0.5 shrink-0 text-primary-fg" />
            <p className="flex-1 min-w-0 whitespace-pre-wrap break-words">{fase.pergunta}</p>
          </div>
          {fase.opcoes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {fase.opcoes.map(o => (
                <button key={o} type="button" onClick={() => responder(o)}
                  className="btn-secondary text-xs min-h-[40px] px-3 py-2 h-auto max-w-full whitespace-normal break-words text-left">{o}</button>
              ))}
            </div>
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); responder(outraResposta) }}>
            <input className="input flex-1 min-w-0" value={outraResposta} onChange={e => setOutraResposta(e.target.value.slice(0, 300))} placeholder="Digite outra resposta" />
            <button className="btn-primary px-3 shrink-0" aria-label="Responder" disabled={!outraResposta.trim()}><Send size={15} /></button>
          </form>
          <p className="text-[11px] text-texto-3 whitespace-pre-wrap break-words">Pedido: “{texto}”</p>
          <button type="button" onClick={novoPedido} className="text-xs text-texto-2 hover:text-texto-1 min-h-[40px]">Novo pedido</button>
        </div>
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

      {fase.tipo !== 'pergunta' && (
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
      {!mic.suportado && fase.tipo !== 'pergunta' && <p className="text-[11px] text-aviso whitespace-pre-wrap break-words">{mensagemSemSuporte()}</p>}
      {mic.ouvindo && <p className="text-[11px] text-texto-3">Ouvindo… toque no botão vermelho para parar (para sozinho após uns segundos de silêncio).</p>}
      <p className="text-[10px] text-texto-3">O assistente só sugere: nada é salvo sem a sua confirmação na prévia. Ele não exclui nada.</p>
    </div>
  )
}

// Vários agendamentos (ou nenhum) para a baixa: lista para escolher; nenhum → lançamento avulso.
function EscolherBaixa({ criterio, candidatos, onEscolher, onLancamento, onNovo }) {
  const { schedules } = useApp()
  const porId = new Map((schedules || []).map(s => [s.id, s]))
  const quem = criterio.favorecido || criterio.descricao || 'esse pedido'
  return (
    <div className="space-y-3 min-w-0">
      {candidatos.length ? (
        <>
          <p className="text-sm text-texto-1 whitespace-pre-wrap break-words">Achei {candidatos.length} agendamentos pendentes para {quem}{criterio.valor_informado || criterio.valor_min ? ' (o de valor mais próximo primeiro)' : ''}. Qual recebe a baixa?</p>
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {candidatos.map(c => {
              const s = porId.get(c.schedule_id)
              const parcela = s ? rotuloParcela(s, c.ocorrencia) : null
              return (
                <li key={`${c.schedule_id}@${c.ocorrencia}`}>
                  <button type="button" onClick={() => onEscolher(c)} className="w-full flex items-center gap-2 px-3 py-2 min-h-[52px] text-left">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-texto-1 break-words">{c.descricao}{parcela ? ` · ${parcela}` : ''}</p>
                      <p className="text-[11px] text-texto-3 break-words">{c.favorecido || 'Sem favorecido'}</p>
                      <p className="text-[11px] break-words">
                        <span className={c.tipo === 'receita' ? 'text-receita' : 'text-despesa'}>{c.tipo === 'receita' ? 'Receita' : 'Despesa'} {fmt(c.valor)}</span>
                        <span className={c.atrasado ? 'text-aviso' : 'text-texto-3'}> · {c.atrasado ? 'venceu' : 'vence'} {fmtDate(c.data)}</span>
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-texto-3" />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="text-sm text-texto-1 whitespace-pre-wrap break-words">
          Não achei agendamento pendente com “{quem}” no favorecido ou na descrição (vencimento entre 30 dias atrás e 15 dias à frente{criterio.valor_exato ? `, valor ${fmt(criterio.valor_informado)}` : ''}). Quer registrar como um lançamento avulso?
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onNovo}>Novo pedido</button>
        <button type="button" className="btn-primary flex-1" onClick={onLancamento}>Registrar como lançamento</button>
      </div>
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
