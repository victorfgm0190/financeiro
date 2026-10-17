import { centralQuery as query } from './_central.js'
import { ensurePlataformaSchema, checarSigla, sugerirSiglaLivre, queryParam } from './_plataforma.js'

// Público (sem login), SÓ leitura: a sigla serve para o endereço sigla.finup.app.br?
//   GET ?sigla=x&nome=y → { sigla, disponivel, motivo?, sugestao? }
//   GET ?nome=y         → { sugestao } (sugestão automática pelas iniciais)
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  if (req.method !== 'GET') return res.status(405).end()
  const sigla = String(queryParam(req, 'sigla') || '').slice(0, 60)
  const nome = String(queryParam(req, 'nome') || '').slice(0, 150)
  try {
    await ensurePlataformaSchema()
    if (!sigla) return res.json({ sugestao: nome ? await sugerirSiglaLivre(query, nome) : null })
    return res.json(await checarSigla(query, sigla, nome))
  } catch (err) {
    console.error('[api/sigla-disponivel]', err.message)
    return res.status(500).json({ error: 'Falha ao consultar a sigla' })
  }
}
