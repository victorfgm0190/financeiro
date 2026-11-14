# Inventário de relatórios, extratos e exportações do Finup

Levantamento de 14/11/2026, feito sobre o código da `homologacao` depois do commit `6fe876c`. Nada foi
renomeado aqui: o documento serve para decidir nomes e organização. Só valem os nomes já aprovados
nas Partes 1 e 2: Extrato da Fatura, Relatório Gerencial da Fatura e Fluxo de Caixa da Reserva.

**Siglas**
- **pTx**: lançamentos do perfil ativo (`profileTransactions`).
- **pRTx**: o pTx com o rateio aberto em uma linha por categoria e a transferência entre perfis
  virando receita ou despesa (`profileReportTransactions`).
- **pSch**: agendamentos do perfil ativo.
- **Excel padrão**: `lib/exportExcel` (logo, nome e frase do ambiente, perfil, cores, fórmulas).
- **CSV padrão**: `lib/csvFinup` + `entregarArquivo` (separador `;`, vírgula decimal, mensagem se der erro).

## 1. Menu Relatórios (`components/Reports/ReportsPanel.jsx`)

| # | Nome / descrição | Componente · fonte | Filtra | Soma | Controle gerencial | Exportação |
|---|---|---|---|---|---|---|
| A1 | **Demonstrativo Financeiro**: "Relatório hierárquico por categoria…" | `Reports/DemonstrativoFinanceiro.jsx` · pRTx | Data do lançamento (De/Até, atalhos pelo início do mês financeiro); contas (a transferência entra se a origem ou o destino estiver marcado); categorias; perfil | Só realizados. Receitas e despesas pela `regraDosConjuntos`; resgate abate a despesa (modo líquido); bloco de Reservas Feitas/Utilizadas; parcela de bem em grupo próprio | Não usa | Excel padrão ✔. CSV **feito à mão**: sem mensagem de erro, sem compartilhar no celular, número com milhar, não traz o bloco de reservas |
| A2 | **Relatório por Favorecido**: "Análise sintética e analítica por favorecido…" | `Reports/RelatorioPorFavorecido.jsx` · **pTx** | Data, contas, nome | Receitas e despesas realizadas por favorecido (transferências fora) | Não usa | Excel padrão ✔. Dois CSVs feitos à mão: ponto decimal, data ISO, sem mensagem de erro, categoria sem rateio |
| A3 | **Fluxo de Caixa por Conta**: "Movimentações e saldo acumulado por conta…" | `Reports/FluxoCaixaPorConta.jsx` → `computeFluxoCaixa` (o mesmo da tela Fluxo de Caixa) · pTx, pSch | Conta, grupo ou contas principais; De/Até (padrão: hoje a +30 dias); com ou sem agendamentos; ocultar reserva/patrimônio | Saldo real + lançamentos + ocorrências agendadas (data e valor efetivos) + envelopes + provisórios + etapa A projetada | Projeta a etapa A pelo grupo gravado (não olha a chave) | Excel padrão ✔. Sem CSV |
| A4 | **Bens e investimentos — saídas por mês** | `Reports/RelatorioBens.jsx` → `/api/bem/extrato` | Período, perfil próprio, bem | Saídas de caixa (principal + juros); terceiros e devoluções fora do total | Não usa | Excel padrão ✔ |
| A5 | **Rendimentos de aluguel** (só com contrato a receber) | `Reports/RelatorioRendimentos.jsx` → `lib/contratos/rendimentos` | Contrato, ano, referência (pagamento, competência, repasse) | Bruto, deduções, base, repasses, conferência com o informe | Não usa | Excel padrão ✔. Usa lançamentos e agendamentos **sem filtro de perfil** (só os contratos são filtrados) |
| A6 | **Fluxo de Caixa da Reserva** (novo) | `Reservas/ExtratoReservaModal.jsx` em página · `Reservas/dadosExtratoReserva.js` | Função ou "Todas as funções"; período de meses (a partir do período aberto) | Saldo de hoje + realizados + previstos dos agendamentos; subtotal por mês e por função | Não usa | Excel padrão ✔ e CSV padrão ✔. O nome do arquivo leva o mês de hoje, não o período |
| A7 | **Extrato da Fatura** (novo) | `CreditCard/ExtratoFatura.jsx` → `lib/faturaCartao` · pTx, pSch | Cartão; fatura por competência (`fatura_ref`) | Compras − estornos; pagamento anterior e previstos à parte | Não usa | Excel padrão ✔ e CSV padrão ✔ |
| A8 | **Relatório Gerencial da Fatura** / **Relatório da Fatura** (chave desligada) | `CreditCard/RelatorioFatura.jsx` → `lib/faturaCartao` | Cartão e fatura por competência; filtro por card | Ligada: cards por grupo + Sem grupo + Estornos (aviso se não fechar). Desligada: cards por categoria | Troca nome, cards, coluna e abas conforme a chave | Excel padrão ✔ (Fatura + Resumo) e CSV padrão ✔ |
| A9 | **Média Receitas / Despesas / Saldo (6m)** | `ReportsPanel` · pRTx, `totaisDoDemonstrativo` | Últimos 6 meses **de calendário**, contando o mês atual incompleto | Soma ÷ 6, pela Regra do valor | Não usa | — |
| A10 | **Evolução dos Últimos 6 Meses** (gráfico) | igual ao A9 | igual ao A9 | Receitas × despesas por mês | Não usa | — |
| A11 | **Despesas por Categoria** (pizza) e **Ranking de Despesas** | `ReportsPanel` · pRTx | Um dos 6 meses; Despesa real / Valor pago | Top 10 categorias (`countsAsReportExpense`); **não segue** a Regra do valor do A9/A10 | Não usa | — |

