import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Pencil } from 'lucide-react'
import { NOME_MAX, rotuloModo } from '../../lib/fluxoConsultas'

// Cartão de uma consulta do Fluxo de Caixa Futuro: nome, "Modo · N contas", badge "padrão",
// renomear inline (lápis ou duplo clique; Enter/blur salva, Esc cancela) e menu "⋯".
// A virtual "FC Principal" não renomeia e só tem "Definir como padrão".
export default function ConsultaCard({
  consulta: c, ativa, padrao, nContas, validarNome,
  onSelecionar, onRenomear, onEditar, onDuplicar, onDefinirPadrao, onExcluir,
}) {
  const [editando, setEditando] = useState(null) // rascunho do nome | null
  const [salvando, setSalvando] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')
  const cancelouRef = useRef(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menu) return
    const fora = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [menu])

  const renomeavel = !c.virtual
  const abrirRenomear = () => { if (!renomeavel) return; cancelouRef.current = false; setErroSalvar(''); setEditando(c.nome) }
  const erro = editando != null ? validarNome(editando) : null

  const confirmar = async () => {
    if (cancelouRef.current) { cancelouRef.current = false; return }
    if (editando == null || salvando) return
    const nome = editando.trim()
    if (nome === c.nome) { setEditando(null); return }
    if (erro) return // fica aberto mostrando o erro; Esc cancela
    setSalvando(true)
    try {
      await onRenomear(nome)
      setEditando(null)
    } catch (err) {
      setErroSalvar(err?.message || 'Falha ao renomear.')
    } finally {
      setSalvando(false)
    }
  }

  const executar = (acao) => {
    setMenu(false)
    if (acao === 'renomear') abrirRenomear()
    else if (acao === 'editar') onEditar()
    else if (acao === 'duplicar') onDuplicar()
    else if (acao === 'padrao') onDefinirPadrao()
    else if (acao === 'excluir') onExcluir()
  }
  const item = (label, acao, { danger = false, disabled = false } = {}) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => executar(acao)}
      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent ${danger ? 'text-perigo' : 'text-texto-1'}`}
    >
      {label}
    </button>
  )

  return (
    <div
      className={`relative group flex items-start gap-1 pl-3 pr-1 py-2 rounded-lg border transition-colors min-w-[170px] max-w-full cursor-pointer ${
        ativa ? 'border-primary bg-primary/10' : 'border-borda bg-surface hover:border-borda-forte'
      }`}
      onClick={() => { if (editando == null) onSelecionar() }}
    >
      <div className="min-w-0 flex-1">
        {editando != null ? (
          <div onClick={e => e.stopPropagation()}>
            <input
              autoFocus
              className={`input py-0.5 px-1.5 text-sm w-full ${erro || erroSalvar ? 'border-perigo' : ''}`}
              value={editando}
              maxLength={NOME_MAX}
              autoComplete="off"
              disabled={salvando}
              onChange={e => { setErroSalvar(''); setEditando(e.target.value) }}
              onBlur={confirmar}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); confirmar() }
                if (e.key === 'Escape') { e.stopPropagation(); cancelouRef.current = true; setEditando(null) }
              }}
            />
            {(erro || erroSalvar) && <p className="text-[11px] text-perigo mt-0.5 max-w-[220px]">{erro || erroSalvar}</p>}
          </div>
        ) : (
          <span className="flex items-center gap-1.5">
            <span
              className={`text-sm font-medium truncate ${ativa ? 'text-primary-fg' : 'text-texto-1'}`}
              onDoubleClick={e => { e.stopPropagation(); abrirRenomear() }}
              title={renomeavel ? 'Duplo clique para renomear' : undefined}
            >
              {c.nome}
            </span>
            {padrao && <span className={`text-[10px] px-1.5 py-0.5 rounded ${ativa ? 'bg-surface' : 'bg-primary/15'} text-primary-fg shrink-0`}>padrão</span>}
            {renomeavel && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); abrirRenomear() }}
                className="p-0.5 rounded text-texto-3 hover:text-texto-2 opacity-60 group-hover:opacity-100 shrink-0"
                title="Renomear"
              >
                <Pencil size={11} />
              </button>
            )}
          </span>
        )}
        <span className="block text-[11px] text-texto-3 mt-0.5">{rotuloModo(c.modo)} · {nContas} conta{nContas !== 1 ? 's' : ''}</span>
      </div>

      <div className="relative shrink-0" ref={menuRef} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={() => setMenu(m => !m)} className="p-1 rounded text-texto-3 hover:text-texto-1 hover:bg-surface-hover" title="Opções da consulta">
          <MoreHorizontal size={14} />
        </button>
        {menu && (
          <div className="absolute right-0 top-full mt-1 z-30 w-44 bg-surface border border-borda-forte rounded-lg shadow-2xl py-1">
            {renomeavel && item('Renomear', 'renomear')}
            {renomeavel && item('Editar', 'editar')}
            {renomeavel && item('Duplicar', 'duplicar')}
            {item(padrao ? 'Já é a padrão' : 'Definir como padrão', 'padrao', { disabled: padrao })}
            {renomeavel && <div className="border-t border-borda my-1" />}
            {renomeavel && item('Excluir', 'excluir', { danger: true })}
          </div>
        )}
      </div>
    </div>
  )
}
