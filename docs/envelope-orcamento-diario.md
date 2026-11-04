# Envelope com orçamento diário e cadastro de feriados (04/11/2026)

## Tipo de orçamento
- `envelopes.tipo_orcamento`: `mensal` (padrão; envelopes antigos ficam assim, sem mudança de valor) ou `diario`.
- Diário: `valor_dia`, `dias_semana` (lista JSONB 0=dom … 6=sáb — o cálculo aceita qualquer combinação; a tela oferece "Segunda a sexta" e "Segunda a sábado") e `descontar_feriados`.
- Migração: `supabase/migrations/2026-11-04b_envelope_diario_feriados.sql` (colunas opcionais no sync: `COLUNAS_OPCIONAIS.envelopes` em `api/_db.js`).

## Cálculo — função única `aGastarEnvelope` (`src/lib/envelopeOrcamento.js`)
- Ciclo = competência dos envelopes: do dia de início do período financeiro até a véspera dele no mês seguinte ("mês corrido" = dia 1). Nada fixo no 15.
- Dias do ciclo = dias na lista, menos os feriados ativos (se "Descontar feriados"). Orçamento = dias × valor/dia.
- Dias passados (antes de hoje), restantes (de hoje ao fim), previsto até ontem, gasto até ontem, gasto de hoje (inclui o já lançado para os dias seguintes do ciclo), excesso = max(0, gasto até ontem − previsto), A gastar = max(0, restantes × valor − excesso − gasto de hoje). Economia não soma. Ciclo futuro = orçamento inteiro; encerrado = 0. Data local, calculado na leitura (sem job).
- Mensal: `max(0, limite − gasto)`, exatamente como antes (teste de regressão contra `envelopesSaldos.antes.json`).

## Onde entra
- Card/detalhe (`EnvelopesPanel`, `EnvelopeResumo` — também no Painel e no Início do celular): `comOrcamentoDiario` + `resumoEnvelope`.
- Saldo Projetado do Painel: o wrapper `getSaldoPrincipalBreakdown` (alteração autorizada em 04/11/2026, só no wrapper) passa os envelopes por `envelopesParaProjecao` — o diário vai com limite = gasto da competência + A gastar, então o cálculo protegido (`calcularSaldoPrincipalBreakdown`, intacto) dá o A gastar.
- Saldo por conta (`getAccountSaldos`) e Fluxo de Caixa/relatórios (`computeFluxoCaixa` com `orcamentoEnvelopes`): o diário projeta o A gastar de cada ciclo do mês financeiro, no fim do ciclo; o mensal continua pelos ciclos do "Dia de vencimento".

## Alteração de configuração
- Vale do ciclo atual em diante: `envelopes.history` guarda `{ tipo: 'config', ate }` (versão anterior) e `{ tipo: 'ciclo', inicio, orcamento, dias }` (orçamento dos últimos 6 ciclos encerrados, gravado ao alterar o envelope ou o cadastro de feriados). Envelope só mensal nunca ganha versões.

## Feriados (Configurações → Cadastros → Feriados)
- `src/lib/feriados.js`: nacionais gerados (01/01, Sexta-feira Santa, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 25/12); Carnaval e Corpus Christi opcionais, desligados por padrão.
- Tabela `feriados` (por cliente) só com o que muda: linha com `chave` liga/desliga um automático; sem chave = estadual/municipal em `data` ou todo ano em `dia_mes`. Rota `api/feriados.js` (módulo Cadastros).

## Totais do topo (tela Envelopes, card "Envelopes do mês" do Painel e do Início no celular)
- `totaisEnvelopes` (`src/lib/envelopes.js`): Total limite = soma dos orçamentos do ciclo; Já gasto = soma dos gastos; **Ainda posso gastar = soma do que cada card mostra** (Mensal: limite − gasto, negativo quando estourou; Diário: A gastar). Só com Mensais, é a mesma conta de antes (limite − gasto). Teste: `src/lib/envelopesTotais.test.js`.

## Banco do ambiente sem a migração (perda silenciosa corrigida)
- Antes: o sync tirava as colunas que faltavam (`COLUNAS_OPCIONAIS`) e respondia 200 — a tela dizia "Tudo sincronizado" e o envelope voltava a Mensal ao recarregar.
- Agora (`api/_db.js`): coluna opcional ausente só sai do upsert se o valor for neutro (vazio/false/'mensal'…, `NEUTRO_OPCIONAL`); valor de verdade → `ErroBancoDesatualizado` (409, `codigo: 'banco_desatualizado'`), nada gravado, e o app marca a alteração com erro (indicador "1 alteração com erro — ver detalhes").
- `/api/load` devolve `recursos` (`recursosDoBanco`: `envelopeDiario`, `creditoPrevisto`, `feriados`); o formulário do envelope e a composição em parcela aberta recusam ANTES de mudar a tela (`src/lib/recursosBanco.js`). Crédito 'previsto' recusado pelo CHECK antigo → 409 com mensagem clara (`api/contrato-creditos.js`).