## 2. Cartão de Crédito (`CreditCardPanel.jsx`)

| Botão | Abre | Observação |
|---|---|---|
| **Extrato da Fatura** | O mesmo componente do A7, na fatura da tela | — |
| **Relatório Gerencial** / **Relatório da Fatura** | O mesmo componente do A8, na fatura da tela | O botão diz "Relatório Gerencial"; o card do menu diz "Relatório Gerencial **da Fatura**" |
| Aba **Extrato gerencial por data** (dentro do A8, só com a chave ligada) | `CreditCard/ExtratoGerencial.jsx` (título na tela: "Extrato Gerencial") | Ver os problemas 24 e 18 |

## 3. Contas e Lançamentos

| Item | Onde | Fonte · filtro · soma | Exportação |
|---|---|---|---|
| **Extrato da conta** (`Accounts/ExtratoContaPanel.jsx`) | Contas › card da conta; Lançamentos › conta | Todos os lançamentos da conta no mês (por data); só realizados, inclusive os de data futura, com selo | **Só a conta gerencial tem Excel** (padrão ✔). Conta comum não exporta |
| Totalizador de faturas da conta gerencial | Barra do extrato | Provisões recebidas, resgates feitos e agendamentos gerenciais pendentes | — |
| Botão "Conciliar Gerenciais" | Extrato, no computador | — | Aparece mesmo com o controle gerencial desligado |

## 4. Reservas (`ReservasPanel.jsx`)

| Aba / item | Filtra | Soma | Exportação |
|---|---|---|---|
| Contas Reserva › "Ver Extrato →" | Cards pelo período da reserva; **a lista não tem filtro de data** | Só transferências | Nenhuma |
| Resumo › Exportar Excel | Funções do perfil | Saldo inicial, entradas, saídas, saldo, saldo atualizado | Excel padrão ✔ |
| Fluxo Futuro › Exportar Excel | Meses do período | Depósito, resgate e saldo por mês e função; TOTAL GERAL | Excel padrão ✔ |
| Fluxo Futuro › nome da função / TOTAL GERAL | Abre o mesmo componente do A6, em janela | igual ao A6 | Excel ✔ e CSV ✔ |
| Razão Diário (`RazaoDiarioTab.jsx` → `/api/reserve-daily-ledger`) | Últimos 120 dias, mês, funções do perfil | Entrada, saída, ajuste, acumulado, saldo real, divergência | Excel padrão ✔ |
| Histórico | Fechamentos das viradas | — | Nenhuma |

## 5. Outras exportações

