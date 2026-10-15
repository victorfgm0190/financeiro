# Análise de cores — Finup

> Relatório gerado por varredura estática (somente leitura) em 2026-10-13. Fontes: `src/**/*.{js,jsx,css}` (testes `*.test.js` excluídos), `index.html`, `vite.config.js` (manifest do `vite-plugin-pwa`) e `supabase/schema.sql`. 
> Não há `tailwind.config.*` nem `postcss.config.*`: o projeto usa **Tailwind v4** via `@tailwindcss/vite`, com tokens em `@theme` dentro de `src/index.css`. 
> Hex equivalente das classes Tailwind = paleta **v4** (definida em OKLCH em `node_modules/tailwindcss/theme.css`, convertida para sRGB). Atenção: os hex "clássicos" hardcoded no código (`#6366f1`, `#ef4444`…) são da paleta **v3** — renderizam um tom levemente diferente da classe v4 de mesmo nome.

## a) Resumo

| Métrica | Valor |
|---|---|
| Arquivos varridos | 176 |
| Arquivos com ao menos uma cor | 110 |
| Ocorrências de cor (total) | 5578 |
| …das quais seed de categorias em `AppContext.jsx` (dados, não UI) | 208 |
| Cores distintas (classe/literal, ignorando opacidade) | 159 |
| Cores distintas contando variações de opacidade (`/10`, `/20`…) | 331 |
| Valores hex distintos (após resolver classes Tailwind) | 137 |
| Ocorrências por tipo | Tailwind: 4801 · hex: 339 · Tailwind (token @theme): 274 · Tailwind arbitrário: 144 · rgba: 8 · nome CSS: 6 · var(): 4 · color-mix: 1 · hsl (gerado): 1 |
| Ocorrências com variante `dark:` | **0** — o app é *dark-only* (tema escuro fixo, sem tema claro) |
| Variantes de estado | `hover:` 464 · `group-hover:` 20 · `peer-checked:` 9 · `focus:` 5 · `placeholder:` 4 · `active:` 4 · `md:` 3 · `disabled:` 1 |

**Leitura rápida:** a UI é praticamente monocromática em `gray-*` (≈ 3218 ocorrências), com cores semânticas de valor em azul (receita) e laranja (despesa) — decisão deliberada documentada em `src/index.css` por o usuário ter deficiência de visão de cores (verde/vermelho nunca distinguem receita/despesa). A cor de marca é o verde `#0F6E56`, sempre hardcoded (não existe token).

## b) Tabela geral

Ordenada por nº de ocorrências. "Função" = distribuição das funções detectadas (prefixo da classe ou contexto do literal).

