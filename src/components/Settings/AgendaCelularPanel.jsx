import { useEffect, useState } from 'react'
import { CalendarDays, Smartphone, Copy, Check, RefreshCw, Info, AlertTriangle } from 'lucide-react'
import ConfirmDialog from '../shared/ConfirmDialog'
import { useApp } from '../../context/AppContext'
import {
  obterAgendaFeed, criarAgendaFeed, alterarAgendaFeed, linksDoFeed, avisarFeedMudou,
} from '../../lib/agendaFeedApi'
import { NOMES_CALENDARIO, TIPOS_FEED } from '../../lib/agendaIcs'

// AGENDA NO CELULAR — o feed .ics do usuário logado para assinar no iPhone / Google Agenda.
// Configurações › Geral e "Agenda no celular" do menu do usuário (janela). O .ics é gerado no app
// (hooks/useAgendaFeed) e servido pelo central; o link fica guardado cifrado no servidor, então o
// dono vê e copia o mesmo link em qualquer aparelho. "Gerar novo link" quebra as assinaturas.

const ROTULO = { despesa: 'Despesas', receita: 'Receitas' }
const fmtHora = (d) => {
  try { return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '' }
}

function Escolha({ ativo, onClick, children, disabled }) {
  return (
    <button type="button" role="radio" aria-checked={ativo} onClick={onClick} disabled={disabled}
      className={`min-h-[40px] px-3 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
        ativo ? 'bg-primary text-white border-primary' : 'bg-surface-2 text-texto-2 border-borda-forte hover:text-texto-1'}`}>
      {children}
    </button>
  )
}

