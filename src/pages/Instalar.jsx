import { useEffect, useState } from 'react'
import { Smartphone, Monitor, Share, Download, CheckCircle2, AlertTriangle, Copy, Check, PlusSquare } from 'lucide-react'
import { detectarAparelho, estaInstalado, pedidoDeInstalacao, aoMudarPedido, pedirInstalacao } from '../lib/instalacao'

// /instalar — página PÚBLICA (sem login) com o passo a passo para instalar o Finup (PWA). Abre no
// endereço do ambiente (<sigla>.finup.app.br ou www): o app instalado abre esse mesmo endereço.
// Mostra primeiro o passo a passo do aparelho detectado; no Android/Chrome, "Instalar agora" quando
// o navegador oferece; no iPhone, avisa que precisa ser o Safari; já instalado → aviso.
// `aparelho`/`instalado`/`endereco` só para testes (renderização sem navegador).
const temJanela = typeof window !== 'undefined'

function Passos({ itens }) {
  return (
    <ol className="space-y-2.5">
      {itens.map((t, i) => (
        <li key={i} className="flex gap-3 text-sm text-texto-1">
          <span className="shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary-fg text-xs font-semibold flex items-center justify-center">{i + 1}</span>
          <span className="pt-0.5 leading-relaxed">{t}</span>
        </li>
      ))}
    </ol>
  )
}

