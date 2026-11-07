import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Check, Plus, Trash2 } from 'lucide-react'
import HelpCampo from '../shared/HelpCampo'
import AvisoPrerequisitos from '../BoasVindas/AvisoPrerequisitos'
import { useApp } from '../../context/AppContext'
import CategorySelect from '../shared/CategorySelect'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
import { fmt, fmtDate } from '../shared/utils'
import { parseValorBR, valorBRFormatado } from '../../lib/valorBR'
import CampoValor from './CampoValor'
import { buscarContratoApi } from '../../lib/contratosApi'
import { gerarPlanoParcelas, proximoReajuste, r2, rotuloContrato, textoProjecao, ehParcelaGerada, parcelaPaga, competenciaDaParcela } from '../../lib/contratos/parcelas'
import { primeiroMes, dataRepasse } from '../../lib/contratos/repasse'
import { ehBemParametrizado } from '../../lib/patrimonio'
import { faltaRecurso } from '../../lib/recursosBanco'
import TaxasRepasse from './TaxasRepasse'
import { taxaParaForm, formParaTaxa, erroTaxa, taxaParaItem, chaveTaxas } from '../../lib/contratos/taxasRepasseForm'
import { taxaDoItem, BASES_TAXA_ADM } from '../../lib/contratos/composicaoRepasse'
import { validarEtapaCampo, sugerirCategoria } from '../../lib/contratos/validacao'
import { useRolarAoTopo, rolarAteElemento } from '../shared/rolagemModal'
import { candidatosVinculo } from '../../lib/contratos/vinculo'
import { MODALIDADES, ehAluguel, rotuloPapel, rotulosContrato } from '../../lib/contratos/rotulos'
import { REGRAS_ABATIMENTO } from '../../lib/contratos/creditos'
import { hojeStr, ymDe, fmtYm, addMeses } from '../../lib/contratos/datas'
import VinculoModal from './VinculoModal'
import EncargosNaParcela from './EncargosNaParcela'
import { encargoParaForm, formParaEncargo, encargosIncompletos } from '../../lib/contratos/encargosForm'
import { encargoParaItem, encargoDoItem } from '../../lib/contratos/encargos'

// Etapas com índice fixo (validarEtapa); a 3 (imóvel e condomínio) só existe no Aluguel — nas
// demais modalidades ela não aparece e a numeração na tela não tem buraco.
const ETAPAS = [
  { i: 0, nome: () => 'Dados' },
  { i: 1, nome: (f) => (ehAluguel(f) ? 'Valores e bonificação' : 'Valores') },
  { i: 2, nome: () => 'Reajuste' },
  { i: 3, nome: (f) => (repasseDoForm(f) ? 'Imóvel' : 'Imóvel e condomínio'), soAluguel: true },
  { i: 4, nome: () => 'Prévia' },
]
const ULTIMA = 4
// Contrato a receber por administradora (lib/contratos/repasse.js): só Aluguel a receber.
const repasseDoForm = (f) => ehAluguel(f) && f.tipo === 'receber' && !!f.modo_repasse
const REPASSE_MESES = { 0: 'No mesmo mês da competência', 1: '1 mês depois (mês seguinte)', 2: '2 meses depois', 3: '3 meses depois' }
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const TIPOS_IMOVEL = { casa: 'Casa', apartamento: 'Apartamento', sala: 'Sala comercial', galpao: 'Galpão', outro: 'Outro' }
const GRUPOS_ITEM = { iptu: 'IPTU', seguro: 'Seguro', condominio: 'Condomínio', outro: 'Outro' }
const MAX_LINHAS_PREVIA = 36
// Campos que mexem nas parcelas: mudou algum → evento 'aditivo' e regeneração das pendentes.
const FINANCEIROS = ['valor_base', 'periodicidade', 'dia_vencimento', 'bonificacao_valor', 'bonificacao_meses', 'indice_reajuste',
  'percentual_fixo', 'mes_base_reajuste', 'data_inicio', 'data_fim', 'tem_condominio', 'valor_condominio_previsto', 'dia_vencimento_condominio',
  'meses_sem_cobranca', 'credito_abatimento', 'modalidade', 'encargos', 'modo_repasse', 'dia_repasse', 'repasse_meses_depois',
  'valor_primeiro_mes', 'favorecido', 'taxa_adm_pct', 'taxa_adm_base', 'itens_repasse']
// Valor "de antes" dos campos novos em contrato gravado antes da migração (a coluna ainda não veio).
const ANTES_PADRAO = { meses_sem_cobranca: [], credito_abatimento: 'proximo_pendente', encargos: [], modo_repasse: false, repasse_meses_depois: 1, taxa_adm_base: 'bruto', itens_repasse: [] }
// Encargos comparáveis (o aditivo só os vê como mudança se algo deles mudou de verdade).
const chaveEncargos = (l) => JSON.stringify((l || []).map(encargoDoItem).map(e => [e.descricao, e.sinal, e.valor, e.parcelas_total, e.parcela_inicio, e.ativo])
  .sort((a, b) => `${a[0]}|${a[4]}`.localeCompare(`${b[0]}|${b[4]}`)))

const txt = (v) => (v == null ? '' : String(v))
const num = (v) => { const n = parseValorBR(v); return Number.isFinite(n) ? n : null }
const int = (v) => (v === '' || v == null ? null : Number.parseInt(v, 10))

function formDoContrato(c, padrao) {
  if (!c) return padrao
  return {
    ...padrao, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])),
    sem_fim: !c.data_fim,
    valor_base: valorBRFormatado(c.valor_base), bonificacao_valor: c.bonificacao_valor ? valorBRFormatado(c.bonificacao_valor) : '',
    valor_condominio_previsto: valorBRFormatado(c.valor_condominio_previsto ?? ''),
    percentual_fixo: c.percentual_fixo == null ? '' : String(c.percentual_fixo).replace('.', ','),
    meses_sem_cobranca: Array.isArray(c.meses_sem_cobranca) ? c.meses_sem_cobranca : [],
    credito_abatimento: c.credito_abatimento || 'proximo_pendente',
    modo_repasse: !!c.modo_repasse,
    repasse_meses_depois: String(c.repasse_meses_depois ?? 1),
    valor_primeiro_mes: c.valor_primeiro_mes == null ? '' : valorBRFormatado(c.valor_primeiro_mes),
    saldo_inicial_valor: c.saldo_inicial_adm ? valorBRFormatado(Math.abs(c.saldo_inicial_adm)) : '',
    saldo_inicial_sinal: Number(c.saldo_inicial_adm) < 0 ? 'devedor' : 'credor',
    saldo_inicial_competencia: c.saldo_inicial_competencia || '',
    taxa_adm_pct: c.taxa_adm_pct == null ? '' : String(c.taxa_adm_pct).replace('.', ','),
    taxa_adm_base: c.taxa_adm_base || 'bruto',
    categoria_taxa_adm_id: c.categoria_taxa_adm_id || '',
  }
}

