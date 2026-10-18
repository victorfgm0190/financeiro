import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { parseBody } from './_db.js'
import { ErroHttp } from './_usuarios.js'
import { queryParam } from './_plataforma.js'
import { pode } from '../src/lib/permissoes.js'
import { gerarIcs, pareceIcs, TIPOS_FEED } from '../src/lib/agendaIcs.js'
import {
  chaveAgenda, buscarFeedAtivo, feedParaTela, criarFeed, alterarOpcoes, gravarCache, ERRO_SEM_CHAVE,
} from './_agendaFeed.js'

// AGENDA NO CELULAR — o feed .ics do PRÓPRIO usuário (tela Configurações › Geral). Tudo no banco
// CENTRAL (api/_agendaFeed.js); esta rota não consulta o banco do ambiente.
//   GET                        → { configurado, feed | null }
//   POST ?acao=criar   { tipos, mostrarValores } → cria ou "Gerar novo link" (revoga o anterior)
//   POST ?acao=opcoes  { tipos, mostrarValores } → muda as opções (mesmo link)
//   POST ?acao=publicar { conteudos: { despesa?, receita? } } → grava os .ics gerados pelo app
// Sem permissão de ver agendamentos, o publicar grava o calendário VAZIO, venha o que vier.
// Só usuários do cadastro (o login fixo de emergência não tem feed).

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  const user = req.user
  const sigla = req.ambiente?.sigla
  try {
    if (user.origem !== 'db' || !user.id) throw new ErroHttp(403, 'Disponível só para usuários do cadastro')
    const chave = chaveAgenda()
    if (req.method === 'GET') {
      return res.json({ configurado: !!chave, feed: await feedParaTela(await buscarFeedAtivo(sigla, user.id), chave) })
    }
    if (req.method !== 'POST') return res.status(405).end()
    if (!chave) throw new ErroHttp(503, ERRO_SEM_CHAVE)
    const acao = queryParam(req, 'acao')
    const body = (await parseBody(req)) || {}

    if (acao === 'criar') {
      const f = await criarFeed(sigla, user.id, body, chave)
      return res.json({ ok: true, feed: await feedParaTela(f, chave) })
    }
    if (acao === 'opcoes') {
      const f = await alterarOpcoes(sigla, user.id, body)
      return res.json({ ok: true, feed: await feedParaTela(f, chave) })
    }
    if (acao === 'publicar') {
      const f = await buscarFeedAtivo(sigla, user.id)
      if (!f) throw new ErroHttp(404, 'Agenda no celular ainda não foi criada')
      const podeVer = pode(user, 'agendamentos', 'ver')
      const conteudos = body.conteudos || {}
      const gravados = {}
      for (const tipo of TIPOS_FEED) {
        if (!f.tipos.includes(tipo) || !(tipo in conteudos)) continue
        const conteudo = podeVer ? String(conteudos[tipo] || '') : gerarIcs({ tipo, eventos: [] })
        if (!pareceIcs(conteudo)) throw new ErroHttp(400, `Conteúdo inválido para ${tipo}`)
        gravados[tipo] = await gravarCache(f.id, tipo, conteudo)
      }
      return res.json({ ok: true, gravados })
    }
    return res.status(400).json({ error: 'Ação desconhecida' })
  } catch (err) {
    if (err instanceof ErroHttp) return res.status(err.status).json({ error: err.message })
    console.error('[api/agenda-feed]', err.message)
    return res.status(500).json({ error: 'Falha ao processar a Agenda no celular' })
  }
}

export default comAmbiente(handler)
