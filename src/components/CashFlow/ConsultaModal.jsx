import { useMemo, useState } from 'react'
import { Info, Trash2 } from 'lucide-react'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import PerfisMultiSelect from '../Settings/PerfisMultiSelect'
import { fmt, fmtDate, groupedAccountOptions } from '../shared/utils'
import {
  MODOS, HORIZONTES, contasDaConsulta, validarConsulta, ultimoDiaDeSaldo,
} from '../../lib/fluxoConsultas'

const OPCOES = [
  ['incluir_agendamentos', 'Agendamentos pendentes'],
  ['incluir_lancamentos_futuros', 'Lançamentos futuros (já lançados com data adiante)'],
  ['incluir_envelopes', 'Restante dos envelopes do mês'],
  ['ocultar_reserva', 'Ocultar movimentos de reserva'],
  ['ocultar_patrimonio', 'Ocultar movimentos de patrimônio'],
]

const vazia = (perfilId) => ({
  nome: '', modo: 'conta', account_ids: [], group_ids: [], perfil_ids: perfilId ? [perfilId] : [],
  incluir_agendamentos: true, incluir_lancamentos_futuros: true, incluir_envelopes: true,
  ocultar_reserva: false, ocultar_patrimonio: false, horizonte_padrao: 30, padrao: false,
})