// Formulário → linha da tabela contratos (o que a API valida). Fora do Aluguel, imóvel e
// condomínio ficam nulos (não há etapa para eles).
function paraContrato(f) {
  const aluguel = ehAluguel(f)
  const repasse = repasseDoForm(f)
  // No modo repasse o condomínio não é boleto do proprietário (vira dedução da composição).
  const cond = aluguel && !!f.tem_condominio && !repasse
  const saldo = repasse ? num(f.saldo_inicial_valor) : null
  return {
    perfil_id: f.perfil_id || null, tipo: f.tipo, modalidade: f.modalidade || null, numero: f.numero || null, objeto: f.objeto || null,
    favorecido: f.favorecido || null, favorecido_condominio: cond ? f.favorecido_condominio || null : null,
    data_inicio: f.data_inicio, data_fim: f.sem_fim ? null : f.data_fim || null,
    renovacao_automatica: !!f.renovacao_automatica, aviso_previo_dias: int(f.aviso_previo_dias) ?? 30,
    valor_base: num(f.valor_base) ?? 0, periodicidade: repasse ? 'mensal' : f.periodicidade, dia_vencimento: int(f.dia_vencimento),
    dia_vencimento_condominio: cond ? int(f.dia_vencimento_condominio) : null,
    categoria_id: f.categoria_id || null, categoria_condominio_id: cond ? f.categoria_condominio_id || null : null,
    conta_id: f.conta_id || null, centro_custo: f.centro_custo || null, tipo_documento_id: f.tipo_documento_id || null,
    indice_reajuste: f.indice_reajuste || 'NENHUM', percentual_fixo: f.indice_reajuste === 'FIXO' ? num(f.percentual_fixo) : null,
    mes_base_reajuste: int(f.mes_base_reajuste), bonificacao_valor: num(f.bonificacao_valor) ?? 0,
    bonificacao_meses: int(f.bonificacao_meses) ?? 0, tipo_imovel: aluguel ? f.tipo_imovel || null : null, tem_condominio: cond,
    valor_condominio_previsto: cond ? num(f.valor_condominio_previsto) : null,
    link_anexo: f.link_anexo || null, status: f.status || 'ativo', observacao: f.observacao || null,
    meses_sem_cobranca: [...new Set(f.meses_sem_cobranca || [])].sort(),
    credito_abatimento: f.credito_abatimento || 'mes_seguinte',
    // Modo repasse (fora dele, os valores neutros — nenhum contrato existente muda).
    modo_repasse: repasse,
    contraparte_nome: repasse ? txt(f.contraparte_nome).trim() || null : null,
    contraparte_documento: repasse ? txt(f.contraparte_documento).trim() || null : null,
    bem_id: aluguel && f.tipo === 'receber' ? f.bem_id || null : null,
    dia_repasse: repasse ? int(f.dia_repasse) : null,
    repasse_meses_depois: repasse ? int(f.repasse_meses_depois) ?? 1 : 1,
    valor_primeiro_mes: repasse && txt(f.valor_primeiro_mes).trim() ? num(f.valor_primeiro_mes) : null,
    saldo_inicial_adm: saldo > 0 ? r2(f.saldo_inicial_sinal === 'devedor' ? -saldo : saldo) : null,
    saldo_inicial_competencia: saldo > 0 ? f.saldo_inicial_competencia || null : null,
    taxa_adm_pct: repasse && num(f.taxa_adm_pct) > 0 ? num(f.taxa_adm_pct) : null,
    taxa_adm_base: repasse ? f.taxa_adm_base || 'bruto' : 'bruto',
    categoria_taxa_adm_id: repasse ? f.categoria_taxa_adm_id || null : null,
  }
}

