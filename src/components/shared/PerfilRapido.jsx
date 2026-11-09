import { useState } from 'react'
import Modal from './Modal'
import { useApp } from '../../context/AppContext'
import { CORES_PERFIL } from '../../lib/chartPalette'
import HelpCampo from './HelpCampo'

// Cadastro rápido de perfil (CPF/CNPJ) aberto POR CIMA de outro formulário (ex.: Nova Conta), sem
// perder o que já foi digitado lá. Sem <form> de propósito: o Modal não usa portal, então ele fica
// dentro do formulário de quem abriu — Enter aqui não pode enviar o de fora.
// onCriado(id) recebe o id do perfil novo.
export default function PerfilRapido({ open, onClose, onCriado }) {
  const { addProfile, profiles = [] } = useApp()
  const [form, setForm] = useState({ name: '', type: 'pf', document: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const criar = () => {
    const name = form.name.trim()
    if (!name) return
    const id = addProfile({
      name, type: form.type, document: form.document.replace(/\D/g, ''),
      color: CORES_PERFIL[profiles.length % CORES_PERFIL.length], isDefault: profiles.length === 0,
    })
    setForm({ name: '', type: 'pf', document: '' })
    onCriado?.(id)
    onClose()
  }
  const enter = (e) => { if (e.key === 'Enter') { e.preventDefault(); criar() } }
  return (
    <Modal open={open} onClose={onClose} title="Novo perfil (CPF/CNPJ)" size="sm">
      <div className="space-y-3" data-help-form="perfilRapido">
        <p className="text-xs text-texto-2">
          O perfil é a pessoa ou empresa dona das contas. Com ele, você vê os números de cada um separados — ou de todos juntos, no filtro "Tudo".
        </p>
        <div data-help-id="perfilRapido.tipo">
          <span className="label">Tipo<HelpCampo campo="perfilRapido.tipo" /></span>
          <div className="flex rounded-lg overflow-hidden border border-borda-forte">
            {[['pf', 'Pessoa Física'], ['pj', 'Pessoa Jurídica']].map(([v, l]) => (
              <button type="button" key={v} onClick={() => set('type', v)} aria-pressed={form.type === v}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${form.type === v ? 'bg-primary/15 text-primary-fg' : 'bg-surface-2 text-texto-2 hover:bg-surface-hover'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <label className="block" data-help-id="perfilRapido.nome">
          <span className="label">{form.type === 'pf' ? 'Nome' : 'Razão social'} *<HelpCampo campo="perfilRapido.nome" /></span>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} onKeyDown={enter} autoFocus
            placeholder={form.type === 'pf' ? 'Nome da pessoa' : 'Nome da empresa'} />
        </label>
        <label className="block" data-help-id="perfilRapido.documento">
          <span className="label">{form.type === 'pf' ? 'CPF' : 'CNPJ'} (opcional)<HelpCampo campo="perfilRapido.documento" /></span>
          <input className="input" inputMode="numeric" value={form.document} onKeyDown={enter}
            onChange={e => set('document', e.target.value.replace(/\D/g, '').slice(0, form.type === 'pf' ? 11 : 14))}
            placeholder={form.type === 'pf' ? 'Só os números do CPF' : 'Só os números do CNPJ'} />
        </label>
        <div className="flex gap-2 pt-1">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary flex-1" disabled={!form.name.trim()} onClick={criar}>Criar perfil</button>
        </div>
      </div>
    </Modal>
  )
}
