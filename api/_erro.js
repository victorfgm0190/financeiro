import { randomBytes } from 'node:crypto'

// ERROS PARA O NAVEGADOR (auditoria 11/2026, item 5). A mensagem crua do Postgres (ou de qualquer
// falha interna) revela tabela, coluna, constraint e às vezes valores: vai só para o log do servidor,
// com um código de referência. O navegador recebe uma frase genérica + o mesmo código, para o
// usuário informar ao suporte. Exceções:
//   • erro "de negócio" com status 4xx (ErroHttp e afins): a mensagem foi escrita por nós para o
//     usuário — passa como está;
//   • lista branca de SQLSTATE com tradução em português (duplicado, referência, formato…).
// No log: código, constraint, tabela, coluna e a mensagem SEM o valor entre aspas (pode ser dado
// financeiro); nunca o `detail` do Postgres (traz os valores da linha) nem cabeçalhos/token.

export const MENSAGEM_GENERICA = 'Não foi possível concluir a operação. Tente de novo; se continuar, informe o código ao suporte.'

const TRADUCOES = {
  23505: 'Já existe um registro com esses dados.',
  23503: 'Este registro depende de outro que não foi encontrado (ou ainda está em uso).',
  23502: 'Falta um campo obrigatório.',
  23514: 'Um dos valores não é permitido.',
  '22P02': 'Um dos valores está em formato inválido.',
  22007: 'Data em formato inválido.',
  22008: 'Data fora do intervalo permitido.',
  22003: 'Valor numérico fora do intervalo permitido.',
  22001: 'Um dos textos é longo demais.',
  // Tabela ainda não criada no banco do ambiente: o app (useContratos) segue sem o recurso ao ver
  // "não existe" — sem citar a tabela.
  '42P01': 'Esta parte do sistema ainda não existe neste ambiente (atualização pendente).',
}

export const novaReferencia = () => `ERR-${randomBytes(3).toString('hex').toUpperCase()}`

// Frase para o navegador (sem nada do erro original, a não ser a tradução da lista branca), com o
// código no próprio texto — a tela mostra só o `error`.
export const comCodigo = (frase, ref) => `${frase} (código ${ref})`
export const mensagemParaNavegador = (err, ref) => comCodigo(TRADUCOES[err?.code] || MENSAGEM_GENERICA, ref)

// Erro escrito por nós para o usuário: status 4xx definido no próprio erro.
export const ehErroDeNegocio = (err) => Number.isInteger(err?.status) && err.status >= 400 && err.status < 500

// Mensagem para o LOG: tira o valor entre aspas do fim ("invalid input syntax for type numeric: \"12,5\"")
// e limita o tamanho.
export function mensagemParaLog(msg) {
  return String(msg ?? '').replace(/:\s*"[^"]*"\s*$/, ': "…"').replace(/\s+/g, ' ').slice(0, 300)
}

export function registrarErro(rota, err, ref) {
  const partes = [`ref=${ref}`]
  for (const k of ['code', 'constraint', 'table', 'column']) if (err?.[k]) partes.push(`${k}=${err[k]}`)
  console.error(`[${rota}]`, partes.join(' '), mensagemParaLog(err?.message ?? err))
}

// 5xx definido no próprio erro (ex.: 502 do serviço externo) é mantido; o resto é 500.
const statusDoErro = (err) => (Number.isInteger(err?.status) && err.status >= 500 && err.status < 600 ? err.status : 500)

// Responde o erro: negócio (4xx) passa; o resto vira frase genérica + referência, com o detalhe só no
// log. `status`: o código HTTP (padrão 500). `extra`: campos a mais da resposta (ex.: codigoBanco).
export function responderErro(res, err, rota, { status = statusDoErro(err), extra = {} } = {}) {
  if (ehErroDeNegocio(err)) return res.status(err.status).json({ error: err.message })
  const ref = novaReferencia()
  registrarErro(rota, err, ref)
  return res.status(status).json({ error: mensagemParaNavegador(err, ref), ref, ...extra })
}

// Rede de segurança (usada pelo comAmbiente): resposta JSON 500 que não passou por responderErro
// (sem `ref`) tem a mensagem trocada pela genérica + referência; a original vai para o log. 502/503
// ficam de fora: são avisos escritos por nós (serviço externo fora, recurso não configurado).
export function protegerRespostasDeErro(res, rota) {
  if (!res || typeof res.json !== 'function' || res.__erroProtegido) return res
  const json = res.json.bind(res)
  res.json = (corpo) => {
    const status = Number(res.statusCode) || 200
    if (status === 500 && corpo && typeof corpo === 'object' && !Array.isArray(corpo) && 'error' in corpo && !corpo.ref) {
      const ref = novaReferencia()
      registrarErro(rota, { message: corpo.error, code: corpo.code || corpo.codigoBanco }, ref)
      const resto = { ...corpo }
      delete resto.error
      delete resto.code
      return json({ ...resto, error: comCodigo(MENSAGEM_GENERICA, ref), ref })
    }
    return json(corpo)
  }
  res.__erroProtegido = true
  return res
}
