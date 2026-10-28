import { useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import { parsearTextoBoleto, classificarItens, resumoItens } from '../../lib/contratos/composicao'
import { rotuloContrato } from '../../lib/contratos/parcelas'

const TIPOS = { comeca_com: 'começa com', contem: 'contém' }
const RESP = { inquilino: 'Inquilino', proprietario: 'Proprietário' }
const VAZIA = { padrao: '', tipo_match: 'comeca_com', responsavel: 'proprietario', observacao: '' }

function FormRegra({ inicial, onSalvar, onCancelar }) {
  const [f, setF] = useState({ ...VAZIA, ...inicial })
  const [erro, setErro] = useState('')
  const salvar = async () => {
    if (!f.padrao.trim()) return setErro('Informe o texto do item.')
    try { await onSalvar({ ...f, padrao: f.padrao.trim() }) } catch (e) { setErro(e.message) }
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-[1fr_130px_150px_auto] gap-2 items-center p-2 rounded-lg bg-surface-2/60">
      <input className="input py-1.5 text-sm col-span-2 sm:col-span-1" autoFocus value={f.padrao} placeholder="Digite o texto do item"
        onChange={e => { setErro(''); setF(p => ({ ...p, padrao: e.target.value })) }} />
      <select className="input py-1.5 text-sm" value={f.tipo_match} onChange={e => setF(p => ({ ...p, tipo_match: e.target.value }))}>
        {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select className="input py-1.5 text-sm" value={f.responsavel} onChange={e => setF(p => ({ ...p, responsavel: e.target.value }))}>
        {Object.entries(RESP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <div className="flex gap-1 justify-end">
        <button type="button" className="btn-secondary text-xs py-1.5" onClick={onCancelar}><X size={12} /></button>
        <button type="button" className="btn-primary text-xs py-1.5" onClick={salvar}><Check size={12} /></button>
      </div>
      {erro && <p className="col-span-2 sm:col-span-4 text-[11px] text-perigo">{erro}</p>}
    </div>
  )
}

// Contratos › Regras de itens: quem paga cada item do boleto do condomínio (globais e por contrato)
// + teste "colar o texto e ver a classificação".
export default function RegrasItensPanel() {
  const { regrasContratos, criarRegraContrato, atualizarRegraContrato, excluirRegraContrato, contratos, pode } = useApp()
  const [escopo, setEscopo] = useState('')
  const [novo, setNovo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const podeEditar = pode('contratos', 'editar')
  const lista = useMemo(() => regrasContratos
    .filter(r => (escopo ? r.contrato_id === escopo : !r.contrato_id))
    .sort((a, b) => a.padrao.localeCompare(b.padrao)), [regrasContratos, escopo])
  const teste = useMemo(() => {
    if (!texto.trim()) return null
    const { itens, total } = parsearTextoBoleto(texto)
    const classificados = classificarItens(itens, regrasContratos, escopo || null)
    return { itens: classificados, total, res: resumoItens(classificados) }
  }, [texto, regrasContratos, escopo])
  const nomeContrato = (id) => { const c = contratos.find(x => x.id === id); return c ? rotuloContrato(c) : 'Contrato' }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label text-xs">Regras de</label>
          <select className="input py-1.5 text-sm" value={escopo} onChange={e => { setEscopo(e.target.value); setNovo(false) }}>
            <option value="">Todos os contratos (globais)</option>
            {contratos.map(c => <option key={c.id} value={c.id}>{rotuloContrato(c)}</option>)}
          </select>
        </div>
        <p className="text-xs text-texto-3 pb-2 flex-1 min-w-[200px]">A regra do contrato vence a global; "começa com" vence "contém". Sem texto diferenciando maiúsculas nem acentos.</p>
        {podeEditar && <button className="btn-primary text-xs inline-flex items-center gap-1" onClick={() => setNovo(true)}><Plus size={12} /> Regra</button>}
      </div>
      {erro && <p className="text-xs text-perigo">{erro}</p>}
      {novo && <FormRegra onCancelar={() => setNovo(false)} onSalvar={async (r) => { await criarRegraContrato({ ...r, contrato_id: escopo || null }); setNovo(false) }} />}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-texto-3 border-b border-borda">
            <th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Casa se</th>
            <th className="px-3 py-2 text-left">De quem é</th><th className="px-3 py-2 text-left">Origem</th><th className="px-3 py-2 w-20" />
          </tr></thead>
          <tbody>
            {lista.map(r => editando === r.id ? (
              <tr key={r.id}><td colSpan={5} className="p-2">
                <FormRegra inicial={r} onCancelar={() => setEditando(null)} onSalvar={async (f) => { await atualizarRegraContrato({ ...r, ...f }); setEditando(null) }} />
              </td></tr>
            ) : (
              <tr key={r.id} className="border-b border-borda/50">
                <td className="px-3 py-2 text-texto-1">{r.padrao}</td>
                <td className="px-3 py-2 text-texto-2 text-xs">{TIPOS[r.tipo_match]}</td>
                <td className="px-3 py-2 text-texto-2 text-xs">{RESP[r.responsavel]}</td>
                <td className="px-3 py-2 text-texto-3 text-xs">{r.contrato_id ? nomeContrato(r.contrato_id) : 'Global'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {podeEditar && <>
                    <button className="p-1 text-texto-3 hover:text-texto-1" title="Editar" onClick={() => setEditando(r.id)}><Pencil size={13} /></button>
                    <button className="p-1 text-texto-3 hover:text-perigo" title="Excluir" onClick={() => excluirRegraContrato(r.id).catch(e => setErro(e.message))}><Trash2 size={13} /></button>
                  </>}
                </td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-xs text-texto-3">Nenhuma regra {escopo ? 'deste contrato' : 'global'}.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card space-y-2">
        <p className="label">Testar: cole o texto do boleto</p>
        <textarea className="input min-h-[110px] font-mono text-xs" value={texto} onChange={e => setTexto(e.target.value)} placeholder={'Taxa de Condomínio 795,11\nFundo de Reserva 79,10'} />
        {teste && (
          <>
            <table className="w-full text-xs">
              <tbody>
                {teste.itens.map((i, k) => (
                  <tr key={k} className="border-b border-borda/50">
                    <td className="py-1 text-texto-2">{i.desc}</td>
                    <td className="py-1 text-right text-texto-1">{fmt(i.valor)}</td>
                    <td className="py-1 pl-3">{i.responsavel ? RESP[i.responsavel] : <span className="text-aviso">⚠ sem regra</span>}</td>
                    <td className="py-1 pl-3 text-texto-3">{i.regra || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-texto-2">
              Soma {fmt(teste.res.total)}{teste.total != null ? ` (total do texto ${fmt(teste.total)})` : ''} · do proprietário {fmt(teste.res.proprietario)} · sem regra: {teste.res.semDono}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