| Item | Onde | Detalhes | Formato |
|---|---|---|---|
| Agendamentos › Exportar Excel | Todas as abas (Agendamentos, Cartão de Crédito, **Gerencial**, Contas Anuais) | O que a lista mostra, com os filtros | Excel padrão ✔. A aba "Gerencial" aparece mesmo com a chave desligada |
| Agenda no celular (.ics) | Configurações › Geral e menu do usuário · `/api/agenda` | Agendamentos pendentes (−30 dias a +12 meses) e faturas em aberto, de todos os perfis permitidos | .ics |
| Gerar Excel para preencher | Importar lançamentos | Modelo .xlsx com listas de categorias e favorecidos (layout próprio) | Sem mensagem se der erro |
| Exportar backup completo | Configurações › Dados › Backup · `/api/backup` | Só para o administrador | JSON ✔ |
| Baixar pendências | Janela de Sincronização | Fila sem internet | JSON |

Telas de análise **sem exportação** que se sobrepõem aos relatórios:
- **Fluxo de Caixa** (mesmo motor do A3).
- **Painel**:
  - "Receitas vs Despesas — últimos 6 meses" (calculado por **outra função**, `totaisDoPeriodo`).
  - "Ranking por Categoria", que segue o modo líquido/bruto (o A11 não segue).
  - "Maiores Despesas", "Top 5 Favorecidos" e "Uso da Receita".
- **Celular**: "Maiores despesas".
- **Patrimônio**: "Resumo do bem" (mesma leitura do A4).
- **Admin da plataforma**: Análise do Cliente e Consumo IA.

Não há geração de PDF nem impressão em nenhum lugar.

**Código sem uso:** `components/Dashboard/PosicaoFinanceiraModal.jsx`, uma posição financeira das
contas principais com agendamentos, não é importado por nenhum arquivo.

## 6. Problemas encontrados

**Sobreposições**
1. A6 e Reservas › Fluxo Futuro abrem o mesmo componente, com dois nomes: "Fluxo de Caixa da Reserva"
   e "Extrato da função" (o título do Excel diz "Extrato da função").
2. A3 e a tela Fluxo de Caixa usam o mesmo motor; só o A3 exporta.
3. Três visões da fatura: Extrato da Fatura e Relatório (por competência) e Extrato gerencial por data
   (por data da compra). Para a "mesma fatura", os números podem não bater.
4. O gráfico de 6 meses do Painel e o A10 usam funções de cálculo diferentes; o ranking do Painel e o
   A11 também seguem regras diferentes.
5. "Top 5 Favorecidos" (Painel) e A2 mostram a mesma informação em dois lugares.

**Nomes e descrições**
6. "Média (6m)" usa mês de calendário e conta o mês atual incompleto. O Demonstrativo usa o início do
   mês financeiro.
7. A ajuda do Favorecido diz que o "CSV Analítico" traz os totais, mas ele traz só os lançamentos.
8. O card "Rendimentos de aluguel" não tem texto na ajuda da tela Relatórios.
9. O título "Extrato Gerencial" dentro da aba "Extrato gerencial por data" repete a ideia com outro nome.
10. O botão do cartão diz "Relatório Gerencial" e o card do menu diz "Relatório Gerencial da Fatura".

**Exportação fora do padrão**
11. Os CSVs do Demonstrativo e do Favorecido são feitos à mão: sem mensagem de erro, sem compartilhar
    no celular e com formato de número diferente entre si.
12. "Gerar Excel para preencher" não mostra mensagem se falhar.
13. **Extrato de conta comum não exporta** (só a conta gerencial).
14. O Extrato gerencial por data não exporta. Os botões Exportar do Relatório, visíveis acima da aba,
    exportam a fatura, não esse extrato.
15. Os nomes de arquivo variam: o CSV do A8 sai sempre como "Relatorio-Fatura", o Excel como
    "Relatorio-Gerencial-Fatura", e o A6 leva o mês de hoje em vez do período.

**"Gerencial" visível com o controle gerencial desligado**
16. A aba "Gerencial" em Agendamentos (e "Aba: Gerencial" no Excel).
17. O botão "Conciliar Gerenciais" no extrato da conta.
18. O selo "Gerencial" e o Excel das subcontas "Ger." (dependem do dado gravado, não da chave).
    O cartão e os cards A7/A8 já trocam o nome corretamente.

