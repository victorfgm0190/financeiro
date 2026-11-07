import { useContext, useState } from 'react'
import { Plus, Trash2, Pencil, Check } from 'lucide-react'
import CategorySelect from '../shared/CategorySelect'
import HelpCampo from '../shared/HelpCampo'
import CampoValor from './CampoValor'
import { TIPOS_TAXA, BOTOES_TAXA, novaTaxaForm, parcelasDoTexto, resumoTaxa, somaParcelasTexto, erroTaxa } from '../../lib/contratos/taxasRepasseForm'
import { valorBRFormatado } from '../../lib/valorBR'
import { CampoErroContext, CLASSE_ERRO } from './campoErro'

// Taxas da administradora no cadastro do contrato a receber: tarifa fixa (todo mês, de/até uma
// competência) e taxa única em parcelas de valor livre (ex.: intermediação = 1º aluguel).
// Cada uma é um cartão com o resumo em uma linha; "Editar" abre os campos e "OK" fecha de volta.
// `_editando` (só da tela; formParaTaxa ignora) diz qual cartão está aberto.
export default function TaxasRepasse({ linhas, onChange, categories, perfilId, inicio }) {
  const falha = useContext(CampoErroContext)
  // Erro do "OK" (cartão que não fecha enquanto falta algo), por índice.
  const [erroOk, setErroOk] = useState({})
  const setL = (i, campos) => {
    setErroOk(p => (p[i] ? { ...p, [i]: '' } : p))
    onChange(linhas.map((l, j) => (j === i ? { ...l, ...campos } : l)))
  }
  const ok = (i) => {
    const e = erroTaxa(linhas[i])
    if (e) return setErroOk(p => ({ ...p, [i]: e }))
    setL(i, { _editando: false })
  }
  const excluir = (i) => {
    setErroOk({})
    onChange(linhas.filter((_, j) => j !== i))
  }
  return (
    <div className="space-y-2" data-guia="contrato-form.taxas-repasse">
      <p className="label mb-0">Tarifas e taxas da administradora</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Object.entries(BOTOES_TAXA).map(([k, b]) => (
          <div key={k} className="min-w-0">
            <div className="flex items-center gap-1">
              <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1"
                onClick={() => onChange([...linhas, { ...novaTaxaForm(k, inicio), _editando: true }])}>
                <Plus size={12} /> {b.rotulo}
              </button>
              <HelpCampo texto={b.explicacao} />
            </div>
            <p className="text-[11px] text-texto-3 mt-1">{b.explicacao}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-texto-2">As tarifas e taxas são gravadas ao concluir o cadastro (Confirmar / Salvar aditivo).</p>
      {linhas.length === 0 && <p className="text-[11px] text-texto-3">Nenhuma. Tarifa bancária, taxa de intermediação e afins descontadas no repasse.</p>}
      {linhas.map((l, i) => {
        const unica = l.tipo_repasse === 'taxa_unica'
        const daValidacao = falha?.campo === `taxa:${i}` ? falha.erro : ''
        const erro = erroOk[i] || daValidacao
        const aberto = !!l._editando || !!erro
        const soma = unica ? somaParcelasTexto(l) : null
        return (
          <div key={i} data-campo={`taxa:${i}`} data-testid="cartao-taxa" data-erro={erro ? '' : undefined}
            className={`p-2 rounded-lg bg-surface-2/60 space-y-2 ${erro ? CLASSE_ERRO : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-texto-3">{TIPOS_TAXA[l.tipo_repasse]}</p>
                {!aberto && <p className="text-sm text-texto-1 break-words" data-testid="resumo-taxa">{resumoTaxa(l)}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!aberto && (
                  <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1" onClick={() => setL(i, { _editando: true })}>
                    <Pencil size={12} /> Editar
                  </button>
                )}
                <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1 hover:text-perigo" onClick={() => excluir(i)}>
                  <Trash2 size={12} /> Excluir
                </button>
              </div>
            </div>
            {aberto && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <input autoComplete="off" className="input py-1.5 text-sm col-span-2" placeholder={unica ? 'Ex.: Taxa de intermediação' : 'Ex.: Tarifa bancária'}
                    aria-label="Descrição da taxa" value={l.descricao} onChange={e => setL(i, { descricao: e.target.value })} maxLength={200} />
                  <CampoValor className="input py-1.5 text-sm" placeholder={unica ? 'Total' : 'Valor por mês'} aria-label={unica ? 'Valor total da taxa' : 'Valor da tarifa'}
                    value={l.valor} onChange={v => setL(i, { valor: v })} />
                  <label className="flex items-center gap-1 text-[11px] text-texto-2">
                    <input type="checkbox" className="accent-primary" checked={!!l.dedutivel_ir} onChange={e => setL(i, { dedutivel_ir: e.target.checked })} />
                    Dedutível IR
                  </label>
                  <label className="text-[11px] text-texto-3 col-span-1">
                    {unica ? 'Competência da 1ª parcela' : 'A partir da competência'}
                    <input type="month" className="input py-1 text-sm" aria-label={unica ? 'Competência da 1ª parcela' : 'Competência inicial'} value={l.vigencia_inicio}
                      onChange={e => setL(i, { vigencia_inicio: e.target.value })} />
                  </label>
                  {unica ? (
                    <label className="text-[11px] text-texto-3 col-span-1 sm:col-span-2">
                      Valor de cada parcela — separe com ";"
                      <input autoComplete="off" className="input py-1 text-sm" placeholder="Ex.: 470,00; 865,00; 865,00" aria-label="Valores das parcelas"
                        value={l.parcelas} onChange={e => setL(i, { parcelas: e.target.value })}
                        onBlur={() => { const v = parcelasDoTexto(l.parcelas); if (v) setL(i, { parcelas: v.map(valorBRFormatado).join('; ') }) }} />
                      {soma && (
                        <span data-testid="soma-parcelas" className={`block mt-1 ${soma.ok ? 'text-receita' : 'text-aviso'}`}>
                          {soma.texto}{!soma.ok && ' (dá para gravar assim mesmo)'}
                        </span>
                      )}
                    </label>
                  ) : (
                    <label className="text-[11px] text-texto-3 col-span-1">
                      Até a competência (opcional)
                      <input type="month" className="input py-1 text-sm" aria-label="Competência final" value={l.vigencia_fim}
                        onChange={e => setL(i, { vigencia_fim: e.target.value })} />
                    </label>
                  )}
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <p className="text-[11px] text-texto-3">Categoria</p>
                    <CategorySelect categories={categories} value={l.categoria_id} onChange={e => setL(i, { categoria_id: e.target.value })} type="expense" perfilId={perfilId || null} searchable placeholder="A da taxa de adm." />
                  </div>
                </div>
                {erro && <p role="alert" className="text-xs text-perigo">{erro}</p>}
                <div className="flex justify-end">
                  <button type="button" className="btn-primary text-xs py-1 flex items-center gap-1" onClick={() => ok(i)}>
                    <Check size={12} /> OK
                  </button>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
