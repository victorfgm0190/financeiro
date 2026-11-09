import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, X } from 'lucide-react'
import { fmt } from './utils'
import { validarRateio, situacaoRateio, COR_SITUACAO_RATEIO } from '../../lib/rateio'
import CategorySelect from './CategorySelect'
import InputMoeda from './InputMoeda'
import { MOBILE_MEDIA_QUERY } from '../../lib/breakpoints'
import HelpCampo from './HelpCampo'

let _k = 0
const mkRow = (r = {}) => ({
  _k: ++_k,
  categoriaId: r.categoriaId || '',
  valor: r.valor != null && r.valor !== '' ? String(r.valor) : '',
  descricao: r.descricao || '',
  comDescricao: !!r.descricao,
})

const parseV = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n }
const round2 = n => Math.round(n * 100) / 100

// Celular: a folha ocupa só a área VISÍVEL (visualViewport) — com o teclado aberto o rodapé (totais e
// Gravar) fica logo acima dele, como no SearchableSelect. Desktop: null (modal centralizado de sempre).
function lerAreaVisivel() {
  if (typeof window === 'undefined' || !window.matchMedia?.(MOBILE_MEDIA_QUERY).matches) return null
  const vv = window.visualViewport
  return vv ? { top: Math.round(vv.offsetTop), height: Math.round(vv.height) } : { top: 0, height: window.innerHeight }
}
function useAreaVisivel() {
  const [area, setArea] = useState(lerAreaVisivel)
  useEffect(() => {
    const atualizar = () => setArea(lerAreaVisivel())
    const vv = window.visualViewport
    window.addEventListener('resize', atualizar)
    vv?.addEventListener('resize', atualizar)
    vv?.addEventListener('scroll', atualizar)
    return () => {
      window.removeEventListener('resize', atualizar)
      vv?.removeEventListener('resize', atualizar)
      vv?.removeEventListener('scroll', atualizar)
    }
  }, [])
  return area
}