**Inconsistências de dados**
19. O Extrato gerencial por data usa lançamentos e cartões **de todos os perfis**, inclusive cartões
    inativos, e filtra por data em vez de `fatura_ref`. Isso vai contra a regra "Cartão: filtrar por
    fatura_ref" do projeto. Foi mantido igual porque a Parte 1 pedia só mudar o lugar.
20. A8 com a chave desligada: os cards por categoria usam a categoria do lançamento, sem rateio, mas a
    tabela e o Excel mostram o rateio.
21. Os cards A7/A8 aparecem se existir qualquer cartão, mesmo inativo, mas o seletor só lista os ativos.
22. Fontes diferentes entre relatórios irmãos: A1 e A11 usam pRTx (rateio aberto); A2 usa pTx; A5 usa
    lançamentos sem filtro de perfil.

**Nada fixo de cliente** na lógica nem nos textos de tela dos relatórios. Só há exemplos em
comentários de código (ex.: "CA", "Pharma"). A identidade do Excel vem da configuração do ambiente.

## 7. Proposta de nomes (para aprovar; nada aplicado)

| Hoje | Proposta | Por quê |
|---|---|---|
| Demonstrativo Financeiro | **Resultado por Categoria** | Diz o que mostra: receitas − despesas por categoria no período. "Demonstrativo" é termo contábil |
| Relatório por Favorecido | **Movimentação por Favorecido** | Mostra quanto entrou e saiu de cada pessoa ou empresa, não um "relatório" genérico |
| Fluxo de Caixa por Conta | **Extrato e Fluxo de Caixa por Conta** | É um extrato com saldo acumulado que também projeta os agendamentos. Resolve a falta de extrato exportável de conta comum (problema 13) |
| Bens e investimentos — saídas por mês | **Patrimônio — Pagamentos por Mês** | Usa o nome do menu (Patrimônio) e a palavra do usuário (pagamentos) |
| Rendimentos de aluguel | **Aluguéis — Rendimentos e Repasses** | Mostra também repasses e a conferência com o informe |
| Extrato da Fatura | (mantém) | Já aprovado |
| Relatório Gerencial da Fatura / Relatório da Fatura | (mantém); o botão do cartão passa a dizer "Relatório Gerencial **da Fatura**" | Mesmo nome nos dois lugares (problema 10) |
| Fluxo de Caixa da Reserva / "Extrato da função" | **Fluxo de Caixa da Reserva** nos dois lugares (título da janela e do Excel) | Um nome só (problema 1) |
| Extrato gerencial por data (título "Extrato Gerencial") | **Movimentos do Cartão por Data** | Deixa claro que é por data da compra, não por fatura, e não depende do controle gerencial no nome |
| Média Receitas/Despesas/Saldo (6m) | **Média Mensal (últimos 6 meses)** | Explicar no (i) se conta ou não o mês atual (problema 6) |
| Evolução dos Últimos 6 Meses | (mantém) | Claro |
| Despesas por Categoria + Ranking de Despesas | **Despesas do Mês por Categoria** (pizza + ranking num bloco só) | São a mesma informação em dois formatos |

**Organização sugerida do menu Relatórios**
- **Resultado**: Resultado por Categoria · Média Mensal · Evolução dos Últimos 6 Meses · Despesas do
  Mês por Categoria · Movimentação por Favorecido
- **Contas e Caixa**: Extrato e Fluxo de Caixa por Conta
- **Cartão de Crédito**: Extrato da Fatura · Relatório Gerencial da Fatura
- **Reservas**: Fluxo de Caixa da Reserva
- **Patrimônio e Aluguéis**: Patrimônio — Pagamentos por Mês · Aluguéis — Rendimentos e Repasses

**Correções sugeridas** (cada uma pequena; só com o seu OK):
- CSV padrão no Demonstrativo e no Favorecido.
- Excel no extrato de conta comum.
- Ocultar "Gerencial" e "Conciliar Gerenciais" com a chave desligada.
- Extrato gerencial por data com perfil, só cartões ativos e exportação.
- Cards por categoria com rateio (A8).
- Nome do arquivo do A6 com o período.
- Card do cartão só com cartão ativo.
- Apagar `PosicaoFinanceiraModal.jsx`.
