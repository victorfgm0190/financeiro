import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Check, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import CategorySelect from '../shared/CategorySelect'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
import { fmt, fmtDate } from '../shared/utils'
import { parseValorBR, valorParaInput } from '../../lib/valorBR'
import { buscarContratoApi } from '../../lib/contratosApi'
import { gerarPlanoParcelas, proximoReajuste, PAPEIS, r2, rotuloContrato, textoProjecao } from '../../lib/contratos/parcelas'
import { validarEtapa, sugerirCategoria } from '../../lib/contratos/validacao'
import { candidatosVinculo } from '../../lib/contratos/vinculo'
import { hojeStr, ymDe, fmtYm } from '../../lib/contratos/datas'
import VinculoModal from './VinculoModal'

const ETAPAS = ['Dados', 'Valores e bonificação', 'Reajuste', 'Imóvel e condomínio', 'Prévia']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const TIPOS_IMOVEL = { casa: 'Casa', apartamento: 'Apartamento', sala: 'Sala comercial', galpao: 'Galpão', outro: 'Outro' }
const GRUPOS_ITEM = { iptu: 'IPTU', seguro: 'Seguro', condominio: 'Condomínio', outro: 'Outro' }
const MAX_LINHAS_PREVIA = 36
// Campos que mexem nas parcelas: mudou algum → evento 'aditivo' e regeneração das pendentes.
const FINANCEIROS = ['valor_base', 'periodicidade', 'dia_vencimento', 'bonificacao_valor', 'bonificacao_meses', 'indice_reajuste',
  'percentual_fixo', 'mes_base_reajuste', 'data_inicio', 'data_fim', 'tem_condominio', 'valor_condominio_previsto', 'dia_vencimento_condominio']

const txt = (v) => (v == null ? '' : String(v))
const num = (v) => { const n = parseValorBR(v); return Number.isFinite(n) ? n : null }
const int = (v) => (v === '' || v == null ? null : Number.parseInt(v, 10))

function formDoContrato(c, padrao) {
  if (!c) return padrao
  return {
    ...padrao, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])),
    sem_fim: !c.data_fim,
    valor_base: valorParaInput(c.valor_base), bonificacao_valor: valorParaInput(c.bonificacao_valor || ''),
    valor_condominio_previsto: valorParaInput(c.valor_condominio_previsto ?? ''),
    percentual_fixo: c.percentual_fixo == null ? '' : String(c.percentual_fixo).replace('.', ','),
  }
}

// Formulário → linha da tabela contratos (o que a API valida).
function paraContrato(f) {
  return {
    perfil_id: f.perfil_id || null, tipo: f.tipo, modalidade: f.modalidade, numero: f.numero || null, objeto: f.objeto || null,
    favorecido: f.favorecido || null, favorecido_condominio: f.tem_condominio ? f.favorecido_condominio || null : null,
    data_inicio: f.data_inicio, data_fim: f.sem_fim ? null : f.data_fim || null,
    renovacao_automatica: !!f.renovacao_automatica, aviso_previo_dias: int(f.aviso_previo_dias) ?? 30,
    valor_base: num(f.valor_base) ?? 0, periodicidade: f.periodicidade, dia_vencimento: int(f.dia_vencimento),
    dia_vencimento_condominio: f.tem_condominio ? int(f.dia_vencimento_condominio) : null,
    categoria_id: f.categoria_id || null, categoria_condominio_id: f.tem_condominio ? f.categoria_condominio_id || null : null,
    conta_id: f.conta_id || null, centro_custo: f.centro_custo || null, tipo_documento_id: f.tipo_documento_id || null,
    indice_reajuste: f.indice_reajuste, percentual_fixo: f.indice_reajuste === 'FIXO' ? num(f.percentual_fixo) : null,
    mes_base_reajuste: int(f.mes_base_reajuste), bonificacao_valor: num(f.bonificacao_valor) ?? 0,
    bonificacao_meses: int(f.bonificacao_meses) ?? 0, tipo_imovel: f.tipo_imovel || null, tem_condominio: !!f.tem_condominio,
    valor_condominio_previsto: f.tem_condominio ? num(f.valor_condominio_previsto) : null,
    link_anexo: f.link_anexo || null, status: f.status || 'ativo', observacao: f.observacao || null,
  }
}

