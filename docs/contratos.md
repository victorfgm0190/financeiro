# Módulo de Contratos

Contratos de aluguel (e serviço) ligados aos agendamentos. O plano completo está no doc "FINUP — Plano do módulo de Contratos".

## Como funciona

- **As parcelas são agendamentos.** Não existe uma tabela própria de parcelas.
  - Cada parcela é um agendamento `'once'`, identificado por `contrato_id` + `contrato_papel`.
  - O id é determinístico: `ctr_<contrato>_<papel>_<AAAAMM>`.
  - As parcelas são gravadas pelo `/api/sync`, como qualquer agendamento.
- **A ficha do contrato não passa pelo `/api/sync` genérico.** As tabelas `contratos`, `contrato_itens`, `contrato_eventos` e `indices_cache` são lidas e gravadas por rotas dedicadas:
  - `api/contratos.js`
  - `api/contrato-itens.js`
  - `api/contrato-eventos.js`
  - `api/indices.js`
- **Lógica pura** (com testes) em `src/lib/contratos/`:
  - `parcelas.js`: plano, reajuste, sincronização e confirmação de reajuste.
  - `vinculo.js`: candidatos a vínculo e plano de vínculo e desvínculo.
- **Estado e ações** ficam em `src/hooks/useContratos.js`, exposto pelo `useApp()`. A interface fica em `src/components/Contratos/`.
- **Plano do ambiente.** O módulo está ligado quando `ambientes.modulos.contratos` é `true` no `finup_central`.
  - Essa informação vai no token, para a interface.
  - A API confere o valor do central a cada requisição (`MODULOS_DE_PLANO` em `src/lib/permissoes.js`).
  - Depois de ligar o módulo para um ambiente, o usuário precisa entrar de novo para ver o menu.

## Regras

- **Parcela paga nunca muda.** Reajuste, aditivo, renovação e rescisão só mexem nas pendentes. Uma pendente com valor editado à mão (valor diferente da composição) também não é sobrescrita.
- **Reajuste.** Acontece nos aniversários de 12 meses (ou no mês-base, nunca antes de 1 ano).
  - As parcelas depois de um aniversário ficam como `valor_status = 'projetado'` (último valor confirmado × acumulado de 12 meses) até alguém confirmar.
  - "Confirmar reajuste" com escopo "Sim" vale para o ciclo inteiro e reprojeta os ciclos seguintes. Com "Não", vale só para aquela parcela.
- **Vínculo (D2).** A série existente mantém o histórico e recebe o `contrato_id`.
  - Se tem ocorrências consumidas, vira parcelada com total igual ao número delas.
  - Sem nenhuma consumida, vira a parcela única da próxima ocorrência.
  - O contrato não gera parcelas nos meses que a série já cobre.
- **Exclusão de parcela.** Passa pelo modal do contrato. A parcela excluída é registrada em evento `edicao_parcela` e não volta quando as parcelas são geradas de novo.
- **Contrato sem data de fim.** Ao abrir o app, as parcelas são estendidas até 12 meses à frente, só criando competências depois da última que já existe.
- **Manutenção ao abrir o app** (contrato ativo): a descrição das pendentes segue o contrato e, com o índice conhecido, as parcelas ainda PROJETADAS são recalculadas. Parcela projetada sem índice fica no valor anterior (0%) e guarda `composicao.projecao.taxa_pct = null`.
- **Índices.** O SGS do Banco Central é consultado por intervalo de datas (30 meses). O `ultimos/N` aceita no máximo 20 valores e, acima disso, responde HTTP 200 com `{"erro":{}}`.
- **Edição de parcela de contrato.** Frequência, ocorrência e data-base (competência) ficam travadas. O vencimento muda pela exceção da ocorrência (`overrides[data-base].date`).
- **Conta do contrato.** Só conta corrente comum; cartão de crédito fica de fora nesta 1ª versão.

## Entrega 2 — pagamento, condomínio e créditos

- **Gancho de efetivação (P5).** `registerScheduleOccurrence`, `markScheduleRegistered` (baixa que aponta um lançamento pago ou importado), `baixarCobrancaRecorrente` e o auto-registro chamam `posEfetivacaoRef` → `useContratos.notificarEfetivacao`.
  - Uma fila é processada quando o estado já tem a baixa e o lançamento.
  - A decisão é pura: `src/lib/contratos/efetivacao.js`.
  - As perguntas aparecem no `ContratoEfetivacaoHost` (composição do boleto; "aplicar às próximas do ciclo?").
  - `baixarComoJaNoCartao` não dispara: contrato não aceita cartão.
