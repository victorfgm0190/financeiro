import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { montarPlanilha, nomeArquivoFinup } from '../exportExcel'
import { specRendimentos } from './rendimentosExcel'
import { rendimentosRepasse, conferenciaInforme } from './rendimentos'
import { competenciasDoRepasse } from './parcelas'

// Dados fictícios: o caso de referência sem despesas (aluguel 2.200, adm 10%, início 21/02/2026).
const CONTRATO = {
  id: 'c9', tipo: 'receber', modalidade: 'aluguel', modo_repasse: true, objeto: 'Imóvel Exemplo', favorecido: 'Administradora Exemplo',
  data_inicio: '2026-02-21', data_fim: '2026-09-30', valor_base: 2200, periodicidade: 'mensal', dia_vencimento: 5, dia_repasse: 10,
  repasse_meses_depois: 1, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0, taxa_adm_pct: 10, taxa_adm_base: 'bruto',
  itens_repasse: [], competencias: [], informes_adm: { 2026: { rendimentos: 15986.67, deducoes: 1500 } },
}
const ident = { nomeAmbiente: 'Família Exemplo', frase: '', perfil: 'Todos os perfis' }

describe('rendimentos em Excel', () => {
  const rel = rendimentosRepasse(CONTRATO, competenciasDoRepasse(CONTRATO, { hoje: '2026-02-25' }), { ano: 2026 })
  const itens = [{ rotulo: 'Imóvel Exemplo', rel, conferencia: conferenciaInforme(CONTRATO, 2026, rel.totais) }]
  const spec = specRendimentos(itens, { ano: '2026', referencia: 'pagamento', total: rel })

  it('aba Resumo + uma aba por contrato; nome do arquivo padrão', async () => {
    expect(spec.abas.map(a => a.nome)).toEqual(['Resumo', 'Imóvel Exemplo'])
    expect(nomeArquivoFinup(spec.nomeArquivo.relatorio, spec.nomeArquivo.periodo)).toBe('Finup_Alugueis-Rendimentos-e-Repasses_2026.xlsx')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await montarPlanilha(ExcelJS, spec, { ident }).xlsx.writeBuffer())
    expect(wb.worksheets.map(w => w.name)).toEqual(['Resumo', 'Imóvel Exemplo'])
  })

  it('resumo com a conferência; aba do contrato com 12 meses, total e aviso do contador', () => {
    const [res, aba] = spec.abas
    expect(res.linhas[0]).toMatchObject({ bruto: 15986.67, infRend: 15986.67, difRend: 0, infDed: 1500 })
    expect(res.linhas[0].difDed).toBe(Math.round((1500 - rel.totais.totalDedutiveis) * 100) / 100)
    expect(aba.linhas.slice(0, 12).map(l => l.mes)).toEqual(['Jan/2026', 'Fev/2026', 'Mar/2026', 'Abr/2026', 'Mai/2026', 'Jun/2026', 'Jul/2026', 'Ago/2026', 'Set/2026', 'Out/2026', 'Nov/2026', 'Dez/2026'])
    expect(aba.linhas[12]).toMatchObject({ mes: 'TOTAL 2026', bruto: 15986.67, _estilo: 'total' })
    expect(aba.linhas[6].obs).toMatch(/Repasse previsto/)
    expect(aba.filtros).toContain('Confira com seu contador o mês de reconhecimento e as deduções aceitas.')
  })
})
