// ── Base do HELP DE CAMPO (F1 / ícone ⓘ / Preenchimento Guiado) ─────────────────────────────────
// Um arquivo por tela (src/help/<tela>.js) exportando:
//   campos:      { 'tela.campo': { titulo, paraQueServe, relacaoComTela, oQueAconteceAoSalvar?,
//                                  obrigatorio, quandoUsar?, atencao?, exemplo?, pendente? } }
//   formularios: { '<form>': { objetivo, preRequisitos: [{ id, texto }], ordemCampos: ['tela.campo'],
//                              resumoAoSalvar } }
// paraQueServe = o texto curto do ícone ⓘ (textoCurtoDoCampo). relacaoComTela = como o campo afeta
// os outros campos e o resultado (o principal do help).
// `pendente`: conteúdo só migrado, sem relacaoComTela — o `npm run help:check` acusa (Etapa 6: nenhum).
// Nada específico de um cliente.
import * as agendamentos from './agendamentos.js'
import * as contratos from './contratos.js'
import * as contas from './contas.js'
import * as lancamentos from './lancamentos.js'
import * as categorias from './categorias.js'
import * as favorecidos from './favorecidos.js'
import * as perfis from './perfis.js'
import * as reservas from './reservas.js'
import * as cadastros from './cadastros.js'
import * as patrimonio from './patrimonio.js'
import * as fluxo from './fluxo.js'
import * as contratosAcoes from './contratosAcoes.js'
import * as configuracoes from './configuracoes.js'
import * as importar from './importar.js'
import * as operacoes from './operacoes.js'
import * as lancamentosModais from './lancamentosModais.js'
import * as filtros from './filtros.js'
import * as assistente from './assistente.js'
import * as acesso from './acesso.js'

const TELAS = { agendamentos, contratos, contas, lancamentos, categorias, favorecidos, perfis, reservas, cadastros, patrimonio, fluxo, contratosAcoes, configuracoes, importar, operacoes, lancamentosModais, filtros, assistente, acesso }

export const CAMPOS = Object.freeze(Object.assign({}, ...Object.values(TELAS).map(t => t.campos)))
export const FORMULARIOS = Object.freeze(Object.assign({}, ...Object.values(TELAS).map(t => t.formularios)))

export const ID_CAMPO = /^[a-zA-Z]+\.[a-zA-Z0-9]+$/

// 'tela.campo' → conteúdo do campo, ou null.
export const helpDoCampo = (id) => CAMPOS[String(id || '')] || null
// 'tela.campo' → texto curto do ⓘ (paraQueServe), ou '' se não existir.
export const textoCurtoDoCampo = (id) => helpDoCampo(id)?.paraQueServe || ''
// '<form>' → roteiro do formulário, ou null.
export const helpDoFormulario = (id) => FORMULARIOS[String(id || '')] || null
// Arquivo de origem de cada id (diagnóstico / help:check).
export const telaDoCampo = (id) => Object.entries(TELAS).find(([, t]) => id in t.campos)?.[0] || null
