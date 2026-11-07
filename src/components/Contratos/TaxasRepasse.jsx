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
// `aluguel`: valor do aluguel do contrato (botão "= 1º aluguel" no total da taxa única).
export default function TaxasRepasse({ linhas, onChange, categories, perfilId, inicio, aluguel = 0 }) {
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
                  <div className={`min-w-0 ${unica ? 'flex items-center gap-1' : ''}`}>
                    <CampoValor className="input py-1.5 text-sm min-w-0" placeholder={unica ? 'Total' : 'Valor por mês'} aria-label={unica ? 'Valor total da taxa' : 'Valor da tarifa'}
                      value={l.valor} onChange={v => setL(i, { valor: v })} />
                    {unica && (
                      <button type="button" className="btn-secondary text-[11px] py-1 px-2 whitespace-nowrap" disabled={!(aluguel > 0)}
                        title={aluguel > 0 ? `Total = aluguel do contrato (${valorBRFormatado(aluguel)})` : 'Informe o valor do aluguel primeiro'}
                        onClick={() => setL(i, { valor: valorBRFormatado(aluguel) })}>
                        = 1º aluguel
                      </button>
                    )}
                  </div>
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
                    <div className="text-[11px] text-texto-3 col-span-1 sm:col-span-2">
                      <label htmlFor={`taxa-parcelas-${i}`}>Valor de cada parcela (opcional) — separe com ";"</label>
                      <input id={`taxa-parcelas-${i}`} autoComplete="off" className="input py-1 text-sm" placeholder="Vazio = tudo de uma vez" aria-label="Valores das parcelas"
                        value={l.parcelas ?? ''} onChange={e => setL(i, { parcelas: e.target.value })}
                        onBlur={e => { const v = parcelasDoTexto(e.target.value); if (v?.length) setL(i, { parcelas: v.map(valorBRFormatado).join('; ') }) }} />
                      {soma && (
                        <span data-testid="soma-parcelas" className={`block mt-1 ${soma.ok ? 'text-receita' : 'text-aviso'}`}>
                          {soma.texto}{!soma.ok && ' (dá para gravar assim mesmo)'}
                        </span>
                      )}
                      <span className="block mt-1">Deixe vazio para descontar tudo de uma vez. O saldo com a administradora vai abatendo nos meses seguintes até zerar.</span>
                    </div>
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
