import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Send, Loader } from 'lucide-react'
import { checarSiglaPublica, enviarPedidoPublico } from '../lib/clientesApi'
import {
  candidatasSigla, normalizarSigla, problemaSigla, documentoValido, problemaTelefone, mascararTelefone, normalizarTelefone, normalizarDocumento, DOMINIO_CLIENTES, SIGLA_MAX,
} from '../lib/plataforma'

// Página PÚBLICA "Quero me tornar cliente" (/quero-ser-cliente, sem login). Só registra o pedido:
// a aprovação é manual no Controle de Clientes. A API revalida tudo — aqui é só ajuda ao usuário.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VAZIO = {
  nome: '', email: '', telefone: '', nao_whatsapp: false, tipo_pessoa: 'PF', documento: '', empresa: '', como_conheceu: '',
  aceite_termos: false, website: '',
}

// Nome que gera a sugestão: a empresa (PJ) ou o nome da pessoa.
const nomeDaSigla = (f) => (f.tipo_pessoa === 'PJ' && f.empresa.trim() ? f.empresa : f.nome)

function validar(f) {
  if (!f.nome.trim()) return 'Informe o seu nome.'
  if (!EMAIL_RE.test(f.email.trim())) return 'Informe um e-mail válido.'
  if (!normalizarTelefone(f.telefone)) return 'Informe o telefone/WhatsApp com DDD.'
  const tel = problemaTelefone(f.telefone, { naoWhatsApp: f.nao_whatsapp })
  if (tel) return `${tel}.`
  if (!documentoValido(f.tipo_pessoa, f.documento)) return f.tipo_pessoa === 'PJ' ? 'CNPJ inválido.' : 'CPF inválido.'
  if (f.tipo_pessoa === 'PJ' && !f.empresa.trim()) return 'Informe o nome da empresa.'
  const p = problemaSigla(f.sigla)
  if (p) return `Sigla: ${p}.`
  if (!f.aceite_termos) return 'É preciso aceitar os termos de uso e a política de privacidade.'
  return null
}

function Campo({ label, children, ajuda }) {
  return (
    <div>
      <label className="block text-xs text-texto-2 mb-1.5">{label}</label>
      {children}
      {ajuda && <p className="text-[11px] text-texto-3 mt-1">{ajuda}</p>}
    </div>
  )
}

