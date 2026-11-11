import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { getSessao } from '../lib/api'
import { temTodosPerfis } from '../lib/permissoes'
import { backendBackup, nomeDoBancoBackup, chaveEspelho, lerConfigDetalhado, salvarConfigDetalhado } from '../lib/backupPasta'

// Quem pode exportar/restaurar backup (a API confere de novo): administrador com todos os perfis.
export const podeFazerBackup = (sessao = getSessao()) => sessao?.nivel === 'admin' && temTodosPerfis(sessao?.perfis)

// Preferências do backup NESTE aparelho (pasta, perguntar ao sair, quantos manter, último backup).
// UMA cópia por usuário e ambiente, compartilhada por quem usa o hook (Configurações → Backup e o Sair):
// a pasta escolhida na tela vale na hora para o Sair, sem depender do IndexedDB. cfg = null só enquanto
// carrega — e isso tem prazo (a leitura nunca fica pendurada). `atualizar` muda a tela na hora e grava
// em segundo plano (com prazo); quem chama nunca espera o IndexedDB, a não ser que peça ({ esperar }).
// `guardado`: false quando o aparelho não leu/gravou (a tela avisa); `motivo`: por quê (backupPasta.js).
const lojas = new Map()
export const _limparLojasBackup = () => lojas.clear()

function criarLoja(nome) {
  const loja = {
    backend: backendBackup(nome),
    espelho: { chave: chaveEspelho(nome) },
    cfg: null, carregou: false, pendente: null, guardado: null, motivo: null,
    ouvintes: new Set(), snap: null,
  }
  loja.publicar = () => {
    loja.snap = { cfg: loja.cfg, guardado: loja.guardado, motivo: loja.motivo }
    loja.ouvintes.forEach(f => f())
  }
  loja.snap = { cfg: null, guardado: null, motivo: null }
  lerConfigDetalhado(loja.backend, loja.espelho).then(({ cfg, guardado, motivo }) => {
    // Algo já foi alterado antes da leitura terminar: o que a tela tem vale mais.
    loja.cfg = loja.pendente ? { ...cfg, ...loja.pendente } : cfg
    loja.pendente = null
    loja.carregou = true
    if (loja.guardado !== false) { loja.guardado = guardado; loja.motivo = motivo }
    loja.publicar()
  })
  return loja
}

function obterLoja(sessao) {
  const nome = nomeDoBancoBackup(sessao)
  const chave = nome || '(sem sessão)'
  if (!lojas.has(chave)) lojas.set(chave, criarLoja(nome))
  return lojas.get(chave)
}

export function useBackupLocal() {
  const sessao = useMemo(() => getSessao(), [])
  const loja = useMemo(() => obterLoja(sessao), [sessao])
  const assinar = useCallback((f) => { loja.ouvintes.add(f); return () => loja.ouvintes.delete(f) }, [loja])
  const { cfg, guardado, motivo } = useSyncExternalStore(assinar, () => loja.snap)
  const atualizar = useCallback((parcial, opcoes) => atualizarLoja(obterLoja(sessao), parcial, opcoes), [sessao])
  return { cfg, atualizar, sessao, guardado, motivo }
}

async function atualizarLoja(loja, parcial, { esperar = false } = {}) {
  const base = loja.carregou ? { ...loja.cfg, ...parcial } : null
  if (!loja.carregou) loja.pendente = { ...(loja.pendente || {}), ...parcial }
  loja.cfg = { ...(loja.cfg || {}), ...parcial }
  loja.publicar()
  // Antes da leitura terminar, grava por cima do que estiver guardado (sem apagar o resto).
  const gravacao = salvarConfigDetalhado(loja.backend, parcial, base, loja.espelho).then((r) => {
    loja.guardado = r.guardado
    loja.motivo = r.motivo
    loja.publicar()
    return r
  })
  if (esperar) return gravacao
  return loja.cfg
}
