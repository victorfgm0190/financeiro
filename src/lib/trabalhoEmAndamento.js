// TRABALHO EM ANDAMENTO — registro ÚNICO do que está na tela e ainda NÃO foi gravado (importação em
// revisão, conciliação, formulário alterado…). Cada tela informa com useTrabalhoEmAndamento(id, ativo,
// frase). Quem usa:
//   • o aviso de atualização (src/components/Layout/AvisoAtualizacao.jsx): com trabalho em andamento,
//     não recarrega sem confirmação e avisa de novo quando a tarefa termina;
//   • o fechar/recarregar a aba (F5, fechar janela): o navegador pergunta (beforeunload) SÓ enquanto
//     houver trabalho registrado.
// Puro (sem React); o estado vive só nesta página.

const trabalhos = new Map() // id → frase ("uma importação de fatura do cartão X")
const ouvintes = new Set()
let instantaneo = []
let saidaPermitida = false
let ouvindoSaida = false

const avisar = () => {
  instantaneo = [...trabalhos.entries()].map(([id, frase]) => ({ id, frase }))
  for (const f of ouvintes) f()
}

export const trabalhosEmAndamento = () => instantaneo
export const haTrabalhoEmAndamento = () => trabalhos.size > 0
export function assinarTrabalhos(f) { ouvintes.add(f); return () => ouvintes.delete(f) }

function aoSair(e) {
  if (saidaPermitida || trabalhos.size === 0) return undefined
  e.preventDefault()
  e.returnValue = ''
  return ''
}
function ouvirSaida() {
  if (ouvindoSaida || typeof window === 'undefined') return
  ouvindoSaida = true
  window.addEventListener('beforeunload', aoSair)
}

export function registrarTrabalho(id, frase) {
  if (!id) return
  const texto = String(frase || 'uma tarefa que ainda não foi gravada')
  if (trabalhos.get(id) === texto) return
  trabalhos.set(id, texto)
  ouvirSaida()
  avisar()
}

export function removerTrabalho(id) {
  if (!trabalhos.delete(id)) return
  avisar()
}

// Frase do aviso: "uma importação de fatura do cartão X" (a mais recente primeiro) e, havendo mais,
// "e mais N tarefas".
export function fraseDosTrabalhos(lista = instantaneo) {
  if (!lista.length) return ''
  const ultima = lista[lista.length - 1].frase
  return lista.length === 1 ? ultima : `${ultima} e mais ${lista.length - 1} ${lista.length === 2 ? 'tarefa' : 'tarefas'} sem gravar`
}

// "Atualizar mesmo assim" confirmado: a recarga não pergunta de novo.
export function permitirSaida() { saidaPermitida = true }

export function _reiniciarTrabalhos() {
  trabalhos.clear(); saidaPermitida = false
  if (ouvindoSaida && typeof window !== 'undefined') window.removeEventListener('beforeunload', aoSair)
  ouvindoSaida = false
  avisar()
}