- **Estorno/exclusão.** `reverseTransaction` e `deleteTransaction` chamam `reverterEfetivacaoRef`. O crédito compensado volta a aberto; o gerado (se ainda aberto) sai; um evento é registrado.
- **Composição do boleto** (`ComposicaoBoletoModal`): digitar, colar texto (`parsearTextoBoleto`) ou foto/print/PDF lidos pelo Assistente (`imagemBoleto.js`).
  - Regras em `contrato_regras_itens`: a do contrato vence a global, "começa com" vence "contém".
  - A soma dos itens tem de ser igual ao valor pago.
  - "Pular" usa a composição estimada, marcada para revisar.
- **Créditos do proprietário** (`contrato_creditos`): só controle, nunca lançamento.
  - Cada crédito aberto abate no PRÓXIMO ALUGUEL PENDENTE com vencimento ≥ data do crédito (`src/lib/contratos/creditos.js`).
  - "Não abater neste mês" adia o abatimento (`composicao.creditos_adiados`).
- **Relatórios.** "Despesa real / Valor pago" (`src/lib/contratos/despesaReal.js`) no relatório por categoria e no Orçado×Realizado. A pizza do Painel segue em valor pago.
- **Edição de parcela de contrato.** Usa a regra de registros separados (como a parcela de financiamento) e registra o evento `edicao_parcela`.
- **Regras globais iniciais.** Vêm do kit básico (clientes novos) e de `sql/contratos_entrega2.sql` (bancos existentes).

## Composição do boleto em parcela ABERTA (04/11/2026)

- **Onde:** ficha do contrato ("Informar composição" na parcela pendente de condomínio), Agendamentos (botão "Informar composição"/"Composição" na ocorrência pendente ou paga — no celular, no detalhe da ocorrência) e chat do Assistente (boleto que corresponde a uma parcela aberta). Todas abrem o MESMO `ComposicaoBoletoModal` pelo `ComposicaoParcelaHost` (`abrirComposicaoParcela`).
- **Parcela aberta** (`useContratos.informarComposicaoAberta`, regras em `src/lib/contratos/composicaoAberta.js`): `schedule.composicao` ganha os itens e `informada: true`; o valor pendente = total do boleto (`valorManual` passa a considerar `informada`, então sincronização e previsão do condomínio não sobrescrevem). As próximas parcelas seguem a regra de sempre (inclusive "Só neste boleto").
- **Crédito previsto:** `contrato_creditos.status = 'previsto'` (migração `2026-11-04_contratos_credito_previsto`), `origem_agendamento_id` = parcela, sem lançamento. Abate no aluguel de destino como os abertos (marcado "(previsto)"); "Não abater neste mês" e "Trocar parcela de destino" valem igual.
- **Pagamento:** valor = total do boleto → a composição vai ao lançamento e o MESMO crédito vira 'aberto' (`substituirCreditoGerado` atualiza no lugar, sem criar outro). Valor diferente → a prévia abre com os itens informados (auto-registro: diferença vira "Diferença/arredondamento" do inquilino).
- **Aluguel pago com crédito previsto:** a confirmação mostra a composição (`ComposicaoParcelaResumo`); o crédito fica 'compensado'; o pagamento do condomínio depois só liga o lançamento (não gera outro).
- **Editar/remover:** recalcula o crédito e o aluguel. Crédito já abatido com valor diferente → pergunta ("manter" ou "complementar" com crédito da diferença). Remover → volta ao condomínio previsto e o crédito previsto sai.
- **Estorno do condomínio:** crédito gerado de parcela informada volta a 'previsto'; já abatido → continua abatido e ligado à parcela, e a tela pergunta se vira crédito avulso. Estorno do aluguel reabre o crédito como 'previsto' se o condomínio de origem ainda não foi pago.
- **Foto/PDF:** `extrairItensDeImagem` → `/api/assistente` com `leitura: 'boleto_condominio'` (ferramenta forçada em `api/_leituraBoleto.js`): só vencimento, total, beneficiário e itens; o responsável vem das regras. Sempre com prévia; o arquivo não é guardado; o consumo vai para `ia_uso` (ferramenta `ler_boleto_condominio`, conta no limite diário com imagem).

## Pendências registradas (não corrigir sem pedido)

- `registerScheduleOccurrence` (`AppContext.jsx`): no resgate com detalhamento por função, o `newTxId` devolvido não corresponde a nenhum lançamento.
- Pagamento de parcela de financiamento pelo Patrimônio (`api/financiamento/parcela/[id]/pagar.js`): marca `registered` só no servidor, sem `registered_meta` e sem atualizar o estado do app.
- (Corrigido em 3031c84) `reverseTransaction` pela data da ocorrência e limpando `registeredMeta`; `deleteTransaction` reabrindo a baixa.

