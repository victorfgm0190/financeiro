import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import InputMoeda from '../shared/InputMoeda'
import DateInput from '../shared/DateInput'
import { registrarBaixaBem } from '../../lib/bemApi'
import { MOTIVOS_BAIXA } from '../../lib/extratoBem'
import { isoLocal } from '../../lib/hoje'

// "Marcar como paga": a parcela conta como paga no bem e nenhum saldo de conta muda. A única exceção é a
// receita de benefício opcional do pagamento por terceiro. alvo = { parcelaId } | { scheduleId, ocorrencia }
// | {} (avulso). `soCredito`: crédito da administradora que não quita parcela.
export default function MarcarPagaModal({ bemId, alvo = {}, rotulo = '', valorSugerido = '', dataSugerida = '', cotas = [], soCredito = false, onCancel, onSuccess }) {
  const { payees, categories } = useApp()
  const [form, setForm] = useState({
    tipo: soCredito ? 'credito' : '',
    valor: valorSugerido === '' ? '' : String(valorSugerido),
    data: dataSugerida || isoLocal(new Date()),
    cota_numero: '',
    favorecido: '',
    gerar_receita: false,
    categoria_id: '',
    descricao: '',
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const campo = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const receitas = (categories || []).filter(c => c.type === 'income')

  const enviar = async (e) => {
    e.preventDefault()
    setSalvando(true)
    setErro('')
    try {
      const r = await registrarBaixaBem({
        bem_id: bemId,
        parcela_id: alvo.parcelaId || null,
        schedule_id: alvo.scheduleId || null,
        ocorrencia: alvo.ocorrencia || null,
        tipo: form.tipo,
        valor: Number(form.valor),
        data: form.data,
        cota_numero: form.cota_numero || null,
        favorecido: form.tipo === 'terceiro' ? form.favorecido : null,
        gerar_receita: form.tipo === 'terceiro' && form.gerar_receita,
        categoria_id: form.gerar_receita ? form.categoria_id : null,
        descricao: form.descricao || null,
      })
      await onSuccess(r)
    } catch (err) {
      setErro(err.message)
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      {rotulo && <p className="text-sm text-texto-2">{rotulo}</p>}
      {!soCredito && (
        <div>
          <label className="label" htmlFor="baixa-motivo">Motivo *</label>
          <select id="baixa-motivo" className="input" required value={form.tipo} onChange={campo('tipo')}>
            <option value="">Selecione o motivo...</option>
            {MOTIVOS_BAIXA.map(m => <option key={m.id} value={m.id}>{m.rotulo}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="baixa-valor">{form.tipo === 'credito' ? 'Valor do crédito (R$) *' : 'Valor (R$) *'}</label>
          <InputMoeda id="baixa-valor" required value={form.valor} onChange={campo('valor')} placeholder="Pode ser diferente do valor da parcela" />
        </div>
        <div>
          <label className="label" htmlFor="baixa-data">Data *</label>
          <DateInput id="baixa-data" className="input" required value={form.data} onChange={campo('data')} />
        </div>
      </div>
      {cotas.length > 0 && (
        <div>
          <label className="label" htmlFor="baixa-cota">Cota</label>
          <select id="baixa-cota" className="input" value={form.cota_numero} onChange={campo('cota_numero')}>
            <option value="">Sem cota específica</option>
            {cotas.map(c => <option key={c.numero} value={c.numero}>{c.numero}</option>)}
          </select>
        </div>
      )}
      {form.tipo === 'terceiro' && (
        <>
          <div>
            <label className="label" htmlFor="baixa-favorecido">Quem pagou *</label>
            <select id="baixa-favorecido" className="input" required value={form.favorecido} onChange={campo('favorecido')}>
              <option value="">Selecione o favorecido...</option>
              {[...new Set(payees || [])].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-texto-2 cursor-pointer">
            <input type="checkbox" className="accent-primary" checked={form.gerar_receita} onChange={e => setForm(f => ({ ...f, gerar_receita: e.target.checked }))} />
            Gerar a receita de benefício no Demonstrativo
          </label>
          {form.gerar_receita && (
            <div>
              <label className="label" htmlFor="baixa-categoria">Categoria da receita *</label>
              <select id="baixa-categoria" className="input" required value={form.categoria_id} onChange={campo('categoria_id')}>
                <option value="">Selecione a categoria...</option>
                {receitas.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </>
      )}
      <div>
        <label className="label" htmlFor="baixa-descricao">Observação</label>
        <input id="baixa-descricao" className="input" value={form.descricao} onChange={campo('descricao')} placeholder="Como aparece no extrato do bem" />
      </div>
      <p className="text-xs text-texto-3">
        Nenhum saldo de conta muda{form.tipo === 'terceiro' && form.gerar_receita ? ', e a receita entra na conta do próprio bem' : ''}. Dá para desfazer depois, no Resumo do bem.
      </p>
      {erro && <p className="text-sm text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
      <div className="flex gap-3">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={salvando}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={salvando}>
          {salvando && <Loader2 size={14} className="animate-spin" />} Confirmar
        </button>
      </div>
    </form>
  )
}
