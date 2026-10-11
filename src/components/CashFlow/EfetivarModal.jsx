import { useMemo, useState } from 'react'
import Modal from '../shared/Modal'
import SearchableSelect from '../shared/SearchableSelect'
import DateInput from '../shared/DateInput'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { filtrarCategoriasPorPerfil, perfilParaCategorias } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'

// Efetivar um PROVISÓRIO: gravar como agendamento (a pagar/receber, "Uma vez") ou como
// lançamento realizado. onConfirmar({ modo: 'agendamento'|'lancamento', categoryId, date })
// lança o erro, que é mostrado aqui.
export default function EfetivarModal({ prov, onConfirmar, onClose }) {
  const { profileAccounts: accounts, categories, activeProfileId, categoryGroupOrder } = useApp()
  const entrada = prov.type === 'entrada'
  const [modo, setModo] = useState('agendamento')
  const [categoryId, setCategoryId] = useState(prov.category_id || '')
  const [date, setDate] = useState(prov.date)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const catOpts = useMemo(() => {
    const alvo = entrada ? 'income' : 'expense'
    const perfil = perfilParaCategorias(accounts, prov.account_id, activeProfileId)
    return ordenarCategorias(filtrarCategoriasPorPerfil(categories, perfil, [categoryId]), categoryGroupOrder)
      .filter(c => c.type === alvo || c.type === 'both')
      .map(c => ({ id: c.id, label: `${c.icon || ''} ${c.name}`.trim(), group: c.group || null }))
  }, [categories, entrada, accounts, prov.account_id, categoryId, activeProfileId, categoryGroupOrder])

  const confirmar = async () => {
    if (modo === 'lancamento' && !date) { setErro('Informe a data do lançamento.'); return }
    setErro('')
    setSalvando(true)
    try {
      await onConfirmar({ modo, categoryId: categoryId || null, date })
      onClose()
    } catch (err) {
      setErro(err?.message || 'Falha ao efetivar.')
      setSalvando(false)
    }
  }

  const opcao = (id, titulo, desc) => (
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="radio" className="mt-0.5 accent-[#0F6E56]" checked={modo === id} onChange={() => setModo(id)} />
      <span className="text-sm text-gray-200">{titulo}<span className="block text-xs text-gray-500">{desc}</span></span>
    </label>
  )

  return (
    <Modal open onClose={onClose} title="Efetivar provisório">
      <div className="space-y-4">
        <div className="text-sm">
          <p className="text-gray-200 font-medium">{prov.description}</p>
          <p className="text-gray-400">{entrada ? 'Entrada' : 'Saída'} de {fmt(prov.amount)} em {fmtDate(prov.date)}</p>
        </div>
        <div className="space-y-2">
          {opcao('agendamento', `Agendamento (${entrada ? 'a receber' : 'a pagar'})`, 'Vira um agendamento "Uma vez" na data do provisório; o saldo da conta não muda até ele ser registrado.')}
          {opcao('lancamento', 'Lançamento realizado', 'Grava o lançamento na conta agora (mexe no saldo se a data for hoje ou anterior).')}
        </div>
        {modo === 'lancamento' && (
          <div>
            <label className="label">Data do lançamento</label>
            <DateInput className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label">Categoria</label>
          <SearchableSelect
            options={catOpts}
            preserveGroupOrder
            value={categoryId}
            onChange={id => setCategoryId(id || '')}
            placeholder="Sem categoria"
            ungroupedLast
            ungroupedLabel="Sem grupo"
          />
        </div>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" className="btn-secondary flex-1" disabled={salvando} onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary flex-1" disabled={salvando} onClick={confirmar}>{salvando ? 'Gravando...' : 'Efetivar'}</button>
        </div>
      </div>
    </Modal>
  )
}