| Cor | Hex equivalente | Tipo | Função | Nº ocorr. | Arquivos principais |
|---|---|---|---|---:|---|
| `gray-500` (/5,15,20,25,40,50) | #6A7282 | Tailwind | Texto (682), Fundo (6), Borda (6), Foco/anel (2) | 697 | SettingsPanel.jsx (56), ImportPanel.jsx (53), SchedulePanel.jsx (51) +89 |
| `gray-800` (/10,20,30,40,50,60,70,80) | #1E2939 | Tailwind | Fundo (285), Borda (259), Divisor (15), Gradiente (1) | 562 | ImportPanel.jsx (48), SchedulePanel.jsx (39), ReservasPanel.jsx (34) +85 |
| `gray-400` (/70) | #99A1AF | Tailwind | Texto | 542 | ImportPanel.jsx (59), ReservasPanel.jsx (45), SchedulePanel.jsx (31) +77 |
| `gray-700` (/20,30,40,50,60,70) | #364153 | Tailwind | Borda (165), Fundo (129), Texto (70) | 364 | ReservasPanel.jsx (44), SettingsPanel.jsx (30), ImportPanel.jsx (28) +70 |
| `gray-300` | #D1D5DC | Tailwind | Texto | 341 | SettingsPanel.jsx (26), ImportPanel.jsx (23), ReservasPanel.jsx (21) +75 |
| `gray-600` (/30,60) | #4A5565 | Tailwind | Texto (260), Fundo (21), Borda (14), Placeholder (2) | 298 | ReservasPanel.jsx (29), ImportPanel.jsx (25), SchedulePanel.jsx (19) +64 |
| `gray-200` | #E5E7EB | Tailwind | Texto | 297 | ImportPanel.jsx (21), SchedulePanel.jsx (20), SettingsPanel.jsx (18) +70 |
| `#0F6E56` (/5,10,15,20,30,50) | #0F6E56 | Tailwind arbitrário, hex | Controle de formulário (accent) (54), Fundo (40), Texto (17), Borda (16) | 142 | SettingsPanel.jsx (15), ImportPanel.jsx (14), SchedulePanel.jsx (12) +39 |
| `orange-600` (/70,80,90) | #F54900 | Tailwind | Texto (134), Fundo (6), Borda (1) | 141 | ReservasPanel.jsx (36), ExtratoContaPanel.jsx (18), DashboardPanel.jsx (14) +18 |
| `white` (/5,8,10,15,20,60,70,80) | #FFFFFF | Tailwind | Texto (77), Fundo (36), Borda (5), Foco/anel (1) | 119 | AccountsPanel.jsx (24), TransactionForm.jsx (19), InicioMobile.jsx (7) +33 |
| `amber-500` (/5,10,15,20,30,40,50,70,80,90) | #FE9A00 | Tailwind | Fundo (65), Borda (25), Texto (22), Controle de formulário (accent) (1) | 113 | SchedulePanel.jsx (14), TransactionForm.jsx (12), ImportPanel.jsx (10) +25 |
| `amber-400` (/10,20,40,70,80,90) | #FFB900 | Tailwind | Texto (104), Fundo (4), Borda (1) | 109 | SchedulePanel.jsx (13), TransactionForm.jsx (10), ImportPanel.jsx (7) +31 |
| `red-400` (/10,15,50,70,80) | #FF6467 | Tailwind | Texto (86), Fundo (12), Borda (5) | 103 | SchedulePanel.jsx (15), SettingsPanel.jsx (14), ExtratoContaPanel.jsx (9) +34 |
| `blue-500` (/5,10,15,20,25,30,40,50,80,[0.03]) | #2B7FFF | Tailwind | Fundo (54), Texto (25), Borda (12), Controle de formulário (accent) (5) | 97 | SchedulePanel.jsx (15), ImportPanel.jsx (13), CashFlowPanel.jsx (12) +23 |
| `gray-100` | #F3F4F6 | Tailwind | Texto | 89 | SchedulePanel.jsx (13), AjusteIntegridadeModal.jsx (5), ImportPanel.jsx (5) +38 |
| `blue-600` (/40,70) | #155DFC | Tailwind | Texto (82), Fundo (6), Gradiente (1) | 89 | ReservasPanel.jsx (33), DashboardPanel.jsx (14), ExtratoContaPanel.jsx (9) +12 |
| `despesa` (/20,80) | #F0997B | Tailwind (token @theme) | Semântica: despesa | 88 | DashboardPanel.jsx (7), PatrimonioPanel.jsx (7), ReservasPanel.jsx (7) +28 |
| `surface` (/30,40,50,60,80) | #1A2438 | Tailwind (token @theme) | Fundo | 76 | ExtratoContaPanel.jsx (11), ImportPanel.jsx (7), SchedulePanel.jsx (6) +34 |
| `orange-500` (/5,10,15,20,25,30,70,90) | #FF6900 | Tailwind | Texto (42), Fundo (28), Borda (5), Controle de formulário (accent) (1) | 76 | ImportPanel.jsx (15), ReservasPanel.jsx (9), SchedulePanel.jsx (8) +21 |
| `receita` (/15,20) | #85B7EB | Tailwind (token @theme) | Semântica: receita | 74 | ReservasPanel.jsx (12), GlobalSearch.jsx (7), DashboardPanel.jsx (6) +25 |
| `emerald-400` (/5,10,70,80) | #00D492 | Tailwind | Texto (64), Fundo (9) | 73 | CreditCardPanel.jsx (9), ImportPanel.jsx (9), SettingsPanel.jsx (9) +25 |
| `blue-400` (/50,70) | #51A2FF | Tailwind | Texto (67), Borda (1) | 68 | ImportPanel.jsx (13), DemonstrativoFinanceiro.jsx (6), PatrimonioPanel.jsx (5) +24 |
| `red-500` (/5,10,15,20,30,40,50,70,[0.03]) | #FB2C36 | Tailwind | Fundo (34), Borda (23), Texto (1) | 58 | SchedulePanel.jsx (12), CashFlowPanel.jsx (7), ImportPanel.jsx (4) +21 |
| `emerald-500` (/5,10,15,20,30,40,50,60) | #00BC7D | Tailwind | Fundo (34), Borda (14), Texto (4), Controle de formulário (accent) (4) | 57 | SettingsPanel.jsx (9), SchedulePanel.jsx (4), ReconciliarModal.jsx (4) +22 |
| `#0EA5E9` | #0EA5E9 | hex | Categoria (seed/dados) (56), Badge tipo de documento (1) | 57 | AppContext.jsx (56), TiposDocumentoPanel.jsx (1) |
| `#F97316` | #F97316 | hex | Categoria (seed/dados) (49), Gráfico (4), Badge tipo de documento (1) | 54 | AppContext.jsx (49), ReportsPanel.jsx (1), RazaoDiarioTab.jsx (1) +3 |
| `#EF4444` | #EF4444 | hex | Categoria (seed/dados) (48), Gráfico (1), Badge tipo de documento (1) | 50 | AppContext.jsx (48), ReportsPanel.jsx (1), TiposDocumentoPanel.jsx (1) |
| `orange-400` (/30,50,70) | #FF8904 | Tailwind | Texto (38), Fundo (1), Borda (1) | 40 | ReservasPanel.jsx (14), ImportPanel.jsx (6), EnvelopesPanel.jsx (4) +11 |
| `amber-300` (/70,90) | #FFD230 | Tailwind | Texto | 37 | CashFlowPanel.jsx (7), FluxoCaixaPorConta.jsx (4), TransactionForm.jsx (4) +15 |
| `indigo-500` (/5,10,15,20,30,60) | #615FFF | Tailwind | Fundo (26), Borda (7), Controle de formulário (accent) (2), Texto (1) | 36 | SchedulePanel.jsx (8), ExtratoContaPanel.jsx (5), TransactionForm.jsx (5) +14 |
| `reserva` (/5,10,15,20,70) | #AFA9EC | Tailwind (token @theme) | Semântica: reserva | 35 | CreditCardPanel.jsx (10), RelatorioFatura.jsx (7), SchedulePanel.jsx (6) +8 |
| `indigo-400` (/5) | #7C86FF | Tailwind | Texto (30), Fundo (1) | 31 | ExtratoContaPanel.jsx (7), TransactionForm.jsx (6), ImportPanel.jsx (3) +10 |
| `transparent` | — | Tailwind | Borda (22), Fundo (7) | 29 | SettingsPanel.jsx (8), TiposDocumentoPanel.jsx (4), ImportPanel.jsx (2) +14 |
| `teal-400` | #00D5BE | Tailwind | Texto | 23 | PatrimonioPanel.jsx (6), PatrimonioEditavel.jsx (4), TradeInResumo.jsx (3) +7 |
| `purple-500` (/10,15,20,30,40) | #AD46FF | Tailwind | Fundo (15), Borda (7) | 22 | CashFlowPanel.jsx (8), FluxoCaixaPorConta.jsx (7), ProvisorioForm.jsx (2) +4 |
| `purple-400` | #C27AFF | Tailwind | Texto | 20 | SchedulePanel.jsx (4), TransactionsPanel.jsx (4), CreditCardPanel.jsx (3) +7 |
| `#EAB308` | #EAB308 | hex | Categoria (seed/dados) | 20 | AppContext.jsx (20) |
| `black` (/50,60) | #000000 | Tailwind | Fundo | 19 | SchedulePanel.jsx (6), ImportPanel.jsx (4), Modal.jsx (2) +7 |
| `gray-900` (/40,95) | #101828 | Tailwind | Fundo (14), Foco/anel (1), Borda (1) | 16 | DespesasCategoria.jsx (2), AgendaMobile.jsx (2), SchedulePanel.jsx (2) +9 |
| `emerald-300` (/80) | #5EE9B5 | Tailwind | Texto | 15 | ImportPanel.jsx (2), SettingsPanel.jsx (2), CashFlowPanel.jsx (1) +10 |
| `emerald-600` (/50,60) | #009966 | Tailwind | Texto (5), Fundo (5), Borda (3), Gradiente (1) | 14 | ViradaModal.jsx (3), AccountsPanel.jsx (1), AjusteIntegridadeModal.jsx (1) +9 |
| `blue-300` | #8EC5FF | Tailwind | Texto | 13 | AccountsPanel.jsx (2), ImportPanel.jsx (2), CashFlowPanel.jsx (1) +8 |
| `#6B7280` | #6B7280 | hex | Gráfico (11), Categoria (seed/dados) (2) | 13 | CashFlowPanel.jsx (2), DashboardPanel.jsx (2), PatrimonioPanel.jsx (2) +4 |
| `teal-500` (/5,10,20,40,[0.03]) | #00BBA7 | Tailwind | Fundo (7), Borda (5), Texto (1) | 13 | TradeInResumo.jsx (4), PatrimonioEditavel.jsx (3), PatrimonioPanel.jsx (2) +4 |
| `#8B5CF6` | #8B5CF6 | hex | Categoria (seed/dados) (6), Gráfico (4), Badge tipo de documento (3) | 13 | AppContext.jsx (6), ReportsPanel.jsx (1), RazaoDiarioTab.jsx (1) +5 |
| `purple-300` (/70,90) | #DAB2FF | Tailwind | Texto | 12 | CashFlowPanel.jsx (5), FluxoCaixaPorConta.jsx (3), AccountsPanel.jsx (1) +3 |
| `#6366F1` | #6366F1 | hex | Perfil/categoria (padrão) (5), Gráfico (4), Ícone (1), Badge tipo de documento (1) | 12 | SettingsPanel.jsx (3), db.js (2), supabase.js (2) +5 |
| `#22C55E` | #22C55E | hex | Categoria (seed/dados) (10), Gráfico (1), Ícone (1) | 12 | AppContext.jsx (10), ReportsPanel.jsx (2) |
| `gray-950` (/95) | #030712 | Tailwind | Fundo | 11 | MobileShell.jsx (3), App.jsx (1), ExtratoContaPanel.jsx (1) +6 |
| `indigo-300` | #A3B3FF | Tailwind | Texto | 11 | ImportPanel.jsx (3), SchedulePanel.jsx (2), PerfisMultiSelect.jsx (2) +4 |
| `emerald-700` | #007A55 | Tailwind | Borda (6), Fundo (4), Texto (1) | 11 | ReservasPanel.jsx (5), ViradaModal.jsx (3), ScheduleMatchModal.jsx (1) +2 |
| `sky-400` (/25) | #00BCFF | Tailwind | Texto (9), Fundo (1) | 10 | IntegridadePanel.jsx (3), AccountsPanel.jsx (2), ExtratoContaPanel.jsx (1) +4 |
| `sky-500` (/10,15,20,40) | #00A6F4 | Tailwind | Fundo (7), Borda (3) | 10 | IntegridadePanel.jsx (5), EscopoSerieDialog.jsx (2), CashFlowPanel.jsx (1) +2 |
| `#14B8A6` | #14B8A6 | hex | Categoria (seed/dados) (4), Badge tipo de documento (3), Gráfico (2) | 9 | AppContext.jsx (4), ReportsPanel.jsx (1), RazaoDiarioTab.jsx (1) +3 |
| `red-300` (/70) | #FFA2A2 | Tailwind | Texto | 8 | FluxoMobileLista.jsx (4), CashFlowPanel.jsx (2), RateioModal.jsx (1) +1 |
| `#EC4899` | #EC4899 | hex | Categoria (seed/dados) (4), Gráfico (3), Badge tipo de documento (1) | 8 | AppContext.jsx (4), ReportsPanel.jsx (1), RazaoDiarioTab.jsx (1) +2 |
| `amber-200` (/60) | #FEE685 | Tailwind | Texto | 7 | BulkEditModal.jsx (3), AccountForm.jsx (1), AccountsPanel.jsx (1) +2 |
| `sky-300` (/70,90) | #74D4FF | Tailwind | Texto | 7 | AccountsPanel.jsx (3), SettingsPanel.jsx (2), CashFlowPanel.jsx (1) +1 |
| `violet-500` (/5,15,20,30) | #8E51FF | Tailwind | Fundo (6), Borda (1) | 7 | AlertsPanel.jsx (4), ExtratoContaPanel.jsx (1), IntegridadePanel.jsx (1) +1 |
| `violet-400` | #A684FF | Tailwind | Texto | 7 | AlertsPanel.jsx (5), ExtratoContaPanel.jsx (1), IntegridadePanel.jsx (1) |
| `#3B82F6` | #3B82F6 | Tailwind arbitrário, hex | Gráfico (4), Fundo (1), Borda (1), Categoria (seed/dados) (1) | 7 | ReconcileBadge.jsx (2), ReportsPanel.jsx (1), RazaoDiarioTab.jsx (1) +3 |
| `yellow-500` (/20) | #F0B100 | Tailwind | Fundo (4), Texto (2) | 6 | ImportPanel.jsx (4), CreditCardPanel.jsx (1), RelatorioFatura.jsx (1) |
| `#F59E0B` | #F59E0B | hex | Gráfico (4), Gráfico/indicador (orçamento) (1), Badge tipo de documento (1) | 6 | DashboardPanel.jsx (1), ReportsPanel.jsx (1), RazaoDiarioTab.jsx (1) +3 |
| `#10B981` | #10B981 | hex | Gráfico (3), Fundo/ícone inline (1), Badge tipo de documento (1), Categoria (seed/dados) (1) | 6 | PatrimonioPanel.jsx (4), TiposDocumentoPanel.jsx (1), AppContext.jsx (1) |
| `yellow-400` | #FDC700 | Tailwind | Texto | 5 | DashboardPanel.jsx (2), ExtratoContaPanel.jsx (1), CreditCardPanel.jsx (1) +1 |
| `#1F2937` | #1F2937 | hex | Gráfico | 5 | CashFlowPanel.jsx (1), DashboardPanel.jsx (1), PatrimonioPanel.jsx (1) +2 |
| `#9CA3AF` | #9CA3AF | hex | Gráfico (3), Badge tipo de documento (1), Fundo/ícone inline (1) | 5 | TiposDocumentoPanel.jsx (2), DashboardPanel.jsx (1), ReportsPanel.jsx (1) +1 |
| `#0E6B4E` (/20) | #0E6B4E | Tailwind arbitrário, hex | Fundo (3), Gradiente (card) (1), Navegação mobile (1) | 5 | InicioMobile.jsx (2), AgendaMobile.jsx (1), ActionSheet.jsx (1) +1 |
| `indigo-600` | #4F39F6 | Tailwind | Fundo | 5 | TransactionForm.jsx (2), ProvisaoForm.jsx (1), ScheduleForm.jsx (1) +1 |
| `currentColor` | — | nome CSS | Gráfico | 4 | CategorySelect.jsx (3), AccountsPanel.jsx (1) |
| `#EA580C` | #EA580C | hex | Gráfico (3), Gráfico/indicador (orçamento) (1) | 4 | DashboardPanel.jsx (2), CashFlowPanel.jsx (1), ReportsPanel.jsx (1) |
| `#2563EB` | #2563EB | hex | Gráfico (3), Gráfico/indicador (orçamento) (1) | 4 | DashboardPanel.jsx (2), CashFlowPanel.jsx (1), ReportsPanel.jsx (1) |
| `#06B6D4` | #06B6D4 | hex | Gráfico (3), Categoria (seed/dados) (1) | 4 | RazaoDiarioTab.jsx (1), SettingsPanel.jsx (1), AppContext.jsx (1) +1 |
| `#85B7EB` (/10,30) | #85B7EB | Tailwind arbitrário, hex | Token @theme (1), Borda (1), Fundo (1) | 3 | RendimentoModal.jsx (2), index.css (1) |
| `#F0997B` (/10,30) | #F0997B | Tailwind arbitrário, hex | Token @theme (1), Borda (1), Fundo (1) | 3 | RendimentoModal.jsx (2), index.css (1) |
| `#185FA5` | #185FA5 | Tailwind arbitrário, hex | Fundo (1), Borda (1), Fundo/ícone inline (1) | 3 | AccountsPanel.jsx (2), AccountForm.jsx (1) |
| `emerald-800` (/30,50) | #006045 | Tailwind | Borda (2), Gradiente (1) | 3 | AccountsPanel.jsx (1), FavorecidosPanel.jsx (1), ScheduleMatchModal.jsx (1) |
| `purple-600` | #9810FA | Tailwind | Fundo (2), Gradiente (1) | 3 | AccountsPanel.jsx (1), ScheduleForm.jsx (1), TransactionForm.jsx (1) |
| `purple-200` | #E9D4FF | Tailwind | Texto | 3 | TransactionForm.jsx (2), AccountsPanel.jsx (1) |
| `green-400` | #05DF72 | Tailwind | Texto | 3 | ExtratoContaPanel.jsx (2), SettingsPanel.jsx (1) |
| `#0C5A47` | #0C5A47 | Tailwind arbitrário | Fundo | 3 | IntegridadePanel.jsx (2), ImportPanel.jsx (1) |
| `#111827` | #111827 | hex | Gráfico | 3 | DashboardPanel.jsx (1), DespesasCategoria.jsx (1), ReportsPanel.jsx (1) |
| `#374151` | #374151 | hex | Gráfico | 3 | DashboardPanel.jsx (1), DespesasCategoria.jsx (1), ReportsPanel.jsx (1) |
| `#78716C` | #78716C | hex | Categoria (seed/dados) | 3 | AppContext.jsx (3) |
| `--color-page` | — | var() | Token @theme | 2 | index.css (2) |
| `#1E2531` | #1E2531 | hex | Fundo (skeleton) | 2 | index.css (2) |
| `blue-200` | #BEDBFF | Tailwind | Texto | 2 | AccountsPanel.jsx (1), TransactionForm.jsx (1) |
| `green-500` (/20) | #00C950 | Tailwind | Fundo | 2 | ExtratoContaPanel.jsx (2) |
| `orange-700` | #CA3500 | Tailwind | Fundo | 2 | ExtratoContaPanel.jsx (2) |
| `red-600` | #E7000B | Tailwind | Fundo | 2 | AlertsPanel.jsx (1), Sidebar.jsx (1) |
| `orange-300` | #FFB86A | Tailwind | Texto | 2 | CreditCardPanel.jsx (1), ImportPanel.jsx (1) |
| `emerald-900` (/20,50) | #004F3B | Tailwind | Borda (1), Fundo (1) | 2 | DashboardPanel.jsx (1), ValueFilterDropdown.jsx (1) |
| `rgba(15,110,86,0.15)` | #0F6E56 | rgba | Fundo/ícone inline | 2 | DashboardPanel.jsx (1), ReportsPanel.jsx (1) |
| `emerald-950` (/30) | #002C22 | Tailwind | Fundo | 2 | ImportPanel.jsx (1), ScheduleMatchModal.jsx (1) |
| `red-950` (/40,90) | #460809 | Tailwind | Fundo | 2 | FinanciamentoModal.jsx (1), Toast.jsx (1) |
| `red-800` | #9F0712 | Tailwind | Borda | 2 | FinanciamentoModal.jsx (1), Toast.jsx (1) |
| `teal-300` | #46ECD5 | Tailwind | Texto | 2 | PatrimonioEditavel.jsx (1), TradeInResumo.jsx (1) |
| `#84CC16` | #84CC16 | hex | Gráfico (1), Categoria (seed/dados) (1) | 2 | ReportsPanel.jsx (1), AppContext.jsx (1) |
| `#12302A` (/40) | #12302A | Tailwind arbitrário | Fundo | 2 | FavorecidosPanel.jsx (1), SettingsPanel.jsx (1) |
| `amber-900` (/20,40) | #7B3306 | Tailwind | Borda (1), Fundo (1) | 2 | SettingsPanel.jsx (2) |
| `#64748B` | #64748B | hex | Badge tipo de documento | 2 | TiposDocumentoPanel.jsx (1), tiposDocumento.js (1) |
| `none` | — | nome CSS | Gráfico | 2 | CategorySelect.jsx (2) |
| `red-100` | #FFE2E2 | Tailwind | Texto | 2 | Toast.jsx (2) |
| `page` | #0F172A | Tailwind (token @theme) | Fundo | 1 | index.css (1) |
| `#0F172A` | #0F172A | hex | Token @theme | 1 | index.css (1) |
| `#1A2438` | #1A2438 | hex | Token @theme | 1 | index.css (1) |
| `#212C45` | #212C45 | hex | Token @theme | 1 | index.css (1) |
| `#AFA9EC` | #AFA9EC | hex | Token @theme | 1 | index.css (1) |
| `#B4B2A9` | #B4B2A9 | hex | Token @theme | 1 | index.css (1) |
| `--color-surface` | — | var() | Token @theme | 1 | index.css (1) |
| `--color-surface-hover` | — | var() | Token @theme | 1 | index.css (1) |
| `#F9FAFB` | #F9FAFB | hex | Componente CSS (.btn/.input/.nav) | 1 | index.css (1) |
| `#0B5C47` | #0B5C47 | hex | Componente CSS (.btn/.input/.nav) | 1 | index.css (1) |
| `#A32D2D` | #A32D2D | hex | Componente CSS (.btn/.input/.nav) | 1 | index.css (1) |
| `#8A2424` | #8A2424 | hex | Componente CSS (.btn/.input/.nav) | 1 | index.css (1) |
| `color-mix(in srgb, #0F6E56 15%, transparent)` | #0F6E56 (15%) | color-mix | Componente CSS (.btn/.input/.nav) | 1 | index.css (1) |
| `#2A3244` | #2A3244 | hex | Fundo (skeleton) | 1 | index.css (1) |
| `blue-800` | #193CB8 | Tailwind | Gradiente | 1 | AccountsPanel.jsx (1) |
| `purple-800` | #6E11B0 | Tailwind | Gradiente | 1 | AccountsPanel.jsx (1) |
| `amber-600` | #E17100 | Tailwind | Gradiente | 1 | AccountsPanel.jsx (1) |
| `amber-800` | #973C00 | Tailwind | Gradiente | 1 | AccountsPanel.jsx (1) |
| `teal-600` | #009689 | Tailwind | Gradiente | 1 | AccountsPanel.jsx (1) |
| `teal-800` | #005F5A | Tailwind | Gradiente | 1 | AccountsPanel.jsx (1) |
| `rose-700` | #C70036 | Tailwind | Gradiente | 1 | AccountsPanel.jsx (1) |
| `rose-900` | #8B0836 | Tailwind | Gradiente | 1 | AccountsPanel.jsx (1) |
| `blue-50` | #EFF6FF | Tailwind | Texto | 1 | AccountsPanel.jsx (1) |
| `orange-50` | #FFF7ED | Tailwind | Texto | 1 | AccountsPanel.jsx (1) |
| `sky-50` | #F0F9FF | Tailwind | Texto | 1 | AccountsPanel.jsx (1) |
| `yellow-300` | #FFDF20 | Tailwind | Texto | 1 | AccountsPanel.jsx (1) |
| `emerald-200` | #A4F4CF | Tailwind | Texto | 1 | AccountsPanel.jsx (1) |
| `sky-200` | #B8E6FE | Tailwind | Texto | 1 | AccountsPanel.jsx (1) |
| `red-200` | #FFC9C9 | Tailwind | Texto | 1 | CashFlowPanel.jsx (1) |
| `orange-900` | #7E2A0C | Tailwind | Fundo | 1 | CreditCardPanel.jsx (1) |
| `green-900` (/30) | #0D542B | Tailwind | Fundo | 1 | CreditCardPanel.jsx (1) |
| `purple-900` | #59168B | Tailwind | Fundo | 1 | CreditCardPanel.jsx (1) |
| `rgba(16,185,129,0.25)` | #10B981 | rgba | Borda | 1 | RelatorioFatura.jsx (1) |
| `rgba(234,88,12,0.25)` | #EA580C | rgba | Borda | 1 | RelatorioFatura.jsx (1) |
| `orange-800` | #9F2D00 | Tailwind | Texto | 1 | RelatorioFatura.jsx (1) |
| `#E5E7EB` | #E5E7EB | hex | Gráfico | 1 | DespesasCategoria.jsx (1) |
| `orange-950` (/30) | #441306 | Tailwind | Fundo | 1 | ImportPanel.jsx (1) |
| `blue-100` | #DBEAFE | Tailwind | Texto | 1 | ImportPanel.jsx (1) |
| `violet-300` | #C4B4FF | Tailwind | Texto | 1 | ImportPanel.jsx (1) |
| `amber-950` (/30) | #461901 | Tailwind | Fundo | 1 | ImportPanel.jsx (1) |
| `indigo-950` (/30) | #1E1A4D | Tailwind | Fundo | 1 | ImportPanel.jsx (1) |
| `slate-400` | #90A1B9 | Tailwind | Texto | 1 | ImportPreviewModal.jsx (1) |
| `rgba(99,102,241,0.15)` | #6366F1 | rgba | Fundo/ícone inline | 1 | ReportsPanel.jsx (1) |
| `#818CF8` | #818CF8 | hex | Ícone | 1 | ReportsPanel.jsx (1) |
| `rgba(59,130,246,0.15)` | #3B82F6 | rgba | Fundo/ícone inline | 1 | ReportsPanel.jsx (1) |
| `#60A5FA` | #60A5FA | hex | Ícone | 1 | ReportsPanel.jsx (1) |
| `rgba(34,197,94,0.15)` | #22C55E | rgba | Fundo/ícone inline | 1 | ReportsPanel.jsx (1) |
| `gray-750` | — | Tailwind | Fundo | 1 | SettingsPanel.jsx (1) |
| `red-900` (/40) | #82181A | Tailwind | Borda | 1 | SettingsPanel.jsx (1) |
| `#A855F7` | #A855F7 | hex | Badge tipo de documento | 1 | TiposDocumentoPanel.jsx (1) |
| `#4B5563` | #4B5563 | hex | Gráfico | 1 | despesasPorCategoria.js (1) |
| `hsl(${h % 360}, 55%, ${48 + (h % 3) * 6}%)` | — | hsl (gerado) | Gráfico | 1 | despesasPorCategoria.js (1) |
| `#0B5740` | #0B5740 | hex | Gradiente (card) | 1 | InicioMobile.jsx (1) |
| `#5B6660` | #5B6660 | hex | Navegação mobile | 1 | MobileShell.jsx (1) |
| `rgba(14,107,78,0.45)` | #0E6B4E | rgba | Navegação mobile | 1 | MobileShell.jsx (1) |
| `#0B0F0E` | #0B0F0E | hex | PWA/manifest/theme-color | 1 | vite.config.js (1) |