export default function CadastroCliente() {
  const [f, setF] = useState(VAZIO)
  // null = sigla automática (iniciais); string = a pessoa digitou/escolheu.
  const [siglaEscolhida, setSiglaEscolhida] = useState(null)
  // Sugestão do servidor quando a sigla automática já está em uso: { de, para }.
  const [substituta, setSubstituta] = useState({ de: null, para: null })
  // Última resposta de disponibilidade: { sigla, disponivel, motivo, sugestao } ou { sigla, erro }.
  const [checagem, setChecagem] = useState({ sigla: null })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(null)
  const set = (k, v) => { setErro(''); setF(p => ({ ...p, [k]: v })) }
  const escolherSigla = (v) => { setErro(''); setSiglaEscolhida(normalizarSigla(v)) }

  const base = nomeDaSigla(f)
  const siglaAuto = candidatasSigla(base)[0] || ''
  const siglaAtual = siglaEscolhida ?? (substituta.de === siglaAuto && substituta.para ? substituta.para : siglaAuto)
  const problemaAtual = siglaAtual ? problemaSigla(siglaAtual) : null

  // Disponibilidade (debounce). A automática em uso troca pela sugestão do servidor.
  const seq = useRef(0)
  useEffect(() => {
    if (!siglaAtual || problemaSigla(siglaAtual)) return
    const meu = ++seq.current
    const automatica = siglaEscolhida == null
    const t = setTimeout(() => {
      checarSiglaPublica(siglaAtual, base)
        .then(r => {
          if (meu !== seq.current) return
          if (!r.disponivel && automatica && r.sugestao && r.sugestao !== siglaAtual) return setSubstituta({ de: siglaAuto, para: r.sugestao })
          setChecagem({ ...r, sigla: siglaAtual })
        })
        .catch(() => { if (meu === seq.current) setChecagem({ sigla: siglaAtual, erro: true }) })
    }, 450)
    return () => clearTimeout(t)
  }, [siglaAtual, siglaAuto, siglaEscolhida, base])

  const estadoSigla = !siglaAtual ? 'vazia'
    : problemaAtual ? 'invalida'
      : checagem.sigla !== siglaAtual ? 'checando'
        : checagem.erro ? 'erro' : checagem.disponivel ? 'livre' : 'ocupada'
  const sigla = estadoSigla === 'invalida' ? { motivo: problemaAtual } : checagem

  const enviar = async (e) => {
    e.preventDefault()
    const problema = validar({ ...f, sigla: siglaAtual })
    if (problema) return setErro(problema)
    if (estadoSigla === 'ocupada') return setErro('Essa sigla já está em uso. Escolha outra.')
    setEnviando(true)
    try {
      const r = await enviarPedidoPublico({
        ...f, sigla: siglaAtual, telefone: normalizarTelefone(f.telefone), documento: normalizarDocumento(f.tipo_pessoa, f.documento), empresa: f.tipo_pessoa === 'PJ' ? f.empresa : '',
      })
      setEnviado(r.mensagem || 'Recebemos seu pedido, entraremos em contato.')
    } catch (err) {
      if (err.status === 409) setChecagem({ sigla: siglaAtual, disponivel: false, motivo: err.message, sugestao: err.dados?.sugestao })
      setErro(err.status ? err.message : 'Erro de rede. Verifique sua conexão.')
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page px-4">
        <div className="w-full max-w-sm text-center bg-surface border border-borda rounded-xl p-6 shadow-2xl">
          <CheckCircle2 size={40} className="mx-auto text-receita" />
          <h1 className="text-lg font-semibold text-texto-1 mt-3">Pedido enviado</h1>
          <p className="text-sm text-texto-2 mt-2">{enviado}</p>
          <a href="/" className="btn-secondary inline-flex items-center gap-2 mt-5"><ArrowLeft size={14} /> Voltar ao início</a>
        </div>
      </div>
    )
  }

  const statusSigla = {
    checando: <span className="text-texto-3 inline-flex items-center gap-1"><Loader size={11} className="animate-spin" /> Verificando…</span>,
    livre: <span className="text-receita">Disponível</span>,
    invalida: <span className="text-perigo">{sigla.motivo}</span>,
    erro: <span className="text-aviso">Não foi possível verificar agora</span>,
    ocupada: (
      <span className="text-perigo">
        {sigla.motivo || 'Em uso'}
        {sigla.sugestao && (
          <> · <button type="button" className="underline text-primary-fg" onClick={() => escolherSigla(sigla.sugestao)}>usar {sigla.sugestao}</button></>
        )}
      </span>
    ),
  }[estadoSigla]

  return (
    <div className="min-h-screen bg-page px-4 py-8 flex justify-center">
      <div className="w-full max-w-md">
        <a href="/" className="text-xs text-texto-3 hover:text-texto-2 inline-flex items-center gap-1"><ArrowLeft size={12} /> Voltar</a>
        <div className="text-center mt-2 mb-6">
          <h1 className="text-2xl font-bold text-texto-1">Quero me tornar cliente</h1>
          <p className="text-sm text-texto-3 mt-1">Preencha os dados abaixo. Entraremos em contato para concluir.</p>
        </div>

        <form onSubmit={enviar} noValidate className="bg-surface border border-borda rounded-xl p-5 space-y-4 shadow-2xl relative">
          <Campo label="Nome completo">
            <input className="input" autoComplete="name" value={f.nome} onChange={e => set('nome', e.target.value)} autoFocus />
          </Campo>
          <Campo label="E-mail">
            <input className="input" type="email" autoComplete="email" autoCapitalize="none" value={f.email} onChange={e => set('email', e.target.value)} />
          </Campo>
          <Campo label="Telefone / WhatsApp" ajuda="Celular com DDD.">
            <input className="input" type="tel" inputMode="tel" autoComplete="tel" value={f.telefone}
              onChange={e => set('telefone', mascararTelefone(e.target.value))} placeholder="(43) 99999-9999" />
            <label className="flex items-center gap-2 text-xs text-texto-3 mt-1.5 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 accent-primary" checked={f.nao_whatsapp} onChange={e => set('nao_whatsapp', e.target.checked)} />
              Não é WhatsApp (telefone fixo)
            </label>
          </Campo>

          <Campo label="Tipo">
            <div className="grid grid-cols-2 gap-2">
              {[['PF', 'Pessoa física'], ['PJ', 'Pessoa jurídica']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => set('tipo_pessoa', v)}
                  className={`px-3 py-2 rounded-lg border text-sm transition-colors ${f.tipo_pessoa === v ? 'border-primary text-primary-fg bg-primary/10' : 'border-borda-campo text-texto-2 hover:bg-surface-hover'}`}>
                  {l}
                </button>
              ))}
            </div>
          </Campo>
          <Campo label={f.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'}>
            <input className="input" inputMode={f.tipo_pessoa === 'PJ' ? 'text' : 'numeric'} autoCapitalize="characters" value={f.documento}
              onChange={e => set('documento', f.tipo_pessoa === 'PJ' ? e.target.value.toUpperCase() : e.target.value)}
              placeholder={f.tipo_pessoa === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'} />
          </Campo>
          {f.tipo_pessoa === 'PJ' && (
            <Campo label="Empresa">
              <input className="input" autoComplete="organization" value={f.empresa} onChange={e => set('empresa', e.target.value)} />
            </Campo>
          )}

          <Campo label="Sigla desejada" ajuda={<>Endereço do seu ambiente: <span className="font-mono">{siglaAtual || 'sigla'}.{DOMINIO_CLIENTES}</span></>}>
            <input className="input font-mono" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={SIGLA_MAX}
              value={siglaAtual} onChange={e => escolherSigla(e.target.value)} />
            <p className="text-[11px] mt-1 min-h-[1em]">{statusSigla}</p>
          </Campo>

          <Campo label="Como conheceu o Finup? (opcional)">
            <input className="input" value={f.como_conheceu} onChange={e => set('como_conheceu', e.target.value)} />
          </Campo>

          {/* Anti-robô: invisível para pessoas; robô que preenche tudo é descartado pela API. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
            <label>Site <input tabIndex={-1} autoComplete="off" name="website" value={f.website} onChange={e => set('website', e.target.value)} /></label>
          </div>

          <label className="flex items-start gap-2 text-sm text-texto-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 mt-0.5 accent-primary shrink-0" checked={f.aceite_termos} onChange={e => set('aceite_termos', e.target.checked)} />
            <span>
              Li e aceito os <a href="/termos" target="_blank" rel="noopener" className="underline text-primary-fg">termos de uso</a> e
              a <a href="/privacidade" target="_blank" rel="noopener" className="underline text-primary-fg">política de privacidade</a>.
            </span>
          </label>

          {erro && <p className="text-xs text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}

          <button type="submit" disabled={enviando} className="btn-primary w-full flex items-center justify-center gap-2">
            <Send size={15} /> {enviando ? 'Enviando…' : 'Enviar pedido'}
          </button>
        </form>
      </div>
    </div>
  )
}
