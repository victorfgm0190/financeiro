// Estado da conexão com o banco (sem React, testável). O AppContext guarda um destes em `dbStatus`:
//   'connecting' — abrindo, o /api/load ainda não respondeu;
//   'connected'  — banco respondendo: a fila de pendências é enviada;
//   'servidor'   — HÁ rede, mas a API falhou (4xx/5xx, tempo esgotado): "Não foi possível falar com
//                  o servidor — tentando de novo". Alterações vão para a fila; nova tentativa sozinha;
//   'local'      — o aparelho está SEM REDE (navigator.onLine === false): "Sem internet".
//
// Antes (até 03/11/2026) toda falha da API virava 'local', e a faixa "Sem internet" aparecia com a
// internet funcionando sempre que o /api/load ou um envio da fila dava erro.
import { tentarReconectar } from './syncSeguro.js'

export const MSG_SERVIDOR = 'Não foi possível falar com o servidor — tentando de novo'

// O aparelho está sem rede? Só o navegador sabe; sem `navigator` (testes, SSR) considera com rede.
export const semRede = (nav = globalThis.navigator) => nav?.onLine === false

// Status depois de o banco não responder: sem rede no aparelho → 'local'; com rede → 'servidor'.
export const statusSemBanco = (nav = globalThis.navigator) => (semRede(nav) ? 'local' : 'servidor')

// O banco está fora (por falta de rede ou por erro da API)?
export const bancoFora = (status) => status === 'local' || status === 'servidor'

// Uma tentativa de sair do modo sem banco (intervalo, evento `online`, foco/visibilidade, "Enviar
// agora"). Sem rede nem tenta. Devolve { status, acao, result?, erro? }:
//   acao 'aguardar'          — continua fora (status diz se é falta de rede ou o servidor);
//   acao 'enviar-pendentes'  — já carregou nesta sessão: volta a 'connected' e envia a fila;
//   acao 'recarregado'       — nunca carregou: `result` do /api/load para aplicar ANTES de enviar.
export async function tentarSairDoModoSemBanco({ carregouDoBanco, ping, carregar, nav = globalThis.navigator }) {
  if (semRede(nav)) return { status: 'local', acao: 'aguardar', erro: 'Sem internet neste aparelho' }
  const r = await tentarReconectar({ carregouDoBanco, ping, carregar })
  if (r.acao === 'aguardar') return { status: statusSemBanco(nav), acao: 'aguardar', erro: 'O servidor não respondeu' }
  if (r.acao === 'enviar-pendentes') return { status: 'connected', acao: 'enviar-pendentes' }
  const st = r.result?.status
  if (st === 'connected' || st === 'empty') return { status: 'connected', acao: 'recarregado', result: r.result }
  return { status: statusSemBanco(nav), acao: 'aguardar', erro: r.result?.error || 'O servidor não respondeu' }
}
