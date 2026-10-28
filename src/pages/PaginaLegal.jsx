import { ArrowLeft } from 'lucide-react'

// Termos de uso e política de privacidade (/termos, /privacidade) — RASCUNHO para revisão do
// Victor antes de qualquer divulgação. Texto simples, sem valor jurídico até a revisão.

// Cláusula de acesso da administração aos dados do cliente (Análise do Cliente, api/admin/
// analise-cliente.js): a mesma nos Termos e na Política de privacidade.
const ACESSO_ANALISES = [
  'Acesso a dados para análises gerenciais',
  'Ao utilizar o Finup, o cliente autoriza a administração da plataforma a acessar os dados financeiros registrados em seu ambiente, como contas bancárias e saldos, receitas, despesas, categorias e favorecidos, com a finalidade de gerar análises gerenciais para o próprio cliente, prestar suporte técnico, garantir a segurança da plataforma e aprimorar o produto. Esses dados não são vendidos, cedidos ou compartilhados com terceiros, salvo por obrigação legal ou ordem judicial. Todo acesso da administração aos dados do cliente fica registrado. O cliente pode, a qualquer momento, solicitar informações sobre o tratamento de seus dados pelo e-mail contato@finup.app.br, conforme a Lei nº 13.709/2018 (LGPD).',
]

const TEXTOS = {
  termos: {
    titulo: 'Termos de uso',
    secoes: [
      ['1. O serviço', 'O Finup é um sistema de gestão financeira oferecido por assinatura. Cada cliente recebe um ambiente próprio, acessado por um endereço exclusivo (sigla.finup.app.br).'],
      ['2. Cadastro e aprovação', 'O pedido feito pelo formulário não garante a contratação. Cada pedido é analisado e, se aprovado, entraremos em contato pelos dados informados.'],
      ['3. Responsabilidades do cliente', 'O cliente é responsável pela veracidade dos dados informados, pela guarda das senhas de acesso e pelo uso que seus usuários fazem do sistema.'],
      ['4. Planos e pagamento', 'Plano, valor mensal, dia de vencimento e limite de usuários são combinados na contratação. A falta de pagamento pode levar à suspensão do acesso.'],
      ['5. Cancelamento', 'O cliente pode pedir o cancelamento a qualquer momento. Após o cancelamento, os dados ficam disponíveis para exportação por prazo a definir e depois são excluídos.'],
      ['6. Alterações', 'Estes termos podem ser atualizados. Mudanças relevantes serão comunicadas aos clientes com antecedência.'],
      [`7. ${ACESSO_ANALISES[0]}`, ACESSO_ANALISES[1]],
    ],
  },
  privacidade: {
    titulo: 'Política de privacidade',
    secoes: [
      ['1. Dados coletados', 'No pedido de cadastro coletamos nome, e-mail, telefone/WhatsApp, CPF ou CNPJ, empresa, a sigla desejada, como conheceu o Finup, a data e hora do aceite destes termos e o endereço IP de envio.'],
      ['2. Para que usamos', 'Para analisar o pedido, entrar em contato, criar o ambiente do cliente, faturar o serviço e cumprir obrigações legais. Não vendemos dados a terceiros.'],
      ['3. Dados financeiros do cliente', 'Os lançamentos e demais dados registrados no ambiente do cliente pertencem ao cliente e ficam em banco de dados separado para cada cliente.'],
      ['4. Compartilhamento', 'Apenas com prestadores necessários à operação (hospedagem, banco de dados, envio de e-mail e meios de pagamento), sob obrigação de sigilo.'],
      ['5. Seus direitos (LGPD)', 'Você pode pedir acesso, correção, portabilidade ou exclusão dos seus dados pelo contato informado no atendimento.'],
      ['6. Segurança', 'Usamos conexões criptografadas e senhas armazenadas com hash. Nenhum sistema é totalmente imune a falhas; incidentes relevantes serão comunicados.'],
      [`7. ${ACESSO_ANALISES[0]}`, ACESSO_ANALISES[1]],
    ],
  },
}

// Aberta pelo cadastro ou pelo login: volta para a página anterior; sem histórico, vai ao início.
const voltar = (e) => {
  if (window.history.length > 1) { e.preventDefault(); window.history.back() }
}

export default function PaginaLegal({ tipo }) {
  const t = TEXTOS[tipo] || TEXTOS.termos
  return (
    <div className="min-h-screen bg-page px-4 py-8 flex justify-center">
      <article className="w-full max-w-2xl">
        <a href="/" onClick={voltar} className="text-xs text-texto-3 hover:text-texto-2 inline-flex items-center gap-1"><ArrowLeft size={12} /> Voltar</a>
        <h1 className="text-2xl font-bold text-texto-1 mt-3">{t.titulo}</h1>
        <p className="text-xs text-aviso mt-1">Rascunho — texto em revisão.</p>
        <div className="mt-6 space-y-5">
          {t.secoes.map(([titulo, texto]) => (
            <section key={titulo}>
              <h2 className="text-sm font-semibold text-texto-1">{titulo}</h2>
              <p className="text-sm text-texto-2 mt-1 leading-relaxed">{texto}</p>
            </section>
          ))}
        </div>
      </article>
    </div>
  )
}
