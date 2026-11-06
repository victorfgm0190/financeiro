import { emTransacaoUnica, parseBody } from './_db.js'
import { pode, temTodosPerfis } from '../src/lib/permissoes.js'
import {
  ErroVirada, temViradaAssistida, fotoDoFechado, itensEmPeriodoFechado, analisarEstorno, estornarViradas, refazerViradas,
  recalcularRazaoNoBanco, hojeDaVirada,
} from './_viradaReservaServidor.js'

// ── Período virado exige estorno ────────────────────────────────────────────────────────────────
// Toda gravação que mexe no saldo de função de reserva passa por aqui: lançamentos, transferências,
// ajustes, saldo inicial e o que o Patrimônio grava. A rota roda numa transação e a guarda compara o que
// mudou em período já virado:
//   • nada mudou lá                 → grava normalmente;
//   • mudou e não há como estornar  → desfaz e bloqueia, com o motivo (409 periodo_bloqueado);
//   • mudou e não há permissão      → desfaz, com a mensagem (403 periodo_virado_sem_permissao);
//   • mudou e não veio confirmação  → desfaz e devolve a prévia (409 periodo_virado);
//   • mudou e veio a confirmação (cabeçalho X-Confirmar-Estorno) → numa operação só: estorna da mais
//     recente até a data, grava e refaz em ordem. Falhou, nada fica.
// `somenteVerificar` no corpo (fila do app, antes de enviar as contas): faz tudo isso sem gravar nada.

export const MSG_PERIODO_VIRADO = 'Esse período já foi virado. Para lançar, é preciso estornar a virada.'
const MSG_SEM_PERMISSAO = 'Esse período já foi virado. Para lançar, é preciso estornar a virada, e o seu acesso não permite. Peça a quem faz a virada.'

class DesfazerTentativa extends Error {}

// Guarda a resposta da rota: só vai ao navegador depois da decisão.
function respostaGuardada(res) {
  const r = {
    statusCode: 200,
    corpo: undefined,
    temCorpoJson: false,
    status(c) { r.statusCode = c; return r },
    json(b) { r.corpo = b; r.temCorpoJson = true; return r },
    end(b) { r.corpo = b; return r },
    send(b) { r.corpo = b; return r },
    setHeader(k, v) { res.setHeader?.(k, v); return r },
    getHeader(k) { return res.getHeader?.(k) },
  }
  return r
}

function entregar(res, guardada, extra = null) {
  res.status(guardada.statusCode)
  if (guardada.temCorpoJson) return res.json(extra ? { ...guardada.corpo, ...extra } : guardada.corpo)
  return res.end(guardada.corpo)
}

const podeEstornar = (user) => pode(user, 'reservas', 'editar') && temTodosPerfis(user?.perfis)

// `aplica(req, corpo)`: quando a guarda vale. Leitura nunca passa por ela.
export function comGuardaVirada(handler, { aplica = () => true } = {}) {
  return async (req, res) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return handler(req, res)
    const corpo = req.method === 'DELETE' ? (req.body || {}) : await parseBody(req)
    if (req.method !== 'DELETE') req.body = corpo
    if (!aplica(req, corpo)) return handler(req, res)
    if (!(await temViradaAssistida())) return handler(req, res)

    const somenteVerificar = corpo?.somenteVerificar === true
    const confirmado = String(req.headers?.['x-confirmar-estorno'] || '') === '1'

    // Tentativa: grava de verdade, compara e só fica se não tocou em período virado.
    const tentativa = respostaGuardada(res)
    let itens = []
    let analise = null
    try {
      await emTransacaoUnica(async (q) => {
        const antes = await fotoDoFechado(q)
        await handler(req, tentativa)
        if (!antes) {
          if (somenteVerificar) throw new DesfazerTentativa()
          return
        }
        if (tentativa.statusCode >= 400) return
        itens = itensEmPeriodoFechado(antes, await fotoDoFechado(q, antes))
        if (itens.length) analise = await analisarEstorno(q, itens)
        if (itens.length || somenteVerificar) throw new DesfazerTentativa()
      })
    } catch (err) {
      if (!(err instanceof DesfazerTentativa)) throw err
    }

    if (tentativa.statusCode >= 400) return entregar(res, tentativa)
    if (!itens.length) return somenteVerificar ? res.json({ ok: true, verificado: true }) : entregar(res, tentativa)

    if (analise.bloqueio) {
      return res.status(409).json({ error: analise.bloqueio, codigo: 'periodo_bloqueado', itens: analise.itens })
    }
    if (!podeEstornar(req.user)) {
      return res.status(403).json({ error: MSG_SEM_PERMISSAO, codigo: 'periodo_virado_sem_permissao' })
    }
    if (!confirmado) {
      return res.status(409).json({
        error: MSG_PERIODO_VIRADO,
        codigo: 'periodo_virado',
        previa: { viradas: analise.viradas, itens: analise.itens },
      })
    }
    if (somenteVerificar) return res.json({ ok: true, verificado: true, estornoConfirmado: true })

    // Confirmado: tudo numa operação só.
    const hoje = hojeDaVirada(corpo?.hoje)
    const usuario = req.user?.username || req.user?.sub || null
    const gravacao = respostaGuardada(res)
    let resultado = null
    const desde = analise.desde
    try {
      await emTransacaoUnica(async (q) => {
        const estornadas = await estornarViradas(q, analise.cortes, usuario)
        await handler(req, gravacao)
        if (gravacao.statusCode >= 400) throw new DesfazerTentativa()
        resultado = await refazerViradas(q, { estornadas, hoje, usuario, desde })
      })
    } catch (err) {
      if (err instanceof ErroVirada) return res.status(err.status).json({ error: `Nada foi gravado: ${err.message}`, codigo: err.codigo })
      if (!(err instanceof DesfazerTentativa)) throw err
    }
    if (gravacao.statusCode >= 400) return entregar(res, gravacao)
    try { await recalcularRazaoNoBanco({ hoje, desde }) } catch (err) { console.error('[virada] razão após estorno:', err?.code || err?.name || 'erro') }
    return entregar(res, gravacao, { viradaEstorno: resultado })
  }
}
