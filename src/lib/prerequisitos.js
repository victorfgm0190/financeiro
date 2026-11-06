// PRÉ-REQUISITOS das funções: o que o código EXIGE para a função funcionar (validação do formulário),
// independente da jornada estar ligada. Usado pelo aviso "Para isso você precisa antes de…"
// (src/components/BoasVindas/AvisoPrerequisitos.jsx). Não bloqueia nada: só orienta.
//   lançamento/agendamento → conta (TransactionForm e ScheduleForm recusam sem accountId); cartão serve.
//   contrato               → perfil, conta e categoria (contratos/validacao.js, etapas 0 e 1). A categoria
//                            vem pronta no kit do ambiente (api/_kitBasico.js); o aviso é para quem
//                            apagou todas. "Reservas Gerais" é do sistema e não conta.
//   importar fatura        → cartão (o arquivo é lançado num cartão cadastrado).
//   função de reserva      → conta de reserva (o form aceita "Sem conta", mas sem ela não há fluxo,
//                            rendimento nem virada).
import { PASSOS_JORNADA } from './onboardingSteps.js'

const CATEGORIA_DO_SISTEMA = 'cat_res_ger'
const contaOuCartao = (d) => (d.accounts || []).some(a => !a.isGerencial)
const temCategoria = (d) => (d.categories || []).some(c => c.id !== CATEGORIA_DO_SISTEMA)
const passo = (id) => PASSOS_JORNADA.find(p => p.id === id)
// Categoria não é passo "fazer" da jornada (já vem pronta): destino próprio, com o "Faça comigo".
const CRIAR_CATEGORIA = { id: 'categoria', tela: 'settings', hash: '#config/cadastros/categorias', tarefa: 'settings.categoria' }

export const PREREQUISITOS = {
  lancamento: { titulo: 'registrar um lançamento', exige: [{ passo: 'conta', texto: 'Cadastrar uma conta ou um cartão', ok: contaOuCartao }] },
  agendamento: { titulo: 'criar um agendamento', exige: [{ passo: 'conta', texto: 'Cadastrar uma conta ou um cartão', ok: contaOuCartao }] },
  contrato: { titulo: 'cadastrar um contrato', exige: [{ passo: 'perfil' }, { passo: 'conta' }, { destino: CRIAR_CATEGORIA, texto: 'Criar uma categoria', ok: temCategoria }] },
  'importar-fatura': { titulo: 'importar uma fatura', exige: [{ passo: 'cartao' }] },
  'funcao-reserva': { titulo: 'criar uma função de reserva', exige: [{ passo: 'reserva' }] },
}

// { titulo, itens: [{ passo, texto, ok }], faltam } — itens na ordem das dependências.
export function prerequisitosDe(funcao, dados = {}) {
  const def = PREREQUISITOS[funcao]
  if (!def) return null
  const itens = def.exige.map(e => {
    const p = e.destino || passo(e.passo)
    return { passo: p, texto: e.texto || p.titulo, ok: e.ok ? e.ok(dados) : !!p.feito?.(dados) }
  })
  return { titulo: def.titulo, itens, faltam: itens.some(i => !i.ok) }
}