## Encargos, descontos e recibo na parcela principal (05/11/2026)
- **Encargos e descontos recorrentes** (Aditivo / editar → Valores e bonificação → "Encargos e descontos na parcela"): `contrato_itens` com `na_parcela`, `sinal` ('encargo'|'desconto'), `parcelas_total` e `parcela_inicio` (parcela do CONTRATO em que o item está na 1ª dele; 0/negativa = começou antes). Migração `2026-11-05_contratos_encargos.sql`. A lista de contratos traz `encargos`; `gerarPlanoParcelas` aplica `itensEncargos` (`src/lib/contratos/encargos.js`): "Seguro 3/36 +49,06", sai sozinho depois da última, sem reajuste (o reajuste é só do contratual). Contrato em andamento: "na próxima parcela pendente (nº N) está na k de T" → `parcela_inicio = N − k + 1`. Itens previstos antigos (`na_parcela = false`) continuam só registro.
- **Recibo do aluguel** (mesmo `ComposicaoParcelaHost`/`ComposicaoBoletoModal`, papel aluguel → `ComposicaoReciboAluguel`): ficha, Agendamentos (desktop/celular) e Assistente (`parcelaAluguelDoRecibo`). Digitar, colar ou foto/PDF (`/api/assistente` leitura `recibo_aluguel`: débito = +, crédito = −; total/subtotal/"PAGAMENTO EFETUADO" ignorados; tokens em `ia_uso`; arquivo não guardado). `classificarRecibo` reconhece contratual, bonificação e encargos pelo esperado da parcela; valor diferente do recorrente vale só nesta parcela ("Usar nas próximas" muda o encargo); item novo = único ("Tornar recorrente"); desconto parecido com crédito a abater é ligado (pendente: `destino_agendamento_id` = a parcela; paga: compensado no lançamento) ou vira crédito manual já abatido.
- `informarReciboAluguel` (`useContratos`): pendente → valor = total do recibo, `composicao.informada` (substitui a previsão só desta parcela; créditos fora do recibo seguem para a próxima — `destinosCreditos` não usa parcela informada como destino, salvo os créditos que estão no recibo); paga → soma = valor pago, lançamento intocado ("Justificar diferença" some quando explicada).
- Despesa real: base, bonificação, encargos e itens únicos na categoria do contrato; créditos à parte (regra de sempre).

## Contrato a receber por administradora — modo repasse (07/11/2026, Etapa 1)
- **Quando:** contrato de Aluguel **a receber** com "Recebo por uma administradora" (`contratos.modo_repasse`, migração `2026-11-07b_contratos_repasse`). Sem a opção, nada muda (os contratos que já existem ficam com `modo_repasse = false`).
- **Partes:** `favorecido` = a administradora (quem paga o repasse e é o favorecido dos agendamentos); o inquilino é só informação (`contraparte_nome`, `contraparte_documento`). `bem_id` liga, opcionalmente, um bem do Patrimônio.
- **Datas:** competência = mês do aluguel; o recebimento cai no `dia_repasse`, `repasse_meses_depois` meses depois (padrão 1 = mês seguinte). Dia que não existe no mês → último dia. `dia_vencimento` é o vencimento do inquilino (só informação).
- **Parcelas:** uma por competência, sempre mensal, id `ctr_<contrato>_aluguel_<AAAAMM da competência>`, data = dia do repasse, descrição "Repasse aluguel MM/AAAA · …". Como a data é a do repasse, a competência de uma parcela gerada vem do id (`competenciaDaParcela`), nunca da data. Condomínio não vira boleto (vai para a composição do repasse nas próximas etapas).
- **1º mês:** início fora do dia 1 → proporcional `valor / 30 × dias` (do dia do início ao fim do mês, no máximo 30); `valor_primeiro_mes` substitui o calculado.
- **Saldo inicial com a administradora:** `saldo_inicial_adm` (positivo = ela me deve; negativo = eu devo) antes da competência `saldo_inicial_competencia`. Só guardado nesta etapa; o saldo corrente entra na Etapa 3.
- **Banco sem a migração:** a API recusa (409 `banco_desatualizado`) contrato com valor de repasse; a tela recusa antes (`recursos.contratoRepasse`).
- Lógica pura em `src/lib/contratos/repasse.js` (testes em `repasse.test.js`).