const Campo = ({ label, children, className = '' }) => (
  <div className={className}><label className="label">{label}</label>{children}</div>
)

// Cadastro em etapas (novo) e Aditivo (edição com prévia do que muda nas parcelas pendentes).
export default function ContratoWizard({ contrato = null, onClose, onSalvo }) {
  const {
    profiles, accounts, categories, payees, costCenters, tiposDocumento, activeProfileId, schedules,
    criarContrato, atualizarContrato, salvarItensContrato, carregarIndice, indicesContratos,
    planejarParcelasContrato, aplicarParcelasContrato, vincularEGerarContrato,
  } = useApp()
  const edicao = !!contrato
  const hoje = hojeStr()
  const tipoCtr = tiposDocumento.find(t => t.sigla === 'CTR' && t.ativo !== false)
  const moradia = sugerirCategoria(categories, 'expense')
  const [f, setF] = useState(() => formDoContrato(contrato, {
    tipo: 'pagar', modalidade: 'aluguel', perfil_id: activeProfileId || profiles[0]?.id || '', objeto: '', numero: '',
    favorecido: '', favorecido_condominio: '', data_inicio: hoje, data_fim: '', sem_fim: false, renovacao_automatica: false,
    aviso_previo_dias: '30', valor_base: '', periodicidade: 'mensal', dia_vencimento: '', bonificacao_valor: '',
    bonificacao_meses: '', conta_id: '', categoria_id: moradia, centro_custo: '', tipo_documento_id: tipoCtr?.id || '',
    indice_reajuste: 'IPCA', percentual_fixo: '', mes_base_reajuste: '', tipo_imovel: 'apartamento', tem_condominio: false,
    valor_condominio_previsto: '', dia_vencimento_condominio: '', categoria_condominio_id: moradia, link_anexo: '',
    observacao: '', status: 'ativo',
  }))
  const [itens, setItens] = useState([])
  const [etapa, setEtapa] = useState(0)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [apartirDe, setApartirDe] = useState(() => {
    const a = ymDe(hoje), b = ymDe(contrato?.data_inicio || hoje)
    return a > b ? a : b
  })
  const [planoEdicao, setPlanoEdicao] = useState(null)
  const [vinculo, setVinculo] = useState(null)
  const set = (k, v) => { setErro(''); setF(p => ({ ...p, [k]: v })) }

  useEffect(() => {
    if (!edicao) return
    buscarContratoApi(contrato.id).then(r => setItens((r.itens || []).map(i => ({ ...i, valor_previsto: valorParaInput(i.valor_previsto ?? '') })))).catch(() => {})
  }, [edicao, contrato?.id])

  useEffect(() => {
    if (f.indice_reajuste === 'IPCA' || f.indice_reajuste === 'IGPM') carregarIndice(f.indice_reajuste).catch(() => {})
  }, [f.indice_reajuste, carregarIndice])

  const contas = useMemo(() => accounts.filter(a => a.type !== 'credit' && a.active !== false && (!f.perfil_id || !a.profileId || a.profileId === f.perfil_id)), [accounts, f.perfil_id])
  const dados = useMemo(() => paraContrato(f), [f])
  const indice = indicesContratos[f.indice_reajuste]
  const tipoCat = f.tipo === 'receber' ? 'income' : 'expense'

  const planoNovo = useMemo(() => (etapa === 4 && !edicao
    ? gerarPlanoParcelas({ ...dados, id: 'novo' }, { hoje, indices: indicesContratos, apartirDe })
    : []), [etapa, edicao, dados, hoje, indicesContratos, apartirDe])

  useEffect(() => {
    if (etapa !== 4 || !edicao) return
    let vivo = true
    planejarParcelasContrato({ ...contrato, ...dados }).then(p => { if (vivo) setPlanoEdicao(p) }).catch(e => setErro(e.message))
    return () => { vivo = false }
  }, [etapa, edicao, contrato, dados, planejarParcelasContrato])

  const avancar = () => {
    const e = validarEtapa(etapa, f)
    if (e) return setErro(e)
    setEtapa(x => Math.min(x + 1, ETAPAS.length - 1))
  }
  const itensPayload = () => itens.filter(i => txt(i.descricao).trim()).map(i => ({
    descricao: i.descricao.trim(), grupo: i.grupo || 'outro', responsavel: i.responsavel || 'inquilino',
    valor_previsto: num(i.valor_previsto), categoria_id: i.categoria_id || null, ativo: i.ativo !== false,
  }))

  const confirmar = async () => {
    for (let i = 0; i < 4; i++) {
      const e = validarEtapa(i, f)
      if (e) { setEtapa(i); return setErro(e) }
    }
    setSalvando(true)
    setErro('')
    try {
      if (!edicao) {
        const c = await criarContrato(dados, itensPayload())
        const candidatos = candidatosVinculo(c, schedules)
        if (candidatos.length) { setVinculo({ contrato: c, candidatos }); return }
        await vincularEGerarContrato(c, { apartirDe })
        onSalvo?.(c)
        return
      }
      const mudou = {}
      for (const [k, v] of Object.entries(dados)) {
        const antes = contrato[k] ?? null
        if (JSON.stringify(antes) !== JSON.stringify(v)) mudou[k] = { de: antes, para: v }
      }
      const financeiro = Object.keys(mudou).some(k => FINANCEIROS.includes(k))
      const evento = financeiro ? {
        tipo: 'aditivo', data_evento: hoje, valor_anterior: contrato.valor_base, valor_novo: dados.valor_base,
        detalhes: { campos: mudou },
      } : null
      const campos = Object.fromEntries(Object.keys(mudou).map(k => [k, dados[k]]))
      const salvo = await atualizarContrato(contrato.id, campos, evento)
      await salvarItensContrato(contrato.id, itensPayload())
      const plano = await planejarParcelasContrato(salvo)
      await aplicarParcelasContrato(plano, { motivo: `Contrato ${rotuloContrato(salvo)}: ${financeiro ? 'aditivo' : 'edição'}` })
      onSalvo?.(salvo)
    } catch (err) {
      setErro(err?.message || 'Falha ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  if (vinculo) {
    return (
      <VinculoModal
        contrato={vinculo.contrato} candidatos={vinculo.candidatos} apartirDe={apartirDe} geracao
        onClose={() => onSalvo?.(vinculo.contrato)} onConcluido={() => onSalvo?.(vinculo.contrato)}
      />
    )
  }

  const proxReaj = proximoReajuste(dados, hoje)
  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-1.5 text-[11px]">
        {ETAPAS.map((e, i) => (
          <li key={e}>
            <button type="button" onClick={() => (i < etapa ? setEtapa(i) : null)}
              className={`px-2 py-1 rounded-full border ${i === etapa ? 'border-primary bg-primary/15 text-primary-fg font-semibold' : i < etapa ? 'border-borda-forte text-texto-2 hover:bg-surface-hover' : 'border-borda text-texto-3 cursor-default'}`}>
              {i + 1}. {e}
            </button>
          </li>
        ))}
      </ol>

      {etapa === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Tipo">
            <select className="input" value={f.tipo} disabled={edicao} onChange={e => {
              const t = e.target.value
              const sug = sugerirCategoria(categories, t === 'receber' ? 'income' : 'expense')
              setErro('')
              setF(p => ({ ...p, tipo: t, categoria_id: sug, categoria_condominio_id: sug }))
            }}>
              <option value="pagar">A pagar (sou o inquilino)</option>
              <option value="receber">A receber (sou o proprietário)</option>
            </select>
          </Campo>
          <Campo label="Modalidade">
            <select className="input" value={f.modalidade} onChange={e => set('modalidade', e.target.value)}>
              <option value="aluguel">Aluguel</option><option value="servico">Serviço</option><option value="outro">Outro</option>
            </select>
          </Campo>
          <Campo label="Perfil">
            <select className="input" value={f.perfil_id} onChange={e => set('perfil_id', e.target.value)}>
              <option value="">Escolha…</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Campo>
          <Campo label="Número do contrato (opcional)">
            <input autoComplete="off" className="input" value={f.numero} onChange={e => set('numero', e.target.value)} maxLength={60} />
          </Campo>
          <Campo label="Objeto (ex.: Apto 302 — Ed. Sol)" className="sm:col-span-2">
            <input autoComplete="off" className="input" value={f.objeto} onChange={e => set('objeto', e.target.value)} maxLength={200} />
          </Campo>
          <Campo label={f.tipo === 'receber' ? 'Inquilino (favorecido)' : 'Favorecido do aluguel (imobiliária / proprietário)'} className="sm:col-span-2">
            <FavorecidoAutocomplete value={f.favorecido} onChange={v => set('favorecido', v)} suggestions={payees || []} />
          </Campo>
          <Campo label="Início da vigência">
            <input autoComplete="off" type="date" className="input" value={f.data_inicio} onChange={e => set('data_inicio', e.target.value)} />
          </Campo>
          <Campo label="Fim da vigência">
            <input autoComplete="off" type="date" className="input" value={f.sem_fim ? '' : f.data_fim} disabled={f.sem_fim} onChange={e => set('data_fim', e.target.value)} />
            <label className="flex items-center gap-2 text-xs text-texto-2 mt-1">
              <input autoComplete="off" type="checkbox" className="accent-primary" checked={f.sem_fim} onChange={e => set('sem_fim', e.target.checked)} />
              Sem data de fim (gera 12 meses à frente e estende sozinho)
            </label>
          </Campo>
          <Campo label="Aviso prévio (dias)">
            <input autoComplete="off" type="number" min="0" max="365" className="input" value={f.aviso_previo_dias} onChange={e => set('aviso_previo_dias', e.target.value)} />
          </Campo>
          <Campo label="Renovação">
            <label className="flex items-center gap-2 text-sm text-texto-2 mt-2">
              <input autoComplete="off" type="checkbox" className="accent-primary" checked={!!f.renovacao_automatica} onChange={e => set('renovacao_automatica', e.target.checked)} />
              Renovação automática
            </label>
          </Campo>
          <Campo label="Link do contrato (anexo)" className="sm:col-span-2">
            <input autoComplete="off" className="input" value={f.link_anexo} onChange={e => set('link_anexo', e.target.value)} placeholder="https://drive.google.com/…" />
          </Campo>
          <Campo label="Observação" className="sm:col-span-2">
            <textarea className="input min-h-[60px]" value={f.observacao} onChange={e => set('observacao', e.target.value)} maxLength={2000} />
          </Campo>
        </div>
      )}

      {etapa === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Conta de pagamento">
            <select className="input" value={f.conta_id} onChange={e => set('conta_id', e.target.value)}>
              <option value="">Escolha…</option>
              {contas.map(a => <option key={a.id} value={a.id}>{a.apelido || a.name}</option>)}
            </select>
            <p className="text-[11px] text-texto-3 mt-1">Cartão de crédito não é aceito nesta versão.</p>
          </Campo>
          <Campo label="Categoria do aluguel">
            <CategorySelect categories={categories} value={f.categoria_id} onChange={e => set('categoria_id', e.target.value)} type={tipoCat} perfilId={f.perfil_id || null} searchable />
          </Campo>
          <Campo label="Valor do aluguel (contratual)">
            <input autoComplete="off" className="input" inputMode="decimal" value={f.valor_base} onChange={e => set('valor_base', e.target.value)} placeholder="3.900,00" />
          </Campo>
          <Campo label="Periodicidade">
            <select className="input" value={f.periodicidade} onChange={e => set('periodicidade', e.target.value)}>
              <option value="mensal">Mensal</option><option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option><option value="anual">Anual</option><option value="unica">Única</option>
            </select>
          </Campo>
          <Campo label="Dia de vencimento">
            <input autoComplete="off" type="number" min="1" max="31" className="input" value={f.dia_vencimento} onChange={e => set('dia_vencimento', e.target.value)} />
          </Campo>
          <Campo label="Tipo de documento">
            <select className="input" value={f.tipo_documento_id} onChange={e => set('tipo_documento_id', e.target.value)}>
              <option value="">Sem tipo</option>
              {tiposDocumento.filter(t => t.ativo !== false).map(t => <option key={t.id} value={t.id}>{t.sigla} — {t.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Centro de custo">
            <select className="input" value={f.centro_custo} onChange={e => set('centro_custo', e.target.value)}>
              <option value="">Nenhum</option>
              {(costCenters || []).map(cc => <option key={cc} value={cc}>{cc}</option>)}
            </select>
          </Campo>
          <div />
          <Campo label="Bonificação por mês (desconto)">
            <input autoComplete="off" className="input" inputMode="decimal" value={f.bonificacao_valor} onChange={e => set('bonificacao_valor', e.target.value)} placeholder="200,00" />
          </Campo>
          <Campo label="Bonificação nos primeiros (meses)">
            <input autoComplete="off" type="number" min="0" className="input" value={f.bonificacao_meses} onChange={e => set('bonificacao_meses', e.target.value)} />
          </Campo>
          {num(f.bonificacao_valor) > 0 && num(f.valor_base) > 0 && (
            <p className="sm:col-span-2 text-xs text-texto-2">
              Parcelas 1 a {int(f.bonificacao_meses) || 0}: {fmt(num(f.valor_base))} − {fmt(num(f.bonificacao_valor))} = <strong className="text-texto-1">{fmt(r2(num(f.valor_base) - num(f.bonificacao_valor)))}</strong>
            </p>
          )}
        </div>
      )}

      {etapa === 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Índice de reajuste">
            <select className="input" value={f.indice_reajuste} onChange={e => set('indice_reajuste', e.target.value)}>
              <option value="IPCA">IPCA</option><option value="IGPM">IGP-M</option>
              <option value="FIXO">Percentual fixo</option><option value="NENHUM">Sem reajuste</option>
            </select>
            {(f.indice_reajuste === 'IPCA' || f.indice_reajuste === 'IGPM') && (
              indice?.acumulado_12m != null ? (
                <p className="text-[11px] text-texto-2 mt-1">
                  Acumulado em 12 meses até {fmtYm(indice.competencia)}: <strong className="text-texto-1">{String(indice.acumulado_12m).replace('.', ',')}%</strong> (Banco Central) — é o usado na projeção.
                  {indice.aviso && <span className="block text-aviso">⚠ {indice.aviso}</span>}
                </p>
              ) : (
                <p className="text-[11px] text-aviso mt-1">
                  ⚠ {indice ? indice.aviso || 'Índice indisponível.' : 'Buscando o índice no Banco Central…'} As parcelas projetadas ficam no valor atual (0%) e são recalculadas sozinhas quando o índice chegar.
                </p>
              )
            )}
          </Campo>
          {f.indice_reajuste === 'FIXO' && (
            <Campo label="Percentual fixo ao ano (%)">
              <input autoComplete="off" className="input" inputMode="decimal" value={f.percentual_fixo} onChange={e => set('percentual_fixo', e.target.value)} placeholder="5,00" />
            </Campo>
          )}
          {f.indice_reajuste !== 'NENHUM' && (
            <Campo label="Mês-base do reajuste">
              <select className="input" value={f.mes_base_reajuste} onChange={e => set('mes_base_reajuste', e.target.value)}>
                <option value="">Aniversário do contrato</option>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Campo>
          )}
          <p className="sm:col-span-2 text-xs text-texto-2">
            {f.indice_reajuste === 'NENHUM'
              ? 'Sem reajuste: todas as parcelas com o mesmo valor.'
              : <>Próximo reajuste: <strong className="text-texto-1">{proxReaj ? fmtDate(proxReaj) : '—'}</strong>. As parcelas depois de cada aniversário nascem como <em>Projetado</em> (último valor confirmado × índice de 12 meses) até você confirmar o valor do boleto.</>}
          </p>
        </div>
      )}

      {etapa === 3 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Tipo do imóvel">
              <select className="input" value={f.tipo_imovel} onChange={e => set('tipo_imovel', e.target.value)}>
                {Object.entries(TIPOS_IMOVEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo label="Condomínio">
              <label className="flex items-center gap-2 text-sm text-texto-2 mt-2">
                <input autoComplete="off" type="checkbox" className="accent-primary" checked={!!f.tem_condominio} onChange={e => set('tem_condominio', e.target.checked)} />
                Tem condomínio (gera as parcelas mensais)
              </label>
            </Campo>
            {f.tem_condominio && (
              <>
                <Campo label="Favorecido do condomínio" className="sm:col-span-2">
                  <FavorecidoAutocomplete value={f.favorecido_condominio} onChange={v => set('favorecido_condominio', v)} suggestions={payees || []} placeholder="Condomínio / administradora" />
                </Campo>
                <Campo label="Valor previsto">
                  <input autoComplete="off" className="input" inputMode="decimal" value={f.valor_condominio_previsto} onChange={e => set('valor_condominio_previsto', e.target.value)} />
                </Campo>
                <Campo label="Dia de vencimento do condomínio">
                  <input autoComplete="off" type="number" min="1" max="31" className="input" value={f.dia_vencimento_condominio} onChange={e => set('dia_vencimento_condominio', e.target.value)} placeholder={f.dia_vencimento || ''} />
                </Campo>
                <Campo label="Categoria do condomínio" className="sm:col-span-2">
                  <CategorySelect categories={categories} value={f.categoria_condominio_id} onChange={e => set('categoria_condominio_id', e.target.value)} type={tipoCat} perfilId={f.perfil_id || null} searchable />
                </Campo>
              </>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="label mb-0">Itens previstos (IPTU, seguro…)</p>
              <button type="button" className="btn-secondary text-xs py-1 flex items-center gap-1"
                onClick={() => setItens(p => [...p, { descricao: '', grupo: 'iptu', responsavel: 'inquilino', valor_previsto: '', categoria_id: '' }])}>
                <Plus size={12} /> Item
              </button>
            </div>
            {itens.length === 0 && <p className="text-xs text-texto-3">Nenhum item. Só registro — não gera agendamento nesta versão.</p>}
            {itens.map((it, i) => {
              const setI = (k, v) => setItens(p => p.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
              return (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_110px_120px_110px_32px] gap-2 items-end p-2 rounded-lg bg-surface-2/60">
                  <input autoComplete="off" className="input py-1.5 text-sm col-span-2 sm:col-span-1" placeholder="Descrição" value={it.descricao} onChange={e => setI('descricao', e.target.value)} />
                  <select className="input py-1.5 text-sm" value={it.grupo} onChange={e => setI('grupo', e.target.value)}>
                    {Object.entries(GRUPOS_ITEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select className="input py-1.5 text-sm" value={it.responsavel} onChange={e => setI('responsavel', e.target.value)}>
                    <option value="inquilino">Inquilino</option><option value="proprietario">Proprietário</option>
                  </select>
                  <input autoComplete="off" className="input py-1.5 text-sm" inputMode="decimal" placeholder="Valor" value={it.valor_previsto} onChange={e => setI('valor_previsto', e.target.value)} />
                  <button type="button" className="p-1.5 text-texto-3 hover:text-perigo" title="Remover" onClick={() => setItens(p => p.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {etapa === 4 && !edicao && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Campo label="Gerar parcelas a partir de">
              <input autoComplete="off" type="month" className="input" value={apartirDe} min={ymDe(f.data_inicio)} onChange={e => setApartirDe(e.target.value || ymDe(hoje))} />
            </Campo>
            <p className="text-xs text-texto-3 pb-2">
              {planoNovo.length} parcela(s){f.sem_fim ? ' — sem data de fim: 12 meses à frente, estendidas sozinhas' : ''}. Antes de gerar, procuro agendamentos parecidos para vincular.
            </p>
          </div>
          <PreviaTabela linhas={planoNovo} />
        </div>
      )}

      {etapa === 4 && edicao && (
        <div className="space-y-2">
          {!planoEdicao ? <p className="text-xs text-texto-3">Calculando…</p> : (
            <>
              <p className="text-xs text-texto-2">
                Parcelas pendentes: <strong className="text-texto-1">{planoEdicao.atualizar.length}</strong> alterada(s),{' '}
                <strong className="text-texto-1">{planoEdicao.criar.length}</strong> nova(s),{' '}
                <strong className="text-texto-1">{planoEdicao.remover.length}</strong> removida(s). Pagas não mudam.
              </p>
              <MudancasTabela plano={planoEdicao} />
            </>
          )}
        </div>
      )}

      {erro && <p className="text-xs text-perigo">{erro}</p>}
      <div className="flex justify-between gap-2 pt-2 border-t border-borda">
        <button type="button" className="btn-secondary flex items-center gap-1" onClick={() => (etapa === 0 ? onClose() : setEtapa(x => x - 1))}>
          <ChevronLeft size={14} /> {etapa === 0 ? 'Cancelar' : 'Voltar'}
        </button>
        {etapa < ETAPAS.length - 1 ? (
          <button type="button" className="btn-primary flex items-center gap-1" onClick={avancar}>Avançar <ChevronRight size={14} /></button>
        ) : (
          <button type="button" className="btn-primary flex items-center gap-1" disabled={salvando} onClick={confirmar}>
            <Check size={14} /> {edicao ? 'Salvar aditivo' : 'Confirmar'}
          </button>
        )}
      </div>
    </div>
  )
}

function Composicao({ c }) {
  return [...(c?.itens || []).map(i => `${i.desc} ${fmt(i.valor)}`), c?.projecao ? textoProjecao(c.projecao) : ''].filter(Boolean).join(' · ')
}

function PreviaTabela({ linhas }) {
  const vis = [...linhas].sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, MAX_LINHAS_PREVIA)
  return (
    <div className="overflow-x-auto max-h-[45vh] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-texto-3 border-b border-borda">
            <th className="px-2 py-1.5 text-left">Nº</th><th className="px-2 py-1.5 text-left">Papel</th>
            <th className="px-2 py-1.5 text-left">Vencimento</th><th className="px-2 py-1.5 text-left">Composição</th>
            <th className="px-2 py-1.5 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {vis.map(p => (
            <tr key={p.id} className="border-b border-borda/50">
              <td className="px-2 py-1.5 text-texto-2">{p.numero}{p.total ? `/${p.total}` : ''}</td>
              <td className="px-2 py-1.5 text-texto-2">{PAPEIS[p.papel]}</td>
              <td className="px-2 py-1.5 text-texto-2 whitespace-nowrap">{fmtDate(p.vencimento)}</td>
              <td className="px-2 py-1.5 text-texto-3"><Composicao c={p.composicao} /></td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap">
                <span className="text-texto-1 font-medium">{fmt(p.valor)}</span>
                {p.valorStatus === 'projetado' && <span className="ml-1.5 text-[10px] text-aviso outline-dashed outline-1 outline-borda-forte rounded px-1">Projetado</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {linhas.length > vis.length && <p className="text-[11px] text-texto-3 mt-1">… mais {linhas.length - vis.length} parcela(s).</p>}
    </div>
  )
}

function MudancasTabela({ plano }) {
  const linhas = [
    ...plano.atualizar.map(m => ({ id: m.id, tipo: 'Alterada', venc: m.changes.startDate || m.antes.startDate, de: m.antes.amount, para: m.changes.amount ?? m.antes.amount, papel: m.antes.contratoPapel })),
    ...plano.criar.map(s => ({ id: s.id, tipo: 'Nova', venc: s.startDate, de: null, para: s.amount, papel: s.contratoPapel })),
    ...plano.remover.map(s => ({ id: s.id, tipo: 'Removida', venc: s.startDate, de: s.amount, para: null, papel: s.contratoPapel })),
  ].sort((a, b) => String(a.venc).localeCompare(String(b.venc)))
  if (!linhas.length) return <p className="text-xs text-texto-3">Nenhuma parcela muda.</p>
  return (
    <div className="overflow-x-auto max-h-[45vh] overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-texto-3 border-b border-borda">
            <th className="px-2 py-1.5 text-left">Vencimento</th><th className="px-2 py-1.5 text-left">Papel</th>
            <th className="px-2 py-1.5 text-left">Mudança</th><th className="px-2 py-1.5 text-right">Antes</th><th className="px-2 py-1.5 text-right">Depois</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={`${l.tipo}-${l.id}`} className="border-b border-borda/50">
              <td className="px-2 py-1.5 text-texto-2 whitespace-nowrap">{fmtDate(l.venc)}</td>
              <td className="px-2 py-1.5 text-texto-2">{PAPEIS[l.papel] || l.papel}</td>
              <td className="px-2 py-1.5 text-texto-2">{l.tipo}</td>
              <td className="px-2 py-1.5 text-right text-texto-3">{l.de == null ? '—' : fmt(l.de)}</td>
              <td className="px-2 py-1.5 text-right text-texto-1 font-medium">{l.para == null ? '—' : fmt(l.para)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
