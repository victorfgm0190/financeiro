// Nome do ESTABELECIMENTO para comparar lançamentos (Importar Fatura, Assistente): a lista de palavras
// genéricas e o corte da cidade/país que o banco cola no fim da descrição moram SÓ aqui. PURO e
// genérico — nada de nome de cliente, loja ou cidade fixa.
//
// Por quê: "Anderson Pasteis Londrina" × "Havan Londrina", "Liz Lingerie Shop" × "Shopee",
// "IOF Compra Internacional" × "Compra Amazon" e "Sereia Comercio" × "Yem Comercio" pareciam a mesma
// loja só pela cidade ou por uma palavra comum.

// Palavras que não identificam a loja: tipo de operação, forma societária, ramo genérico, conectivos.
export const PALAVRAS_GENERICAS = new Set([
  // operação / meio de pagamento
  'compra', 'compras', 'pagamento', 'pagto', 'pgto', 'pag', 'pg', 'debito', 'credito', 'parcela', 'parc',
  'internacional', 'nacional', 'online', 'virtual', 'app', 'www', 'com', 'br', 'bra', 'brasil',
  // forma societária
  'ltda', 'me', 'mei', 'epp', 'eireli', 'sa', 'cia', 'filial', 'matriz',
  // ramo genérico
  'shop', 'store', 'loja', 'lojas', 'comercio', 'comercial', 'mercado', 'servico', 'servicos',
  'industria', 'distribuidora', 'center', 'centro', 'posto', 'farmacia', 'drogaria', 'supermercado',
  'restaurante', 'lanchonete', 'padaria', 'auto', 'bar', 'hotel', 'magazine',
  // conectivos
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'the', 'and',
])

// Extratos de cartão costumam trazer o estabelecimento e, depois de vários espaços, a cidade/sufixo
// ("PADARIA X        SAO PAULO"). Só separa nesse caso (2+ espaços seguidos); o resto fica inteiro.
export function separarSufixo(descricao) {
  const s = String(descricao || '')
  const m = s.match(/^(.*?\S)\s{2,}(\S.*)$/)
  if (!m) return { principal: s.trim(), sufixo: '' }
  return { principal: m[1].trim(), sufixo: m[2].replace(/\s{2,}/g, ' ').trim() }
}

// Cidade + país COLADOS no fim, quando o arquivo perde os espaços do campo do estabelecimento
// ("Havan Londrina 3londrinabra", "Sereia Comercio De Linlondrinabra", "Amazon Br Brsao Paulobra"):
// última palavra terminada em "bra" (código do país) com 6+ letras, havendo outra palavra antes.
const CIDADE_COLADA = /\s+\S{3,}bra$/i

// Descrição → nome do estabelecimento: sem a cidade/sufixo (2+ espaços ou colada com "bra").
export function nomeSemSufixo(descricao) {
  const { principal } = separarSufixo(descricao)
  const semCidade = principal.replace(CIDADE_COLADA, '')
  return semCidade.trim() || principal
}

// Tira as palavras genéricas de um nome JÁ normalizado (minúsculo, sem acento, palavras por espaço).
// Se só sobrar palavra genérica, devolve vazio — "Loja" sozinha não identifica ninguém.
export function semPalavrasGenericas(nomeNormalizado) {
  return String(nomeNormalizado || '').split(' ').filter(w => w && !PALAVRAS_GENERICAS.has(w)).join(' ')
}
