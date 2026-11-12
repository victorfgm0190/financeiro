// Regras puras do "O que mudou" (lista em src/novidades.js). Nada específico de cliente.

// 'AAAA.MM.DD' ou 'AAAA.MM.DD-n' → número comparável (n ausente = 1). Inválido → -1.
export function chaveVersao(id) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})(?:-(\d{1,3}))?$/.exec(String(id || ''))
  if (!m) return -1
  return Number(`${m[1]}${m[2]}${m[3]}`) * 1000 + Number(m[4] || 1)
}

export const maisNovaPrimeiro = (lista = []) => [...lista].filter(n => chaveVersao(n?.id) >= 0).sort((a, b) => chaveVersao(b.id) - chaveVersao(a.id))
export const versaoMaisNova = (lista = []) => maisNovaPrimeiro(lista)[0]?.id || null
export const visivelPara = (n, { admin = false } = {}) => n.publico !== 'admin' || admin

// Sem nada guardado (usuário que ainda não viu nenhuma): só as dos últimos DIAS_SEM_REGISTRO dias —
// quem chega não recebe o histórico inteiro.
export const DIAS_SEM_REGISTRO = 30
export function novidadesNaoVistas(lista, vista, { admin = false, agora = new Date() } = {}) {
  const visiveis = maisNovaPrimeiro(lista).filter(n => visivelPara(n, { admin }))
  if (vista && chaveVersao(vista) >= 0) return visiveis.filter(n => chaveVersao(n.id) > chaveVersao(vista))
  const limite = agora.getTime() - DIAS_SEM_REGISTRO * 86400000
  return visiveis.filter(n => new Date(`${n.data}T12:00:00`).getTime() >= limite)
}

// Versão nova publicada (/versao.json) × a que está aberta: as entradas que chegam com ela.
export function novidadesDaVersaoNova(locais = [], remotas = []) {
  const atual = chaveVersao(versaoMaisNova(locais))
  return maisNovaPrimeiro(remotas).filter(n => chaveVersao(n.id) > atual)
}

// Até `max` linhas para o aviso de atualização (das mais novas para as mais antigas).
export function linhasDoAviso(novas = [], { admin = false, max = 3 } = {}) {
  return novas.filter(n => visivelPara(n, { admin })).flatMap(n => n.itens || []).slice(0, max)
}

// Obrigatória quando QUALQUER versão no caminho é (a anterior não pode mais gravar). Motivo da mais nova.
export function obrigatoriaEntre(novas = []) {
  const o = novas.find(n => n.obrigatoria)
  return o ? { obrigatoria: true, motivo: o.motivo || 'Esta versão muda a forma como os dados são guardados; a versão aberta não consegue mais gravar.' } : { obrigatoria: false, motivo: null }
}