## c) Paleta por família (claro → escuro)

### Cinzas/neutros (22 cores, 3458 ocorrências)

| Cor | Hex | Luminância | Ocorr. |
|---|---|---:|---:|
| `white` | #FFFFFF | 1.000 | 119 |
| `gray-100` | #F3F4F6 | 0.904 | 89 |
| `gray-200` | #E5E7EB | 0.798 | 297 |
| `#E5E7EB` | #E5E7EB | 0.798 | 1 |
| `gray-300` | #D1D5DC | 0.663 | 341 |
| `#B4B2A9` | #B4B2A9 | 0.444 | 1 |
| `#9CA3AF` | #9CA3AF | 0.364 | 5 |
| `gray-400` | #99A1AF | 0.354 | 542 |
| `slate-400` | #90A1B9 | 0.349 | 1 |
| `#78716C` | #78716C | 0.169 | 3 |
| `#6B7280` | #6B7280 | 0.167 | 13 |
| `gray-500` | #6A7282 | 0.167 | 697 |
| `#5B6660` | #5B6660 | 0.126 | 1 |
| `#4B5563` | #4B5563 | 0.089 | 1 |
| `gray-600` | #4A5565 | 0.089 | 298 |
| `gray-700` | #364153 | 0.052 | 364 |
| `gray-800` | #1E2939 | 0.022 | 562 |
| `surface` | #1A2438 | 0.018 | 76 |
| `gray-900` | #101828 | 0.009 | 16 |
| `page` | #0F172A | 0.009 | 1 |
| `gray-950` | #030712 | 0.002 | 11 |
| `black` | #000000 | 0.000 | 19 |