// "Meses sem cobrança": competências da vigência em que a cobrança principal não acontece.
function MesesSemCobranca({ valor = [], onChange, inicio, fim }) {
  const [mes, setMes] = useState('')
  const min = ymDe(inicio) || undefined
  const max = fim ? ymDe(fim) : undefined
  const ok = mes && (!min || mes >= min) && (!max || mes <= max) && !valor.includes(mes)
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input type="month" className="input w-auto" value={mes} min={min} max={max} onChange={e => setMes(e.target.value)} aria-label="Mês sem cobrança" />
        <button type="button" className="btn-secondary text-xs py-1.5 flex items-center gap-1" disabled={!ok}
          onClick={() => { onChange([...valor, mes].sort()); setMes('') }}>
          <Plus size={12} /> Adicionar mês
        </button>
      </div>
      {valor.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {valor.map(m => (
            <span key={m} className="inline-flex items-center gap-1 text-xs bg-surface-2 text-texto-1 rounded-full px-2 py-0.5">
              {fmtYm(m)}
              <button type="button" className="text-texto-3 hover:text-perigo" title={`Voltar a cobrar em ${fmtYm(m)}`} onClick={() => onChange(valor.filter(x => x !== m))}>×</button>
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-texto-3">
        O mês escolhido não gera parcela e não conta na numeração nem no desconto temporário. O reajuste segue o calendário do contrato.
      </p>
    </div>
  )
}

// Campo barrado na validação (validarEtapaCampo): o Campo com a mesma chave fica destacado e mostra o erro.
const CampoErroContext = createContext(null)
// Erros que apontam para um campo exibido junto de outro (competência do saldo inicial fica no mesmo bloco).
const CAMPO_DO_ERRO = { saldo_inicial_competencia: 'saldo_inicial_valor' }

// `help`: chave do ⓘ do campo (src/lib/helpCampos.js). `campo`: chave do formulário (rolagem/destaque do erro).
const Campo = ({ label, children, className = '', help, campo }) => {
  const falha = useContext(CampoErroContext)
  const comErro = !!campo && falha?.campo === campo
  return (
    <div className={`${className}${comErro ? ' rounded-lg ring-2 ring-perigo ring-offset-2 ring-offset-surface' : ''}`} data-campo={campo} data-erro={comErro ? '' : undefined}>
      <label className="label">{label}{help && <HelpCampo campo={help} />}</label>{children}
      {comErro && <p role="alert" className="text-xs text-perigo mt-1">{falha.erro}</p>}
    </div>
  )
}

// Cadastro em etapas (novo) e Aditivo (edição com prévia do que muda nas parcelas pendentes).
export default function ContratoWizard({ contrato = null, onClose, onSalvo }) {
  const {
    profiles, accounts, categories, payees, costCenters, tiposDocumento, activeProfileId, schedules,
    criarContrato, atualizarContrato, salvarItensContrato, carregarIndice, indicesContratos,
    planejarParcelasContrato, aplicarParcelasContrato, vincularEGerarContrato, recursosBanco,
  } = useApp()
  // Banco sem a migração do repasse: a opção nem aparece (a API recusa de novo, como segunda trava).
  const semRepasse = faltaRecurso(recursosBanco, 'contratoRepasse')
  const edicao = !!contrato
  const hoje = hojeStr()
  const tipoCtr = tiposDocumento.find(t => t.sigla === 'CTR' && t.ativo !== false)
  // Contrato novo nasce sem modalidade: ela é o primeiro campo e decide categoria sugerida, índice
  // padrão e se há etapa de imóvel/condomínio.
  const [f, setF] = useState(() => formDoContrato(contrato, {
    tipo: 'pagar', modalidade: '', perfil_id: activeProfileId || profiles[0]?.id || '', objeto: '', numero: '',
    favorecido: '', favorecido_condominio: '', data_inicio: hoje, data_fim: '', sem_fim: false, renovacao_automatica: false,
    aviso_previo_dias: '30', valor_base: '', periodicidade: 'mensal', dia_vencimento: '', bonificacao_valor: '',
    bonificacao_meses: '', conta_id: '', categoria_id: '', centro_custo: '', tipo_documento_id: tipoCtr?.id || '',
    indice_reajuste: 'NENHUM', percentual_fixo: '', mes_base_reajuste: '', tipo_imovel: '', tem_condominio: false,
    valor_condominio_previsto: '', dia_vencimento_condominio: '', categoria_condominio_id: '', link_anexo: '',
    observacao: '', status: 'ativo', meses_sem_cobranca: [], credito_abatimento: 'mes_seguinte',
    modo_repasse: false, contraparte_nome: '', contraparte_documento: '', bem_id: '', dia_repasse: '', repasse_meses_depois: '1',
    valor_primeiro_mes: '', saldo_inicial_valor: '', saldo_inicial_sinal: 'credor', saldo_inicial_competencia: '',
    taxa_adm_pct: '', taxa_adm_base: 'bruto', categoria_taxa_adm_id: '',
  }))
  const aluguel = f.modalidade === 'aluguel'
  const repasse = repasseDoForm(f)
  // Antes de escolher a modalidade, textos neutros (nada de inquilino/aluguel).
  const rot = rotulosContrato({ ...f, modalidade: f.modalidade || 'outro' })
  // Etapa seguinte/anterior pulando a de imóvel fora do Aluguel.
  const visivel = (i) => !ETAPAS[i].soAluguel || aluguel
  const proxima = (i) => { let n = i + 1; while (n < ULTIMA && !visivel(n)) n += 1; return Math.min(n, ULTIMA) }
  const anterior = (i) => { let n = i - 1; while (n > 0 && !visivel(n)) n -= 1; return Math.max(n, 0) }
  const etapasVisiveis = ETAPAS.filter(e => visivel(e.i))

  // Modalidade (contrato novo): Aluguel sugere "Moradia" e IPCA; as demais, sem categoria e sem reajuste.
  const trocarModalidade = (m) => {
    setErro('')
    setF(p => {
      if (edicao) return { ...p, modalidade: m }
      const ehAlug = m === 'aluguel'
      const sug = ehAlug ? sugerirCategoria(categories, p.tipo === 'receber' ? 'income' : 'expense') : ''
      return {
        ...p, modalidade: m, indice_reajuste: ehAlug ? 'IPCA' : 'NENHUM',
        categoria_id: ehAlug ? p.categoria_id || sug : p.categoria_id,
        categoria_condominio_id: ehAlug ? p.categoria_condominio_id || sug : '',
        tipo_imovel: ehAlug ? p.tipo_imovel || 'apartamento' : '',
        tem_condominio: ehAlug ? p.tem_condominio : false,
      }
    })
  }
  const [itens, setItens] = useState([])
  // Encargos e descontos na parcela (contrato_itens com na_parcela).
  const [encargosForm, setEncargosForm] = useState(() => (contrato?.encargos || []).map(encargoParaForm))
  // Tarifas e taxa única da administradora (contrato_itens com tipo_repasse).
  const [taxasForm, setTaxasForm] = useState(() => (contrato?.itens_repasse || []).map(taxaParaForm))
  const [etapa, setEtapa] = useState(0)
  const [erro, setErroTexto] = useState('')
  // Campo barrado + contador (a mesma falha repetida rola de novo até o campo).
  const [falha, setFalha] = useState({ campo: null, n: 0 })
  const setErro = (msg, campo = null) => {
    setErroTexto(msg)
    setFalha(p => (msg ? { campo: CAMPO_DO_ERRO[campo] || campo, n: p.n + 1 } : p.campo ? { ...p, campo: null } : p))
  }
  const raizRef = useRef(null)
  // Troca de etapa (Avançar, Voltar ou a abinha): o corpo do modal volta ao topo.
  useRolarAoTopo(etapa)
  // Validação barrou: rola até o campo destacado (ou, sem campo, até a mensagem) — depois da rolagem ao topo.
  useEffect(() => {
    if (!falha.n) return
    const raiz = raizRef.current
    const alvo = (falha.campo && raiz?.querySelector(`[data-campo="${falha.campo}"]`)) || raiz?.querySelector('[data-erro-wizard]')
    rolarAteElemento(alvo, { focar: !!falha.campo })
  }, [falha])
  const [salvando, setSalvando] = useState(false)
  // "Gerar a partir de": escolhido à mão ou, sem escolha, o mês de hoje (no modo repasse, a competência
  // cujo repasse ainda vem — hoje menos a defasagem), nunca antes do início.
  const [apartirManual, setApartirDe] = useState(null)
  const apartirDe = useMemo(() => {
    if (apartirManual) return apartirManual
    const a = repasse ? addMeses(ymDe(hoje), -(int(f.repasse_meses_depois) ?? 1)) : ymDe(hoje)
    const b = ymDe((edicao ? contrato?.data_inicio : f.data_inicio) || hoje)
    return a > b ? a : b
  }, [apartirManual, repasse, hoje, f.repasse_meses_depois, f.data_inicio, edicao, contrato?.data_inicio])
  const [planoEdicao, setPlanoEdicao] = useState(null)
  const [vinculo, setVinculo] = useState(null)
  const set = (k, v) => { setErro(''); setF(p => ({ ...p, [k]: v })) }

  useEffect(() => {
    if (!edicao) return
    buscarContratoApi(contrato.id).then(r => {
      const todos = r.itens || []
      setItens(todos.filter(i => !i.na_parcela && !i.tipo_repasse).map(i => ({ ...i, valor_previsto: valorBRFormatado(i.valor_previsto ?? '') })))
      if (todos.some(i => i.na_parcela)) setEncargosForm(todos.filter(i => i.na_parcela).map(encargoDoItem).map(encargoParaForm))
      if (todos.some(i => i.tipo_repasse)) setTaxasForm(todos.filter(i => i.tipo_repasse).map(taxaDoItem).map(taxaParaForm))
    }).catch(() => {})
  }, [edicao, contrato?.id])

  useEffect(() => {
    if (f.indice_reajuste === 'IPCA' || f.indice_reajuste === 'IGPM') carregarIndice(f.indice_reajuste).catch(() => {})
  }, [f.indice_reajuste, carregarIndice])

  const contas = useMemo(() => accounts.filter(a => a.type !== 'credit' && a.active !== false && (!f.perfil_id || !a.profileId || a.profileId === f.perfil_id)), [accounts, f.perfil_id])
  // Bens do Patrimônio que podem ser o imóvel do contrato (vendido fica de fora, salvo o já ligado).
  const bens = useMemo(() => accounts.filter(a => ehBemParametrizado(a) && ((!a.foiVendido && a.active !== false) || a.id === f.bem_id)), [accounts, f.bem_id])
  // Nº da próxima parcela pendente do contrato (contrato em andamento: "está na parcela k de N").
  const numeroProxima = useMemo(() => {
    if (!edicao) return 1
    const nums = (schedules || []).filter(s => s.contratoId === contrato.id && s.contratoPapel === 'aluguel' && ehParcelaGerada(s, contrato.id) && !parcelaPaga(s))
      .map(s => Number(s.composicao?.numero)).filter(n => n > 0)
    return nums.length ? Math.min(...nums) : 1
  }, [edicao, schedules, contrato])
  const encargosDados = useMemo(() => encargosForm.map(l => formParaEncargo(l, numeroProxima)).filter(Boolean), [encargosForm, numeroProxima])
  const taxasDados = useMemo(() => (repasse ? taxasForm.map(formParaTaxa).filter(Boolean) : []), [repasse, taxasForm])
  // competencias: a composição gravada de cada mês entra na Prévia (o valor do repasse depende dela).
  const dados = useMemo(() => ({
    ...paraContrato(f), encargos: encargosDados, itens_repasse: taxasDados, competencias: contrato?.competencias || [],
  }), [f, encargosDados, taxasDados, contrato?.competencias])
  const indice = indicesContratos[f.indice_reajuste]
  const tipoCat = f.tipo === 'receber' ? 'income' : 'expense'

  const planoNovo = useMemo(() => (etapa === ULTIMA && !edicao
    ? gerarPlanoParcelas({ ...dados, id: 'novo' }, { hoje, indices: indicesContratos, apartirDe })
    : []), [etapa, edicao, dados, hoje, indicesContratos, apartirDe])

  useEffect(() => {
    if (etapa !== ULTIMA || !edicao) return
    let vivo = true
    planejarParcelasContrato({ ...contrato, ...dados }).then(p => { if (vivo) setPlanoEdicao(p) }).catch(e => { setErroTexto(e.message); setFalha(p => ({ ...p, campo: null })) })
    return () => { vivo = false }
  }, [etapa, edicao, contrato, dados, planejarParcelasContrato])

  // Aditivo com mês sem cobrança que já tem pagamento: a parcela paga não sai (só avisa).
  const pagasSemCobranca = useMemo(() => {
    if (!edicao) return []
    const meses = new Set(dados.meses_sem_cobranca)
    return (schedules || []).filter(s => s.contratoId === contrato.id && (s.contratoPapel || 'aluguel') === 'aluguel'
      && (ehParcelaGerada(s, contrato.id) ? parcelaPaga(s) && meses.has(competenciaDaParcela(s)) : (s.registered || []).some(d => meses.has(ymDe(d)))))
  }, [edicao, dados.meses_sem_cobranca, schedules, contrato])

  const avancar = () => {
    const { erro: e, campo } = validarEtapaCampo(etapa, f)
    if (e) return setErro(e, campo)
    setErro('')
    setEtapa(x => proxima(x))
  }
  const itensPayload = () => [
    ...(aluguel && !repasse ? itens : []).filter(i => txt(i.descricao).trim()).map(i => ({
      descricao: i.descricao.trim(), grupo: i.grupo || 'outro', responsavel: i.responsavel || 'inquilino',
      valor_previsto: num(i.valor_previsto), categoria_id: i.categoria_id || null, ativo: i.ativo !== false,
    })),
    ...encargosDados.map(encargoParaItem),
    ...taxasDados.map(taxaParaItem),
  ]

  const confirmar = async () => {
    for (let i = 0; i < 4; i++) {
      const { erro: e, campo } = validarEtapaCampo(i, f)
      if (e) { setEtapa(i); return setErro(e, campo) }
    }
    if (encargosIncompletos(encargosForm, numeroProxima).length) {
      setEtapa(1)
      return setErro('Encargos e descontos na parcela: preencha descrição, valor, número de parcelas e o início (ou remova a linha).')
    }
    const erroTaxas = repasse ? taxasForm.filter(l => formParaTaxa(l)).map(erroTaxa).find(Boolean) : ''
    if (erroTaxas) { setEtapa(1); return setErro(erroTaxas) }
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
        const antes = contrato[k] ?? ANTES_PADRAO[k] ?? null
        if (k === 'competencias') continue
        const diferente = k === 'encargos' ? chaveEncargos(antes) !== chaveEncargos(v)
          : k === 'itens_repasse' ? chaveTaxas(antes) !== chaveTaxas(v) : JSON.stringify(antes) !== JSON.stringify(v)
        if (diferente) mudou[k] = { de: antes, para: v }
      }
      const financeiro = Object.keys(mudou).some(k => FINANCEIROS.includes(k))
      const evento = financeiro ? {
        tipo: 'aditivo', data_evento: hoje, valor_anterior: contrato.valor_base, valor_novo: dados.valor_base,
        detalhes: { campos: mudou },
      } : null
      const campos = Object.fromEntries(Object.keys(mudou).map(k => [k, dados[k]]))
      const salvo0 = await atualizarContrato(contrato.id, campos, evento)
      const rows = await salvarItensContrato(contrato.id, itensPayload())
      // O plano usa os encargos gravados agora (a lista substitui a anterior).
      const salvo = {
        ...salvo0, encargos: (rows || []).filter(i => i.na_parcela).map(encargoDoItem),
        itens_repasse: (rows || []).filter(i => i.tipo_repasse).map(taxaDoItem),
      }
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
    <CampoErroContext.Provider value={erro && falha.campo ? { campo: falha.campo, erro } : null}>
    <div ref={raizRef} className="space-y-4">
      {!contrato && <AvisoPrerequisitos funcao="contrato" onIr={onClose} />}
      <ol data-guia="contrato-form.etapas" className="flex flex-wrap gap-1.5 text-[11px]">
        {etapasVisiveis.map((e, pos) => (
          <li key={e.i}>
            <button type="button" onClick={() => { if (e.i < etapa) { setErro(''); setEtapa(e.i) } }}
              className={`px-2 py-1 rounded-full border ${e.i === etapa ? 'border-primary bg-primary/15 text-primary-fg font-semibold' : e.i < etapa ? 'border-borda-forte text-texto-2 hover:bg-surface-hover' : 'border-borda text-texto-3 cursor-default'}`}>
              {pos + 1}. {e.nome(f)}
            </button>
          </li>
        ))}
      </ol>

      {etapa === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo campo="modalidade" label="Modalidade" help="contrato.modalidade">
            <select data-guia="contrato-form.modalidade" className="input" value={f.modalidade} onChange={e => trocarModalidade(e.target.value)}>
              <option value="">Escolha a finalidade do contrato…</option>
              {Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Campo>
          <Campo label="Tipo">
            <select data-guia="contrato-form.tipo" className="input" value={f.tipo} disabled={edicao} onChange={e => {
              const t = e.target.value
              setErro('')
              setF(p => {
                const semRepasse = t === 'receber' ? {} : { modo_repasse: false }
                if (!ehAluguel(p) || !p.modalidade) return { ...p, ...semRepasse, tipo: t }
                const sug = sugerirCategoria(categories, t === 'receber' ? 'income' : 'expense')
                return { ...p, ...semRepasse, tipo: t, categoria_id: sug, categoria_condominio_id: sug }
              })
            }}>
              <option value="pagar">{rot.tipoPagar}</option>
              <option value="receber">{rot.tipoReceber}</option>
            </select>
          </Campo>
          <Campo campo="perfil_id" label="Perfil">
            <select data-guia="contrato-form.perfil" className="input" value={f.perfil_id} onChange={e => set('perfil_id', e.target.value)}>
              <option value="">Escolha…</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Campo>
          <Campo label="Número do contrato (opcional)">
            <input autoComplete="off" className="input" value={f.numero} onChange={e => set('numero', e.target.value)} maxLength={60} />
          </Campo>
          <Campo label="Objeto do contrato" className="sm:col-span-2">
            <input data-guia="contrato-form.objeto" autoComplete="off" className="input" value={f.objeto} onChange={e => set('objeto', e.target.value)} maxLength={200}
              placeholder={aluguel ? 'Imóvel do contrato (ex.: Apto 302 — Ed. Sol)' : 'O que o contrato cobre (ex.: manutenção mensal, plano anual)'} />
          </Campo>
          {aluguel && f.tipo === 'receber' && !semRepasse && (
            <Campo label="Como o aluguel chega" className="sm:col-span-2">
              <label className="flex items-start gap-2 text-sm text-texto-2 mt-1">
                <input autoComplete="off" type="checkbox" className="accent-primary mt-0.5" data-guia="contrato-form.modo-repasse" checked={!!f.modo_repasse}
                  disabled={edicao && !!contrato?.modo_repasse} onChange={e => set('modo_repasse', e.target.checked)} />
                <span>
                  Recebo por uma administradora (imobiliária), que repassa o valor líquido
                  <span className="block text-[11px] text-texto-3">
                    O inquilino paga à administradora; ela desconta as taxas e repassa a você num dia fixo. Cada mês de aluguel vira um recebimento na data do repasse.
                  </span>
                </span>
              </label>
            </Campo>
          )}
          <Campo campo="favorecido" label={rot.favorecido} className="sm:col-span-2">
            <FavorecidoAutocomplete value={f.favorecido} onChange={v => set('favorecido', v)} suggestions={payees || []} />
          </Campo>
          {repasse && (
            <>
              <Campo label="Inquilino (só informação)">
                <input autoComplete="off" className="input" value={f.contraparte_nome} onChange={e => set('contraparte_nome', e.target.value)} maxLength={200} placeholder="Nome do inquilino (opcional)" />
              </Campo>
              <Campo label="CPF/CNPJ do inquilino">
                <input autoComplete="off" className="input" value={f.contraparte_documento} onChange={e => set('contraparte_documento', e.target.value)} maxLength={30} placeholder="Opcional" />
              </Campo>
            </>
          )}
          <Campo campo="data_inicio" label="Início da vigência">
            <input data-guia="contrato-form.inicio" autoComplete="off" type="date" className="input" value={f.data_inicio} onChange={e => set('data_inicio', e.target.value)} />
          </Campo>
          <Campo campo="data_fim" label="Fim da vigência">
            <input autoComplete="off" type="date" className="input" value={f.sem_fim ? '' : f.data_fim} disabled={f.sem_fim} onChange={e => set('data_fim', e.target.value)} />
            <label className="flex items-center gap-2 text-xs text-texto-2 mt-1">
              <input autoComplete="off" type="checkbox" className="accent-primary" checked={f.sem_fim} onChange={e => set('sem_fim', e.target.checked)} />
              Sem data de fim (gera 12 meses à frente e estende sozinho)
            </label>
          </Campo>
          <Campo label="Aviso prévio (dias)" help="contrato.avisoPrevio">
            <input autoComplete="off" type="number" min="0" max="365" className="input" value={f.aviso_previo_dias} onChange={e => set('aviso_previo_dias', e.target.value)} />
          </Campo>
          <Campo label="Renovação" help="contrato.renovacao">
            <label className="flex items-center gap-2 text-sm text-texto-2 mt-2">
              <input autoComplete="off" type="checkbox" className="accent-primary" checked={!!f.renovacao_automatica} onChange={e => set('renovacao_automatica', e.target.checked)} />
              Renovação automática
            </label>
          </Campo>
          <Campo campo="link_anexo" label="Link do contrato (anexo)" className="sm:col-span-2">
            <input autoComplete="off" className="input" value={f.link_anexo} onChange={e => set('link_anexo', e.target.value)} placeholder="https://drive.google.com/…" />
          </Campo>
          <Campo label="Observação" className="sm:col-span-2">
            <textarea className="input min-h-[60px]" value={f.observacao} onChange={e => set('observacao', e.target.value)} maxLength={2000} />
          </Campo>
        </div>
      )}

      {etapa === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo campo="conta_id" label={rot.conta} help="contrato.contaPagamento">
            <select data-guia="contrato-form.conta" className="input" value={f.conta_id} onChange={e => set('conta_id', e.target.value)}>
              <option value="">Escolha…</option>
              {contas.map(a => <option key={a.id} value={a.id}>{a.apelido || a.name}</option>)}
            </select>
            <p className="text-[11px] text-texto-3 mt-1">Cartão de crédito não é aceito nesta versão.</p>
          </Campo>
          <Campo campo="categoria_id" label={rot.categoria}>
            <CategorySelect categories={categories} value={f.categoria_id} onChange={e => set('categoria_id', e.target.value)} type={tipoCat} perfilId={f.perfil_id || null} searchable />
          </Campo>
          <Campo campo="valor_base" label={rot.valorPrincipal} help="contrato.valorPrincipal">
            <CampoValor data-guia="contrato-form.valor" value={f.valor_base} onChange={v => set('valor_base', v)} placeholder="0,00" />
          </Campo>
          <Campo label="Periodicidade" help="contrato.periodicidade">
            <select className="input" value={repasse ? 'mensal' : f.periodicidade} disabled={repasse} onChange={e => set('periodicidade', e.target.value)}>
              <option value="mensal">Mensal</option><option value="trimestral">Trimestral</option>
              <option value="semestral">Semestral</option><option value="anual">Anual</option><option value="unica">Única</option>
            </select>
          </Campo>
          <Campo campo="dia_vencimento" label={rot.diaVencimento} help="contrato.diaVencimento">
            <input autoComplete="off" type="number" min="1" max="31" data-guia="contrato-form.dia-vencimento" className="input" value={f.dia_vencimento} onChange={e => set('dia_vencimento', e.target.value)} />
          </Campo>
          <Campo label="Tipo de documento" help="contrato.tipoDocumento">
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
          {repasse && <CamposRepasse f={f} set={set} categories={categories} />}
          {repasse && <TaxasRepasse linhas={taxasForm} onChange={(v) => { setErro(''); setTaxasForm(v) }} categories={categories} perfilId={f.perfil_id} inicio={ymDe(f.data_inicio)} />}
          <Campo campo="bonificacao_valor" label={`${rot.desconto} por mês (desconto)`} help="contrato.desconto">
            <CampoValor value={f.bonificacao_valor} onChange={v => set('bonificacao_valor', v)} placeholder="Desconto em cada parcela (opcional)" />
          </Campo>
          <Campo campo="bonificacao_meses" label={`${rot.desconto} nas primeiras (parcelas cobradas)`} help="contrato.desconto">
            <input autoComplete="off" type="number" min="0" className="input" value={f.bonificacao_meses} onChange={e => set('bonificacao_meses', e.target.value)} placeholder="Quantas parcelas têm o desconto" />
          </Campo>
          {num(f.bonificacao_valor) > 0 && num(f.valor_base) > 0 && (
            <p className="sm:col-span-2 text-xs text-texto-2">
              Parcelas 1 a {int(f.bonificacao_meses) || 0}: {fmt(num(f.valor_base))} − {fmt(num(f.bonificacao_valor))} = <strong className="text-texto-1">{fmt(r2(num(f.valor_base) - num(f.bonificacao_valor)))}</strong>
            </p>
          )}
          <EncargosNaParcela linhas={encargosForm} onChange={(v) => { setErro(''); setEncargosForm(v) }} proxima={numeroProxima} />
          <Campo campo="meses_sem_cobranca" label="Meses sem cobrança" className="sm:col-span-2" help="contrato.mesesSemCobranca">
            <div data-guia="contrato-form.meses-sem-cobranca">
              <MesesSemCobranca valor={f.meses_sem_cobranca || []} onChange={v => set('meses_sem_cobranca', v)} inicio={f.data_inicio} fim={f.sem_fim ? null : f.data_fim} />
            </div>
          </Campo>
        </div>
      )}

      {etapa === 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Índice de reajuste" help="contrato.indiceReajuste">
            <select data-guia="contrato-form.reajuste" className="input" value={f.indice_reajuste} onChange={e => set('indice_reajuste', e.target.value)}>
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
            <Campo campo="percentual_fixo" label="Percentual fixo ao ano (%)">
              <input autoComplete="off" className="input" inputMode="decimal" value={f.percentual_fixo} onChange={e => set('percentual_fixo', e.target.value)} placeholder="Ex.: 5,00" />
            </Campo>
          )}
          {f.indice_reajuste !== 'NENHUM' && (
            <Campo label="Mês-base do reajuste" help="contrato.mesBase">
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
            {f.tipo === 'receber' && (
              <Campo label="Bem do Patrimônio (opcional)">
                <select className="input" data-guia="contrato-form.bem" value={f.bem_id || ''} onChange={e => set('bem_id', e.target.value)}>
                  <option value="">Nenhum</option>
                  {bens.map(a => <option key={a.id} value={a.id}>{a.apelido || a.name}</option>)}
                </select>
                {!bens.length && <p className="text-[11px] text-texto-3 mt-1">Nenhum bem cadastrado no Patrimônio.</p>}
              </Campo>
            )}
            {repasse && (
              <p className="sm:col-span-2 text-[11px] text-texto-3">
                Com administradora, condomínio, IPTU e outras despesas que ela paga por você entram como deduções do repasse (composição do mês), não como boletos.
              </p>
            )}
            {!repasse && <Campo label="Condomínio">
              <label className="flex items-center gap-2 text-sm text-texto-2 mt-2">
                <input autoComplete="off" type="checkbox" className="accent-primary" checked={!!f.tem_condominio} onChange={e => set('tem_condominio', e.target.checked)} />
                Tem condomínio (gera as parcelas mensais)
              </label>
            </Campo>}
            {f.tem_condominio && !repasse && (
              <>
                <Campo label="Favorecido do condomínio" className="sm:col-span-2">
                  <FavorecidoAutocomplete value={f.favorecido_condominio} onChange={v => set('favorecido_condominio', v)} suggestions={payees || []} placeholder="Digite o nome do favorecido" />
                </Campo>
                <Campo campo="valor_condominio_previsto" label="Valor previsto">
                  <CampoValor value={f.valor_condominio_previsto} onChange={v => set('valor_condominio_previsto', v)} placeholder="0,00" />
                </Campo>
                <Campo campo="dia_vencimento_condominio" label="Dia de vencimento do condomínio">
                  <input autoComplete="off" type="number" min="1" max="31" className="input" value={f.dia_vencimento_condominio} onChange={e => set('dia_vencimento_condominio', e.target.value)} placeholder={f.dia_vencimento || ''} />
                </Campo>
                <Campo campo="categoria_condominio_id" label="Categoria do condomínio" className="sm:col-span-2">
                  <CategorySelect categories={categories} value={f.categoria_condominio_id} onChange={e => set('categoria_condominio_id', e.target.value)} type={tipoCat} perfilId={f.perfil_id || null} searchable />
                </Campo>
                <Campo label="Créditos do proprietário: abater" className="sm:col-span-2">
                  <select data-guia="contrato-form.credito-abatimento" className="input" value={f.credito_abatimento} onChange={e => set('credito_abatimento', e.target.value)}>
                    {Object.entries(REGRAS_ABATIMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <p className="text-[11px] text-texto-3 mt-1">
                    {f.credito_abatimento === 'proximo_pendente'
                      ? 'O crédito do boleto entra no primeiro aluguel ainda pendente com vencimento a partir da data do pagamento.'
                      : 'O crédito do boleto entra no aluguel do mês seguinte ao do boleto (ex.: boleto de dezembro abate no aluguel de janeiro).'}
                  </p>
                </Campo>
              </>
            )}
          </div>
          {!repasse && <div className="space-y-2">
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
                  <input autoComplete="off" className="input py-1.5 text-sm col-span-2 sm:col-span-1" placeholder="Digite a descrição do item" value={it.descricao} onChange={e => setI('descricao', e.target.value)} />
                  <select className="input py-1.5 text-sm" value={it.grupo} onChange={e => setI('grupo', e.target.value)}>
                    {Object.entries(GRUPOS_ITEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select className="input py-1.5 text-sm" value={it.responsavel} onChange={e => setI('responsavel', e.target.value)}>
                    <option value="inquilino">Inquilino</option><option value="proprietario">Proprietário</option>
                  </select>
                  <CampoValor className="input py-1.5 text-sm" placeholder="0,00" value={it.valor_previsto} onChange={v => setI('valor_previsto', v)} />
                  <button type="button" className="p-1.5 text-texto-3 hover:text-perigo" title="Remover" onClick={() => setItens(p => p.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                </div>
              )
            })}
          </div>}
        </div>
      )}

      {etapa === ULTIMA && !edicao && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Campo label={repasse ? 'Gerar repasses a partir da competência' : 'Gerar parcelas a partir de'}>
              <input autoComplete="off" type="month" className="input" value={apartirDe} min={ymDe(f.data_inicio)} onChange={e => setApartirDe(e.target.value || ymDe(hoje))} />
            </Campo>
            <p className="text-xs text-texto-3 pb-2">
              {planoNovo.length} parcela(s){f.sem_fim ? ' — sem data de fim: 12 meses à frente, estendidas sozinhas' : ''}. Antes de gerar, procuro agendamentos parecidos para vincular.
              {' '}Meses anteriores ficam na ficha como "Sem pagamento vinculado", para você ligar o pagamento que já fez.
            </p>
          </div>
          {(f.meses_sem_cobranca || []).length > 0 && (
            <p className="text-xs text-texto-2">Sem cobrança: {f.meses_sem_cobranca.map(fmtYm).join(', ')}.</p>
          )}
          {repasse && planoNovo.some(p => p.composicao?.bruto === true) && (
            <p className="text-xs text-aviso">Valor bruto — as deduções da administradora entram na composição de cada mês.</p>
          )}
          <PreviaTabela linhas={planoNovo} contrato={dados} />
        </div>
      )}

      {etapa === ULTIMA && edicao && (
        <div className="space-y-2">
          {pagasSemCobranca.length > 0 && (
            <p className="text-xs text-aviso bg-surface-2/60 rounded-lg px-3 py-2">
              ⚠ Mês marcado sem cobrança que já tem pagamento: {[...new Set(pagasSemCobranca.flatMap(s => (ehParcelaGerada(s, contrato.id) ? [s.startDate] : s.registered || []).map(ymDe)))].filter(m => dados.meses_sem_cobranca.includes(m)).map(fmtYm).join(', ')}.
              {' '}A parcela paga não é removida nem muda de valor; só fica sem número.
            </p>
          )}
          {!planoEdicao ? <p className="text-xs text-texto-3">Calculando…</p> : (
            <>
              <p className="text-xs text-texto-2">
                Parcelas pendentes: <strong className="text-texto-1">{planoEdicao.atualizar.length}</strong> alterada(s),{' '}
                <strong className="text-texto-1">{planoEdicao.criar.length}</strong> nova(s),{' '}
                <strong className="text-texto-1">{planoEdicao.remover.length}</strong> removida(s). Pagas não mudam.
              </p>
              <MudancasTabela plano={planoEdicao} contrato={dados} />
            </>
          )}
        </div>
      )}

      {/* Erro de um campo aparece junto dele (Campo); aqui, só os que não têm campo. */}
      {erro && !falha.campo && <p data-erro-wizard="" role="alert" className="text-xs text-perigo">{erro}</p>}
      <div className="flex justify-between gap-2 pt-2 border-t border-borda">
        <button type="button" className="btn-secondary flex items-center gap-1" onClick={() => { if (etapa === 0) return onClose(); setErro(''); setEtapa(x => anterior(x)) }}>
          <ChevronLeft size={14} /> {etapa === 0 ? 'Cancelar' : 'Voltar'}
        </button>
        {etapa < ULTIMA ? (
          <button type="button" data-guia="contrato-form.avancar" className="btn-primary flex items-center gap-1" onClick={avancar}>Avançar <ChevronRight size={14} /></button>
        ) : (
          <button type="button" data-guia="contrato-form.salvar" className="btn-primary flex items-center gap-1" disabled={salvando} onClick={confirmar}>
            <Check size={14} /> {edicao ? 'Salvar aditivo' : 'Confirmar'}
          </button>
        )}
      </div>
    </div>
    </CampoErroContext.Provider>
  )
}

// Campos do modo repasse na etapa Valores: dia e regra do repasse, 1º mês proporcional e saldo inicial
// com a administradora.
function CamposRepasse({ f, set, categories }) {
  const valor = num(f.valor_base) || 0
  const pm = f.data_inicio ? primeiroMes({ data_inicio: f.data_inicio, valor_base: valor }) : null
  const comp = ymDe(f.data_inicio)
  const dr = int(f.dia_repasse)
  const exemplo = comp && dr >= 1 && dr <= 31
    ? dataRepasse({ dia_repasse: dr, repasse_meses_depois: int(f.repasse_meses_depois) ?? 1 }, comp) : null
  return (
    <>
      <Campo campo="dia_repasse" label="Dia do repasse">
        <input autoComplete="off" type="number" min="1" max="31" data-guia="contrato-form.dia-repasse" className="input" value={f.dia_repasse} onChange={e => set('dia_repasse', e.target.value)} />
      </Campo>
      <Campo label="Repasse acontece">
        <select className="input" value={f.repasse_meses_depois} onChange={e => set('repasse_meses_depois', e.target.value)}>
          {Object.entries(REPASSE_MESES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {exemplo && <p className="text-[11px] text-texto-3 mt-1">Ex.: aluguel de {fmtYm(comp)} → repasse em {fmtDate(exemplo)}.</p>}
      </Campo>
      <Campo campo="taxa_adm_pct" label="Taxa de administração (%)">
        <input autoComplete="off" className="input" inputMode="decimal" data-guia="contrato-form.taxa-adm" value={f.taxa_adm_pct}
          onChange={e => set('taxa_adm_pct', e.target.value)} placeholder="Ex.: 10" />
      </Campo>
      <Campo label="Taxa calculada sobre">
        <select className="input" value={f.taxa_adm_base} onChange={e => set('taxa_adm_base', e.target.value)}>
          {Object.entries(BASES_TAXA_ADM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <p className="text-[11px] text-texto-3 mt-1">O valor de cada mês pode ser corrigido na composição (fica o calculado e o informado).</p>
      </Campo>
      <Campo label="Categoria da taxa de administração" className="sm:col-span-2">
        <CategorySelect categories={categories} value={f.categoria_taxa_adm_id} onChange={e => set('categoria_taxa_adm_id', e.target.value)} type="expense" perfilId={f.perfil_id || null} searchable />
      </Campo>
      <Campo campo="valor_primeiro_mes" label="Aluguel do 1º mês" className="sm:col-span-2">
        <CampoValor value={f.valor_primeiro_mes} onChange={v => set('valor_primeiro_mes', v)} placeholder={pm ? valorBRFormatado(pm.calculado) : 'Mês cheio'} />
        <p className="text-[11px] text-texto-3 mt-1">
          {pm
            ? <>Início em {fmtDate(f.data_inicio)}: proporcional de {pm.dias} dias = {fmt(valor)} ÷ 30 × {pm.dias} = <strong className="text-texto-1">{fmt(pm.calculado)}</strong>. Deixe em branco para usar esse valor ou digite o combinado.</>
            : 'Início no dia 1: o 1º mês é cheio. Preencha só se o valor combinado for diferente.'}
        </p>
      </Campo>
      <Campo campo="saldo_inicial_valor" label="Saldo inicial com a administradora (opcional)" className="sm:col-span-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select className="input" value={f.saldo_inicial_sinal} onChange={e => set('saldo_inicial_sinal', e.target.value)} aria-label="Sentido do saldo inicial">
            <option value="credor">A administradora me deve</option>
            <option value="devedor">Eu devo à administradora</option>
          </select>
          <CampoValor value={f.saldo_inicial_valor} onChange={v => set('saldo_inicial_valor', v)} placeholder="0,00" aria-label="Valor do saldo inicial" />
          <input autoComplete="off" type="month" className="input" value={f.saldo_inicial_competencia} onChange={e => set('saldo_inicial_competencia', e.target.value)} aria-label="Competência do saldo inicial" />
        </div>
        <p className="text-[11px] text-texto-3 mt-1">
          Para começar no meio da história: o saldo que vinha de antes da competência informada (ex.: despesas maiores que o aluguel ainda a descontar). Sem saldo, deixe em branco.
        </p>
      </Campo>
    </>
  )
}

function Composicao({ c }) {
  return [...(c?.itens || []).map(i => `${i.desc ?? i.descricao} ${fmt(i.valor)}`), c?.projecao ? textoProjecao(c.projecao) : ''].filter(Boolean).join(' · ')
}

function PreviaTabela({ linhas, contrato }) {
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
              <td className="px-2 py-1.5 text-texto-2">{contrato.modo_repasse && p.papel === 'aluguel' ? `Repasse ${fmtYm(p.competencia)}` : rotuloPapel(contrato, p.papel)}</td>
              <td className="px-2 py-1.5 text-texto-2 whitespace-nowrap">{fmtDate(p.vencimento)}</td>
              <td className="px-2 py-1.5 text-texto-3"><Composicao c={p.composicao} /></td>
              <td className="px-2 py-1.5 text-right whitespace-nowrap">
                <span className="text-texto-1 font-medium">{fmt(p.valor)}</span>
                {p.composicao?.bruto === true && <span className="ml-1.5 text-[10px] text-aviso outline-dashed outline-1 outline-borda-forte rounded px-1">Valor bruto</span>}
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

function MudancasTabela({ plano, contrato }) {
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
              <td className="px-2 py-1.5 text-texto-2">{rotuloPapel(contrato, l.papel)}</td>
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
