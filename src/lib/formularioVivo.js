// Formulário aberto × registro que mudou FORA dele (outra tela por cima, pagamento, composição do
// boleto, outro aparelho). Funções puras usadas pelo Editar Agendamento (ScheduleForm).

const valorBR = (n) => `R$ ${(Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dataBR = (d) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d || '—')

// Comparável: valor como número (o campo pode guardar "1.424,67" digitado ou 1424.67).
const chave = (f) => JSON.stringify({ ...(f || {}), amount: Number(f?.amount) || 0 })
export const mesmoFormulario = (a, b) => chave(a) === chave(b)

const ROTULOS = {
  amount: ['valor', valorBR], nextOccurrence: ['vencimento', dataBR], startDate: ['data inicial', dataBR],
  description: ['descrição', (v) => `"${v || ''}"`], payee: ['favorecido', (v) => v || '—'],
}
// O que mudou, para o aviso: [{ campo, texto }] ("valor R$ 1.424,67 → R$ 1.544,37").
export function camposQueMudaram(antes, depois) {
  const out = []
  const a = antes || {}
  const d = depois || {}
  for (const [campo, [rot, f]] of Object.entries(ROTULOS)) {
    const va = campo === 'amount' ? Number(a[campo]) || 0 : a[campo]
    const vd = campo === 'amount' ? Number(d[campo]) || 0 : d[campo]
    if (va !== vd) out.push({ campo, texto: `${rot} ${f(a[campo])} → ${f(d[campo])}` })
  }
  const outros = Object.keys({ ...a, ...d }).filter(k => !(k in ROTULOS) && JSON.stringify(a[k] ?? null) !== JSON.stringify(d[k] ?? null))
  if (outros.length) out.push({ campo: 'outros', texto: outros.some(k => k === 'overrides' || k === 'skipped') ? 'ocorrências ou outros campos' : 'outros campos' })
  return out
}

// "Manter a minha edição": campo que o usuário mexeu (≠ do que o formulário mostrava ao abrir) fica
// como ele deixou; campo que ele não mexeu recebe o valor novo do registro.
const igual = (k, a, b) => (k === 'amount' ? (Number(a) || 0) === (Number(b) || 0) : JSON.stringify(a ?? null) === JSON.stringify(b ?? null))
export function juntarEdicao(form, base, vivo) {
  const out = { ...vivo }
  for (const k of Object.keys(form || {})) if (!igual(k, form[k], base?.[k])) out[k] = form[k]
  return out
}
