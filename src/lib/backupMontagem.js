// BACKUP COMPLETO — montagem do arquivo a partir do manifesto e das páginas, e divisão do arquivo
// em partes para a restauração. O MESMO código no navegador (src/lib/backupCliente.js) e no script
// scripts/backup-exportar.js. PURO: quem chama fornece obterManifesto/obterPagina.
import { FORMATO, VERSAO_FORMATO, LIMITE_BYTES_PARTE, impressaoDasLinhas } from './backupFormato.js'

export const ERRO_BANCO_MUDOU = 'O banco mudou enquanto o backup era gerado (alguém gravou algo). Tente de novo.'

// → arquivo { formato, versaoFormato, manifesto, tabelas }. Confere quantidade e impressão digital de
// cada tabela recebida contra o manifesto; diferença (o banco mudou no meio) → tenta de novo do zero
// até `tentativas` vezes e depois falha com ERRO_BANCO_MUDOU.
export async function montarBackup({ obterManifesto, obterPagina, onProgresso = () => {}, subtle, tentativas = 2 }) {
  let ultimoErro = null
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    const manifesto = await obterManifesto()
    const nomes = Object.keys(manifesto.tabelas).sort()
    const totalLinhas = nomes.reduce((s, t) => s + Number(manifesto.tabelas[t].linhas || 0), 0)
    let feitas = 0
    const tabelas = {}
    let mudou = null
    for (const [i, t] of nomes.entries()) {
      const linhas = []
      let offset = 0
      while (offset != null) {
        const r = await obterPagina(t, offset)
        linhas.push(...r.linhas)
        feitas += r.linhas.length
        onProgresso({ tabela: t, tabelaIndice: i + 1, totalTabelas: nomes.length, linhas: feitas, totalLinhas })
        offset = r.proximo
      }
      const info = manifesto.tabelas[t]
      if (linhas.length !== Number(info.linhas) || await impressaoDasLinhas(linhas, subtle) !== info.impressao) { mudou = t; break }
      tabelas[t] = linhas
    }
    if (!mudou) return { formato: FORMATO, versaoFormato: VERSAO_FORMATO, manifesto, tabelas }
    ultimoErro = new Error(`${ERRO_BANCO_MUDOU} (${mudou})`)
  }
  throw ultimoErro
}

// Partes para a área de preparo: cada parte com até `limite` bytes (medido no JSON que vai no corpo).
// Tabela sem linhas não gera parte. → [{ tabela, parte, linhas }]
export function dividirEmPartes(arquivo, limite = LIMITE_BYTES_PARTE) {
  const out = []
  for (const t of Object.keys(arquivo.manifesto.tabelas).sort()) {
    const linhas = arquivo.tabelas[t] || []
    let atual = []
    let bytes = 0
    let parte = 0
    for (const l of linhas) {
      const b = JSON.stringify(l).length + 1
      if (atual.length && bytes + b > limite) { out.push({ tabela: t, parte: parte++, linhas: atual }); atual = []; bytes = 0 }
      atual.push(l)
      bytes += b
    }
    if (atual.length) out.push({ tabela: t, parte, linhas: atual })
  }
  return out
}

// Texto do arquivo (.json). Linhas uma por linha do arquivo — fica legível e o tamanho é o mínimo.
export function serializarBackup(arquivo) {
  const tabelas = Object.keys(arquivo.tabelas).sort()
    .map(t => `${JSON.stringify(t)}:[${arquivo.tabelas[t].length ? '\n' + arquivo.tabelas[t].map(l => JSON.stringify(l)).join(',\n') + '\n' : ''}]`)
  return `{"formato":${JSON.stringify(arquivo.formato)},"versaoFormato":${arquivo.versaoFormato},\n"manifesto":${JSON.stringify(arquivo.manifesto, null, 1)},\n"tabelas":{\n${tabelas.join(',\n')}\n}}\n`
}
