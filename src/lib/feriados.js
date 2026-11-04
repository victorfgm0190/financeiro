// FERIADOS (Configurações → Cadastros → Feriados) — funções puras.
// Os NACIONAIS são gerados por ano (datas fixas + Sexta-feira Santa pela Páscoa); Carnaval
// (segunda e terça) e Corpus Christi são OPCIONAIS, desligados por padrão. A tabela `feriados` (por
// cliente) guarda só o que o usuário mudou ou acrescentou:
//   • linha com `chave` = um automático ligado/desligado (ex.: { chave: 'finados', ativo: false });
//   • linha sem chave = feriado do usuário (estadual/municipal/outro), numa data (`data`) ou todo
//     ano (`dia_mes` 'MM-DD').
// Datas sempre como texto 'AAAA-MM-DD' (sem fuso).

const pad = (n) => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const somaDias = (s, n) => {
  const d = new Date(`${s}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano).
export function pascoa(ano) {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return ymd(ano, mes, dia)
}

// Automáticos: { chave, nome, abrangencia: 'nacional'|'opcional', fixo?: 'MM-DD', movel?: (ano) → [datas] }
export const FERIADOS_AUTOMATICOS = [
  { chave: 'confraternizacao', nome: 'Confraternização Universal', abrangencia: 'nacional', fixo: '01-01' },
  { chave: 'carnaval', nome: 'Carnaval (segunda e terça)', abrangencia: 'opcional', movel: (a) => [somaDias(pascoa(a), -48), somaDias(pascoa(a), -47)] },
  { chave: 'sexta_santa', nome: 'Sexta-feira Santa', abrangencia: 'nacional', movel: (a) => [somaDias(pascoa(a), -2)] },
  { chave: 'tiradentes', nome: 'Tiradentes', abrangencia: 'nacional', fixo: '04-21' },
  { chave: 'trabalho', nome: 'Dia do Trabalho', abrangencia: 'nacional', fixo: '05-01' },
  { chave: 'corpus_christi', nome: 'Corpus Christi', abrangencia: 'opcional', movel: (a) => [somaDias(pascoa(a), 60)] },
  { chave: 'independencia', nome: 'Independência do Brasil', abrangencia: 'nacional', fixo: '09-07' },
  { chave: 'aparecida', nome: 'Nossa Senhora Aparecida', abrangencia: 'nacional', fixo: '10-12' },
  { chave: 'finados', nome: 'Finados', abrangencia: 'nacional', fixo: '11-02' },
  { chave: 'republica', nome: 'Proclamação da República', abrangencia: 'nacional', fixo: '11-15' },
  { chave: 'consciencia_negra', nome: 'Dia Nacional de Zumbi e da Consciência Negra', abrangencia: 'nacional', fixo: '11-20' },
  { chave: 'natal', nome: 'Natal', abrangencia: 'nacional', fixo: '12-25' },
]
const POR_CHAVE = new Map(FERIADOS_AUTOMATICOS.map(f => [f.chave, f]))

export const datasDoAutomatico = (f, ano) => (f.fixo ? [`${ano}-${f.fixo}`] : f.movel(ano))
// Opcional nasce desligado; nacional, ligado. A linha do cadastro (mesma chave) manda.
export const ativoPadrao = (f) => f.abrangencia !== 'opcional'

// Lista para a tela (um ano): automáticos com o estado do cadastro + os do usuário.
// → [{ chave?, id?, nome, abrangencia, datas: [...], ativo, automatico }]
export function feriadosDoAno(ano, cadastro = []) {
  const linhaDe = new Map((cadastro || []).filter(r => r.chave).map(r => [r.chave, r]))
  const auto = FERIADOS_AUTOMATICOS.map(f => {
    const l = linhaDe.get(f.chave)
    return { chave: f.chave, id: l?.id || null, nome: f.nome, abrangencia: f.abrangencia, datas: datasDoAutomatico(f, ano), ativo: l ? !!l.ativo : ativoPadrao(f), automatico: true }
  })
  const proprios = (cadastro || []).filter(r => !r.chave && (r.dia_mes || String(r.data || '').startsWith(`${ano}-`)))
    .map(r => ({ id: r.id, nome: r.nome, abrangencia: r.abrangencia, datas: [r.dia_mes ? `${ano}-${r.dia_mes}` : r.data], ativo: r.ativo !== false, automatico: false, todoAno: !!r.dia_mes }))
  return [...auto, ...proprios].sort((a, b) => a.datas[0].localeCompare(b.datas[0]))
}

// Datas de feriado ATIVAS entre `inicio` e `fim` (inclusive) → Set('AAAA-MM-DD').
export function feriadosAtivos(cadastro, inicio, fim) {
  const out = new Set()
  if (!inicio || !fim || inicio > fim) return out
  const a0 = Number(inicio.slice(0, 4))
  const a1 = Number(fim.slice(0, 4))
  for (let ano = a0; ano <= a1; ano++) {
    for (const f of feriadosDoAno(ano, cadastro)) {
      if (!f.ativo) continue
      for (const d of f.datas) if (d >= inicio && d <= fim) out.add(d)
    }
  }
  return out
}

export const nomeDoAutomatico = (chave) => POR_CHAVE.get(chave)?.nome || chave