### Azuis (40 cores, 573 ocorrências)

| Cor | Hex | Luminância | Ocorr. |
|---|---|---:|---:|
| `#F9FAFB` | #F9FAFB | 0.955 | 1 |
| `sky-50` | #F0F9FF | 0.935 | 1 |
| `blue-50` | #EFF6FF | 0.915 | 1 |
| `blue-100` | #DBEAFE | 0.811 | 1 |
| `sky-200` | #B8E6FE | 0.739 | 1 |
| `blue-200` | #BEDBFF | 0.688 | 2 |
| `sky-300` | #74D4FF | 0.580 | 7 |
| `blue-300` | #8EC5FF | 0.529 | 13 |
| `indigo-300` | #A3B3FF | 0.472 | 11 |
| `receita` | #85B7EB | 0.449 | 74 |
| `#85B7EB` | #85B7EB | 0.449 | 3 |
| `sky-400` | #00BCFF | 0.432 | 10 |
| `#06B6D4` | #06B6D4 | 0.382 | 4 |
| `#60A5FA` | #60A5FA | 0.363 | 1 |
| `blue-400` | #51A2FF | 0.348 | 68 |
| `sky-500` | #00A6F4 | 0.338 | 10 |
| `#0EA5E9` | #0EA5E9 | 0.329 | 57 |
| `#818CF8` | #818CF8 | 0.302 | 1 |
| `indigo-400` | #7C86FF | 0.286 | 31 |
| `#3B82F6` | #3B82F6 | 0.235 | 7 |
| `rgba(59,130,246,0.15)` | #3B82F6 | 0.235 | 1 |
| `blue-500` | #2B7FFF | 0.229 | 97 |
| `#6366F1` | #6366F1 | 0.185 | 12 |
| `rgba(99,102,241,0.15)` | #6366F1 | 0.185 | 1 |
| `indigo-500` | #615FFF | 0.179 | 36 |
| `#64748B` | #64748B | 0.171 | 2 |
| `#2563EB` | #2563EB | 0.153 | 4 |
| `blue-600` | #155DFC | 0.150 | 89 |
| `indigo-600` | #4F39F6 | 0.112 | 5 |
| `#185FA5` | #185FA5 | 0.111 | 3 |
| `blue-800` | #193CB8 | 0.069 | 1 |
| `#374151` | #374151 | 0.052 | 3 |
| `#2A3244` | #2A3244 | 0.032 | 1 |
| `#212C45` | #212C45 | 0.026 | 1 |
| `#1F2937` | #1F2937 | 0.022 | 5 |
| `#1E2531` | #1E2531 | 0.018 | 2 |
| `#1A2438` | #1A2438 | 0.018 | 1 |
| `indigo-950` | #1E1A4D | 0.016 | 1 |
| `#111827` | #111827 | 0.009 | 3 |
| `#0F172A` | #0F172A | 0.009 | 1 |

