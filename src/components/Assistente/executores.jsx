import {
  Pergunta, PreviaCriacao, BaixaResposta, SaldoResposta, SaldoPrincipalResposta, VencimentosResposta, FaturaResposta,
  GastosResposta, BuscaResposta, AbrirTelaResposta,
} from './respostas'

// EXECUTORES do Assistente IA: id da ação (src/lib/assistente/acoes.js) → componente.
// Ação nova = entrada no registro + UMA linha aqui. 🟡 criação = PreviaCriacao (o formulário existente
// pré-preenchido). Ações 🔴 não têm executor próprio: vão pelo abrir_tela (AbrirTelaResposta).
// O teste do registro confere que toda ação com ferramenta tem o seu.
export const EXECUTORES = {
  perguntar: Pergunta,
  abrir_tela: AbrirTelaResposta,
  registrar_lancamento: PreviaCriacao,
  criar_agendamento: PreviaCriacao,
  consultar_saldo: SaldoResposta,
  buscar_lancamentos: BuscaResposta,
  baixar_agendamento: BaixaResposta,
  consultar_vencimentos: VencimentosResposta,
  consultar_fatura: FaturaResposta,
  consultar_gastos_categoria: GastosResposta,
  consultar_saldo_principal: SaldoPrincipalResposta,
}
