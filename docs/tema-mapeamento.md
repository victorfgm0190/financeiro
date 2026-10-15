# Finup — Tabela de mapeamento cor → token (contrato da Fase 2)

> **Estado final (Fase 4, 2026-10-14):** todas as fases concluídas. A ponte temporária (inversão de
> `gray-*` no claro) foi removida do `src/index.css`. Os valores atuais dos tokens, as decisões das
> Fases 3–4 e a lista final de exceções estão nas seções 12–14, no fim do arquivo; as tabelas 1–11 são
> o contrato original da Fase 2 (as linhas que mudaram depois estão marcadas com "→ Fase 3/4").

Fase 0, gerada em 2026-10-13 a partir de `docs/analise-cores.md` e de uma nova varredura de `src/`
(5.578 ocorrências, 176 arquivos). Os nomes de token são exatamente os de `_tema/theme.css` (rascunho já fundido ao `src/index.css`, onde os tokens vivem hoje).
Contagens entre parênteses = ocorrências; os arquivos estão em ordem de volume.

Regras gerais
- Classe → token SÓ depois de identificar o papel no elemento. Opacidade se mantém (`bg-gray-800/40` → `bg-surface-2/40`).
- Texto branco sobre fundo colorido sólido (botão primário, badge, card de conta, FAB) continua `text-white`.
- Cor que é DADO (categoria.color, perfil.color, tipos_documento.cor, seed do AppContext) continua inline/dinâmica.
- Exportação Excel/CSV: fora de escopo.
- `PatrimonioEditavel.jsx` (protegido) tem 8 classes emerald e algumas gray: mostrar o diff antes de trocar.
- `BottomNav.jsx` não existe: a barra inferior, o FAB "+" e a tela "Mais" ficam em `src/mobile/MobileShell.jsx`.

## 1. Superfícies