### Verdes (33 cores, 414 ocorrências)

| Cor | Hex | Luminância | Ocorr. |
|---|---|---:|---:|
| `emerald-200` | #A4F4CF | 0.771 | 1 |
| `teal-300` | #46ECD5 | 0.661 | 2 |
| `emerald-300` | #5EE9B5 | 0.640 | 15 |
| `green-400` | #05DF72 | 0.540 | 3 |
| `teal-400` | #00D5BE | 0.513 | 23 |
| `emerald-400` | #00D492 | 0.492 | 73 |
| `#84CC16` | #84CC16 | 0.481 | 2 |
| `green-500` | #00C950 | 0.424 | 2 |
| `#22C55E` | #22C55E | 0.411 | 12 |
| `rgba(34,197,94,0.15)` | #22C55E | 0.411 | 1 |
| `teal-500` | #00BBA7 | 0.383 | 13 |
| `emerald-500` | #00BC7D | 0.374 | 57 |
| `#14B8A6` | #14B8A6 | 0.372 | 9 |
| `rgba(16,185,129,0.25)` | #10B981 | 0.364 | 1 |
| `#10B981` | #10B981 | 0.364 | 6 |
| `emerald-600` | #009966 | 0.237 | 14 |
| `teal-600` | #009689 | 0.236 | 1 |
| `emerald-700` | #007A55 | 0.146 | 11 |
| `#0F6E56` | #0F6E56 | 0.119 | 142 |
| `rgba(15,110,86,0.15)` | #0F6E56 | 0.119 | 2 |
| `#0E6B4E` | #0E6B4E | 0.112 | 5 |
| `rgba(14,107,78,0.45)` | #0E6B4E | 0.112 | 1 |
| `teal-800` | #005F5A | 0.089 | 1 |
| `emerald-800` | #006045 | 0.088 | 3 |
| `#0B5C47` | #0B5C47 | 0.082 | 1 |
| `#0C5A47` | #0C5A47 | 0.078 | 3 |
| `#0B5740` | #0B5740 | 0.073 | 1 |
| `green-900` | #0D542B | 0.066 | 1 |
| `emerald-900` | #004F3B | 0.059 | 2 |
| `#12302A` | #12302A | 0.024 | 2 |
| `emerald-950` | #002C22 | 0.019 | 2 |
| `#0B0F0E` | #0B0F0E | 0.004 | 1 |
| `color-mix(in srgb, #0F6E56 15%, transparent)` | #0F6E56 (15%) | — | 1 |

### Vermelhos/rosas (15 cores, 241 ocorrências)

| Cor | Hex | Luminância | Ocorr. |
|---|---|---:|---:|
| `red-100` | #FFE2E2 | 0.811 | 2 |
| `red-200` | #FFC9C9 | 0.673 | 1 |
| `red-300` | #FFA2A2 | 0.497 | 8 |
| `red-400` | #FF6467 | 0.314 | 103 |
| `#EC4899` | #EC4899 | 0.248 | 8 |
| `#EF4444` | #EF4444 | 0.229 | 50 |
| `red-500` | #FB2C36 | 0.226 | 58 |
| `red-600` | #E7000B | 0.170 | 2 |
| `rose-700` | #C70036 | 0.124 | 1 |
| `#A32D2D` | #A32D2D | 0.099 | 1 |
| `red-800` | #9F0712 | 0.076 | 2 |
| `#8A2424` | #8A2424 | 0.068 | 1 |
| `rose-900` | #8B0836 | 0.059 | 1 |
| `red-900` | #82181A | 0.055 | 1 |
| `red-950` | #460809 | 0.015 | 2 |

### Amarelos/laranjas (27 cores, 724 ocorrências)

| Cor | Hex | Luminância | Ocorr. |
|---|---|---:|---:|
| `orange-50` | #FFF7ED | 0.939 | 1 |
| `amber-200` | #FEE685 | 0.794 | 7 |
| `yellow-300` | #FFDF20 | 0.741 | 1 |
| `amber-300` | #FFD230 | 0.676 | 37 |
| `yellow-400` | #FDC700 | 0.617 | 5 |
| `orange-300` | #FFB86A | 0.566 | 2 |
| `amber-400` | #FFB900 | 0.560 | 109 |
| `yellow-500` | #F0B100 | 0.500 | 6 |
| `#EAB308` | #EAB308 | 0.498 | 20 |
| `amber-500` | #FE9A00 | 0.442 | 113 |
| `#F59E0B` | #F59E0B | 0.439 | 6 |
| `#F0997B` | #F0997B | 0.427 | 3 |
| `despesa` | #F0997B | 0.427 | 88 |
| `orange-400` | #FF8904 | 0.392 | 40 |
| `#F97316` | #F97316 | 0.325 | 54 |
| `orange-500` | #FF6900 | 0.314 | 76 |
| `amber-600` | #E17100 | 0.278 | 1 |
| `#EA580C` | #EA580C | 0.245 | 4 |
| `rgba(234,88,12,0.25)` | #EA580C | 0.245 | 1 |
| `orange-600` | #F54900 | 0.242 | 141 |
| `orange-700` | #CA3500 | 0.151 | 2 |
| `amber-800` | #973C00 | 0.098 | 1 |
| `orange-800` | #9F2D00 | 0.092 | 1 |
| `amber-900` | #7B3306 | 0.066 | 2 |
| `orange-900` | #7E2A0C | 0.061 | 1 |
| `amber-950` | #461901 | 0.020 | 1 |
| `orange-950` | #441306 | 0.017 | 1 |

### Roxos (14 cores, 127 ocorrências)

| Cor | Hex | Luminância | Ocorr. |
|---|---|---:|---:|
| `purple-200` | #E9D4FF | 0.716 | 3 |
| `purple-300` | #DAB2FF | 0.540 | 12 |
| `violet-300` | #C4B4FF | 0.516 | 1 |
| `reserva` | #AFA9EC | 0.435 | 35 |
| `#AFA9EC` | #AFA9EC | 0.435 | 1 |
| `purple-400` | #C27AFF | 0.326 | 20 |
| `violet-400` | #A684FF | 0.318 | 7 |
| `#A855F7` | #A855F7 | 0.215 | 1 |
| `purple-500` | #AD46FF | 0.205 | 22 |
| `#8B5CF6` | #8B5CF6 | 0.198 | 13 |
| `violet-500` | #8E51FF | 0.189 | 7 |
| `purple-600` | #9810FA | 0.139 | 3 |
| `purple-800` | #6E11B0 | 0.069 | 1 |
| `purple-900` | #59168B | 0.046 | 1 |

### Outros (transparent/current/var) (8 cores, 41 ocorrências)

| Cor | Hex | Luminância | Ocorr. |
|---|---|---:|---:|
| `--color-page` | — | — | 2 |
| `--color-surface` | — | — | 1 |
| `--color-surface-hover` | — | — | 1 |
| `currentColor` | — | — | 4 |
| `transparent` | — | — | 29 |
| `gray-750` | — | — | 1 |
| `none` | — | — | 2 |
| `hsl(${h % 360}, 55%, ${48 + (h % 3) * 6}%)` | — | — | 1 |

## d) Top 20 componentes que mais usam cor

| # | Arquivo | Ocorrências | Cores distintas | Hex/rgba inline |
|---:|---|---:|---:|---:|
| 1 | `src/components/Import/ImportPanel.jsx` | 428 | 46 | 15 |
| 2 | `src/components/Schedule/SchedulePanel.jsx` | 385 | 36 | 14 |
| 3 | `src/components/Reservas/ReservasPanel.jsx` | 379 | 24 | 3 |
| 4 | `src/components/Settings/SettingsPanel.jsx` | 299 | 40 | 25 |
| 5 | `src/context/AppContext.jsx` | 211 | 19 | 208 |
| 6 | `src/components/Accounts/ExtratoContaPanel.jsx` | 203 | 26 | 0 |
| 7 | `src/components/CashFlow/CashFlowPanel.jsx` | 182 | 35 | 14 |
| 8 | `src/components/CreditCard/CreditCardPanel.jsx` | 181 | 37 | 3 |
| 9 | `src/components/Transactions/TransactionForm.jsx` | 168 | 33 | 2 |
| 10 | `src/components/Reports/FluxoCaixaPorConta.jsx` | 155 | 28 | 9 |
| 11 | `src/components/Accounts/AccountsPanel.jsx` | 137 | 47 | 2 |
| 12 | `src/components/Dashboard/DashboardPanel.jsx` | 128 | 36 | 13 |
| 13 | `src/components/Patrimonio/PatrimonioPanel.jsx` | 109 | 21 | 11 |
| 14 | `src/components/Transactions/TransactionsPanel.jsx` | 109 | 19 | 0 |
| 15 | `src/components/Schedule/ScheduleForm.jsx` | 93 | 27 | 2 |
| 16 | `src/components/Reports/DemonstrativoFinanceiro.jsx` | 88 | 15 | 6 |
| 17 | `src/components/Reports/ReportsPanel.jsx` | 78 | 35 | 26 |
| 18 | `src/components/Alerts/IntegridadePanel.jsx` | 75 | 22 | 5 |
| 19 | `src/components/Envelopes/EnvelopesPanel.jsx` | 72 | 16 | 0 |
| 20 | `src/components/Reports/RelatorioPorFavorecido.jsx` | 72 | 15 | 2 |