// `emJanela`: dentro do Modal do menu do usuário (sem o card e sem o título, que o Modal já tem).
export default function AgendaCelularPanel({ emJanela = false }) {
  const { usuario, pode } = useApp()
  const [estado, setEstado] = useState({ carregando: true, configurado: false, feed: null })
  const [tipos, setTipos] = useState(TIPOS_FEED)
  const [mostrarValores, setMostrarValores] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState(null)
  const [confirmarNovo, setConfirmarNovo] = useState(false)
  const doCadastro = usuario?.origem === 'db'

  useEffect(() => {
    if (!doCadastro) return
    let vivo = true
    obterAgendaFeed()
      .then(r => {
        if (!vivo) return
        setEstado({ carregando: false, configurado: !!r.configurado, feed: r.feed })
        if (r.feed) { setTipos(r.feed.tipos); setMostrarValores(r.feed.mostrarValores) }
      })
      .catch(e => vivo && (setEstado({ carregando: false, configurado: false, feed: null }), setErro(e.message)))
    return () => { vivo = false }
  }, [doCadastro])

  const aplicar = async (fn, opcoes) => {
    setErro('')
    setSalvando(true)
    try {
      const feed = await fn(opcoes)
      setEstado(e => ({ ...e, feed }))
      setTipos(feed.tipos)
      setMostrarValores(feed.mostrarValores)
      avisarFeedMudou(feed)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }
  const mudarOpcoes = (novosTipos, novoMostrar) => {
    if (novosTipos.length === 0) return
    setTipos(novosTipos)
    setMostrarValores(novoMostrar)
    if (estado.feed) aplicar(alterarAgendaFeed, { tipos: novosTipos, mostrarValores: novoMostrar })
  }
  const copiar = async (tipo, url) => {
    try { await navigator.clipboard.writeText(url); setCopiado(tipo); setTimeout(() => setCopiado(null), 2000) } catch { setErro('Não foi possível copiar. Selecione e copie o link manualmente.') }
  }

  const feed = estado.feed
  const origem = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className={emJanela ? 'space-y-4' : 'card space-y-4'}>
      <div>
        {!emJanela && <h2 className="text-sm font-semibold text-texto-2 mb-1 flex items-center gap-2"><CalendarDays size={15} /> Agenda no celular</h2>}
        <p className="text-xs text-texto-3">
          Veja os agendamentos pendentes e as faturas em aberto na agenda do iPhone ou no Google Agenda,
          de 30 dias atrás até 12 meses à frente.
        </p>
      </div>

      {!doCadastro ? (
        <p className="text-xs text-texto-3 bg-surface-2 border border-borda rounded-lg px-3 py-2">Disponível só para usuários do cadastro.</p>
      ) : estado.carregando ? (
        <p className="text-xs text-texto-3">Carregando…</p>
      ) : !estado.configurado ? (
        <p className="flex items-start gap-2 text-xs text-aviso bg-aviso/10 border border-aviso/30 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          Agenda no celular indisponível: falta configurar a chave AGENDA_TOKEN_KEY no servidor. Nenhum link foi gerado.
        </p>
      ) : (
        <>
          <div className="space-y-3">
            <div>
              <p className="label">Mostrar na agenda</p>
              <div role="radiogroup" aria-label="Mostrar na agenda" className="flex flex-wrap gap-2">
                <Escolha ativo={tipos.length === 1 && tipos[0] === 'despesa'} disabled={salvando} onClick={() => mudarOpcoes(['despesa'], mostrarValores)}>Despesas</Escolha>
                <Escolha ativo={tipos.length === 1 && tipos[0] === 'receita'} disabled={salvando} onClick={() => mudarOpcoes(['receita'], mostrarValores)}>Receitas</Escolha>
                <Escolha ativo={tipos.length === 2} disabled={salvando} onClick={() => mudarOpcoes(TIPOS_FEED, mostrarValores)}>Ambos</Escolha>
              </div>
            </div>
            <div>
              <p className="label">Mostrar valores</p>
              <div role="radiogroup" aria-label="Mostrar valores" className="flex flex-wrap gap-2">
                <Escolha ativo={mostrarValores} disabled={salvando} onClick={() => mudarOpcoes(tipos, true)}>Sim</Escolha>
                <Escolha ativo={!mostrarValores} disabled={salvando} onClick={() => mudarOpcoes(tipos, false)}>Não</Escolha>
              </div>
              <p className="text-[11px] text-texto-3 mt-1">{mostrarValores ? 'Ex.: "Aluguel — R$ 1.500,00"' : 'Ex.: "Aluguel" (sem o valor)'}</p>
            </div>
          </div>

          {!pode('agendamentos', 'ver') && (
            <p className="text-xs text-texto-3 bg-surface-2 border border-borda rounded-lg px-3 py-2">Seu acesso não inclui Agendamentos: a agenda fica vazia.</p>
          )}

          {!feed ? (
            <button type="button" className="btn-primary" disabled={salvando} onClick={() => aplicar(criarAgendaFeed, { tipos, mostrarValores })}>
              {salvando ? 'Criando…' : 'Criar minha agenda'}
            </button>
          ) : !feed.token ? (
            <p className="text-xs text-aviso bg-aviso/10 border border-aviso/30 rounded-lg px-3 py-2">
              Não foi possível recuperar o link atual (a chave do servidor mudou). Use "Gerar novo link" e adicione a agenda de novo.
            </p>
          ) : (
            <div className="space-y-3">
              {feed.tipos.map(tipo => {
                const l = linksDoFeed(origem, feed.token, tipo)
                const cache = feed.cache?.[tipo]
                return (
                  <div key={tipo} className="rounded-lg border border-borda bg-surface-2/50 p-3 space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-texto-1">{NOMES_CALENDARIO[tipo]}</h3>
                      <span className="text-[11px] text-texto-3">{cache ? `Atualizada em ${fmtHora(cache.geradoEm)}` : 'Gerando…'}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                      <a href={l.webcal} className="btn-secondary min-h-[40px] flex items-center justify-center gap-2 text-sm">
                        <Smartphone size={14} /> Adicionar ao iPhone
                      </a>
                      <a href={l.google} target="_blank" rel="noopener noreferrer" className="btn-secondary min-h-[40px] flex items-center justify-center gap-2 text-sm">
                        <CalendarDays size={14} /> Adicionar ao Google Agenda
                      </a>
                      <button type="button" onClick={() => copiar(tipo, l.https)} className="btn-secondary min-h-[40px] flex items-center justify-center gap-2 text-sm">
                        {copiado === tipo ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar link</>}
                      </button>
                    </div>
                    <p className="text-[11px] text-texto-3 font-mono break-all select-all" aria-label={`Link ${ROTULO[tipo]}`}>{l.https}</p>
                  </div>
                )
              })}
              <button type="button" onClick={() => setConfirmarNovo(true)} disabled={salvando}
                className="flex items-center gap-1.5 text-xs text-texto-3 hover:text-perigo min-h-[32px]">
                <RefreshCw size={12} /> Gerar novo link
              </button>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-texto-2 bg-surface-2 border border-borda rounded-lg px-3 py-2">
            <Info size={14} className="shrink-0 mt-0.5 text-texto-3" />
            <span>
              <strong className="font-semibold">Atualiza quando você abre o Finup.</strong> O Google pode levar algumas horas
              para atualizar; o iPhone, até 1 h. A agenda é só para consulta: pagar e editar continuam no Finup.
            </span>
          </div>
        </>
      )}
      {erro && <p className="text-xs text-perigo" role="alert">{erro}</p>}

      <ConfirmDialog
        open={confirmarNovo}
        onClose={() => setConfirmarNovo(false)}
        onConfirm={() => aplicar(criarAgendaFeed, { tipos, mostrarValores })}
        title="Gerar novo link?"
        message="O link atual para de funcionar: no iPhone e no Google Agenda a assinatura antiga deixa de atualizar e você terá de adicionar a agenda de novo."
        confirmLabel="Gerar novo link"
        danger
      />
    </div>
  )
}