| # | Classe/cor atual | Papel | Token | Onde aparece |
|---|---|---|---|---|
| S1 | `bg-gray-950` (11), `bg-gray-950/95` | fundo de página / shell / navegação | `bg-page` (`bg-page/95`) | App.jsx:208 · Header.jsx:31 · Sidebar.jsx:45 · MobileShell.jsx (raiz, header:74, barra inferior) · cabeçalhos sticky em ExtratoContaPanel, CreditCardPanel, TransactionsPanel |
| S2 | `body { background: var(--color-page); color: #f9fafb }` | página | `--color-page` / `--color-texto-1` | index.css:36-37 (remover o #0F172A, decisão 1) |
| S3 | `bg-surface` (77, já token), `.card` | card / painel / modal | `bg-surface` (mantém) | index.css:42 · Modal · ExtratoContaPanel (11) · ImportPanel (7) · SchedulePanel (6) · ReservasPanel (4) |
| S4 | `bg-gray-900` (14) | card, menu suspenso, bottom sheet | `bg-surface` | Header.jsx:117 (menu de perfil) · BottomSheet.jsx:18 · Login (2) · DespesasCategoria (2) · AgendaMobile (2) · SchedulePanel (2) · FluxoMobileLista |
| S5 | `bg-gray-800` sólido (89), dentro de card/modal | superfície elevada / bloco interno | `bg-surface-2` | ImportPanel (13) · SettingsPanel (13) · ReservasPanel (4) · ScheduleMatchModal (4) · AccountForm (3) · CreditCardPanel (3) · ScheduleForm (3) |
| S6 | `bg-gray-800/10…/80` (93) | zebra, cabeçalho de tabela, fundo sutil | `bg-surface-2/<mesma opacidade>` | SchedulePanel (8) · ReservasPanel (5) · SettingsPanel (5) · AccountForm (4) · ExtratoContaPanel (4) · AjusteIntegridadeModal (4) · CashFlowPanel (4) |
| S7 | `bg-gray-700` (74) como fundo de chip/botão neutro | elevado / neutro | `bg-surface-hover` | SettingsPanel (9) · IntegridadePanel (6) · ImportPanel (6) · SchedulePanel (6) · DemonstrativoFinanceiro (5) · CreditCardPanel (4) · TransactionForm (4) |
| S8 | `bg-gray-700`/`bg-gray-600` (9) como trilho de toggle desligado ou barra de progresso vazia | trilho | `bg-borda-forte` (→ Fase 4: trilho de toggle desligado passou a `bg-borda-campo`, ≥ 3:1; barra de progresso vazia continua `borda-forte`) | GlobalSearch (3) · Header · AccountsPanel · ImportPanel · BemHistoricoTab · FluxoCaixaPorConta · SettingsPanel |
| S9 | `hover:bg-gray-800`, `/20…/60`, `hover:bg-gray-700`, `hover:bg-gray-600` (166) | hover de linha, menu, botão | `hover:bg-surface-hover` (a opacidade se mantém quando existir) | SettingsPanel (16) · PatrimonioPanel (12) · ReservasPanel (12) · ExtratoContaPanel (8) · SchedulePanel (8) · TransactionsPanel (8) · ImportPanel (7) |
| S10 | `bg-black/40…/60` (19) | overlay de modal | `bg-overlay` | Modal (2) · SchedulePanel (6) · ImportPanel (4) · BottomSheet · DuplicateButton · MonthStartModal · ScheduleForm |
| S11 | skeleton `#1e2531` / `#2a3244` | placeholder carregando | `--color-surface-2` / `--color-surface-hover` | index.css:97 |
| S12 | `ring-offset-gray-900` | anel de seleção | `ring-offset-surface` | SettingsPanel.jsx:822 |

## 2. Bordas e campos

| # | Classe/cor atual | Papel | Token | Onde aparece |
|---|---|---|---|---|
| B1 | `border-gray-800`, `divide-gray-800` (274) | borda e divisor comuns | `border-borda`, `divide-borda` | ImportPanel (28) · SchedulePanel (25) · ReservasPanel (22) · ExtratoContaPanel (17) · CashFlowPanel (11) · SettingsPanel (8) · PatrimonioPanel (7) · `.card` |
| B2 | `border-gray-700` (165), exceto em campo | borda decorativa / botão "bs" / badge neutro (decisão 2) | `border-borda-forte` | ImportPanel (21) · SchedulePanel (13) · ReservasPanel (11) · ExtratoContaPanel (8) · TransactionForm (8) · AccountForm (7) · CreditCardPanel (6) · `.input` index.css:68 |
| B3 | `border-gray-600` / `border-gray-500` (20) | borda de badge/botão neutro | `border-borda-forte` | Header (3) · ImportPreviewModal (2) · DemonstrativoFinanceiro (2) · ReconcileBadge (2) · TipoDocumentoBadge (fallback) |
| B4 | `.input` e campos inline `bg-gray-800 border-gray-700` (input, select, textarea, DateInput) | campo de formulário | `bg-input border-borda-campo`; foco `border-primary` (D1) | index.css:67-73 · TransactionForm · DateInput · ImportPanel:3211/3871 (selects) · PerfisMultiSelect · SearchableSelect · CategorySelect |
| B5 | `placeholder-gray-*` / `placeholder:text-gray-*` (4) | placeholder | `placeholder:text-texto-3` | inputs de busca |

## 3. Texto

| # | Classe/cor atual | Papel | Token | Onde aparece |
|---|---|---|---|---|
| T1 | `text-white` (solto), `text-gray-100`, `text-gray-200` (399) | principal: títulos e valores | `text-texto-1` | SchedulePanel (32) · ImportPanel (26) · TransactionForm (22) · SettingsPanel (21) · ReservasPanel (16) · CreditCardPanel (12) · ExtratoContaPanel (11) |
| T2 | `text-gray-300`, `text-gray-400` (803) | secundário: rótulos e subtítulos | `text-texto-2` | ImportPanel (76) · ReservasPanel (61) · SchedulePanel (42) · ExtratoContaPanel (39) · CashFlowPanel (39) · SettingsPanel (39) · CreditCardPanel (34) |
| T3 | `text-gray-500`, `text-gray-600` (938) | terciário: legendas e datas | `text-texto-3` | ReservasPanel (78) · ImportPanel (74) · SettingsPanel (72) · SchedulePanel (67) · CreditCardPanel (26) · DashboardPanel (25) · TransactionsPanel (22) |
| T4 | `text-gray-700` (70), **prioridade em cada grupo** (decisão 7) | terciário | `text-texto-3` | ReservasPanel (23) · SchedulePanel (7) · RazaoDiarioTab (6) · RelatorioPorFavorecido (5) · RelatorioFatura (4) · CreditCardPanel (3) · TransactionsPanel (3) |
| T5 | `hover:text-gray-*` / `hover:text-white` (145) | hover de texto/ícone | `hover:text-texto-1` | ReportsPanel (12) · SchedulePanel (12) · SettingsPanel (9) · ExtratoContaPanel (8) · ImportPanel (8) · TransactionsPanel (8) |
| T6 | `.label` (`text-gray-400`) | rótulo de campo | `text-texto-2` | index.css:76 |
| T7 | `.nav-item` (`text-gray-400 hover:text-gray-100 hover:bg-gray-800/60`) | item de menu | `text-texto-2 hover:text-texto-1 hover:bg-surface-hover` | index.css:79 · Sidebar |

## 4. Marca / ação primária

| # | Classe/cor atual | Papel | Token | Onde aparece |
|---|---|---|---|---|
| P1 | `#0F6E56` como fundo: `bg-[#0F6E56]`, `accent-[#0F6E56]`, `peer-checked:bg-[#0F6E56]` (94) | botão primário, checkbox/radio, toggle ligado, logo | `bg-primary`, `accent-primary`, `peer-checked:bg-primary` (com `text-white`) | `.btn-primary` index.css:47 · ImportPanel (10) · CashFlowPanel (9) · FluxoCaixaPorConta (8) · SettingsPanel (8) · ConsultaModal (6) · SchedulePanel (6) · Sidebar.jsx:48 (logo) |
| P2 | `bg-[#0F6E56]/5…/30` | fundo de item selecionado | `bg-primary/<mesma opacidade>` | ImportPanel · SettingsPanel · SchedulePanel |
| P3 | hover `#0b5c47` / `#0c5a47` | hover do primário | `hover:bg-primary-hover` (D2) | index.css:50 · IntegridadePanel.jsx:168, 260 · ImportPanel.jsx:1135 |
| P4 | `#0F6E56` como texto/ícone: `text-[#0F6E56]`, `style={{color}}` (30) | marca como texto, link, item ativo | `text-primary-fg` | `.nav-active` index.css:81 · SchedulePanel (4) · SettingsPanel (4) · AccountForm (2) · ImportPanel (2) · CategorySelect (2) · RelatorioFatura.jsx:262 · DashboardPanel.jsx:327 · ReportsPanel.jsx:178 |
| P5 | `#0F6E56` como borda/anel/foco (18) | foco / seleção | `border-primary` / `ring-primary` | `.input:focus` index.css:71-72 · SettingsPanel (3) · ImportPanel (2) · SchedulePanel (2) · Login (2) |
| P6 | `#0E6B4E` (verde do mobile) | nav ativo / FAB | FAB: `bg-primary` (sombra `rgba(14,107,78,.45)` mantida) · ícone ativo: `text-primary-fg` | MobileShell.jsx:10, 63, 110 · AgendaMobile |
| P7 | `#5B6660` | nav mobile inativo | `text-texto-3` | MobileShell.jsx:11, 63 |
| P8 | `#12302a`, `bg-[#12302a]/40` | seção ativa / caixa de marca | `bg-primary/15` + `text-primary-fg` | SettingsPanel.jsx:638 · FavorecidosPanel.jsx:112 |
| P9 | gradiente `#0E6B4E → #0B5740` (texto branco 6,5–8,6:1) | card de saldo da marca (Início mobile) | **exceção literal**, igual nos dois temas (D7) | InicioMobile.jsx:121 |

## 5. Semântica financeira (decisão 10: sinal + cor, sem mudar largura)

| # | Classe/cor atual | Papel | Token | Onde aparece |
|---|---|---|---|---|
| F1 | `text-blue-*` / `text-sky-*` em VALOR (parte das 209) | receita, entrada, saldo positivo | `text-receita` + "+R$"/"R$" + ícone | ReservasPanel (38) · ImportPanel (24) · DashboardPanel (15) · ExtratoContaPanel (12) · AccountsPanel (11) · CashFlowPanel (10) · TxMobileItem.jsx:8 · BulkEditModal.jsx:13 · SaldoPrincipalBreakdownModal.jsx:24 |
| F2 | `text-orange-*` em VALOR (parte das 218) | despesa, saída, saldo negativo | `text-despesa` + "−R$" + ícone | ReservasPanel (53) · ImportPanel (23) · ExtratoContaPanel (18) · DashboardPanel (15) · CreditCardPanel (10) · FluxoCaixaPorConta (10) · TxMobileItem.jsx:9 · BulkEditModal.jsx:14 |
| F3 | `bg-blue-500/xx`, `bg-orange-500/xx` em chip ou linha de valor | fundo de receita/despesa | `bg-receita/<op>`, `bg-despesa/<op>` | TxMobileItem · BulkEditModal · SchedulePanel · CashFlowPanel |
| F4 | `bg-blue-600 text-white` / `bg-orange-600 text-white` em toggle de tipo selecionado | tipo Receita/Despesa escolhido | `bg-receita text-page` / `bg-despesa text-page` (escuro 9,6 / 9,2 · claro 6,0 / 5,2) | TransactionForm.jsx:1198, 1313 · ScheduleForm.jsx:665 · ProvisorioForm.jsx:119 |
| F5 | `border-[#85B7EB]/30 bg-[#85B7EB]/10`, `…#F0997B…` | hex do token escrito à mão | `border-receita/30 bg-receita/10`, `border-despesa/30 bg-despesa/10` | RendimentoModal.jsx:111, 118 |
| F6 | `red-*` / `blue-*` como sinal de saldo (INCORRETO) | saldo | `text-despesa` com "−" / `text-receita` (decisão 10) | CashFlowPanel.jsx:616, 794, 827-829 · FluxoMobileLista.jsx:72-73, 114 |
| F7 | totais neutros (Saldo Total, Dívida Total, Limite) | neutro | `text-texto-1` | AccountsPanel · CreditCardPanel · DashboardPanel |
| F8 | transferência: `text-gray-400` / `text-blue-400` / `text-purple-400` | transferência | `text-transferencia` (+ ícone ⇄) | TxMobileItem.jsx:10 · BulkEditModal.jsx:15 · ImportPanel.jsx:320 · SchedulePanel.jsx:1083, 1459 |
| F9 | `purple-*` / `indigo-*` / `violet-*` em reserva (parte das 161) | reserva / gerencial / resgate | `text-reserva`, `bg-reserva-bg` (ou `bg-reserva/<op>`) | TransactionForm (22) · SchedulePanel (18) · CashFlowPanel (15) · ExtratoContaPanel (14) · FluxoCaixaPorConta (14) · ImportPanel (11) · tokens já usados em CreditCardPanel/RelatorioFatura |

## 6. Estados

| # | Classe/cor atual | Papel | Token | Onde aparece |
|---|---|---|---|---|
| E1 | `amber-*` em botão/ícone de AÇÃO, `.btn-amber` | ação secundária de destaque | `text-ambar`, `border-ambar/40`, `bg-ambar/10`, `hover:bg-ambar/20` | `.btn-amber` index.css:55 · ExtratoContaPanel (8) · SchedulePanel (4, "Selecionar") · CreditCardPanel (2, "Extrato"/"Relatório") · EnvelopesPanel (2) · AgendaMobile (1) |
| E2 | `amber-*` / `orange-*` em VALIDAÇÃO ou ALERTA | aviso | `text-aviso` / `border-aviso`, **sempre com ⚠ + texto** | ImportPanel.jsx:3211, 3871 (`border-orange-500`: função de reserva pendente) · TransactionForm.jsx:1405-1423 ("Obrigatório para reserva livre") · AccountForm.jsx:464, 639 · AjusteIntegridadeModal.jsx:160-177 · DindinImportPanel.jsx:302 |
| | **Regra (decisão 3)** | | aviso só em validação de campo e status de alerta (⚠ + texto). ambar só em botões e ícones de ação; nunca em borda de campo. | |
| E3 | `bg-orange-600` (Excluir em massa), `text-orange-400 border-orange-600` (Fechar Fatura), "Excluir ambos" | botão que ABRE ação destrutiva | `bg-perigo-bg text-perigo` (+ `border-perigo/40`) | ExtratoContaPanel.jsx:1521, 1592 ("Excluir em massa") · CreditCardPanel.jsx:760 ("Fechar Fatura") |
| E4 | `.btn-danger` `#A32D2D` (hover `#8a2424`), confirmação dentro de modal de exclusão | confirmação destrutiva | `bg-perigo-solido hover:bg-perigo-solido-hover text-white` (D2, D3) | index.css:60-65 · modais de confirmação · "Excluir ambos" = `confirmLabel` em ExtratoContaPanel.jsx:1482 e TransactionsPanel.jsx:389 |
| E5 | `badge bg-red-600 text-white` | contador de Alertas (decisão 13) | `bg-perigo-solido text-white` | Sidebar.jsx:64 · AlertsPanel.jsx:251 |
| E6 | `red-*` em "Em atraso" / "Nd em atraso" / "Pendências em atraso" | status atrasado (decisão 11) | `bg-perigo-bg`, `border-perigo`, `text-perigo` + ⚠ | SaldoPrincipalBreakdownModal.jsx:101-107 (modal "Como chegamos aqui", App.jsx:168) · CashFlowPanel.jsx:741-771 · FluxoMobileLista.jsx:154-168 |
| E7 | `red-400/500` em erro, ícone de lixeira, `hover:text-red-400 hover:bg-red-500/10` | erro / destrutivo | `text-perigo`, `hover:text-perigo hover:bg-perigo-bg` | SchedulePanel (27) · SettingsPanel (16) · ImportPanel (10) · CashFlowPanel:853 · Toast |
| E8 | `emerald-*` / `green-*` em "atualizada", "há N dias", "Paga ✓", toast de sucesso | ok / sucesso (decisão 11) | `text-primary-fg` + ícone ✓ | SettingsPanel (22) · CreditCardPanel (15, inclui :759 "Abrir fatura") · ImportPanel (15) · AccountsPanel (8) · AjusteIntegridadeModal (8) · TxMobileItem.jsx:11 (pagamento) · PatrimonioEditavel (8, **protegido**) |
| E9 | "sem movimento há N dias", "Falta pagar", "Final Calendário: R$ 0,00" | aviso (decisão 11) | `text-aviso` + ⚠ (ou só `text-aviso` quando já houver rótulo) | AccountsPanel · CreditCardPanel · CashFlowPanel |

## 7. Pontuais (decisões 9, 12, 13)

| # | Classe/cor atual | Papel | Token | Onde aparece |
|---|---|---|---|---|
| X1 | cards que hoje recebem `from-blue-600 to-blue-800` (mesma regra de hoje: `TYPE_COLORS.checking`) + `text-white` | destaque (decisão 9, D5) | `bg-destaque text-white` (6,70:1); a regra de quais contas recebem não muda | AccountsPanel.jsx:46, 264, 317 |
| X2 | texto secundário do card (`opacity-50/60/70`, `text-white/60`) sobre `destaque` | secundário no card | `text-white/80` (4,89:1) (D5) | AccountsPanel.jsx:340-436 |
| X3 | estrela `text-yellow-300` no card | marca de conta principal | mantém (5,05:1 sobre destaque) | AccountsPanel.jsx:334 |
| X3b | estrela ★ da conta principal no Painel (`text-yellow-400`) | **exceção:** estrela = marcador de principal, identificado pela forma | `text-ambar` (8,79:1 escuro · 5,22:1 claro) — exceção à regra "ambar só em ação" | DashboardPanel (Contas) |
| X4 | Agendamentos, linha · Pagar | ação positiva | `bg-receita/15 text-receita` | SchedulePanel (Grupo 3) |
| X5 | Agendamentos, linha · Estornar | ação de reversão | `bg-despesa/15 text-despesa` | SchedulePanel |
| X6 | Agendamentos, linha · Pular | neutro "bs" | `bg-surface-2 border-borda-forte text-texto-2` | SchedulePanel |
| X7 | Agendamentos, linha · editar/histórico | ação secundária | `text-ambar` | SchedulePanel |
| X8 | demais gradientes de conta (emerald/purple/amber/teal/rose/gray) com texto branco | cor do tipo de conta | **exceção literal**, igual nos dois temas; só sobe a opacidade do texto que estiver abaixo de 4,5:1 (D5) | AccountsPanel.jsx:47-51, 264 |
| X9 | `#185FA5` (borda e selo "Próxima fatura") | destaque de vencimento | **mantém**, igual nos dois temas; selo branco sobre #185FA5 = 6,52:1 (D5) | AccountsPanel.jsx:318, 329 · AccountForm |
| X10 | faixa da safe-area superior no tema claro | status bar do iOS | regra `.header-safe-top` / `.faixa-safe-top` em theme.css (#111827) | Header.jsx:31 · MobileShell.jsx:74 (acrescentar a classe-marcador) |

## 8. Gráficos (Fase 3, só registrado)

| # | Atual | Token / origem | Onde |
|---|---|---|---|
| G1 | grade `#1f2937` | `chartGrade` | CashFlowPanel:639 · DashboardPanel:549 · PatrimonioPanel:193 · ReportsPanel:215 · RazaoDiarioTab:55 |
| G2 | ticks `#6b7280` | `chartEixo` | CashFlowPanel:640-641 · DashboardPanel:550-551 · PatrimonioPanel:194-196 · ReportsPanel:216-217 · RazaoDiarioTab:58, 65 |
| G3 | legenda `#9ca3af` | `texto2` | DashboardPanel:556 · ReportsPanel:219 · RazaoDiarioTab:71 |
| G4 | tooltip `#111827` / `#374151` | fundo `surface`, borda `borda-forte` (var), texto `texto1` | DashboardPanel:554 · DespesasCategoria:171 · ReportsPanel:248 · tooltips customizados em CashFlowPanel:73 e ReportsPanel:24 |
| G5 | barras `#2563EB` / `#EA580C` | `receita` / `despesa` | DashboardPanel:557-558 · ReportsPanel:220-221 |
| G6 | Fluxo de Caixa Futuro: linha `#2563EB`, zero `#EA580C` tracejado | linha `receita`; zero `chartEixo` tracejado; grade `chartGrade` (decisão 14) | CashFlowPanel.jsx:639-644 |
| G7 | patrimônio `#10b981` (verde) | a definir na Fase 3 (não verde×vermelho) | PatrimonioPanel.jsx:189-213 |
| G8 | orçamento `#2563EB` / `#f59e0b` / `#EA580C` | a definir (hoje reaproveita receita/despesa com outro sentido) | DashboardPanel.jsx:145 |
| G9 | contorno selecionado `#e5e7eb` | `texto1` | DespesasCategoria.jsx:161 |
| G10 | paletas `COLORS`, `SERIES_COLORS`, `CORES_TOP`, `PROFILE_COLORS`, `CORES`, seed | `src/lib/chartPalette.js` (espelho) | ReportsPanel:16 · RazaoDiarioTab:16 · despesasPorCategoria.js:88 (ver dúvida D4) · SettingsPanel:24 · TiposDocumentoPanel:9 · AppContext (seed, intocado) |

## 9. Fora de escopo (permanecem como estão)

| Item | Motivo | Onde |
|---|---|---|
| `categoria.color`, `perfil.color`, `tipos_documento.cor` | dado do usuário (→ Fase 3: não é mais usada como cor de TEXTO; ver seção 12) | Header.jsx:70-138 · SettingsPanel:404, 765 · DespesasCategoria:235 · TipoDocumentoBadge |
| seed de categorias, defaults `#6366f1` | dado | AppContext.jsx · db.js · supabase.js · schema.sql |
| fallbacks de tipo de documento (`#8b5cf6`, `#14b8a6`, `#64748b`) | equivalem a dado | lib/tiposDocumento.js:20-22 · SchedulePanel.jsx:2493-2494 |
| cores do Excel (ARGB) | regra 3 | DemonstrativoFinanceiro.jsx:250-270 |
| `bg-white` em bolinha de toggle e barra de progresso, `bg-white/10…/30` no card de conta | sobre fundo colorido | AccountsPanel (18) · DemonstrativoFinanceiro (4) · TransactionForm (4) · FluxoCaixaPorConta (3) |
| `fill="currentColor"` / `stroke="currentColor"` | herda o token do pai | CategorySelect · AccountsPanel |
| `theme-color` e manifest | Fase 1 | index.html:8 · vite.config.js:18-19 |

## 10. Decisões D1–D10 (Fase 0, aprovadas)

| # | Decisão |
|---|---|
| D1 | Token `borda-campo` (#6A7282 escuro / #858F9E claro) SÓ em borda de input, select, textarea e DateInput (`border-borda-campo`, foco `border-primary`). `borda-forte` fica para bordas decorativas. |
| D2 | Tokens `primary-hover` (#0B5C47) e `perigo-solido-hover` (#8A2424), iguais nos dois temas, texto branco. Substituem `#0b5c47`, `#0c5a47` e `#8a2424`. |
| D3 | "Excluir ambos" é confirmação dentro do modal → `bg-perigo-solido text-white`. `perigo-bg` + `text-perigo` só nos botões que ABREM a ação ("Excluir em massa", "Fechar Fatura"). |
| D4 | `chartPalette.js` só espelha `CORES_TOP`; `despesasPorCategoria.js` fica intocado. |
| D5 | Cards de Contas: a regra de quais cards ficam azuis não muda, só o valor (`bg-destaque`). Texto `opacity-50/60/70` sobre destaque → `text-white/80`. Borda e selo `#185FA5` mantidos. Gradientes emerald/purple/amber/teal/rose: exceção literal; só subir opacidade de texto < 4,5:1. |
| D6 | Sem token `info`. Links, item selecionado, "Conciliar" → `text-primary-fg` (fundo tingido `bg-primary/15`). Badges informativos ("Confirmado", "agendamento"…) → `bg-surface-2 text-texto-2 border-borda-forte`, mantendo o ícone. Azul reservado para receita. |
| D7 | Cartão de saldo do Início mobile: exceção literal, igual nos dois temas. |
| D8 | Âmbar de realce neutro (caixa "série de parcelas", badge "Patrimonial", círculos de repetição) → `bg-surface-2 border-borda-forte text-texto-2`, mantendo os ícones. |
| D9 | "Provisório" (FluxoMobileLista.jsx:114 e equivalente no CashFlowPanel) e o card "Simulação" do Fluxo Futuro → neutro `border-dashed border-borda-forte` + rótulo "provisório"/"simulação" em `text-texto-2`. Não usar reserva. |
| D10 | `PatrimonioEditavel.jsx`: mostrar o diff e esperar aprovação antes de aplicar. |

## 11. Regras gerais acrescentadas (Grupos 3–4)

| Regra | Aplicação |
|---|---|
| **Simulação, provisório e data alterada = tracejado neutro; aviso só para o que pede atenção.** | Selos: `outline-dashed outline-1 -outline-offset-1 outline-borda-forte text-texto-2` (não ocupa espaço). Datas alteradas/provisórias: `underline decoration-dashed decoration-borda-campo underline-offset-2` em `text-texto-1/2`, mantendo o ícone existente. Cards/linhas: `border-dashed border-borda-forte`. Bloqueios e impedimentos continuam em `aviso`. |
| Sinal "−" (tipográfico, `fmtSinal`) só fora de tabelas; dentro de tabelas mantém o hífen do `fmt`. | Decisão do usuário (Grupo 3, resposta 1). |
| Botão neutro "bs" sem borda original: contorno interno `ring-1 ring-inset ring-borda-forte`. | Não altera tamanho (Pular, Pular selecionados). |
| Cards de Contas: degradês emerald/amber/teal começam em -700; texto secundário em branco puro nesses três tipos (`txtSec`). | Grupo 3, resposta 2; Grupo 4, resposta 1. |

## 12. Decisões das Fases 3 e 4

| # | Decisão |
|---|---|
| F3.1 | Gráficos leem cores de `useThemeColors()` (eixo/ticks `chartEixo`, grade `chartGrade`, tooltip `surface` + `bordaForte` + `texto1/texto2`, legenda `texto2`) e trocam com o tema efetivo, inclusive ao cruzar o breakpoint. Receita/despesa nos tokens; linha de saldo do Fluxo e área do PL em `receita`; zero tracejado em `chartEixo`. |
| F3.2 | `src/lib/chartPalette.js`: `PALETA_GRAFICO` (escuro/claro, 8 cores, testada para deuteranopia — vizinhas ΔE ≥ 40 / ≥ 32, ΔL* ≥ 14 / ≥ 17, contraste ≥ 3:1 com o card), `corSerie(tema, i)`, `estiloTooltip(cor)`, espelho de `CORES_TOP`/`COR_OUTRAS`/`COR_SEM_CATEGORIA` (D4) e as paletas de ESCOLHA `CORES_PERFIL` (8) e `CORES_TIPO_DOCUMENTO` (12), sem variante por tema e com as mesmas cores e quantidade de antes. |
| F3.3 | Pizza "Maiores despesas" continua com `corDaCategoria` (mesma cor da categoria no ranking e nas listas); só tooltip e borda de seleção nos tokens. |
| F3.4 | Pizza de Relatórios: rótulo a partir de 5% (o código comparava `percent > 5` com valor 0–1 e nunca mostrava); desktop nome + %, mobile só % (o ranking abaixo tem nome + % na mesma ordem/cor). |
| F3.5 | Patrimônio: com PL igual ao centavo nos 6 meses, o eixo Y ganha folga de 10% (mantendo o zero) — corrige o aviso de key duplicada do Recharts. Só apresentação. |
| F3.6 | Cor de dado nunca é cor de TEXTO: `TipoDocumentoBadge` = `bg-surface-2 text-texto-1 border-borda-forte` + filete interno `box-shadow: inset 2px 0 0 <cor>` (mesmo tamanho); ícone de perfil no Header em `text-texto-2` (a cor do perfil fica na borda que já existia / filete `inset 3px` no item do menu); chip do perfil ativo e avatar em Configurações = `bg-surface-2` + `ring-2 ring-inset` na cor do perfil, texto/ícone `texto-1`. |
| F3.7 | `chart-grade` escuro #1F2937 → #303B55 (1,39:1 sobre surface). Claro inalterado. |
| F4.1 | Ponte temporária removida. Todos os `text-white` restantes estão sobre fundo colorido (no próprio elemento ou no pai). |
| F4.2 | Selo com texto no token sobre fundo do mesmo token a 10–20% (`bg-despesa/15 text-despesa` etc.) precisa de ≥ 4,5:1 até /20 sobre page/surface/surface-2. Para isso, tokens do CLARO escurecidos (mesmo matiz, ΔE 1–8): primary-fg #0B6A52→#0A664F, receita #1D5BA6→#1C58A1, despesa #A8461C→#953D18, reserva #5B48C2→#5845BC, transferencia #5F5C55→#5C5952, ambar #97590A→#824C07, aviso #8A5300→#804D00, perigo #B42323→#A62020; ESCURO: perigo #FF8080→#FF8E8E. |
| F4.3 | Trilho de toggle desligado `bg-borda-forte`/`bg-surface-hover` → `bg-borda-campo` (≥ 3:1 sobre card nos dois temas; bolinha branca sobre o trilho 4,84 / 3,27). |
| F4.4 | ConsultaCard ativo: `bg-primary/15` → `/10`; selo "padrão" dentro do card ativo em `bg-surface`. Selo "G" do Agendamentos: `bg-reserva/20` → `/15`. |

## 13. Tokens — valores finais

| Token | Escuro | Claro |
|---|---|---|
| page / surface / surface-2 / surface-hover | #030712 / #1A2438 / #1E2939 / #212C45 | #EEF1F6 / #FFFFFF / #F5F7FB / #E8EDF5 |
| borda / borda-forte / borda-campo / input | #1E2939 / #364153 / #6A7282 / #1E2939 | #D5DCE6 / #C5CDD8 / #858F9E / #FFFFFF |
| overlay | rgb(0 0 0 / .6) | rgb(15 23 42 / .45) |
| texto-1 / texto-2 / texto-3 | #F3F4F6 / #C8CED8 / #9AA3B5 | #111827 / #374151 / #5B6474 |
| primary / primary-hover / primary-fg | #0F6E56 / #0B5C47 / #3CC29B | #0F6E56 / #0B5C47 / #0A664F |
| ambar / aviso | #FBBF24 / #FCD34D | #824C07 / #804D00 |
| receita / despesa / reserva / reserva-bg / transferencia | #85B7EB / #F0997B / #AFA9EC / #2B2E55 / #B4B2A9 | #1C58A1 / #953D18 / #5845BC / #ECEAFB / #5C5952 |
| perigo / perigo-bg / perigo-solido (+hover) | #FF8E8E / #3B1D27 / #A32D2D (#8A2424) | #A62020 / #FDECEC / igual |
| destaque | #1D4ED8 | igual |
| chart-eixo / chart-grade | #9AA3B5 / #303B55 | #5B6474 / #E2E8F0 |

## 14. Exceções finais (cor literal mantida de propósito)

| Onde | O quê | Por quê |
|---|---|---|
| AccountsPanel.jsx:47-51, 264 | degradês dos cards de conta por tipo (emerald/purple/amber/teal/rose/cinza) + `text-white`, `bg-white/10–20`, selos `FC/INV/CC` (`*-500/30` + `*-200`), linhas de saldo `text-purple/sky/amber-200`, status de fatura `*-50` | cor do tipo de conta, igual nos dois temas (D5, regra 11) — ver pendência sobre purple/rose |
| AccountsPanel.jsx:320, 331 | `#185FA5` (borda e selo "Próxima fatura") | D5 / X9 |
| AccountsPanel.jsx:337 | estrela `text-yellow-300` no card | X3 |
| InicioMobile.jsx:121-135 | degradê `#0E6B4E → #0B5740`, `text-white/80` | D7 |
| MobileShell.jsx:110 | sombra do FAB `rgba(14,107,78,.45)` | sombra, não cor de interface |
| index.css (faixa safe-area) | `#111827` na faixa do iOS no claro | X10 / status bar black-translucent |
| useTheme.js | `THEME_COLOR` e `FALLBACK` (cópias dos tokens para meta theme-color e para gráficos antes do CSS carregar) | precisa do valor literal |
| chartPalette.js / despesasPorCategoria.js | paletas de gráfico e de escolha | F3.2 / D4 |
| tiposDocumento.js:20-22, SchedulePanel.jsx:2493-2494, db.js, supabase.js, SettingsPanel `#6366f1`, `input type=color` | cores que são DADO (fallbacks e defaults gravados) | regra 3 |
| AppContext.jsx (seed) e Excel (ARGB em DemonstrativoFinanceiro) | dado / exportação | regra 3 |
| `bg-white` (bolinha de toggle, barra de progresso no card) | sobre fundo colorido | — |
| src/dev/modoDev.js | faixa "MODO DEV" | só em desenvolvimento, fora do build |
