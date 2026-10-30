import { fmt, fmtDate } from '../shared/utils'
import { favorecidoDaLinha } from '../../lib/casamentoFatura'

// Importar Fatura — célula de status das linhas "Já lançado" (lib/casamentoFatura):
//   • casada: mostra o lançamento existente (descrição, data, valor, categoria) e o seletor de
//     favorecido [manter atual] / [sugerido pela fatura] / [outro]; "Não é este" desfaz (vira nova);
//   • para escolher: os candidatos + "É novo" — nunca casa sozinho.
// Escolhas ficam na linha (_jaLancadoEscolha, _favModo, _favOutro) via updateRow.
export function JaLancadoStatus({ row, categories, payees, updateRow }) {
  if (row._jaLancado) {
    const j = row._jaLancado
    const tx = j.tx
    const cat = categories.find(c => c.id === tx.categoryId)
    const modo = row._favModo || j.favModoPadrao
    const pre = j.origem === 'pre'
    return (
      <div className="space-y-1 max-w-[18rem]">
        <span className="text-xs px-1.5 py-0.5 rounded bg-receita/15 text-receita"
          title={pre ? 'Casa com um pré-lançamento do Assistente: será gravado pela importação com a classificação dele, e o pré-lançamento sai da lista.' : 'Já está no cartão (lançado à mão ou pelo Assistente): não cria outro lançamento nem outra transferência gerencial — o existente recebe valor/data da fatura e fica conciliado.'}>
          ✔ {pre ? 'Pré-lançamento' : 'Já lançado'}
          {/* Estimado (compra em dólar / IOF): o valor real da fatura substitui o estimado. */}
          {tx.estimado && Math.round(Number(row.amount) * 100) !== Math.round((j.grupo ? j.grupo.reduce((s, t) => s + Number(t.amount), 0) : Number(tx.amount)) * 100) && (
            <> (valor ajustado {fmt(j.grupo ? j.grupo.reduce((s, t) => s + Number(t.amount), 0) : tx.amount)} → {fmt(row.amount)})</>
          )}
        </span>
        {j.grupo && <p className="text-[10px] text-texto-3">IOF agrupado pelo banco: {j.grupo.length} IOFs estimados somados, repartidos na proporção.</p>}
        <p className="text-[10px] text-texto-3 break-words">
          {pre ? 'Pré-lançamento' : 'Existente'}: <span className="text-texto-2">{tx.description || '—'}</span> · {fmtDate(tx.date)} · {fmt(tx.amount)}{cat ? ` · ${cat.icon || ''} ${cat.name}` : ''}
        </p>
        {!pre && (
          <div className="text-[10px] text-texto-3 space-y-0.5">
            <span>Favorecido:</span>
            <select className="ml-1 bg-surface-2 border border-borda-campo text-texto-1 rounded px-1 py-0.5 text-[10px] max-w-[12rem]"
              value={modo} onChange={e => updateRow(row._id, { _favModo: e.target.value })}>
              <option value="manter">Manter: {tx.payee || '(sem favorecido)'}</option>
              <option value="sugerido">Sugerido{j.sugerido.aprendido ? ' (aprendido)' : ''}: {j.sugerido.nome || '—'}</option>
              <option value="outro">Outro…</option>
            </select>
            {modo === 'outro' && (
              <>
                <input list="ja-lancado-favorecidos" className="input !py-0.5 !text-[11px] mt-0.5" placeholder="Digite o favorecido"
                  value={row._favOutro || ''} onChange={e => updateRow(row._id, { _favOutro: e.target.value })} />
                <datalist id="ja-lancado-favorecidos">{payees.slice(0, 500).map(p => <option key={p} value={p} />)}</datalist>
              </>
            )}
            {modo !== 'manter' && <p className="text-texto-3">Fica: <span className="text-texto-2">{favorecidoDaLinha(row) || '—'}</span></p>}
          </div>
        )}
        {/* "Já existe" da lógica atual (mesma descrição-base) nunca vira linha nova; só o casamento
            da regra nova (sem descrição) pode ser desfeito. */}
        {j.origem !== 'ja_existe' && (
          <button type="button" className="text-[10px] text-primary-fg hover:text-texto-1" onClick={() => updateRow(row._id, { _jaLancadoEscolha: 'novo', selected: true })}>
            Não é este — importar como novo
          </button>
        )}
      </div>
    )
  }
  if (row._jaLancadoOpcoes) {
    const pendente = !row._jaLancadoEscolha
    return (
      <div className="space-y-1 max-w-[18rem]">
        <span className={`text-xs px-1.5 py-0.5 rounded ${pendente ? 'bg-aviso/15 text-aviso' : 'bg-primary/15 text-primary-fg'}`}
          title="Mais de um lançamento do cartão com o mesmo valor e data próxima: escolha qual é (ou se é novo)">
          {pendente ? '⚠ Para escolher' : 'Novo (escolhido)'}
        </span>
        {row._jaLancadoOpcoes.map(tx => (
          <label key={tx.id} className="flex items-start gap-1 text-[10px] text-texto-2 cursor-pointer">
            <input type="radio" className="accent-primary mt-0.5" name={`ja-${row._id}`} checked={row._jaLancadoEscolha === tx.id}
              onChange={() => updateRow(row._id, { _jaLancadoEscolha: tx.id })} />
            <span className="break-words">É {tx._pre ? 'o pré-lançamento' : 'este'}: {tx.description || '—'} · {fmtDate(tx.date)} · {fmt(tx.amount)}</span>
          </label>
        ))}
        <label className="flex items-center gap-1 text-[10px] text-texto-2 cursor-pointer">
          <input type="radio" className="accent-primary" name={`ja-${row._id}`} checked={row._jaLancadoEscolha === 'novo'}
            onChange={() => updateRow(row._id, { _jaLancadoEscolha: 'novo', selected: true })} />
          <span>É novo — importar</span>
        </label>
      </div>
    )
  }
  return null
}

// Contador do topo: "X já lançados · Y novos · Z para escolher".
export function ResumoJaLancados({ resumo }) {
  if (!resumo.ja && !resumo.escolher) return null
  return (
    <p className="text-xs text-texto-2">
      <span className="text-receita font-medium">{resumo.ja} já lançado{resumo.ja !== 1 ? 's' : ''}</span>
      {' · '}{resumo.novos} novo{resumo.novos !== 1 ? 's' : ''}
      {' · '}<span className={resumo.escolher ? 'text-aviso font-medium' : ''}>{resumo.escolher} para escolher</span>
    </p>
  )
}
