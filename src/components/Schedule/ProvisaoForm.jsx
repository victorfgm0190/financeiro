import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { today } from '../shared/utils'
import SearchableSelect from '../shared/SearchableSelect'
import { filtrarCategoriasPorPerfil, perfilParaCategorias } from '../../lib/categoriasPerfil'
import { ordenarCategorias } from '../../lib/ordemCategorias'
import { contaCentralDoPerfil, msgSemContaCentral } from '../../lib/contaCentral'
import InputMoeda from '../shared/InputMoeda'

// Mesmas frequências do ScheduleForm.
const FREQUENCIES = [
  { value: 'once', label: 'Única' },
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'bimonthly', label: 'Bimestral' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'quadrimestral', label: 'Quadrimestral' },
  { value: 'semiannual', label: 'Semestral' },
  { value: 'annual', label: 'Anual' },
]
const FREQ_OPTIONS = FREQUENCIES.map(f => ({ id: f.value, label: f.label }))

// Formulário de "Provisão de Despesa": uma despesa futura estimada (valor/data ainda não
// definitivos), gravada como agendamento de despesa com is_provisao = true. Pode ser "Uma vez"
// ou recorrente (Contínua/Parcelada). Opcionalmente vinculada a uma Função de Reserva.
// Com `initial`, abre em modo edição (todos os campos editáveis).
export default function ProvisaoForm({ initial, onClose }) {
  const { accounts, profiles, categories, reserveFunctions, addSchedule, updateSchedule, getNextOccurrences, activeProfileId, categoryGroupOrder, pode } = useApp()
  // Nível de acesso: lançar = incluir; salvar edição = editar (sem permissão: só leitura).
  const podeGravarForm = pode('agendamentos', initial?.id ? 'editar' : 'incluir')

  // A provisão é uma despesa futura debitada da Conta central DO PERFIL DA PROVISÃO — aparece no
  // Fluxo de Caixa Principal como despesa. Perfil: na edição, o da conta já gravada; na criação, o
  // da conta da função de reserva escolhida; sem função, o select "Perfil" (obrigatório, nunca o
  // filtro da tela). Sem Conta central nesse perfil, o Salvar fica bloqueado com o aviso.
  const [perfilEscolhido, setPerfilEscolhido] = useState('')
  const [erroCentral, setErroCentral] = useState(null)

  // TODAS as funções de reserva de TODAS as contas (cada função pertence a uma conta via
  // accountId). Formato "Nome (apelido)"; ordenado por conta e depois por nome da função.
  const funcoesReserva = useMemo(() => {
    const accById = new Map(accounts.map(a => [a.id, a]))
    return (reserveFunctions || [])
      .filter(f => f.accountId && accById.has(f.accountId))
      .map(f => {
        const acc = accById.get(f.accountId)
        const accLabel = acc.apelido || acc.name
        return { id: f.id, name: f.name, accLabel, label: `${f.name} (${accLabel})` }
      })
      .sort((a, b) =>
        a.accLabel.localeCompare(b.accLabel, 'pt-BR') ||
        a.name.localeCompare(b.name, 'pt-BR')
      )
  }, [reserveFunctions, accounts])

  const [form, setForm] = useState({
    description: initial?.description || '',
    amount: initial?.amount ?? '',
    startDate: initial?.startDate || today(),
    categoryId: initial?.categoryId || '',
    frequency: initial?.frequency || 'once',
    occurrenceType: initial?.occurrenceType || 'continuous',
    installments: initial?.installments ?? 0,
    comReserva: !!initial?.reservaFuncaoId,
    reservaFuncaoId: initial?.reservaFuncaoId || '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const isRecorrente = form.frequency && form.frequency !== 'once'

  const contaDaFuncao = form.comReserva && form.reservaFuncaoId
    ? accounts.find(a => a.id === (reserveFunctions || []).find(f => f.id === form.reservaFuncaoId)?.accountId) || null
    : null
  const perfilDaProvisao = initial?.accountId
    ? accounts.find(a => a.id === initial.accountId)?.profileId || null
    : contaDaFuncao ? contaDaFuncao.profileId || null : (perfilEscolhido || null)
  const mostraSelectPerfil = !initial?.accountId && !contaDaFuncao
  const contaPrincipal = contaCentralDoPerfil(accounts, perfilDaProvisao)

  // Categorias por perfil: o da conta principal (onde a provisão cai), senão o chip do topo; a
  // categoria já gravada continua na lista.
  const perfilCategorias = perfilParaCategorias(accounts, contaPrincipal?.id || initial?.accountId, activeProfileId)
  const expenseCatOpts = useMemo(() =>
    ordenarCategorias(filtrarCategoriasPorPerfil(categories, perfilCategorias, [initial?.categoryId]), categoryGroupOrder)
      .filter(c => c.type === 'expense' || c.type === 'both')
      .map(c => ({ id: c.id, label: `${c.icon} ${c.name}`, group: c.group || null })),
  [categories, perfilCategorias, initial?.categoryId, categoryGroupOrder])

  // Prévia das próximas ocorrências — mesma lógica do ScheduleForm: reusa getNextOccurrences
  // com um schedule "virtual" montado do form. Contínua → próximas 12; Parcelada → só as N datas
  // (getNextOccurrences limita por installments). Recalculada a cada render → atualiza em tempo real
  // quando muda data/frequência/nº de parcelas. 'Única' não tem próximas ocorrências.
  const previewSchedule = {
    startDate: form.startDate,
    frequency: form.frequency,
    occurrenceType: form.occurrenceType,
    installments: form.occurrenceType === 'installment' ? (Number(form.installments) || 0) : 0,
    registered: [],
    skipped: [],
  }
  const preview = isRecorrente && form.startDate ? getNextOccurrences(previewSchedule, 12) : []

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!podeGravarForm) return
    if (!form.description || !form.amount || !form.startDate || !form.frequency) return
    if (isRecorrente && form.occurrenceType === 'installment' && Number(form.installments) < 1) return
    if (form.comReserva && !form.reservaFuncaoId) return
    if (!initial?.accountId && !contaPrincipal) {
      setErroCentral(msgSemContaCentral(profiles, perfilDaProvisao, contaDaFuncao))
      return
    }

    const payload = {
      description: form.description,
      transactionType: 'expense',
      // Em edição mantém a conta original; na criação usa a Conta central do perfil da provisão.
      accountId: initial?.accountId || contaPrincipal?.id || '',
      accountType: initial?.accountType ?? (contaPrincipal?.type || null),
      toAccountId: '',
      amount: Number(form.amount),
      categoryId: form.categoryId || '',
      payee: initial?.payee || '',
      costCenter: initial?.costCenter || '',
      frequency: form.frequency,
      startDate: form.startDate,
      occurrenceType: isRecorrente ? form.occurrenceType : 'continuous',
      installments: isRecorrente ? Number(form.installments) : 0,
      remindDaysBefore: initial?.remindDaysBefore ?? 3,
      // Provisão é uma estimativa: não auto-registra até ser efetivada. Continua aparecendo
      // como despesa futura projetada no Fluxo de Caixa Principal.
      autoRegister: false,
      grupoGerencial: initial?.grupoGerencial ?? null,
      skipped: initial?.skipped || [],
      overrides: initial?.overrides || {},
      reservaFuncaoId: form.comReserva ? form.reservaFuncaoId : '',
      isProvisao: true,
      provisaoEfetivada: initial?.provisaoEfetivada ?? false,
    }

    if (initial?.id) updateSchedule(initial.id, payload)
    else addSchedule(payload)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-surface-2 border border-borda-forte rounded-lg">
        <Info size={14} className="text-texto-2 shrink-0 mt-0.5" />
        <p className="text-xs text-texto-2 leading-snug">
          Uma provisão é uma despesa futura estimada. Pode ser Única ou recorrente
          (Contínua/Parcelada). Aparece no Fluxo de Caixa Principal e pode ser efetivada depois,
          ocorrência a ocorrência, com o valor e a data reais.
        </p>
      </div>

      {mostraSelectPerfil && (
        <div>
          <label className="label">Perfil *</label>
          <select className="input" value={perfilEscolhido} required
            onChange={e => { setPerfilEscolhido(e.target.value); setErroCentral(null) }}>
            <option value="">Selecione o perfil...</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{String(p.name || '').trim()}</option>)}
          </select>
          <p className="text-xs text-texto-3 mt-1">A provisão sai da Conta central deste perfil.</p>
        </div>
      )}
      {(erroCentral || (perfilDaProvisao && !contaPrincipal && !initial?.accountId)) && (
        <p className="text-xs text-aviso">{erroCentral || msgSemContaCentral(profiles, perfilDaProvisao, contaDaFuncao)}</p>
      )}

      {/* Descrição */}
      <div>
        <label className="label">Descrição *</label>
        <input
          className="input"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Digite a descrição da provisão"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Valor estimado */}
        <div>
          <label className="label">Valor estimado (R$) *</label>
          <InputMoeda
            min="0.01"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            required
          />
        </div>

        {/* Data estimada (1ª ocorrência quando recorrente) */}
        <div>
          <label className="label">{isRecorrente ? 'Data estimada (1ª ocorrência) *' : 'Data estimada *'}</label>
          <input
            className="input"
            type="date"
            value={form.startDate}
            onChange={e => set('startDate', e.target.value)}
            required
          />
        </div>
      </div>

      {/* Frequência + Ocorrência (mesmo padrão do agendamento normal) */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Frequência *</label>
          <SearchableSelect
            options={FREQ_OPTIONS}
            value={form.frequency}
            onChange={id => setForm(f => ({ ...f, frequency: id, ...(id === 'once' || !id ? { occurrenceType: 'continuous' } : {}) }))}
            placeholder="Selecione a frequência..."
            required
          />
        </div>

        {isRecorrente && (
          <div className={form.occurrenceType === 'installment' ? '' : 'col-span-1'}>
            <label className="label">Ocorrência</label>
            <div className="flex rounded-lg overflow-hidden border border-borda-forte">
              {[['continuous', 'Contínua'], ['installment', 'Parcelada']].map(([v, l]) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => set('occurrenceType', v)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    form.occurrenceType === v ? 'bg-primary/15 text-primary-fg' : 'bg-surface-2 text-texto-2 hover:bg-surface-hover'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isRecorrente && form.occurrenceType === 'installment' && (
        <div>
          <label className="label">Nº de Parcelas</label>
          <input
            className="input"
            type="number"
            min="1"
            max="360"
            value={form.installments}
            onChange={e => set('installments', e.target.value)}
          />
        </div>
      )}

      {/* Prévia das próximas ocorrências (read-only) — reusa a lógica do modal de Agendamento */}
      {preview.length > 0 && (
        <div>
          <label className="label">Prévia das próximas ocorrências</label>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {preview.map((date, i) => (
              <div
                key={date}
                className={`text-center p-2 rounded-lg text-xs ${
                  i === 0 ? 'bg-primary/15 text-primary-fg font-medium' : 'bg-surface-2 text-texto-2'
                }`}
              >
                {date.split('-').reverse().join('/')}
              </div>
            ))}
          </div>
          {form.occurrenceType === 'installment' && (
            <p className="text-xs text-texto-3 mt-1.5">
              {preview.length} parcela{preview.length !== 1 ? 's' : ''}.
            </p>
          )}
        </div>
      )}

      {/* Categoria (opcional) */}
      <div>
        <label className="label">Categoria</label>
        <SearchableSelect
          options={expenseCatOpts}
          preserveGroupOrder
          value={form.categoryId}
          onChange={id => set('categoryId', id)}
          placeholder="Sem categoria"
          ungroupedLast
          ungroupedLabel="Sem grupo"
        />
      </div>

      {/* Será pago com reserva */}
      <div className="bg-surface-2/40 rounded-xl p-3.5 space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.comReserva}
            onChange={e => setForm(f => ({ ...f, comReserva: e.target.checked, reservaFuncaoId: e.target.checked ? f.reservaFuncaoId : '' }))}
            className="w-4 h-4 rounded accent-primary cursor-pointer"
          />
          <span className="text-sm text-texto-2">Será pago com reserva</span>
        </label>

        {form.comReserva && (
          <div>
            <label className="label text-reserva">Função de Reserva *</label>
            <select
              className="input"
              value={form.reservaFuncaoId}
              onChange={e => set('reservaFuncaoId', e.target.value)}
            >
              <option value="">— Selecione —</option>
              {funcoesReserva.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
            {funcoesReserva.length === 0 && (
              <p className="text-xs text-texto-3 mt-1">Nenhuma função de reserva vinculada a uma conta.</p>
            )}
            <p className="text-xs text-texto-3 mt-1.5 leading-snug">
              A provisão entrará como resgate projetado no Fluxo Futuro desta reserva.
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        {podeGravarForm
          ? <button type="submit" className="btn-primary flex-1">{initial ? 'Salvar' : 'Lançar Provisão'}</button>
          : <p className="flex-1 text-xs text-texto-3 self-center text-center">Somente leitura — seu nível de acesso não permite gravar.</p>}
      </div>
    </form>
  )
}