// "Dividir em categorias": divide o `total` do lançamento em linhas (lib/rateio). Só grava quando a
// soma fecha o total ("Restante a distribuir" em tempo real; "Usar restante" numa linha).
// onSave(rateios) recebe [{ categoriaId, valor, descricao }] — uma linha só o chamador transforma em
// lançamento comum; onDeleteAll() limpa tudo. Componente ÚNICO: lançamento, agendamento, importação e
// prévia do Assistente (pelo formulário de lançamento).
//   Celular: tela cheia; cada linha é um cartão (categoria inteira + lixeira / valor + "Usar
//   restante" / "+ descrição"); rodapé fixo acima do teclado.
//   Desktop: modal no meio, cada linha numa faixa só.
export default function RateioModal({ total = 0, categories = [], categoryType = null, initial = [], onSave, onDeleteAll, onClose, perfilId }) {
  const [rows, setRows] = useState(() => (initial.length > 0 ? initial.map(mkRow) : [mkRow(), mkRow()]))
  const area = useAreaVisivel()
  const corpoRef = useRef(null)

  const setRow = (k, patch) => setRows(rs => rs.map(r => r._k === k ? { ...r, ...patch } : r))
  const addRow = () => setRows(rs => [...rs, mkRow()])
  const removeRow = (k) => setRows(rs => rs.filter(r => r._k !== k))

  const atribuido = round2(rows.reduce((s, r) => s + parseV(r.valor), 0))
  const naoAtribuido = round2(total - atribuido)
  const preenchidas = rows.filter(r => r.categoriaId || parseV(r.valor) > 0)
  const validacao = validarRateio(preenchidas.map(r => ({ categoriaId: r.categoriaId, valor: parseV(r.valor) })), total)
  const podeGravar = preenchidas.length > 0 && validacao.ok
  const restanteDaLinha = (k) => round2(total - rows.reduce((s, r) => (r._k === k ? s : s + parseV(r.valor)), 0))
  const usarRestante = (k) => {
    const v = restanteDaLinha(k)
    if (v > 0) setRow(k, { valor: String(v) })
  }
  // Verde (✓) quando fecha, âmbar quando falta, vermelho quando passa — com o símbolo, não só a cor.
  const sitRestante = situacaoRateio(total, atribuido)
  const corRestante = COR_SITUACAO_RATEIO[sitRestante.estado]

  // Tocar no valor (celular): depois que o teclado sobe, o cartão rola para ficar visível.
  const mostrarCartao = (e) => {
    if (!area) return
    const cartao = e.target.closest('[data-rateio-linha]')
    setTimeout(() => cartao?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }), 300)
  }

  const handleSave = () => {
    const clean = rows
      .filter(r => r.categoriaId && parseV(r.valor) > 0)
      .map(r => ({ categoriaId: r.categoriaId, valor: parseV(r.valor), descricao: (r.descricao || '').trim() }))
    onSave(clean)
  }

  const celular = !!area
  const painelStyle = celular ? { position: 'fixed', left: 0, right: 0, top: area.top, height: area.height } : undefined

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-overlay hidden md:block" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dividir em categorias"
        data-help-form="rateio"
        style={painelStyle}
        className="relative flex flex-col bg-surface md:border md:border-borda-forte md:rounded-2xl shadow-2xl w-full h-full md:h-auto md:max-w-3xl md:max-h-[90vh]"
      >
        <div className={`flex items-center justify-between gap-2 px-4 md:px-5 pb-3 border-b border-borda shrink-0 ${celular && area.top === 0 ? 'modal-safe-top' : 'pt-3 md:pt-4'}`}>
          <h3 className="text-base md:text-sm font-semibold text-texto-1 min-w-0">Dividir em categorias</h3>
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={onDeleteAll} className="text-xs text-texto-3 hover:text-perigo underline min-h-[44px] md:min-h-0 px-2">
              Excluir tudo
            </button>
            <button type="button" onClick={onClose} aria-label="Fechar" className="w-11 h-11 md:w-8 md:h-8 -mr-2 flex items-center justify-center text-texto-3 hover:text-texto-2">
              <X size={18} />
            </button>
          </div>
        </div>

        <div ref={corpoRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 md:px-5 py-3 space-y-3 md:space-y-2">
          <p data-testid="legenda-rateio" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-texto-3"><span>Categoria<HelpCampo campo="rateio.categoria" /></span><span>Valor<HelpCampo campo="rateio.valor" /></span><span>Descrição<HelpCampo campo="rateio.descricao" /></span></p>
          {rows.map((r, i) => {
            const resto = restanteDaLinha(r._k)
            const mostraUsar = naoAtribuido > 0.004 && resto > 0.004 && Math.abs(resto - parseV(r.valor)) > 0.004
            return (
              <div key={r._k} data-rateio-linha=""
                className="rounded-xl border border-borda bg-surface-2/40 p-3 space-y-2 md:space-y-0 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:flex md:items-start md:gap-2">
                {/* Categoria na largura toda (nome inteiro) + lixeira */}
                <div className="flex items-start gap-2 md:flex-1 md:min-w-0">
                  <div className="flex-1 min-w-0" data-guia={i === 0 ? 'rateio-form.categoria' : undefined}>
                    <CategorySelect
                      categories={categories}
                      perfilId={perfilId}
                      type={categoryType}
                      className="input w-full min-h-[44px] md:min-h-0 text-sm"
                      value={r.categoriaId}
                      onChange={e => setRow(r._k, { categoriaId: e.target.value })}
                      placeholder={`Categoria da parte ${i + 1}`}
                      helpId="rateio.categoria"
                      searchable
                      quebrarRotulo
                    />
                  </div>
                  <button type="button" onClick={() => removeRow(r._k)} aria-label={`Remover a parte ${i + 1}`}
                    className="md:hidden w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-texto-3 hover:text-perigo hover:bg-surface-hover">
                    <Trash2 size={16} />
                  </button>
                </div>
                {/* Valor + "Usar restante" */}
                <div className="flex items-center gap-2 md:shrink-0" data-guia={i === 0 ? 'rateio-form.valor' : undefined}>
                  <InputMoeda
                    min="0"
                    value={r.valor}
                    onChange={e => setRow(r._k, { valor: e.target.value })}
                    onFocus={mostrarCartao}
                    aria-label={`Valor da parte ${i + 1}`}
                    helpId="rateio.valor"
                    placeholder="Valor da parte"
                    className="input flex-1 min-w-0 md:flex-none md:w-32 min-h-[44px] md:min-h-0 text-base md:text-sm"
                  />
                  {mostraUsar && (
                    <button type="button" onClick={() => usarRestante(r._k)}
                      className="btn-secondary shrink-0 whitespace-nowrap text-xs min-h-[44px] md:min-h-0 px-3">
                      Usar restante ({fmt(naoAtribuido)})
                    </button>
                  )}
                </div>
                {/* Descrição: recolhida até tocar (aberta se já tem) */}
                <div className="md:flex-1 md:min-w-0">
                  {r.comDescricao ? (
                    <input
                      type="text"
                      value={r.descricao}
                      onChange={e => setRow(r._k, { descricao: e.target.value })}
                      onFocus={mostrarCartao}
                      aria-label={`Descrição da parte ${i + 1}`}
                      data-help-id="rateio.descricao"
                      placeholder="Descrição da parte (opcional)"
                      autoFocus={!r.descricao}
                      className="input w-full min-h-[44px] md:min-h-0 text-base md:text-sm"
                    />
                  ) : (
                    <button type="button" onClick={() => setRow(r._k, { comDescricao: true })}
                      className="text-xs text-primary-fg hover:underline min-h-[44px] md:min-h-[38px] px-1">
                      + descrição
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => removeRow(r._k)} aria-label={`Remover a parte ${i + 1}`}
                  className="hidden md:flex w-9 h-9 shrink-0 items-center justify-center rounded-lg text-texto-3 hover:text-perigo hover:bg-surface-hover">
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}

          <button type="button" onClick={addRow} data-guia="rateio-form.adicionar"
            className="btn-secondary w-full md:w-auto min-h-[44px] md:min-h-0 text-sm md:text-xs flex items-center justify-center gap-1.5">
            <Plus size={14} /> Categoria
          </button>
        </div>

        {/* Rodapé fixo: totais, validação em linha própria e Gravar */}
        <div className={`shrink-0 border-t border-borda px-4 md:px-5 pt-3 pb-3 space-y-2 bg-surface md:rounded-b-2xl ${celular && area.height >= window.innerHeight - 1 ? 'nav-safe-bottom' : ''}`}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-texto-2">Total do lançamento</span>
            <span className="font-semibold text-texto-1">{fmt(total)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm" data-guia="rateio-form.restante">
            <span className="text-texto-2">Restante a distribuir</span>
            <span className={`font-semibold ${corRestante}`} data-testid="rateio-restante">{sitRestante.estado === 'ok' ? '✓ ' : ''}{fmt(naoAtribuido)}</span>
          </div>
          {!podeGravar && preenchidas.length > 0 && (
            <p role="status" className="text-sm text-aviso">{validacao.motivo}</p>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={handleSave} disabled={!podeGravar} data-guia="rateio-form.gravar"
              className="btn-primary w-full md:w-auto min-h-[44px] md:min-h-0 text-sm disabled:opacity-50">
              Gravar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
