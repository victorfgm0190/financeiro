// Importar Fatura — FORMATO da sugestão do Assistente (Etapa 6c). Nesta etapa nada chama a IA: a
// tela já tem o lugar (cartão "É este?" e lista de Novos) e só mostra uma sugestão que passe por esta
// validação. Ver docs/importar-fatura-6b-diagnostico.md §4.
//
// Sugestão (uma por linha da fatura):
//   {
//     linhaId:     string            — _id da linha da fatura
//     decisao:     'mesmo' | 'novo' | null   — no cartão "É este?": é o candidato / é outra compra
//     candidatoId: string | null     — o lançamento (ou agendamento) que a sugestão aponta
//     categoriaId: string | null     — na lista de Novos: categoria sugerida
//     confianca:   'alta' | 'media' | 'baixa'
//     motivo:      string (até 140 caracteres)
//   }
// A tela valida contra as regras: candidato só da lista já permitida, categoria só das do perfil.
// Sugestão fora disso é descartada (= "sem sugestão"). Sempre só sugestão: o usuário confirma.

export const CONFIANCAS = ['alta', 'media', 'baixa']
export const MOTIVO_MAX = 140

// → sugestão normalizada, ou null quando não vale para esta linha.
//   ctx: { linhaId, candidatosIds = [], categoriasIds = null (null = não se aplica) }
export function validarSugestao(s, { linhaId, candidatosIds = [], categoriasIds = null } = {}) {
  if (!s || typeof s !== 'object' || !linhaId || s.linhaId !== linhaId) return null
  if (!CONFIANCAS.includes(s.confianca)) return null
  const motivo = String(s.motivo || '').trim()
  if (!motivo) return null
  const decisao = s.decisao === 'mesmo' || s.decisao === 'novo' ? s.decisao : null
  const candidatoId = s.candidatoId || null
  if (decisao === 'mesmo' && (!candidatoId || !candidatosIds.includes(candidatoId))) return null
  if (decisao !== 'mesmo' && candidatoId) return null
  let categoriaId = s.categoriaId || null
  if (categoriaId && (!categoriasIds || !categoriasIds.includes(categoriaId))) return null
  if (!decisao && !categoriaId) return null
  return {
    linhaId, decisao, candidatoId, categoriaId, confianca: s.confianca,
    motivo: motivo.length > MOTIVO_MAX ? `${motivo.slice(0, MOTIVO_MAX - 1)}…` : motivo,
  }
}

export const ROTULO_CONFIANCA = { alta: 'confiança alta', media: 'confiança média', baixa: 'confiança baixa' }
