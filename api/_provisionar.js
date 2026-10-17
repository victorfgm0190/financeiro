import { withTransaction } from './_db.js'
import { ErroHttp } from './_usuarios.js'
import { buscarCliente, registrarHistorico, siglaOcupada } from './_plataforma.js'
import { problemaSigla, DOMINIO_CLIENTES } from '../src/lib/plataforma.js'

// PONTO ÚNICO de provisionamento de um cliente da plataforma. Hoje é chamado pelo botão Aprovar
// do Controle de Clientes; no futuro o aviso (webhook) da plataforma de pagamento vai chamar ESTA
// mesma função — nada de provisionar por outro caminho.
//
// FASE DE TESTE: só confirma a sigla, marca 'aprovado', grava o histórico e devolve a mensagem de
// boas-vindas. REGRA DE SEGURANÇA: não cria usuário nem dá acesso a este banco (dados pessoais).
//
// Estados de onde dá para provisionar. 'aprovado' de novo só regera a mensagem (idempotente).
const PODE_PROVISIONAR = ['pedido', 'recusado', 'aprovado']

export function mensagemBoasVindas(c) {
  const primeiroNome = String(c.nome || '').trim().split(/\s+/)[0] || 'tudo bem'
  const endereco = `https://${c.sigla}.${DOMINIO_CLIENTES}`
  return [
    `Olá, ${primeiroNome}! Seu pedido para usar o Finup foi aprovado.`,
    '',
    `Acesse: https://${DOMINIO_CLIENTES}`,
    `Ambiente: ${String(c.sigla).toUpperCase()}`,
    `Usuário: admin (ou o e-mail ${c.email})`,
    `Endereço do seu ambiente: ${endereco}`,
    '',
    'Na próxima etapa você vai receber o link para criar a sua senha de acesso.',
    'Qualquer dúvida, é só responder esta mensagem.',
  ].join('\n')
}

export async function provisionarCliente(clienteId, { autor = null, transacao = withTransaction } = {}) {
  return transacao(async (q) => {
    const c = await buscarCliente(q, clienteId, { travar: true })
    if (!c) throw new ErroHttp(404, 'Cliente não encontrado')
    if (!PODE_PROVISIONAR.includes(c.status)) throw new ErroHttp(409, `Cliente com status "${c.status}" não pode ser aprovado`)

    // 1. Confirma a sigla (formato, reservada e única).
    const problema = problemaSigla(c.sigla)
    if (problema) throw new ErroHttp(409, `Sigla: ${problema}`)
    if (await siglaOcupada(q, c.sigla, c.id)) throw new ErroHttp(409, 'Sigla já está em uso por outro cliente')

    // ETAPA 2 — entram aqui, nesta ordem (cada passo idempotente, para o webhook poder repetir):
    //   2. criar o banco do cliente no Neon (API de projetos/branches) e guardar a connection string
    //      no banco central da plataforma;
    //   3. aplicar o schema (supabase/schema.sql + migrações) no banco novo;
    //   4. criar a organização e o usuário admin (e-mail do cliente) NO BANCO DO CLIENTE — nunca aqui;
    //   5. gerar o link de criação de senha (token de uso único com validade);
    //   6. enviar o e-mail de boas-vindas com o link e o endereço sigla.finup.app.br.

    const jaAprovado = c.status === 'aprovado'
    if (!jaAprovado) {
      await q("UPDATE plataforma_clientes SET status = 'aprovado', updated_at = now() WHERE id = $1", [c.id])
      await registrarHistorico(q, c.id, 'aprovado', `Status ${c.status} → aprovado · sigla ${c.sigla}`, autor)
    } else {
      await registrarHistorico(q, c.id, 'boas_vindas', 'Mensagem de boas-vindas gerada novamente', autor)
    }
    const cliente = await buscarCliente(q, c.id)
    return { cliente, mensagem: mensagemBoasVindas(cliente), endereco: `https://${cliente.sigla}.${DOMINIO_CLIENTES}` }
  })
}