> `AppContext.jsx` (5º) aparece só pelo seed de categorias — cores de dados, não de UI.

## Cores vindas do banco e de dados

Não consultado o Neon — apenas schema e código.

| Tabela.coluna | Default | Onde é renderizada | Observação |
|---|---|---|---|
| `categorias.color` (TEXT) | `NULL` | bolinhas/barras em `SettingsPanel.jsx:404`, `DespesasCategoria.jsx:235` (fallback `corDaCategoria()` → `CORES_TOP` / `hsl()` gerado em `lib/despesasPorCategoria.js:131`) | Seed em `supabase/schema.sql` com 207 literais (19 hex distintos, paleta v3: `#f97316` ×40, `#ef4444` ×37, `#0ea5e9` ×37, `#eab308` ×20…) e o mesmo seed duplicado em `AppContext.jsx` (208 ocorrências). |
| `perfis.color` (TEXT) | `'#6366f1'` | `Header.jsx:70/101/106/138` (borda/ícone do seletor de perfil), `SettingsPanel.jsx:765` | Default repetido em 4 lugares (`schema.sql:311`, `db.js:348/357`, `supabase.js:19/28`). Paleta de escolha `PROFILE_COLORS` em `SettingsPanel.jsx:24`. |
| `tipos_documento.cor` (TEXT) | `NULL` | `TipoDocumentoBadge.jsx` → texto = `cor`, fundo = `cor`+`26` (15%), borda = `cor`+`66` (40%) | Seed em `api/_tiposDocumento.js:24` (11 tipos). Fallbacks hardcoded em `lib/tiposDocumento.js:20-22` e `SchedulePanel.jsx:2493-2494`. Paleta de escolha `CORES` em `TiposDocumentoPanel.jsx:9` + `<input type="color">` livre. |

**Exportação Excel** (`DemonstrativoFinanceiro.jsx:250-270`, ARGB sem `#`, não entra nas contagens acima): `1E3A5F`, `2C4E7A` (cabeçalhos), `0D5E3F`/`D6EFE5`/`EEF8F3` (verde), `8B1A1A`/`FDEAEA`/`FEF5F5` (vermelho), `F7F9FC`, `1A1A1A`, `FFFFFF`, e **sinal do valor: `POS = 1A6B3C` (verde) / `NEG = A61C1C` (vermelho)**.

## Mapa por função

