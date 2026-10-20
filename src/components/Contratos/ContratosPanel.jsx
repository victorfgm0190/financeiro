import { useMemo, useState } from 'react'
import { Plus, FileSignature } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { valorAtual, proximaParcela, rotuloContrato, STATUS_CONTRATO } from '../../lib/contratos/parcelas'
import ContratoWizard from './ContratoWizard'

// Lista de contratos (filtros perfil / tipo / status) + "Novo contrato". Clique abre a ficha.
export default function ContratosPanel() {
  const { contratos, contratosCarregados, schedules, profiles, activeProfileId, pode, abrirFichaContrato, recarregarContratos } = useApp()
  const [perfil, setPerfil] = useState(activeProfileId || '')
  const [tipo, setTipo] = useState('')
  const [status, setStatus] = useState('ativo')
  const [novo, setNovo] = useState(false)
  const [erro, setErro] = useState('')

  const linhas = useMemo(() => contratos
    .filter(c => (!perfil || c.perfil_id === perfil) && (!tipo || c.tipo === tipo) && (!status || c.status === status))
    .map(c => ({ c, valor: valorAtual(c, schedules), prox: proximaParcela(c, schedules) }))
    .sort((a, b) => String(a.prox?.startDate || '9999').localeCompare(String(b.prox?.startDate || '9999'))),
  [contratos, schedules, perfil, tipo, status])

  const vigencia = (c) => `${fmtDate(c.data_inicio)} – ${c.data_fim ? fmtDate(c.data_fim) : 'sem fim'}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label text-xs">Perfil</label>
          <select className="input py-1.5 text-sm" value={perfil} onChange={e => setPerfil(e.target.value)}>
            <option value="">Todos</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">Tipo</label>
          <select className="input py-1.5 text-sm" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">Todos</option><option value="pagar">A pagar</option><option value="receber">A receber</option>
          </select>
        </div>
        <div>
          <label className="label text-xs">Status</label>
          <select className="input py-1.5 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(STATUS_CONTRATO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {pode('contratos', 'incluir') && (
          <button className="btn-primary ml-auto flex items-center gap-1.5" onClick={() => setNovo(true)}>
            <Plus size={14} /> Novo contrato
          </button>
        )}
      </div>

      {erro && <p className="text-xs text-perigo">{erro}</p>}
      {!contratosCarregados ? (
        <div className="card text-sm text-texto-3 flex items-center justify-between">
          Carregando contratos…
          <button className="btn-secondary text-xs" onClick={() => recarregarContratos().catch(e => setErro(e.message))}>Tentar de novo</button>
        </div>
      ) : linhas.length === 0 ? (
        <div className="card text-center py-10 space-y-2">
          <FileSignature size={28} className="mx-auto text-texto-3" />
          <p className="text-sm text-texto-2">Nenhum contrato {status ? `${STATUS_CONTRATO[status].toLowerCase()} ` : ''}com esses filtros.</p>
        </div>
      ) : (
        <>
          <div className="card p-0 overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-texto-3 border-b border-borda">
                  <th className="px-3 py-2 text-left">Contrato</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-right">Valor atual</th>
                  <th className="px-3 py-2 text-left">Vigência</th>
                  <th className="px-3 py-2 text-left">Próximo vencimento</th>
                  <th className="px-3 py-2 text-left">Próximo reajuste</th>
                  <th className="px-3 py-2 text-right">Créditos abertos</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ c, valor, prox }) => (
                  <tr key={c.id} className="border-b border-borda/50 hover:bg-surface-hover/30 cursor-pointer" onClick={() => abrirFichaContrato(c.id)}>
                    <td className="px-3 py-2.5">
                      <p className="text-texto-1 font-medium">{rotuloContrato(c)}</p>
                      <p className="text-xs text-texto-3">{c.favorecido || '—'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-texto-2">{c.tipo === 'receber' ? 'A receber' : 'A pagar'}</td>
                    <td className="px-3 py-2.5 text-right text-texto-1 font-medium whitespace-nowrap">{fmt(valor)}</td>
                    <td className="px-3 py-2.5 text-xs text-texto-2 whitespace-nowrap">{vigencia(c)}</td>
                    <td className="px-3 py-2.5 text-xs text-texto-2 whitespace-nowrap">{prox ? `${fmtDate(prox.startDate)} · ${fmt(prox.amount)}` : '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-texto-2 whitespace-nowrap">{c.proximo_reajuste ? fmtDate(c.proximo_reajuste) : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-texto-3" title="Créditos do proprietário chegam na próxima entrega">—</td>
                    <td className="px-3 py-2.5 text-xs text-texto-2">{STATUS_CONTRATO[c.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2">
            {linhas.map(({ c, valor, prox }) => (
              <button key={c.id} className="card w-full text-left space-y-1" onClick={() => abrirFichaContrato(c.id)}>
                <div className="flex justify-between gap-2">
                  <p className="text-sm text-texto-1 font-medium truncate">{rotuloContrato(c)}</p>
                  <p className="text-sm text-texto-1 font-semibold whitespace-nowrap">{fmt(valor)}</p>
                </div>
                <p className="text-xs text-texto-3">{c.favorecido || '—'} · {STATUS_CONTRATO[c.status]}</p>
                <p className="text-xs text-texto-2">Próx.: {prox ? `${fmtDate(prox.startDate)} · ${fmt(prox.amount)}` : '—'}{c.proximo_reajuste ? ` · reajuste ${fmtDate(c.proximo_reajuste)}` : ''}</p>
              </button>
            ))}
          </div>
        </>
      )}

      <Modal open={novo} onClose={() => setNovo(false)} title="Novo contrato" size="xl">
        {novo && <ContratoWizard onClose={() => setNovo(false)} onSalvo={(c) => { setNovo(false); abrirFichaContrato(c.id) }} />}
      </Modal>
    </div>
  )
}