// Criar/editar uma consulta salva do Fluxo de Caixa Futuro. `initial` com id = edição.
// onSalvar(payload) e onExcluir(id) lançam o erro do endpoint (mostrado aqui).
export default function ConsultaModal({ initial, accounts, accountGroups, transactions, profiles, activeProfileId, hoje, onSalvar, onExcluir, onClose }) {
  const editando = !!initial?.id
  const [form, setForm] = useState(() => (editando ? { ...initial } : vazia(activeProfileId)))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmExcluir, setConfirmExcluir] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const caixa = useMemo(() => accounts.filter(a => a.type !== 'credit' && a.active !== false), [accounts])
  const porGrupo = useMemo(() => groupedAccountOptions(caixa, accountGroups), [caixa, accountGroups])
  const grupos = useMemo(
    () => [...(accountGroups || [])].filter(g => !g.inibido).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [accountGroups],
  )
  const ultimo = useMemo(() => {
    const m = new Map()
    for (const a of caixa) m.set(a.id, ultimoDiaDeSaldo(a.id, transactions, hoje))
    return m
  }, [caixa, transactions, hoje])

  const contas = contasDaConsulta(form, caixa)
  const total = contas.reduce((s, a) => s + (a.balance || 0), 0)

  const toggle = (k, id) => set(k, form[k].includes(id) ? form[k].filter(x => x !== id) : [...form[k], id])

  const salvar = async () => {
    const e = validarConsulta(form)
    if (e) { setErro(e); return }
    setErro('')
    setSalvando(true)
    try {
      await onSalvar({ ...form, nome: form.nome.trim() })
      onClose()
    } catch (err) {
      setErro(err?.message || 'Falha ao salvar a consulta.')
      setSalvando(false)
    }
  }
  const excluir = async () => {
    setSalvando(true)
    try {
      await onExcluir(initial.id)
      onClose()
    } catch (err) {
      setErro(err?.message || 'Falha ao excluir a consulta.')
      setSalvando(false)
    }
  }

  const linhaConta = (a, marcavel) => (
    <label key={a.id} className={`flex items-center gap-2.5 px-3 py-2 ${marcavel ? 'hover:bg-gray-800 cursor-pointer' : ''}`}>
      {marcavel && (
        <input type="checkbox" className="accent-[#0F6E56] w-3.5 h-3.5 shrink-0"
          checked={form.account_ids.includes(a.id)} onChange={() => toggle('account_ids', a.id)} />
      )}
      <span className="text-sm text-gray-300 truncate flex-1 min-w-0">{a.apelido || a.name}</span>
      <span className="text-[11px] text-gray-500 shrink-0 w-20 text-right">{ultimo.get(a.id) ? fmtDate(ultimo.get(a.id)) : '—'}</span>
      <span className={`text-xs shrink-0 w-28 text-right ${(a.balance || 0) >= 0 ? 'text-gray-300' : 'text-orange-500'}`}>{fmt(a.balance || 0)}</span>
    </label>
  )

  // O ConfirmDialog fica FORA do Modal (irmão): dentro, o transform do painel recortaria o
  // overlay fixo; enquanto ele está aberto o modal principal some (Esc não fecha os dois).
  return (
    <>
    <Modal open={!confirmExcluir} onClose={onClose} title={editando ? 'Editar consulta' : 'Nova consulta'}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="label">Nome *</label>
            <input className="input" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Só Itaú" autoFocus />
          </div>
          <div>
            <label className="label">Perfis</label>
            <PerfisMultiSelect value={form.perfil_ids} onChange={v => set('perfil_ids', v)} profiles={profiles} className="py-2 w-full" />
          </div>
        </div>

        <div className="flex gap-1 bg-gray-800/60 rounded-lg p-1">
          {MODOS.map(m => (
            <button key={m.id} type="button" onClick={() => set('modo', m.id)}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${form.modo === m.id ? 'bg-[#0F6E56] text-white' : 'text-gray-400 hover:text-gray-200'}`}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {form.modo === 'conta' && (
              <>
                <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-800 sticky top-0 bg-surface z-10">
                  <button type="button" onClick={() => set('account_ids', caixa.map(a => a.id))} className="text-xs text-[#0F6E56] hover:underline">Todas</button>
                  <span className="text-gray-700">·</span>
                  <button type="button" onClick={() => set('account_ids', [])} className="text-xs text-gray-500 hover:text-gray-300">Nenhuma</button>
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-600">último dia · saldo</span>
                </div>
                {porGrupo.map(({ group, accounts: accs }) => (
                  <div key={group?.id || 'sem-grupo'}>
                    <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide font-semibold text-gray-500">{group?.name || 'Sem grupo'}</p>
                    {accs.map(a => linhaConta(a, true))}
                  </div>
                ))}
              </>
            )}
            {form.modo === 'grupo' && grupos.map(g => {
              const n = caixa.filter(a => a.accountGroupId === g.id).length
              return (
                <label key={g.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-800 cursor-pointer">
                  <input type="checkbox" className="accent-[#0F6E56] w-3.5 h-3.5 shrink-0"
                    checked={form.group_ids.includes(g.id)} onChange={() => toggle('group_ids', g.id)} />
                  <span className="text-sm text-gray-300 flex-1 truncate">{g.name}</span>
                  <span className="text-[11px] text-gray-500">{n} conta{n !== 1 ? 's' : ''}</span>
                </label>
              )
            })}
            {form.modo === 'grupo' && grupos.length === 0 && <p className="text-xs text-gray-500 px-3 py-3">Nenhum grupo de contas cadastrado.</p>}
            {form.modo === 'principais' && (
              <>
                <p className="flex items-start gap-2 px-3 py-2 text-xs text-gray-400 border-b border-gray-800">
                  <Info size={13} className="shrink-0 mt-0.5 text-gray-500" />
                  Usa automaticamente as contas marcadas como Fluxo de Caixa Principal (FC). Para mudar, altere o cadastro da conta.
                </p>
                {contas.map(a => linhaConta(a, false))}
                {contas.length === 0 && <p className="text-xs text-amber-400 px-3 py-3">Nenhuma conta marcada como FC.</p>}
              </>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-gray-800 bg-gray-800/30 text-xs">
            <span className="text-gray-400">Saldo inicial desta consulta · {contas.length} conta{contas.length !== 1 ? 's' : ''}</span>
            <span className={`font-bold ${total >= 0 ? 'text-blue-400' : 'text-orange-500'}`}>{fmt(total)}</span>
          </div>
        </div>

        <div className="space-y-2">
          {OPCOES.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-[#0F6E56] w-3.5 h-3.5" checked={!!form[k]} onChange={e => set(k, e.target.checked)} />
              <span className="text-sm text-gray-300">{l}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400">Horizonte padrão</span>
          <div className="flex gap-1 bg-gray-800/60 rounded-lg p-1">
            {HORIZONTES.map(h => (
              <button key={h} type="button" onClick={() => set('horizonte_padrao', h)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium ${form.horizonte_padrao === h ? 'bg-[#0F6E56] text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                {h} dias
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 cursor-pointer sm:ml-auto">
            <input type="checkbox" className="accent-[#0F6E56] w-3.5 h-3.5" checked={!!form.padrao} onChange={e => set('padrao', e.target.checked)} />
            <span className="text-sm text-gray-300">Abrir esta consulta por padrão</span>
          </label>
        </div>

        {erro && <p className="text-xs text-red-400">{erro}</p>}

        <div className="flex gap-3 pt-1 flex-wrap">
          {editando && (
            <button type="button" className="btn-danger flex items-center gap-1.5" disabled={salvando} onClick={() => setConfirmExcluir(true)}>
              <Trash2 size={13} /> Excluir consulta
            </button>
          )}
          <div className="flex gap-3 ml-auto">
            <button type="button" className="btn-secondary" disabled={salvando} onClick={onClose}>Cancelar</button>
            <button type="button" className="btn-primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </div>
    </Modal>

      <ConfirmDialog
        open={confirmExcluir}
        onClose={() => setConfirmExcluir(false)}
        onConfirm={excluir}
        danger
        title="Excluir consulta"
        confirmLabel="Excluir"
        message={`Excluir a consulta "${initial?.nome || ''}"? Provisórios e datas provisórias não são afetados.`}
      />
    </>
  )
}