| Função | Cores em uso (principais) |
|---|---|
| **Texto principal** | `gray-100` (89), `gray-200` (297), `white` (70), body `#f9fafb` |
| **Texto secundário** | `gray-300` (341), `gray-400` (540) |
| **Texto terciário / desabilitado** | `gray-500` (682 — o mais usado do app), `gray-600` (260), `gray-700` (70, como texto!) |
| **Links / destaque de marca** | `text-[#0F6E56]` (17), `.nav-active` `#0F6E56`, ícones `style={{color:'#0F6E56'}}` |
| **Fundo da página** | `bg-gray-950` (#030712) no shell (`App.jsx:208`, `Sidebar`, `Header`, `MobileShell`) **vs** `--color-page` #0F172A no `body` |
| **Fundo de card/modal** | `bg-surface` #1A2438 (`.card` + 60 usos), `bg-gray-900` (9, menus/modais), `bg-gray-800` (131), `bg-gray-800/20…/60` (~150) |
| **Inputs** | `.input` = `bg-gray-800 border-gray-700`; foco `#0F6E56` |
| **Cabeçalho de tabela / zebra / hover de linha** | `bg-gray-800/40`, `/30`, `/20`; hover `hover:bg-gray-800/40`, `hover:bg-gray-700` (52) |
| **Bordas/divisores** | `border-gray-800` (195), `border-gray-700` (142), `/50`, `/40`, `/60`, `divide-gray-800` |
| **Overlay de modal** | `bg-black/60` (18) |
| **Receita / entrada / saldo +** | token `text-receita` #85B7EB (70) · `text-blue-600` (81) · `blue-400` (66) · `blue-500` (23) · `sky-400` (9) · gráfico `#2563EB` |
| **Despesa / saída / saldo −** | token `text-despesa` #F0997B (84) · `text-orange-600` (130) · `orange-500` (40) · `orange-400` (35) · gráfico `#EA580C` · `red-300/400/500` em `CashFlowPanel`/`FluxoMobileLista` |
| **Reserva / gerencial** | token `reserva` #AFA9EC, `purple-300/400`, `indigo-300/400` |
| **Transferência** | token `transferencia` #B4B2A9 (quase não usado) vs `text-gray-400` em `TxMobileItem`/`BulkEditModal` |
| **Previsto / agendado** | sem cor própria: usa `amber-*` (alerta), opacidades (`/70`, `/80`) e cinzas |
| **Pagamento de cartão / efetivado / sucesso** | `emerald-400` (63 texto), `emerald-500/10`, `bg-emerald-600` |
| **Alerta** | `amber-400` (92), `amber-300`, `amber-500/10…/30`, `.btn-amber` |
| **Erro** | `red-400` (83), `red-500`, `bg-red-500/10`, `border-red-500` |
| **Botão primário** | `.btn-primary` `#0F6E56` / hover `#0b5c47`; também `bg-[#0F6E56]` + `hover:bg-[#0c5a47]`; `bg-emerald-600 hover:bg-emerald-600` |
| **Botão secundário** | `.btn-secondary` `gray-800 → gray-700`; `.btn-amber` |
| **Botão perigo** | `.btn-danger` `#A32D2D` / hover `#8a2424`; exclusão em massa com `bg-orange-600 hover:bg-orange-700` (ExtratoContaPanel); `hover:text-red-400 hover:bg-red-500/10` em ícones de lixeira |
| **Badges/tags** | contadores `badge bg-red-600 text-white` (Sidebar, AlertsPanel); `TipoDocumentoBadge` (cor do banco), status em `bg-{cor}-500/15` + `text-{cor}-400`, `.badge` |
| **Gráficos (Recharts)** | grid `#1f2937`, ticks `#6b7280`, legenda `#9ca3af`, tooltip `#111827`/`#374151`, barras `#2563EB`/`#EA580C`, linha patrimônio `#10b981`, paletas `COLORS`, `SERIES_COLORS`, `CORES_TOP` |
| **Navegação mobile** | barra `bg-gray-950/95 border-gray-800`; item ativo `#0E6B4E`, inativo `#5B6660`; FAB `+` `#0E6B4E` com sombra `rgba(14,107,78,.45)`; card de saldo `linear-gradient(#0E6B4E → #0B5740)` |
| **PWA** | `theme_color`/`<meta theme-color>` `#0F6E56`, `background_color` `#0b0f0e` |
| **Dark mode** | **não há variante `dark:`** — o tema escuro é o único tema. Nada a "faltar" por componente; o risco é o inverso (ver inconsistência 9). |

## e) Inconsistências

### 1. Receita/despesa: 4 sistemas paralelos para a mesma semântica
Pares receita/despesa encontrados na mesma linha (ternários `valor >= 0 ? … : …`):

| Par | Linhas | Arquivos (exemplos) |
|---|---:|---|
| `receita` / `despesa` (tokens) | 38 | AccountsPanel, BudgetPanel, DashboardPanel, EnvelopesPanel, BemComposicao… |
| `blue-600` / `orange-600` | 33 | DashboardPanel, ExtratoContaPanel, ExtratoGerencial, FluxoCaixaPorConta, ReportsPanel, ImportPanel |
| `blue-400` / `orange-500` | 11 | ConsultaModal, DemonstrativoFinanceiro, PosicaoFinanceiraModal, RelatorioPorFavorecido |
| `blue-500` / `orange-600`, `blue-400` / `orange-400`, `blue-500` / `orange-500` | 8 | CashFlowPanel, FluxoMobileLista, InicioMobile, ReservasPanel, TransactionForm |
| `sky-400` / `despesa` / `orange-*` | 4 | AccountsPanel, ExtratoContaPanel, SaldoPrincipalBreakdownModal, SettingsPanel |
| **`blue-300` / `red-300`, `blue-500` / `red-500`, `emerald-400` / `red-400`** | 6 | **CashFlowPanel, FluxoMobileLista, ImportPanel, Toast** |
| gráficos `#2563EB` / `#EA580C` | — | DashboardPanel, ReportsPanel, CashFlowPanel |

Os tokens `receita`/`despesa` existem mas cobrem menos da metade dos casos. `TxMobileItem` e `BulkEditModal` (`TYPE_META`) usam `blue-600`/`orange-600`.

### 2. Vermelho/verde ainda distinguindo sinal — contra a regra de acessibilidade do próprio app
`index.css` diz que verde/vermelho **nunca** devem distinguir receita/despesa (usuário com deficiência de visão de cores), mas:
- `CashFlowPanel.jsx` / `FluxoMobileLista.jsx` usam `red-300/400/500` para negativo;
- `PatrimonioPanel.jsx:189-213` desenha a evolução do patrimônio em verde `#10b981`;
- `RelatorioFatura.jsx:317/326` borda verde `rgba(16,185,129,.25)` vs laranja;
- **Exportação Excel** colore o sinal com `POS 1A6B3C` (verde) / `NEG A61C1C` (vermelho);
- `emerald-400` vs `red-400` em `ImportPanel` / `Toast` (aqui é sucesso/erro, mais aceitável, mas a única pista é a cor).

### 3. Cor de marca sem token — 7 verdes diferentes
`#0F6E56` (142 usos entre `accent-`, `bg-[]`, `text-[]`, `border-[]`, CSS, `style`), `#0E6B4E` (mobile: nav ativo, FAB, card), `#0B5740` (gradiente), `#0b5c47` (hover `.btn-primary`), `#0c5a47` (hover inline), `#12302a` (fundo), `emerald-600/700` em botões. Hover tem dois valores diferentes (`#0b5c47` × `#0c5a47`). Mobile usa `#0E6B4E` e desktop `#0F6E56` para a mesma marca.

### 4. Fundo de página com dois valores
`--color-page` = `#0F172A` (slate-900) no `body`, mas o shell real (`App.jsx:208`, `Sidebar.jsx:45`, `Header.jsx:31`, `MobileShell.jsx`) é `bg-gray-950` = `#030712`. O token `bg-page` quase não é usado; o `bg-surface` (#1A2438, matiz azulado) convive com `bg-gray-800/900` (matiz neutro) no mesmo papel de card/modal/menu. O skeleton usa ainda `#1e2531`/`#2a3244`, e o manifest `#0b0f0e` (verde-acinzentado) — 5 "pretos" distintos.

### 5. Texto terciário em 3 tons de cinza, dois deles ilegíveis
`gray-500` (682), `gray-600` (260) e `gray-700` (70) usados para rótulos/metadados/datas. `gray-500` e `gray-600` cumprem o mesmo papel (subtítulo/legenda) na mesma tela em `SettingsPanel`, `ImportPanel`, `SchedulePanel`. `gray-700` como **texto** (ex.: separadores "—", placeholders) tem contraste 1,5:1.

### 6. Hex hardcoded com equivalente Tailwind (paleta v3)
Todos os gráficos e paletas usam hex v3 em vez de classes/tokens: `#1f2937`=gray-800, `#6b7280`=gray-500, `#9ca3af`=gray-400, `#111827`=gray-900, `#374151`=gray-700, `#e5e7eb`=gray-200, `#2563EB`=blue-600, `#EA580C`=orange-600, `#10b981`=emerald-500, `#6366f1`=indigo-500, `#8b5cf6`=violet-500, `#f97316`=orange-500, `#ef4444`=red-500, `#0ea5e9`=sky-500, `#14b8a6`=teal-500, `#f59e0b`=amber-500, `#22c55e`=green-500, `#3b82f6`=blue-500, `#06b6d4`=cyan-500, `#ec4899`=pink-500, `#84cc16`=lime-500, `#a855f7`=purple-500, `#64748b`=slate-500, `#818cf8`=indigo-400, `#60a5fa`=blue-400, `#4b5563`=gray-600, `#78716c`=stone-500, `#f9fafb`=gray-50.
Como o Tailwind v4 usa OKLCH, `#2563EB` (v3 blue-600) ≠ classe `blue-600` (v4 `#155DFC`) → **a barra "Receitas" do gráfico tem tom diferente do texto `text-blue-600` ao lado**. Idem `#EA580C` × `orange-600` v4 `#F54900`.
Sem equivalente (cores próprias): `#0F6E56`, `#0E6B4E`, `#0B5740`, `#0b5c47`, `#0c5a47`, `#12302a`, `#185FA5`, `#A32D2D`, `#8a2424`, `#5B6660`, `#1e2531`, `#2a3244`, `#0b0f0e` e os tokens do `@theme`.

### 7. Paletas categóricas duplicadas e divergentes
`COLORS` (ReportsPanel, 10 cores), `SERIES_COLORS` (RazaoDiarioTab, 8), `CORES_TOP` (despesasPorCategoria, 6), `PROFILE_COLORS` (SettingsPanel, 8), `CORES` (TiposDocumentoPanel, 12), seed de categorias (schema + AppContext, 19). Mesmas cores em ordens diferentes; `COLORS` inclui `#22c55e` e `#ef4444` lado a lado (par verde/vermelho). Fallback de categoria gera `hsl()` arbitrário.

### 8. Tokens semânticos sub-usados / transferência inconsistente
`text-transferencia` existe mas transferência é `text-gray-400` em `TxMobileItem`/`BulkEditModal`. `reserva` (21) convive com `purple-300/400` (30) e `indigo-300/400` (41) para reservas/gerencial. `bg-[#85B7EB]/10` e `bg-[#F0997B]/10` repetem o hex do token em vez de `bg-receita/10`.

### 9. Mistura de famílias de cinza / matizes
Quase tudo é `gray-*` (3 218), com 1 ocorrência de `slate` (`ImportPreviewModal.jsx`) e `stone-500` (`#78716c`) no seed de categorias. Mais relevante: os tokens (`page`, `surface`, `surface-hover`) são **azul-ardósia**, enquanto `gray-*` v4 é cinza levemente azulado e `#5B6660`/`#0b0f0e` são **cinza-esverdeado** — três temperaturas de neutro.

### 10. Mesmo papel, cores diferentes em botões e estados
- Perigo: `.btn-danger #A32D2D` × `bg-orange-600` no botão "Excluir" de `ExtratoContaPanel.jsx:1521/1592` — **a mesma cor de despesa usada para ação destrutiva** — × `hover:bg-red-400/10` nos ícones de lixeira.
- Primário: `.btn-primary`, `bg-[#0F6E56]` inline, `bg-emerald-600`, destaque azul `#185FA5` (AccountsPanel).
- Alerta x previsto: `amber-*` serve a alerta, "Patrimonial", botão secundário (`.btn-amber`) e pendências — sem cor própria para "previsto/agendado".
- Indicador de orçamento: `#2563EB` / `#f59e0b` / `#EA580C` (`DashboardPanel.jsx:145`) — azul como "ok" e laranja como "estourado" reaproveita receita/despesa com outro sentido.

### Outras observações
- `dark:` = 0 ocorrências: não há componente "sem variante dark", pois não existe tema claro. Os 17 `bg-white` são bolinhas de toggles e barras de progresso — corretos.
- Opacidades: 172 combinações cor/opacidade distintas (`/5` a `/95`); só `gray-800` tem 8 níveis (`/10` a `/80`).

## f) Contraste (WCAG AA, texto normal ≥ 4,5:1)

Fundo assumido quando a classe não declara fundo: **`surface` #1A2438** (cards) — e `page`/`gray-950` onde indicado. Cores Tailwind convertidas da paleta v4; opacidades mescladas sobre o fundo.

### Texto sobre o fundo padrão (card `#1A2438`)

| Texto | Hex | vs surface | vs gray-950 (#030712) | Usos | Gravidade |
|---|---|---:|---:|---:|---|
| `text-gray-800` | #1E2939 | **1,06** | 1,4 | 1 | invisível |
| `text-gray-700` | #364153 | **1,51** | 2,0 | 70 | crítica |
| `text-gray-600` | #4A5565 | **2,05** | 2,7 | 260 | crítica |
| `text-[#0F6E56]` (marca) | #0F6E56 | **2,50** | 3,1 | 17 | crítica |
| `.nav-active` (#0F6E56 sobre 15% de si mesma) | #0F6E56 / #0F2431 | **2,57** | — | menu lateral | crítica |
| `text-emerald-700` | #007A55 | **2,89** | — | 1 | alta |
| `text-blue-600` (receita) | #155DFC | **2,96** | 3,8 | 81 | **crítica — valor financeiro** |
| `text-gray-500` | #6A7282 | **3,21** | 4,2 | 682 | alta (volume) |
| `text-indigo-500` | #615FFF | 3,39 | — | 1 | alta |
| `text-red-500` | #FB2C36 | 4,08 | — | 1 | média |
| `text-blue-500` | #2B7FFF | 4,12 | — | 23 | média |
| `text-emerald-600` | #009966 | 4,25 | — | 5 | média |
| `text-orange-600` (despesa) | #F54900 | 4,31 | 5,6 | 130 | média — valor financeiro |
| variantes com opacidade (`blue-600/70`, `orange-600/70…/90`, `red-400/70`, `blue-400/70`, `orange-400/70`, `amber-500/70`, `gray-400/70`) | — | 2,1 – 4,3 | — | ~20 | alta |

Tokens do `@theme` passam com folga: `receita` 7,37 · `despesa` 7,05 · `reserva` 7,17 · `transferencia` 7,30. `gray-400` 5,96 · `amber-400` 9,0 · `emerald-400` 8,0.

### Pares texto/fundo explícitos na mesma `className`

| Par | Razão | Onde |
|---|---:|---|
| `text-gray-600` + `bg-gray-700/50` | **1,70** | SettingsPanel |
| `text-gray-600` + `bg-surface` | **2,05** | SearchableSelect |
| `text-[#0F6E56]` + `bg-[#0F6E56]/20` | **2,14** | SettingsPanel |
| `text-blue-600` + `bg-blue-500/20` | **2,29** | SchedulePanel |
| `text-blue-600` + `bg-blue-500/15` | **2,44** | SchedulePanel |
| `text-gray-500` + `bg-gray-700/60`, `bg-gray-500/20`, `bg-gray-600/30`, `bg-gray-700/40` | 2,55 – 2,74 | CreditCardPanel, ImportPanel, AccountsPanel, SettingsPanel, CashFlowPanel |
| `text-gray-500` + `bg-gray-800` / `/60` / `/40` | 3,03 – 3,14 | SchedulePanel, CreditCardPanel, ExtratoContaPanel, RelatorioFatura, EnvelopesPanel |
| `text-orange-600` + `bg-orange-500/20` / `/15` | 3,30 / 3,59 | CreditCardPanel, SchedulePanel |
| `text-blue-500` + `bg-blue-500/15` | 3,40 | ReservasPanel, SchedulePanel |
| `text-white` + `bg-orange-600` | 3,60 | ExtratoContaPanel |
| `text-white` + `bg-emerald-600` | 3,65 | DuplicateButton |
| `text-gray-400` + `bg-gray-700` | 3,96 | DindinImportPanel, ReservasPanel, SettingsPanel, TiposDocumentoPanel |
| `text-indigo-400` + `bg-indigo-500/20` | 3,99 | ExtratoContaPanel, ImportPanel, ResgateBreakdownModal, SchedulePanel |
| `text-orange-500` + `bg-orange-500/20` | 4,11 | ImportPanel |
| `text-violet-400` + `bg-violet-500/20` | 4,40 | AlertsPanel |

### Literais (gráficos, navegação, badges)

| Elemento | Par | Razão |
|---|---|---:|
| Nav mobile — ícone/rótulo **ativo** | `#0E6B4E` sobre `gray-950` | **3,10** |
| Nav mobile — inativo (rótulo 11px) | `#5B6660` sobre `gray-950` | **3,37** |
| Eixos dos gráficos (11px) | `#6b7280` sobre surface / page | **3,21 / 3,69** |
| Badge `CTR` (Contrato) | `#64748b` sobre 15% de si | **2,78** |
| Badge `FAT` (Fatura) | `#6366f1` | **2,94** |
| Badge `CC` (Fatura de Cartão) | `#8b5cf6` | **3,12** |
| Badge `DUP` | `#a855f7` | 3,33 |
| Badge `GUIA` | `#ef4444` | 3,58 |
| Badge (cor `#ec4899` disponível) | — | 3,77 |
| Badge `NF` | `#0ea5e9` | 4,44 |
| Legenda dos gráficos | `#9ca3af` sobre page | 7,03 ✓ |
| `.btn-primary` / FAB | branco sobre `#0F6E56` / `#0E6B4E` | 6,20 / 6,50 ✓ |
| `.btn-danger` | branco sobre `#A32D2D` | 7,07 ✓ |

## g) Proposta de paleta padronizada (tokens) — **não aplicada**

Mantém a regra de acessibilidade existente (receita azul, despesa laranja, nunca verde×vermelho para sinal) e os 4 tokens semânticos atuais, que já têm bom contraste. Valores sugeridos para `@theme` em `src/index.css`:

| Token | Valor | Substitui | Contraste (sobre `fundo-2`) |
|---|---|---|---:|
| `--color-fundo-1` (página/shell) | `#0F172A` | `bg-gray-950`, `#0b0f0e`, `--color-page` | — |
| `--color-fundo-2` (card/modal/menu) | `#1A2438` | `bg-surface`, `bg-gray-900`, `bg-gray-800` em cards | — |
| `--color-fundo-3` (input, cabeçalho de tabela, hover, zebra) | `#212C45` | `bg-gray-800/20…/60`, `bg-gray-700`, `surface-hover`, skeleton `#1e2531` | — |
| `--color-borda` | `#2A3550` | `border-gray-800`, `divide-gray-800`, `/40…/60` | — |
| `--color-borda-forte` | `#364153` | `border-gray-700`, `border-gray-600` | — |
| `--color-texto-1` | `#F3F4F6` | `gray-100`, `gray-200`, `white`, `#f9fafb` | 14,1 |
| `--color-texto-2` | `#D1D5DC` | `gray-300` | 10,5 |
| `--color-texto-3` (rótulos, datas, eixos) | `#9AA3B5` | `gray-400`, **`gray-500`**, **`gray-600`**, `#6b7280` | 6,1 |
| `--color-texto-desabilitado` | `#6A7282` | `gray-500` só em estado `disabled` (isento do AA) | 3,2 |
| `--color-primary` (fundo de botão, FAB, theme-color) | `#0F6E56` | `#0E6B4E`, `emerald-600`, `bg-[#0F6E56]` | branco 6,2 |
| `--color-primary-hover` | `#0B5C47` | `#0c5a47`, `#0B5740` | branco 8,0 |
| `--color-primary-fg` (texto/ícone/nav ativo sobre escuro) | `#3CC29B` | `text-[#0F6E56]`, `.nav-active`, ícones `#0F6E56`, nav mobile ativo | 6,9 |
| `--color-secondary` | `#212C45` + texto `texto-1` | `.btn-secondary` gray-800/700 | 14,1 |
| `--color-success` | `#00D492` (emerald-400) | `emerald-300/400/500`, `#10b981` — só para status/confirmação, nunca sinal de valor | 8,0 |
| `--color-danger` (fundo de botão) | `#A32D2D` / hover `#8A2424` | `bg-orange-600` em ação destrutiva, `bg-red-600` em contadores | branco 7,1 |
| `--color-danger-fg` (texto de erro) | `#FF6467` (red-400) | `red-300/400/500` | 5,4 |
| `--color-warning` | `#FFB900` (amber-400) | `amber-300/400/500`, `yellow-400` | 9,0 |
| `--color-info` | `#00BCFF` (sky-400) | `sky-300/400`, `indigo-400` em avisos | 7,1 |
| `--color-receita` | `#85B7EB` (manter) | `blue-300…600`, `sky-400`, `#2563EB` (texto **e** gráfico) | 7,4 |
| `--color-despesa` | `#F0997B` (manter) | `orange-400…600`, `red-*` para negativo, `#EA580C` | 7,1 |
| `--color-reserva` | `#AFA9EC` (manter) | `purple-300/400`, `indigo-300/400` em reservas | 7,2 |
| `--color-transferencia` | `#B4B2A9` (manter) | `gray-400` em transferência | 7,3 |
| `--color-previsto` | `receita`/`despesa` a 70% + itálico/ícone de relógio | hoje sem padrão (`amber`, `/70`, `/80`) | ≈ 4,2–4,4 (subir para 80% → ≈ 5) |
| Gráficos | barras/linhas = `receita`/`despesa`; grid = `borda`; eixos = `texto-3`; tooltip = `fundo-2` + `borda-forte` | `#2563EB`, `#EA580C`, `#1f2937`, `#6b7280`, `#111827` | — |
| Paleta categórica única | 8 cores com L≈70% (OKLCH) e matizes espaçados, testada para daltonismo; uma só constante para categorias, perfis, séries e tipos de documento | `COLORS`, `SERIES_COLORS`, `CORES_TOP`, `PROFILE_COLORS`, `CORES` | ≥ 4,5 sobre 15% de si |

Badges de tipo de documento: manter a cor do banco, mas derivar o **texto** com luminosidade mínima (ex.: `color-mix(in oklch, cor 60%, white)`) para garantir ≥ 4,5:1 independentemente da cor escolhida.

Exportação Excel: trocar `POS 1A6B3C`/`NEG A61C1C` por azul/laranja escuros (ex.: `1F4E8C` 8,3:1 / `B4501E` 5,1:1 sobre branco) para seguir a mesma regra da tela.
