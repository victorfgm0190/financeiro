import { withCentralTransaction } from './_central.js'

// LIMITE DO "ESQUECI MINHA SENHA" (tabela senha_pedidos do CENTRAL). Cada pedido grava uma linha na
// chave do IP ('ip:<ip>') e, se o login casar com um usuário, outra na chave do usuário
// ('usr:<ambiente_id>:<usuario_id>'), com o ambiente, o login digitado e o resultado. O pedido acima
// do limite também conta (insistir não reabre a janela). Linhas com mais de 1 dia são apagadas.
export const LIMITE_IP_POR_HORA = 10
export const LIMITE_USUARIO_POR_HORA = 3
const JANELA_MS = 60 * 60 * 1000
export const RESULTADOS = ['enviado', 'nao_encontrado', 'bloqueado_ip', 'bloqueado_usuario', 'falha_envio']

// Registra o pedido na chave e diz se ainda estava dentro do limite. Devolve { dentro, id }.
export async function registrarPedido(chave, limite, { agora, ambienteId = null, login = null, seBloqueado }) {
  return withCentralTransaction(async (cq) => {
    await cq('SELECT pg_advisory_xact_lock(hashtext($1))', [`senha_pedidos:${chave}`])
    await cq("DELETE FROM senha_pedidos WHERE criado_em < $1::timestamptz - interval '1 day'", [agora])
    const [{ n }] = await cq(
      "SELECT count(*)::int AS n FROM senha_pedidos WHERE chave = $1 AND criado_em > $2::timestamptz - interval '1 hour'",
      [chave, agora],
    )
    const dentro = n < limite
    const [r] = await cq(
      'INSERT INTO senha_pedidos (chave, criado_em, ambiente_id, login, resultado) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [chave, agora, ambienteId, login ? String(login).slice(0, 200) : null, dentro ? 'pendente' : seBloqueado],
    )
    return { dentro, id: r.id }
  })
}

export async function marcarResultado(q, ids, resultado) {
  const lista = ids.filter(Boolean)
  if (lista.length) await q('UPDATE senha_pedidos SET resultado = $2 WHERE id = ANY($1)', [lista, resultado])
}

// 189.45.12.7 → 189.45.x.x; IPv6 → só os 2 primeiros grupos.
export function mascararIp(ip) {
  const s = String(ip || '')
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return s.split('.').slice(0, 2).join('.') + '.x.x'
  if (s.includes(':')) return s.split(':').slice(0, 2).join(':') + ':x'
  return 'x'
}

// Quando a chave volta a aceitar pedido: a janela tem `n` pedidos; com n >= limite, precisa sair o
// (n - limite + 1)º mais antigo. Sem bloqueio → null.
function liberaEm(datas, limite) {
  if (datas.length < limite) return null
  const ordenadas = [...datas].sort((a, b) => a - b)
  return new Date(ordenadas[datas.length - limite].getTime() + JANELA_MS)
}

// Quadro "Tentativas de senha" de um ambiente: pedidos da última hora (sem IP completo nem token) e
// os bloqueios em vigor. `q` = consulta no central.
export async function tentativasDoAmbiente(q, ambienteId, { agora = new Date() } = {}) {
  const desde = new Date(agora.getTime() - JANELA_MS)
  const linhas = await q(
    `SELECT chave, criado_em, login, resultado FROM senha_pedidos
      WHERE ambiente_id = $1 AND chave LIKE 'ip:%' AND criado_em > $2 ORDER BY criado_em DESC`,
    [ambienteId, desde],
  )
  const pedidos = linhas.map(r => ({
    quando: r.criado_em, login: r.login, resultado: r.resultado === 'pendente' ? 'em_andamento' : r.resultado,
    ip: mascararIp(r.chave.slice(3)),
  }))

  const bloqueios = []
  // por IP (o limite do IP vale para todos os ambientes)
  for (const ip of [...new Set(linhas.map(r => r.chave))]) {
    const datas = (await q('SELECT criado_em FROM senha_pedidos WHERE chave = $1 AND criado_em > $2', [ip, desde])).map(r => new Date(r.criado_em))
    const ate = liberaEm(datas, LIMITE_IP_POR_HORA)
    if (ate) bloqueios.push({ tipo: 'ip', alvo: mascararIp(ip.slice(3)), ate })
  }
  // por usuário do ambiente
  const porUsuario = new Map()
  for (const r of await q(
    `SELECT chave, criado_em, login FROM senha_pedidos WHERE chave LIKE $1 AND criado_em > $2`,
    [`usr:${ambienteId}:%`, desde],
  )) {
    const u = porUsuario.get(r.chave) || { datas: [], login: null }
    u.datas.push(new Date(r.criado_em))
    u.login = u.login || r.login
    porUsuario.set(r.chave, u)
  }
  for (const u of porUsuario.values()) {
    const ate = liberaEm(u.datas, LIMITE_USUARIO_POR_HORA)
    if (ate) bloqueios.push({ tipo: 'usuario', alvo: u.login || 'usuário', ate })
  }
  const liberadoEm = bloqueios.length ? new Date(Math.max(...bloqueios.map(b => b.ate.getTime()))) : null
  return {
    pedidos, bloqueios, liberadoEm,
    limites: { porIpPorHora: LIMITE_IP_POR_HORA, porUsuarioPorHora: LIMITE_USUARIO_POR_HORA },
  }
}

// "Liberar agora": apaga SÓ os registros deste ambiente (as linhas de IP gravadas a partir dele e as
// linhas dos usuários dele). Conta antes (SELECT) e devolve quantas apagou.
export async function liberarLimiteDoAmbiente(q, ambienteId) {
  const filtro = 'ambiente_id = $1 OR chave LIKE $2'
  const params = [ambienteId, `usr:${ambienteId}:%`]
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM senha_pedidos WHERE ${filtro}`, params)
  if (n) await q(`DELETE FROM senha_pedidos WHERE ${filtro}`, params)
  return n
}
