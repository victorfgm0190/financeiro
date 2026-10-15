import { useEffect, useState } from 'react'
import { Keyboard, RotateCcw, Ban, Circle } from 'lucide-react'
import { useAtalhos } from '../../context/atalhosHooks'
import ConfirmDialog from '../shared/ConfirmDialog'
import Toast from '../shared/Toast'
import Teclas from '../shared/Teclas'
import { ACOES, CONTEXTOS, ATALHOS_FIXOS, acaoPorId, acoesEmConflito, rotuloContexto } from '../../lib/atalhos/registry'
import { combinacaoDoEvento, temModificador, textoCombinacao, validarCombinacao } from '../../lib/atalhos/combinacao'

// Cadastros › Atalhos: a combinação de cada ação do registry (as ações são fixas no código).
// Grava no Neon (/api/atalhos) só o que difere do padrão; "Restaurar" apaga a linha.
export default function AtalhosPanel() {
  const ctx = useAtalhos()
  const [capturando, setCapturando] = useState(null) // acaoId em modo captura
  const [erroCaptura, setErroCaptura] = useState('')
  const [conflito, setConflito] = useState(null) // { acaoId, combinacao, outros }
  const [confirmarTodos, setConfirmarTodos] = useState(false)
  const [toast, setToast] = useState(null)

  const mapa = ctx?.mapa
  const setCapturandoMotor = ctx?.setCapturando
  const gravar = ctx?.gravar

  // Modo captura: o próximo keydown com modificador vira a combinação; Esc cancela. O motor fica
  // suspenso enquanto isso (senão Alt+N abriria o modal da tela em vez de ser gravado).
  useEffect(() => {
    if (!capturando) return
    setCapturandoMotor?.(true)
    const salvar = (acaoId, combinacao, outros = []) => {
      setCapturando(null)
      gravar([...outros.map(o => ({ acaoId: o.id, combinacao: null })), { acaoId, combinacao }])
        .then(() => setToast({ msg: `Atalho gravado: ${acaoPorId(acaoId)?.label} = ${textoCombinacao(combinacao)}` }))
        .catch(err => setToast({ msg: `Falha ao gravar: ${err.message}`, variant: 'error' }))
    }
    const onKeyDown = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      if (e.key === 'Escape') { setCapturando(null); return }
      const combinacao = combinacaoDoEvento(e)
      if (!combinacao) return
      if (!temModificador(combinacao)) { setErroCaptura('Use pelo menos um modificador (Alt ou Ctrl).'); return }
      const erro = validarCombinacao(combinacao)
      if (erro) { setErroCaptura(erro); return }
      if (mapa[capturando] === combinacao) { setCapturando(null); return }
      const outros = acoesEmConflito(capturando, combinacao, mapa)
      if (outros.length) {
        setCapturando(null)
        setConflito({ acaoId: capturando, combinacao, outros })
        return
      }
      salvar(capturando, combinacao)
    }
    // Fase de captura: chega antes de qualquer outro listener (inclusive o Esc dos modais).
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      setCapturandoMotor?.(false)
    }
  }, [capturando, mapa, gravar, setCapturandoMotor])

  if (!ctx) return null

  const iniciarCaptura = (acaoId) => { setErroCaptura(''); setCapturando(acaoId) }
  const executar = (promessa, msg) => promessa
    .then(() => setToast({ msg }))
    .catch(err => setToast({ msg: `Falha: ${err.message}`, variant: 'error' }))

  const desativar = (a) => executar(ctx.gravar([{ acaoId: a.id, combinacao: null }]), `Atalho desativado: ${a.label}`)
  const restaurar = (a) => executar(ctx.restaurar(a.id), `Padrão restaurado: ${a.label}`)
  const substituir = () => {
    const { acaoId, combinacao, outros } = conflito
    executar(
      ctx.gravar([...outros.map(o => ({ acaoId: o.id, combinacao: null })), { acaoId, combinacao }]),
      `Atalho gravado: ${acaoPorId(acaoId)?.label} = ${textoCombinacao(combinacao)} (${outros.map(o => o.label).join(', ')} desativado)`,
    )
  }

  const grupos = CONTEXTOS.map(c => ({ ...c, acoes: ACOES.filter(a => a.contexto === c.id) })).filter(g => g.acoes.length)
  const gravados = ctx.gravados
  const personalizados = Object.keys(gravados).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-texto-2 flex items-center gap-2"><Keyboard size={15} /> Atalhos de teclado</h2>
          <p className="text-xs text-texto-3 mt-1">
            Escolha a combinação de cada ação. Só vale no computador. Pressione <Teclas combinacao="Shift+?" /> em qualquer tela para ver os atalhos dela.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"
          disabled={!personalizados}
          onClick={() => setConfirmarTodos(true)}
        >
          <RotateCcw size={12} /> Restaurar todos os padrões
        </button>
      </div>

      {!ctx.carregado && <p className="text-xs text-texto-3">Carregando atalhos…</p>}

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-texto-3 border-b border-borda">
              <th className="px-3 py-2 font-medium">Ação</th>
              <th className="px-3 py-2 font-medium">Contexto</th>
              <th className="px-3 py-2 font-medium">Atalho</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr>
          </thead>
          {grupos.map(g => (
            <tbody key={g.id}>
              <tr className="bg-surface-2/60">
                <td colSpan={4} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-texto-2">{g.label}</td>
              </tr>
              {g.acoes.map(a => {
                const emCaptura = capturando === a.id
                const alterado = Object.prototype.hasOwnProperty.call(gravados, a.id)
                return (
                  <tr key={a.id} className="border-b border-borda last:border-b-0">
                    <td className="px-3 py-2 text-texto-1">
                      {a.label}
                      {alterado && <span className="ml-2 text-[10px] text-primary-fg" title={`Padrão: ${textoCombinacao(a.padrao)}`}>personalizado</span>}
                    </td>
                    <td className="px-3 py-2 text-texto-2 text-xs">{rotuloContexto(a.contexto)}</td>
                    <td className="px-3 py-2">
                      {emCaptura ? (
                        <div>
                          <span className="inline-flex items-center gap-1.5 text-xs text-primary-fg animate-pulse">
                            <Circle size={8} className="fill-current" /> Pressione a combinação… (Esc cancela)
                          </span>
                          {erroCaptura && <p className="text-[11px] text-perigo mt-0.5">{erroCaptura}</p>}
                        </div>
                      ) : (
                        <Teclas combinacao={mapa[a.id]} />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          className={`${emCaptura ? 'btn-primary' : 'btn-secondary'} text-xs py-1 px-2 flex items-center gap-1`}
                          onClick={() => (emCaptura ? setCapturando(null) : iniciarCaptura(a.id))}
                        >
                          <Keyboard size={12} /> {emCaptura ? 'Cancelar' : 'Gravar atalho'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"
                          disabled={!mapa[a.id] || emCaptura}
                          onClick={() => desativar(a)}
                        >
                          <Ban size={12} /> Desativar
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-xs py-1 px-2 flex items-center gap-1"
                          disabled={!alterado || emCaptura}
                          onClick={() => restaurar(a)}
                          title={`Padrão: ${textoCombinacao(a.padrao)}`}
                        >
                          <RotateCcw size={12} /> Restaurar padrão
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>

      <div className="card">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-texto-3 mb-2">Fixos (não configuráveis)</h3>
        <ul className="space-y-1.5">
          {ATALHOS_FIXOS.map(f => (
            <li key={f.combinacao} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-texto-2">{f.label}</span>
              <Teclas combinacao={f.combinacao} />
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={!!conflito}
        onClose={() => setConflito(null)}
        onConfirm={substituir}
        title="Atalho em uso"
        message={conflito
          ? `${textoCombinacao(conflito.combinacao)} já é usado por ${conflito.outros.map(o => `"${o.label}" (${rotuloContexto(o.contexto)})`).join(', ')}. Substituir? O outro atalho será desativado.`
          : ''}
        confirmLabel="Substituir"
      />
      <ConfirmDialog
        open={confirmarTodos}
        onClose={() => setConfirmarTodos(false)}
        onConfirm={() => executar(ctx.restaurarTodos(), 'Todos os atalhos voltaram ao padrão.')}
        title="Restaurar todos os padrões"
        message="Todos os atalhos personalizados voltam à combinação padrão. Continuar?"
        confirmLabel="Restaurar"
      />
      {toast && <Toast message={toast.msg} variant={toast.variant} onClose={() => setToast(null)} />}
    </div>
  )
}