function Cartao({ icone: Icone, titulo, destaque, children }) {
  return (
    <section className={`bg-surface border rounded-xl p-5 space-y-4 ${destaque ? 'border-primary/50 shadow-2xl' : 'border-borda'}`}>
      <h2 className="flex items-center gap-2 text-base font-semibold text-texto-1">
        <Icone size={18} className={destaque ? 'text-primary-fg' : 'text-texto-3'} /> {titulo}
        {destaque && <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary-fg">este aparelho</span>}
      </h2>
      {children}
    </section>
  )
}

export default function Instalar({ aparelho: aparelhoTeste, instalado: instaladoTeste, endereco: enderecoTeste } = {}) {
  const [aparelho] = useState(() => aparelhoTeste ?? (temJanela ? detectarAparelho(navigator.userAgent, { maxTouchPoints: navigator.maxTouchPoints }) : { tipo: 'computador' }))
  const [instalado] = useState(() => instaladoTeste ?? estaInstalado())
  const [endereco] = useState(() => enderecoTeste ?? (temJanela ? window.location.host : 'finup.app.br'))
  const [podeInstalar, setPodeInstalar] = useState(() => !!(temJanela && pedidoDeInstalacao()))
  const [resultado, setResultado] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => aoMudarPedido((e) => setPodeInstalar(!!e)), [])

  const instalarAgora = async () => {
    const r = await pedirInstalacao()
    setPodeInstalar(false)
    setResultado(r === 'accepted' ? 'Pronto! O Finup foi instalado — procure o ícone na tela de início.' : r === 'dismissed' ? 'Instalação cancelada. Você pode instalar depois pelo menu do navegador.' : '')
  }
  const copiar = async () => {
    try { await navigator.clipboard.writeText(`https://${endereco}`); setCopiado(true) } catch { setCopiado(false) }
  }

  const url = <span className="font-mono text-[13px] break-all">{endereco}</span>
  const botaoInstalar = podeInstalar && (
    <button type="button" onClick={instalarAgora} className="btn-primary w-full flex items-center justify-center gap-2">
      <Download size={16} /> Instalar agora
    </button>
  )

  const iphone = (destaque) => (
    <Cartao key="iphone" icone={Smartphone} titulo="iPhone" destaque={destaque}>
      {destaque && aparelho.safari === false && (
        <div className="text-xs text-texto-1 bg-aviso/10 border border-aviso/40 rounded-lg px-3 py-2 space-y-2">
          <p className="flex items-start gap-1.5"><AlertTriangle size={14} className="text-aviso shrink-0 mt-px" /><span>No iPhone, só o <strong>Safari</strong> instala o Finup. Abra este endereço no Safari:</span></p>
          <button type="button" onClick={copiar} className="btn-secondary !py-1 text-xs inline-flex items-center gap-1.5">
            {copiado ? <Check size={12} /> : <Copy size={12} />} {copiado ? 'Endereço copiado' : `Copiar https://${endereco}`}
          </button>
        </div>
      )}
      <Passos itens={[
        <>Abra {url} no <strong>Safari</strong>.</>,
        <>Toque no botão <strong>Compartilhar</strong> <Share size={14} className="inline -mt-1 text-primary-fg" /> (na barra de baixo).</>,
        <>Role a lista e toque em <strong>“Adicionar à Tela de Início”</strong> <PlusSquare size={14} className="inline -mt-1 text-primary-fg" />.</>,
        <>Toque em <strong>Adicionar</strong>. O ícone do Finup aparece na tela de início.</>,
      ]} />
    </Cartao>
  )
  const android = (destaque) => (
    <Cartao key="android" icone={Smartphone} titulo="Android" destaque={destaque}>
      {destaque && botaoInstalar}
      <Passos itens={[
        <>Abra {url} no <strong>Chrome</strong>.</>,
        <>Toque no menu <strong>⋮</strong> (canto superior direito).</>,
        <>Toque em <strong>“Instalar app”</strong> (ou <strong>“Adicionar à tela inicial”</strong>).</>,
        <>Confirme em <strong>Instalar</strong>. O ícone do Finup aparece na tela inicial.</>,
      ]} />
    </Cartao>
  )
  const computador = (destaque) => (
    <Cartao key="computador" icone={Monitor} titulo="Computador" destaque={destaque}>
      {destaque && botaoInstalar}
      <Passos itens={[
        <>No <strong>Chrome</strong> ou no <strong>Edge</strong>, abra {url} e clique no ícone de instalar na barra de endereço (ou menu ⋮ → <strong>“Instalar Finup”</strong>).</>,
        <>No <strong>Safari</strong> do Mac: menu <strong>Arquivo → “Adicionar ao Dock”</strong>.</>,
        <>Para o celular, abra {url} no próprio aparelho e siga o passo a passo dele.</>,
      ]} />
    </Cartao>
  )
  const ordem = { iphone: ['iphone', 'android', 'computador'], android: ['android', 'iphone', 'computador'], computador: ['computador', 'iphone', 'android'] }[aparelho.tipo]
  const cartoes = { iphone, android, computador }

  return (
    <div className="min-h-screen bg-page px-4 py-8">
      <div className="w-full max-w-lg mx-auto space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-texto-1">Finup</h1>
          <p className="text-base font-semibold text-texto-1">Instale o Finup no celular</p>
          <p className="text-sm text-texto-3">Não precisa baixar nada na loja de aplicativos. O Finup vira um ícone na tela de início e abre como um app.</p>
        </div>

        {instalado ? (
          <div className="bg-surface border border-primary/50 rounded-xl p-5 text-center space-y-3">
            <CheckCircle2 size={32} className="mx-auto text-receita" />
            <p className="text-sm font-semibold text-texto-1">O Finup já está instalado neste aparelho.</p>
            <a href="/" className="btn-primary inline-flex">Abrir o Finup</a>
          </div>
        ) : (
          <>
            {resultado && <p className="text-xs text-texto-1 bg-primary/10 border border-primary/30 rounded-lg px-3 py-2">{resultado}</p>}
            {cartoes[ordem[0]](true)}
            <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-3 pt-2">Outros aparelhos</h3>
            {ordem.slice(1).map(t => cartoes[t](false))}
          </>
        )}

        <p className="text-center text-xs text-texto-3">
          Endereço deste ambiente: {url} · <a href="/" className="underline underline-offset-2 hover:text-texto-1">Voltar para o Finup</a>
        </p>
      </div>
    </div>
  )
}
