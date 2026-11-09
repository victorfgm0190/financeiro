import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { feriadosDoAno } from '../../lib/feriados'
import HelpCampo from '../shared/HelpCampo'

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const diaSemana = (d) => SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]
const ROTULO = { nacional: 'Nacional', opcional: 'Opcional', estadual: 'Estadual', municipal: 'Municipal' }

// Configurações → Cadastros → Feriados (por cliente). Nacionais gerados automaticamente; Carnaval e
// Corpus Christi opcionais (desligados por padrão); o usuário acrescenta estaduais/municipais e liga
// ou desliga qualquer um. Usado pelos envelopes diários com "Descontar feriados".
export default function FeriadosPanel() {
  const { feriados, feriadosCarregados, alternarFeriadoAutomatico, criarFeriado, atualizarFeriado, excluirFeriado } = useApp()
  const [ano, setAno] = useState(() => new Date().getFullYear())
  const [nome, setNome] = useState('')
  const [abrangencia, setAbrangencia] = useState('municipal')
  const [data, setData] = useState('')
  const [todoAno, setTodoAno] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const lista = useMemo(() => feriadosDoAno(ano, feriados), [ano, feriados])

  const executar = async (fn) => {
    setErro('')
    setSalvando(true)
    try { await fn() } catch (err) { setErro(err?.message || 'Falha ao gravar.') } finally { setSalvando(false) }
  }
  const alternar = (f) => executar(() => (f.automatico ? alternarFeriadoAutomatico(f.chave, !f.ativo) : atualizarFeriado({ id: f.id, ativo: !f.ativo })))
  const adicionar = () => executar(async () => {
    await criarFeriado({ nome: nome.trim(), abrangencia, ...(todoAno ? { dia_mes: data.slice(5) } : { data }), ativo: true })
    setNome('')
    setData('')
  })

  return (
    <div className="card space-y-4" data-guia="settings:feriados.lista" data-help-form="feriados">
      <div>
        <h2 className="text-sm font-semibold text-texto-2">Feriados</h2>
        <p className="text-xs text-texto-3 mt-0.5">
          Os nacionais são gerados automaticamente todo ano. Carnaval e Corpus Christi são opcionais (desligados até você ligar).
          Acrescente os feriados do seu estado ou município. Envelopes diários com "Descontar feriados" usam esta lista.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="button" className="p-2 rounded-md hover:bg-surface-hover text-texto-2" onClick={() => setAno(a => a - 1)} aria-label="Ano anterior"><ChevronLeft size={16} /></button>
        <p className="text-sm font-semibold text-texto-1">{ano}</p>
        <button type="button" className="p-2 rounded-md hover:bg-surface-hover text-texto-2" onClick={() => setAno(a => a + 1)} aria-label="Próximo ano"><ChevronRight size={16} /></button>
      </div>

      {!feriadosCarregados && <p className="text-xs text-texto-3">Carregando o cadastro…</p>}
      <p data-testid="legenda-feriados" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-texto-3"><span>Ligado/desligado<HelpCampo campo="feriado.ligado" /></span></p>
      <ul className="divide-y divide-borda/60 border border-borda rounded-lg">
        {lista.map(f => (
          <li key={`${f.chave || f.id}`} className={`flex items-center gap-3 px-3 py-2.5 ${f.ativo ? '' : 'opacity-60'}`}>
            <div className="w-24 shrink-0 text-xs text-texto-2 tabular-nums">
              {f.datas.map(d => <span key={d} className="block">{ddmm(d)} <span className="text-texto-3">{diaSemana(d)}</span></span>)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-texto-1 truncate">{f.nome}</p>
              <p className="text-[11px] text-texto-3">{ROTULO[f.abrangencia] || f.abrangencia}{f.automatico ? ' · automático' : f.todoAno ? ' · todo ano' : ''}</p>
            </div>
            <label data-help-id="feriado.ligado" className="flex items-center gap-1.5 text-xs text-texto-2 cursor-pointer shrink-0 min-h-[40px]">
              <input type="checkbox" className="accent-primary" checked={f.ativo} disabled={salvando} onChange={() => alternar(f)} aria-label={`${f.ativo ? 'Desligar' : 'Ligar'} ${f.nome}`} />
              {f.ativo ? 'Ligado' : 'Desligado'}
            </label>
            {!f.automatico && (
              <button type="button" className="p-1.5 text-texto-3 hover:text-perigo shrink-0" disabled={salvando} title="Excluir feriado"
                onClick={() => { if (window.confirm(`Excluir o feriado "${f.nome}"?`)) executar(() => excluirFeriado(f.id)) }}>
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="space-y-2 border-t border-borda pt-3">
        <p className="text-xs font-semibold text-texto-2">Novo feriado estadual ou municipal</p>
        <p data-testid="legenda-novo-feriado" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-texto-3"><span>Nome<HelpCampo campo="feriado.nome" /></span><span>Abrangência<HelpCampo campo="feriado.abrangencia" /></span><span>Data<HelpCampo campo="feriado.data" /></span></p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_160px] gap-2">
          <input className="input" data-help-id="feriado.nome" aria-label="Nome do feriado" value={nome} onChange={e => setNome(e.target.value)} maxLength={120} placeholder="Nome do feriado" />
          <select className="input" data-help-id="feriado.abrangencia" value={abrangencia} onChange={e => setAbrangencia(e.target.value)} aria-label="Abrangência">
            <option value="municipal">Municipal</option>
            <option value="estadual">Estadual</option>
          </select>
          <input className="input" type="date" data-help-id="feriado.data" value={data} onChange={e => setData(e.target.value)} aria-label="Data do feriado" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label data-help-id="feriado.todoAno" className="flex items-center gap-2 text-xs text-texto-2 cursor-pointer">
            <input type="checkbox" className="accent-primary" checked={todoAno} onChange={e => setTodoAno(e.target.checked)} />
            Repete todo ano (mesmo dia e mês)<HelpCampo campo="feriado.todoAno" />
          </label>
          <button type="button" className="btn-primary text-sm inline-flex items-center gap-1.5" disabled={salvando || !nome.trim() || !data} onClick={adicionar}>
            <Plus size={14} /> Adicionar feriado
          </button>
        </div>
        {erro && <p className="text-xs text-perigo">{erro}</p>}
      </div>
    </div>
  )
}
