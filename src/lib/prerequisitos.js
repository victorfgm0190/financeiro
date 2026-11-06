// PRÉ-REQUISITOS das funções: o que o código EXIGE para a função funcionar (validação do formulário),
// independente da jornada estar ligada. Usado pelo aviso "Para isso você precisa antes de…"
// (src/components/BoasVindas/AvisoPrerequisitos.jsx). Não bloqueia nada: só orienta.
//   lançamento/agendamento → conta (TransactionForm e ScheduleForm recusam sem accountId); cartão serve.
//   contrato               → perfil e conta (contratos/validacao.js, etapas 0 e 1). Categoria também é
//                            exigida, mas já vem pronta no kit do ambiente.
//   importar fatura        → cartão (o arquivo é lançado num cartão cadastrado).
//   função de reserva      → conta de reserva (o form aceita "Sem conta", mas sem ela não há fluxo,
//                            rendimento nem virada).
import { PASSOS_JORNADA } from './onboardingSteps.js'

const contaOuCartao = (d) => (d.accounts || []).some(a => !a.isGerencial)
const passo = (id) => PASSOS_JORNADA.find(p => p.id === id)

export const PREREQUISITOS = {
  lancamento: { titulo: 'registrar um lançamento', exige: [{ passo: 'conta', texto: 'Cadastrar uma conta ou um cartão', ok: contaOuCartao }] },
  agendamento: { titulo: 'criar um agendamento', exige: [{ passo: 'conta', texto: 'Cadastrar uma conta ou um cartão', ok: contaOuCartao }] },
  contrato: { titulo: 'cadastrar um contrato', exige: [{ passo: 'perfil' }, { passo: 'conta' }] },
  'importar-fatura': { titulo: 'importar uma fatura', exige: [{ passo: 'cartao' }] },
  'funcao-reserva': { titulo: 'criar uma função de reserva', exige: [{ passo: 'reserva' }] },
}

// { titulo, itens: [{ passo, texto, ok }], faltam } — itens na ordem das dependências.
export function prerequisitosDe(funcao, dados = {}) {
  const def = PREREQUISITOS[funcao]
  if (!def) return null
  const itens = def.exige.map(e => {
    const p = passo(e.passo)
    return { passo: p, texto: e.texto || p.titulo, ok: e.ok ? e.ok(dados) : !!p.feito?.(dados) }
  })
  return { titulo: def.titulo, itens, faltam: itens.some(i => !i.ok) }
}
