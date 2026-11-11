// BACKUP COMPLETO — montagem do arquivo a partir do manifesto e das páginas, e divisão do arquivo
// em partes para a restauração. O MESMO código no navegador (src/lib/backupCliente.js) e no script
// scripts/backup-exportar.js. PURO: quem chama fornece obterManifesto/obterPagina.
import { FORMATO, VERSAO_FORMATO, LIMITE_BYTES_PARTE, impressaoDasLinhas } from './backupFormato.js'

const pausa = () => new Promise(r => setTimeout(r, 0))
export const ERRO_BANCO_MUDOU = 'O banco mudou enquanto o backup era gerado (alguém gravou algo). Tente de novo.'

// → arquivo { formato, versaoFormato, manifesto, tabelas }. Confere quantidade e impressão digital de
// cada tabela recebida contra o manifesto; diferença (o banco mudou no meio) → tenta de novo do zero
// até `tentativas` vezes e depois falha com ERRO_BANCO_MUDOU.
// Leitura: `obterPaginas(de, offset)` → { blocos: [{ tabela, linhas }], proximo: { tabela, offset } | null }
// (várias tabelas por chamada — a tela) ou `obterPagina(tabela, offset)` → { linhas, proximo } (uma
// tabela por chamada — o script, que fala direto com o banco).
export async function montarBackup({ obterManifesto, obterPagina, obterPaginas, onProgresso = () => {}, subtle, tentativas = 2 }) {
  let ultimoErro = null
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    const manifesto = await obterManifesto()
    const nomes = Object.keys(manifesto.tabelas).sort()
    const indice = new Map(nomes.map((t, i) => [t, i + 1]))
    const totalLinhas = nomes.reduce((s, t) => s + Number(manifesto.tabelas[t].linhas || 0), 0)
    let feitas = 0
    const recebidas = {}
    const receber = (t, linhas) => {
      ;(recebidas[t] ||= []).push(...linhas)
      feitas += linhas.length
      onProgresso({ tabela: t, tabelaIndice: indice.get(t) || nomes.length, totalTabelas: nomes.length, linhas: feitas, totalLinhas })
    }
    if (obterPaginas) {
      let cursor = { tabela: null, offset: 0 }
      while (cursor) {
        const r = await obterPaginas(cursor.tabela, cursor.offset)
        for (const b of r.blocos || []) receber(b.tabela, b.linhas)
        cursor = r.proximo || null
        await pausa() // devolve a vez à tela a cada resposta (a barra anda e os cliques respondem)
      }
    } else {
      for (const t of nomes) {
        let offset = 0
        while (offset != null) {
          const r = await obterPagina(t, offset)
          receber(t, r.linhas)
          offset = r.proximo
        }
      }
    }
    // Tabela que o banco tem e o manifesto não (criada no meio) também é "o banco mudou".
    let mudou = Object.keys(recebidas).find(t => !manifesto.tabelas[t]) || null
    const tabelas = {}
    for (const t of mudou ? [] : nomes) {
      const linhas = recebidas[t] || []
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
