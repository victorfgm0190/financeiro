# Importar Fatura — Etapa 6b: diagnóstico da conferência e proposta de tela nova

12/11/2026 · somente leitura (nenhum código alterado, nada gravado; banco só `SELECT` em transação
`READ ONLY`). Exemplos **fictícios** — nenhuma descrição, valor ou nome real.

Base lida: `src/components/Import/ImportPanel.jsx`, `src/components/Import/RevisaoFatura.jsx`,
`src/components/Import/JaLancadoCelula.jsx`, `src/lib/revisaoImportacao.js`,
`src/lib/casamentoFatura.js`, `src/lib/importacaoCorrespondencias.js`,
`src/lib/linhasFaturaImportada.js`, `src/lib/contagemRevisaoFatura.js`, `src/lib/conciliacaoMatch.js`,
`src/lib/agendamentoManda.js`, `src/lib/scheduleBaixa.js`, `src/mobile/modules.js` e
`docs/importar-fatura-casamento.md`. Nenhuma função protegida foi tocada (nem precisaria: a tela nova
só muda apresentação e as regras de casamento, que moram nas libs acima).

---

## 1. Mapa da tela atual

### 1.1 Duas telas diferentes para o mesmo arquivo

| Tela | Como se chega | Quem decide o casamento |
|---|---|---|
| **Importar** (revisão linha a linha) | carregar o arquivo na aba Importar Fatura | `resolverLinhasRevisao` → `aplicarJaLancados` → `aplicarCorrespondencias` (`ImportPanel.jsx:1751-1764`) |
| **Conciliar Fatura** (3 seções) | botão "Conciliar fatura" | regra própria, mais antiga: descrição sem sufixo de parcela + valor ±R$ 0,50 (`ImportPanel.jsx:3270-3284`) e `crossMatchConciliacao` (`conciliacaoMatch.js:68-92`) |

As duas tratam o mesmo arquivo com **regras diferentes** — a Conciliação não segue a Etapa 6a (ver §2).

### 1.2 Estrutura da tela Importar

1. **Resumo** (4 cartões, `RevisaoFatura.jsx:25-48`): Total do arquivo · Já no Finup · A importar ·
   Precisam de decisão; abaixo, total projetado e linhas desmarcadas.
2. **Conferência da fatura** (recolhível, `RevisaoFatura.jsx:51-121`): diferença arquivo × Finup
   explicada por grupos — "Ainda sem decisão", "Gravado no Finup, ainda não veio no arquivo",
   "Parcelas previstas aguardando lançamento do banco", "Diferença de centavos/valor", "Linhas
   desmarcadas", "Linhas que vão para outra fatura".
3. **Abas** (`contagemRevisaoFatura.js:62-79`): Para importar · Precisam de decisão · Já conciliados ·
   Todos. Abre em "Precisam de decisão" se houver alguma; senão em "Para importar".
4. **Tabela** (7–8 colunas: marcar, data, descrição, parcela, fatura, valor, categoria, grupo,
   status) com um selo de situação por linha e um ícone que abre "detalhes" embaixo.
5. **Rodapé**: "Parcelas já no banco — atualizar?" + "Lançamentos já conciliados com diferença no
   arquivo — só informação" (`RevisaoFatura.jsx:267-358`), parcelas futuras e regras (recolhidos).
6. **Barra fixa** com a contagem e "Confirmar"; antes de gravar, o **Resumo da Importação**
   (`ImportPreviewModal.jsx`) com pendências ("Resolver") — inclusive as cobranças recorrentes com
   valor diferente.

### 1.3 Estados de cada linha (selo da coluna Status — `ImportPanel.jsx:2948-2995`)

| Selo / estado | Quando aparece (regra) | O que oferece | Aba |
|---|---|---|---|
| **Novo** | nada casou | marcar/desmarcar, classificar | Para importar |
| **Novo + ⚠ (aviso parecido)** | novo, mas há lançamento NÃO conciliado da mesma loja, valor ±5%, fatura igual ou vizinha (`importacaoCorrespondencias.js:79-80`) | só texto nos detalhes; entra como novo | Para importar |
| **Novo + ⚠ "Também em MM/AAAA"** | mesmo valor e descrição-base em OUTRA fatura (`revisaoImportacao.js:399-410`) | só texto | Para importar |
| **↩ Estorno herdado** | crédito que herdou a classificação da compra original | classificar | Para importar |
| **Não será importada** | linha desmarcada | marcar de novo | Para importar (fim) |
| **✔ Já existe** | mesmo valor ±0,01, mesma parcela, descrição-base parecida, compra até 3 dias, não conciliado — ou o mesmo exato conciliado (reimportação) (`revisaoImportacao.js:345-371`) | nada (detalhes) | Já conciliados |
| **✔ Já lançado** | à vista/parcela 1: valor ±0,01, data até 3 dias, um único candidato, mesmo com descrição diferente (`casamentoFatura.js:115-132`) | favorecido (manter/da fatura/outro); "Não é este — importar como novo" | Já conciliados |
| **✔ Pré-lançamento** | casou com pré-lançamento pendente do Assistente | importa com a classificação do pré | Para importar |
| **✔ Já existe — valor diferente** | o usuário escolheu um candidato de "Para escolher" com valor/data diferente (`importacaoCorrespondencias.js:94-114`) | favorecido; "Não é este" | Já conciliados |
| **No banco ✓** | parcela da mesma série/chave, mesma fatura, valor ±0,01, sem nada a atualizar | nada | Já conciliados |
| **No banco ↻** | idem, mas a projeção NÃO conciliada difere (descrição, data…) | caixa "atualizar" no rodapé | Já conciliados |
| **Conciliado ✓** | colisão com parcela JÁ conciliada (nunca é alterada) | nada; diferenças só no rodapé | Já conciliados |
| **É o mesmo ↻** | usuário escolheu "É a mesma" numa possível duplicata | "Desfazer" | Já conciliados |
| **⚠ Possível duplicata…** (select) | parcela mesma chave/série com centavos até ±0,50; ou mesma série + mesmo valor + outro número de parcela (`revisaoImportacao.js:373-395`) | "É outra compra — importar" / "É a mesma — atualizar o existente" | Precisam de decisão |
| **⚠ Escolher…** (select / "Para escolher") | candidatos de `casamentoFatura` (parcela ±0,50, parcela N>1 sem série, estimado dólar/IOF) ou de `importacaoCorrespondencias` (nome forte ±5%; à vista mesmo valor 4–7 dias) | "É este: …" (até 3) / "É novo — importar" | Precisam de decisão |
| **IOF agrupado** | linha de IOF = soma dos IOFs estimados (±20%) | nada | Já conciliados |
| **↧ baixa** (selo extra) | casa com ocorrência de agendamento: cartão + valor ±0,05 + fatura (`scheduleBaixa.js:20,55`) | desmarcar / trocar agendamento | — |
| *(morto)* "Parecido — é este?" | rótulo de `_parecido`, que hoje é sempre falso (`RevisaoFatura.jsx:243`, `JaLancadoCelula.jsx:89-92`) | — | — |

Fora da tabela, só na Conferência: **parcela ausente** de fatura aberta ("aguardando o banco",
informativa) e **"gravado no Finup, ainda não veio no arquivo"** (à vista/projeção sem linha). Na tela
Importar nenhuma das duas tem botão de excluir.

### 1.4 Estados da tela Conciliar Fatura

| Seção | Regra | Ações |
|---|---|---|
| Conciliados | descrição sem sufixo de parcela igual + valor ±0,50 + tipo (`ImportPanel.jsx:3270-3279`) | editar o lançamento (`concEditTx`) |
| Só no Itaú | sobrou do arquivo; selo 🔴 Já no sistema / 🟠 Provável / 🟡 Possível (cruzamento ±0,50, similaridade ≥0,5) | Importar / Ignorar |
| Só no sistema | sobrou do Finup na fatura | **Manter / Excluir** (excluir escondido só para parcela de série com cabeçalho "fatura aberta") + "Fatura encerrada" empurra parcelas para o mês seguinte |

**São 17 rótulos de situação diferentes** entre as duas telas (Novo, Já existe, Já lançado,
Pré-lançamento, Já existe — valor diferente, No banco ✓, No banco ↻, Conciliado ✓, É o mesmo ↻,
Possível duplicata, Escolher, Também em, Estorno herdado, Não será importada, 🔴/🟠/🟡 da
Conciliação) — para o usuário, a maioria quer dizer a mesma coisa: "já está no Finup".

---

## 2. Onde a tela atual fere as regras ou confunde

### 2.1 Simulação no teste1 (só leitura)

- **Arquivo real** da última importação do Personalite no teste1 (`card_imports` de 10/11/2026,
  fatura 11/2026, **fatura aberta**, 227 linhas), lido com o parser e as funções da tela
  (`linhasDaFaturaParaRevisao` → `resolverLinhasRevisao` → `aplicarJaLancados` →
  `aplicarCorrespondencias`). Script no scratchpad da sessão (`sim6b.mjs`), não versionado.
- Dois cenários: **A — reimportar hoje** (estado atual do banco) e **B — antes da importação de
  10/11** (sem os 47 lançamentos que ela criou e com a conciliação feita por ela desfeita —
  aproximação: conciliados da fatura atualizados até 15 min depois da importação).

| Grupo (linhas do arquivo) | A — reimportar hoje | B — antes da importação |
|---|---:|---:|
| Já existe (conciliado, silencioso) | 214 | 109 |
| No banco ↻ — parcela já conciliada | 13 | 5 |
| No banco ↻ — atualiza projeção não conciliada | 0 | 3 |
| Já existe (lançado à mão/Assistente, automático) | 0 | 36 |
| Já lançado (automático, descrição pode diferir) | 0 | 41 |
| Novo | 0 | 32 |
| Novo com aviso "parecido" | 0 | 1 |
| Possível duplicata / Para escolher (pedem decisão) | **0** | **0** |
| **Total** | 227 | 227 |

| Conferência (fora da tabela) | A | B |
|---|---:|---:|
| Parcelas aguardando o banco (fatura aberta) | 3 | 3 |
| Gravado no Finup sem linha no arquivo (à vista manual) | 2 | 2 |
| Diferença de valor (centavos) entre par conciliado | 4 | 2 |
| **"Conciliados com diferença no arquivo" (painel do rodapé)** | **186** | **109** |

**Sugestões de "parecido" que violam as regras** (candidato mostrado ao usuário: Para escolher,
Possível duplicata ou aviso de parecido):

| | A | B |
|---|---:|---:|
| Sugestões mostradas | 0 | 1 |
| … com valor diferente | 0 | 1 |
| … de outra série / outro número de parcela | 0 | 1 (linha 1/3 × candidato 2/3, valores diferentes — o aviso não confere a parcela) |
| … com candidato conciliado | 0 | 0 |

Leitura: **nesta fatura** a lógica da 6a não propôs nenhum "parecido" errado na tabela — sobrou um
**aviso** errado. O que pesa para o usuário é outra coisa:
- **186 linhas** no painel "conciliados com diferença" numa simples reimportação — 182 só porque a
  **descrição** do Finup é a escrita pelo usuário ("Padaria") ou sem a cidade, e a do banco é outra
  ("PADARIA EXEMPLO LTDA CIDADEBRA"). Não é diferença real para ninguém; é ruído que esconde as 4
  diferenças de valor.
- **77 casamentos automáticos** (B) sem nada na linha além de "✔ Já lançado"; em **74** a descrição
  do Finup é outra. O usuário não vê, lado a lado, o que foi juntado com o quê.
- Os casos que violam as regras estão no **código** (abaixo) e aparecem em faturas com centavos de
  arredondamento, compras em dólar, preço de assinatura reajustado ou na tela de Conciliação — não
  nesta fatura.

### 2.2 Regras × código

| # | Regra | Situação | Onde |
|---|---|---|---|
| R1 | Conciliado nunca é candidato | **Importar: OK** (`podePerguntar`, `candidatosJaLancado`, `classificarLinhaLivre` excluem conciliados). **Conciliar Fatura: FERE** — a fatura inteira, conciliados inclusive, entra no casamento e no cruzamento 🔴/🟠/🟡 | `ImportPanel.jsx:3160-3170` (`faturaItensSistema` sem filtro de `reconciled`), `conciliacaoMatch.js:68-92` |
| R1b | idem, no aviso "Também em" | **Confunde** — usa qualquer lançamento do cartão, conciliado ou não (é só aviso, mas é um "é este?" disfarçado) | `revisaoImportacao.js:401-408` |
| R2 | Conciliados fora da visão principal | **Parcial** — a aba principal não os mostra, mas o rodapé lista "conciliados com diferença" (186 numa reimportação) e "Parcelas já no banco" fica sempre à vista | `RevisaoFatura.jsx:267-295`, `revisaoImportacao.js:458-466` (descrição conta como diferença) |
| R3 | Conciliado nunca é alterado | **Importar: OK** (`mudancasDaColisao` → vazio). **Conciliar Fatura: FERE** — "Só no sistema" pode **excluir** lançamento conciliado; "Conciliados" permite editar o existente; "Fatura encerrada" empurra parcela (conciliada ou não) para o mês seguinte | `ImportPanel.jsx:3391,3405,3416-3427,3849-3855` |
| R4 | Parcela com n/total diferente = nova; exceção: mesma série + mesmo valor | **Importar: quase** — a exceção aceita também "mesma base da chave" sem série conhecida (`!outraSerie && baseDaChave igual`), então duas compras diferentes da mesma loja, mesmo total e mesmo valor podem virar pergunta. **Conciliar: FERE** — tira o sufixo de parcela e casa 1/5 com 5/8 se a descrição-base e o valor (±0,50) baterem | `revisaoImportacao.js:384-388`; `ImportPanel.jsx:3271-3276`, `conciliacaoMatch.js:79-80` |
| R5 | Valor diferente / outra série nunca proposto como parecido | **FERE em 5 pontos**: (a) possível duplicata com centavos até ±0,50; (b) "Para escolher" de parcela com até ±0,50; (c) "Para escolher" por nome forte com valor ±5%; (d) aviso de parecido ±5% **sem conferir a parcela** (caso real da simulação: 1/3 × 2/3); (e) Conciliar: cruzamento ±0,50. Estimado (dólar/IOF ±15/20%) é caso à parte — ver pergunta 3 | (a) `revisaoImportacao.js:24,325-326`; (b) `casamentoFatura.js:126-127`; (c) `importacaoCorrespondencias.js:73-74`; (d) `importacaoCorrespondencias.js:79-80`; (e) `conciliacaoMatch.js:77` |
| R6 | Parcela ausente em fatura aberta não pode ser excluída (nem as seguintes) | **Importar: OK** (só informa). **Conciliar: FERE** fora do Itaú — a proteção só vale quando o **cabeçalho** do arquivo diz "fatura aberta" (`aguardandoLancamentoDoBanco` com `aberta` = `cabecalhoArquivo?.aberta`); arquivo CSV/Dindin ou cabeçalho não lido → "Excluir" aparece para a parcela ausente | `revisaoImportacao.js:123-125`, `ImportPanel.jsx:1198,3391,3849` |
| R7 | Recorrente com valor diferente: baixa pelo valor do cartão; importado com a classificação do agendamento | **Parcial** — até ±0,05 baixa sozinho; de 0,05 a 0,50 vira pendência "Resolver" no Resumo (baixa pelo valor do cartão ✓, classificação do agendamento ✓). **Acima de ±R$ 0,50** (assinatura reajustada de R$ 39,90 para R$ 44,90) o agendamento **não é reconhecido**: nem baixa, nem classificação | `agendamentoManda.js:25` (±0,50), `scheduleBaixa.js:20`, `ImportPanel.jsx:3097-3100` |
| R8 | Importado / que bateu já fica conciliado | **OK** (`handleImport` grava `reconciled: true`; `idsNoBancoConferidos`) | `revisaoImportacao.js:481-486`, `ImportPanel.jsx:2355-2356` |
| R9 | Data do sistema da parcela = dia 15 do mês anterior à fatura; data do cartão no campo próprio | **OK no cálculo** (`installmentSystemDate` com dia inicial 15 do ambiente). **Confunde na tela**: a coluna mostra só a data do cartão; a do sistema aparece num ponto laranja e num clique | `linhasFaturaImportada.js:62-66`, `RevisaoFatura.jsx:145-171` |
| R10 | Nada específico de cliente | **OK** | — |
| R11 | Computador **e** celular | **FERE** — o módulo "Importar fatura" é só de computador no celular (`place: 'desktop'`); a tabela tem 7–8 colunas | `src/mobile/modules.js:57` |

### 2.3 O que confunde (mesmo quando a regra está certa)

1. **17 rótulos** para 4 situações reais (novo, já está, pede decisão, não entra) — "No banco ✓",
   "No banco ↻", "Conciliado ✓", "Já existe", "Já lançado" querem dizer "já está no Finup".
2. **Decisão num `<select>` estreito** (`DecisaoSelect`, máx. 11rem): o texto do candidato
   ("É este: Loja Fictícia 3/5 · 15/10 · R$ 120,00") fica cortado; não há lado a lado nem destaque do
   que difere (parcela, valor, fatura, categoria, se veio de agendamento).
3. **Possível duplicata × Para escolher** são duas perguntas iguais ("é o mesmo?") com controles
   diferentes.
4. **Termos técnicos**: "colisão", "série", "projeção", "No banco ↻", "fatura vizinha",
   "pré-lançamento", "descrição-base".
5. **O que acontece ao confirmar** não está dito na linha: "É a mesma — atualizar o existente" não diz
   que o número da parcela do Finup muda; "Já lançado" não diz que valor/data/favorecido serão
   trocados.
6. **Conferência da fatura** usa conta de diferença ("efeito na diferença arquivo − Finup") — útil
   para auditoria, difícil para o usuário.
7. **Duas telas** (Importar e Conciliar) com regras diferentes para o mesmo arquivo.

---

## 3. Proposta da tela nova

### 3.1 Princípios

- **Uma pergunta só**: "Esta linha da fatura já está no Finup?" — com três respostas possíveis por
  linha: *já está* (nada a fazer), *é nova* (será importada) ou *preciso que você diga*.
- **Só o que pede decisão fica aberto**; o resto vem recolhido com contador.
- **Lado a lado** em toda pergunta, com as diferenças realçadas.
- **Frase do que acontece ao confirmar** em cada escolha.
- **As regras de casamento passam a ser as da §2.2** (candidato só com mesmo valor ±0,01, mesma
  parcela ou mesma série com outro número, nunca conciliado) — a tela nova não mostra o que a regra
  não permite.
- **Uma tela só** para Importar e Conciliar (a Conciliação vira o mesmo fluxo, ver §5 etapa 6).

### 3.2 Situações (no lugar dos 17 rótulos)

| Grupo na tela | Entra aqui | Aberto? |
|---|---|---|
| **Precisam da sua decisão** | "é este?" (mesma série com outro nº de parcela; mais de um candidato igual; estimado dólar/IOF; recorrente com valor diferente) | **aberto** |
| **Novos — serão importados** | linhas novas, já classificadas | recolhido (abre para revisar categoria) |
| **Já estão no Finup — serão conciliados** | Já existe / Já lançado / parcela da série / IOF agrupado | recolhido; ao abrir, cada item mostra o lado a lado em 1 linha |
| **Já conciliados antes** | reimportação do que já estava conciliado | recolhido e **à parte**; diferenças de **valor ou data** aparecem com ⚠; descrição diferente não conta |
| **Não entram** | desmarcadas | recolhido |
| **Aguardando o banco** | parcelas previstas de fatura aberta sem linha no arquivo | recolhido, só informação, **sem excluir** |

### 3.3 Esboço — computador

```
┌─ Importar fatura · Cartão Exemplo · fatura 11/2026 (aberta, valor parcial) ───────────────────┐
│  227 linhas no arquivo                                                                         │
│  ┌──────────────┐ ┌──────────────────┐ ┌───────────────────┐ ┌──────────────────────────────┐  │
│  │ 32 novos     │ │ 191 já no Finup  │ │ ⚠ 3 pedem decisão │ │ Total do arquivo R$ 9.999,99 │  │
│  │ R$ 1.234,56  │ │ serão conciliados│ │ R$ 456,78 parados │ │ Fatura no Finup após: igual ✓│  │
│  └──────────────┘ └──────────────────┘ └───────────────────┘ └──────────────────────────────┘  │
│                                                                                                │
│  ⚠ PRECISAM DA SUA DECISÃO (3)                                                  1 de 3 ▸       │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │ Esta linha da fatura é um lançamento que já está no Finup?                                │ │
│  │                      NA FATURA (arquivo)            │  NO FINUP (já lançado)              │ │
│  │  Data do cartão      05/10/2026                      │  05/10/2026                          │ │
│  │  Data no sistema     15/10/2026                      │  15/10/2026                          │ │
│  │  Descrição           LOJA FICTICIA CIDADE            │  Loja Fictícia                       │ │
│  │  Valor               R$ 120,00                       │  R$ 120,00                           │ │
│  │  Parcela             3/4                    ◀ difere │  4/4                                 │ │
│  │  Categoria           Vestuário (da série)            │  Vestuário                           │ │
│  │  Conta / fatura      Cartão Exemplo · 11/2026        │  Cartão Exemplo · 11/2026            │ │
│  │  Origem              —                               │  🔁 parcela de série                 │ │
│  │                                                                                           │ │
│  │  💡 Sugestão do Assistente (Etapa 6c): "Parece a mesma compra: mesma loja, mesmo valor,   │ │
│  │     mesma série; só o número da parcela está adiantado no Finup."   [Usar sugestão]       │ │
│  │                                                                                           │ │
│  │  ( ) Sim, é este — o Finup passa a mostrar a parcela 3/4 e fica conciliado.              │ │
│  │  ( ) Não, é outra compra — será importada como nova (R$ 120,00, parcela 3/4).            │ │
│  └───────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                │
│  ▸ Novos — serão importados (32 · R$ 1.234,56)                       [Revisar categorias]     │
│  ▸ Já estão no Finup — serão conciliados (191)                                                 │
│  ▸ Já conciliados antes (0) · ▸ Não entram (0) · ▸ Aguardando o banco (3 parcelas · só info)  │
│                                                                                                │
│ ───────────────────────────────────────────────────────────────────────────────────────────── │
│  32 novos · 191 conciliados · ⚠ 3 sem decisão (ficam de fora)       [Cancelar] [Confirmar]    │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Item de "Já estão no Finup" aberto (uma linha por par, sem tabela larga):

```
  ✔ 05/10  LOJA FICTICIA CIDADE  R$ 45,00  →  no Finup: "Loja Fictícia" · lançado por você · 05/10
    Ao confirmar: fica conciliado; favorecido passa a "Loja Fictícia"  [manter o atual ▾]  [Não é este]
```

### 3.4 Esboço — celular (390 px)

```
┌──────────────────────────────┐
│ Importar fatura      11/2026 │
│ Cartão Exemplo · aberta      │
├──────────────────────────────┤
│ 32 novos      R$ 1.234,56    │
│ 191 já no Finup              │
│ ⚠ 3 pedem decisão            │
├──────────────────────────────┤
│ ⚠ DECISÃO 1 de 3        ◂ ▸  │
│ É o mesmo lançamento?        │
│                              │
│ NA FATURA                    │
│ LOJA FICTICIA CIDADE         │
│ 05/10 · R$ 120,00 · 3/4      │
│                              │
│ NO FINUP                     │
│ Loja Fictícia                │
│ 05/10 · R$ 120,00 · 4/4 ◀    │
│ Vestuário · parcela de série │
│                              │
│ ◀ difere: número da parcela  │
│ 💡 Assistente: "parece a     │
│ mesma compra…" [ver mais]    │
│                              │
│ ┌──────────────────────────┐ │
│ │ Sim, é este              │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Não, é outra — importar  │ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ ▸ Novos (32)                 │
│ ▸ Já no Finup (191)          │
│ ▸ Aguardando o banco (3)     │
├──────────────────────────────┤
│  [   Confirmar importação  ] │
└──────────────────────────────┘
```

No celular: uma decisão por vez (cartão), botões grandes (≥ 44 px), listas recolhidas viram cartões
de uma linha; classificação de categoria abre numa folha de baixo. O arquivo vem do seletor de
arquivos do celular (Downloads / app do banco).

### 3.5 Linguagem

| Hoje | Proposto |
|---|---|
| No banco ✓ / No banco ↻ / Conciliado ✓ / Já existe / Já lançado | **Já está no Finup** (detalhe: "lançado por você", "parcela da série", "importado antes") |
| Possível duplicata / Para escolher / Escolher… | **É este?** |
| É a mesma — atualizar o existente | **Sim, é este** — e a frase do que muda |
| É outra compra — importar / É novo — importar | **Não, é outra — importar** |
| Não será importada | **Não entra** |
| Também em 10/2026 | "Já há um lançamento igual na fatura 10/2026" (só se não conciliado; ver pergunta 5) |
| Gravado no Finup, ainda não veio no arquivo | "Está no Finup e não veio nesta fatura" |
| Parcelas previstas aguardando lançamento do banco | "Parcelas previstas que o banco ainda não lançou (fatura aberta)" |
| colisão, série, projeção, fatura vizinha | não aparecem |

---

## 4. Onde entra a Etapa 6c (Assistente)

**Espaço na tela:** dentro de cada cartão de decisão, entre o lado a lado e as opções (ver 💡 nos
esboços), e na lista de **Novos** uma coluna/linha "Categoria sugerida 💡" com o motivo em uma frase.
Sempre como **sugestão**: o botão "Usar sugestão" só pré-marca; o usuário confirma.

**Dados que a sugestão receberia (por linha), sem nada além do necessário:**

| Dado | Para quê |
|---|---|
| Linha da fatura: descrição do banco, data do cartão, valor, parcela n/total, tipo (compra/estorno), moeda/valor original se houver | entender a compra |
| Candidatos já permitidos pela regra (máx. 3): descrição, data do cartão e do sistema, valor, parcela, categoria, origem (manual, Assistente, série, agendamento), conciliado = sempre "não" | sugerir "é este" / "é outra" |
| Diferenças já calculadas pela regra (campo, de, para) | explicar em uma frase |
| Para categoria: categorias do perfil do cartão (id, nome), a categoria da irmã da série e a do agendamento, se houver; apelido aprendido da descrição | sugerir categoria |
| O que **não** vai: nomes de pessoas, CPF/CNPJ, saldos, outras contas, outras faturas inteiras | minimização (LGPD) |

**Resposta esperada (estruturada):** `{ linha_id, decisao: 'mesmo' | 'novo' | null, candidato_id,
categoria_id, confianca: 'alta' | 'media' | 'baixa', motivo: '≤ 140 caracteres' }`. A tela valida
contra as regras (nunca aceita candidato fora da lista nem categoria de outro perfil) e mostra
"sem sugestão" quando a resposta não vier.

---

## 5. Plano de implementação (etapas pequenas, cada uma testável no teste1)

| Etapa | O que muda | Testes automatizados | Risco |
|---|---|---|---|
| **6b-1 Regras de candidato** | Sai o "parecido" com valor diferente e de outra série: possível duplicata e "Para escolher" só com valor ±0,01 e mesma parcela (ou mesma série + mesmo valor com outro nº); aviso de parecido passa a exigir a mesma parcela; "Também em" ignora conciliados. Diferença de centavos vira item da conferência, não pergunta | `revisaoImportacao.test.js`, `casamentoFatura.test.js`, `importacaoCorrespondencias.test.js`: um caso por regra (R1, R4, R5a–d), incluindo o 1/3 × 2/3 da simulação; simulação do arquivo real (script) antes/depois sem decisões novas | **Médio**: linhas que hoje perguntam passam a entrar como novas → risco de duplicar uma compra arredondada. Mitigação: a diferença aparece na Conferência; simular as 4 últimas faturas reais antes |
| **6b-2 Situação única por linha** | Uma função pura `situacaoParaTela(r)` → {grupo, frase, oQueAcontece, diferencas[]} no lugar dos 17 rótulos; "conciliados com diferença" passa a contar só valor e data do cartão | teste da função cobrindo cada estado da tabela §1.3; `contagemRevisaoFatura.test.js` (total = soma dos grupos) | Baixo (só apresentação) |
| **6b-3 Cartão de decisão lado a lado** | Componente `DecisaoLadoALado` (computador e celular) no lugar do `DecisaoSelect`; navegação 1 de N | `RevisaoFatura.test.jsx`: lado a lado com diferença realçada; escolher "Sim" grava `_mesmoQueId`/`_jaLancadoEscolha`; "Não" importa; sem decisão não entra | Baixo-médio (fluxo de escolha) |
| **6b-4 Grupos recolhidos + resumo** | Resumo com 3 números; grupos recolhidos; "Já conciliados antes" à parte; "Aguardando o banco" só info | telas: abre em "decisão" quando houver; conciliados não aparecem na visão principal; nenhum botão de excluir em aguardando | Baixo |
| **6b-5 Celular** | Habilitar "Importar fatura" no celular (`modules.js`), layout em cartões, folha de categoria | telas em 390 px (`isMobile`): carregar arquivo, decidir, confirmar; contagem igual à do computador | Médio (arquivo grande no celular, memória do `xlsx`) |
| **6b-6 Conciliação no mesmo fluxo** | "Conciliar Fatura" passa a usar as libs da Importar (R1, R3, R4, R5, R6); "Só no sistema": sem excluir conciliado, sem excluir parcela de fatura aberta mesmo sem cabeçalho (fatura aberta pelo calendário do cartão) | testes da conciliação com conciliado, parcela 1/5 × 5/8, CSV sem cabeçalho | **Alto**: mexe em exclusão e no "Fatura encerrada". Fazer por último, com simulação das faturas reais |
| **6b-7 Recorrente acima de R$ 0,50** | Reconhecer o agendamento recorrente pela loja/favorecido mesmo com valor diferente (ex.: até ±30% ou sem limite com confirmação) → pendência "Resolver" com baixa pelo valor do cartão e classificação do agendamento | `agendamentoManda.test.js`, `scheduleBaixa.test.js`; caso assinatura reajustada | Médio: pode casar uma compra avulsa na mesma loja com a assinatura — sempre perguntar, nunca automático |
| **6c (depois)** | Sugestão do Assistente no espaço reservado | contrato da resposta, validação contra a lista de candidatos, "sem sugestão" | Médio (custo de IA, latência) |

Cada etapa: um commit, `npm test`, simulação do arquivo real no teste1 (só leitura) e a entrada em
`src/novidades.js` quando for visível (6b-3 em diante).

---

## 6. Perguntas que dependem de decisão sua

1. **Centavos de arredondamento (parcela igual, valor até ±R$ 0,50).** A regra nova proíbe propor
   valor diferente. Recomendo: **entra como nova** e a diferença aparece na Conferência ("parcela com
   R$ 0,03 de diferença da prevista no Finup") — *ou* manter a pergunta só para esse caso? Recomendo
   a primeira só se a parcela prevista NÃO conciliada for então **substituída** (a prevista some e a
   do arquivo entra conciliada); senão sobram as duas.
2. **Parcela prevista não conciliada com centavos de diferença** (projeção da série × linha do
   arquivo, mesma série e mesmo número): é o mesmo lançamento com valor corrigido. Recomendo
   **atualizar sozinho o valor da projeção** (não é "parecido": é a mesma parcela) e mostrar em "Já
   estão no Finup" com "valor ajustado de R$ X para R$ Y".
3. **Compra em dólar / IOF estimados** (o valor em reais só fecha na fatura; hoje pergunta com
   ±15%/±20%). Recomendo **manter a pergunta** como exceção explícita (é estimado por definição),
   com o lado a lado mostrando "valor estimado × valor real".
4. **"Já lançado" automático com descrição diferente** (77 na simulação; mesmo valor, mesma data ±3
   dias, um único candidato). Recomendo **continuar automático**, listado em "Já estão no Finup" com
   o par visível e o botão "Não é este".
5. **"Também em outra fatura"** (mesmo valor e loja em outra fatura). Recomendo **mostrar só quando
   o outro lançamento não está conciliado** e como pergunta ("é o mesmo, lançado na fatura errada?"),
   não como aviso solto.
6. **Recorrente com valor bem diferente** (> R$ 0,50): reconhecer o agendamento por loja/favorecido
   e **perguntar** (baixa pelo valor do cartão + classificação do agendamento)? Recomendo **sim**,
   sempre perguntando, com limite de ±50% para não casar compra avulsa.
7. **Conciliar Fatura**: unificar com a Importar (uma tela só) ou manter as duas com as mesmas regras?
   Recomendo **unificar** — a Conciliação vira "Importar" com a opção "só conferir, sem importar
   novos".
8. **Excluir na Conciliação** ("Só no sistema"): manter a opção de excluir lançamento **não
   conciliado** de fatura fechada? Recomendo manter só para **à vista não conciliado de fatura
   fechada**, com confirmação; nunca conciliado, nunca parcela de série.
9. **Data do sistema da parcela 1 / à vista**: hoje é a data do cartão (só as parcelas 2..N usam o
   dia 15 do mês anterior à fatura). A regra fala em "parcela" — vale também para a parcela 1/N?
   Recomendo **manter a parcela 1 e o à vista na data do cartão** (é o dia da compra) e mostrar as
   duas datas no lado a lado.
10. **Celular**: liberar a Importar fatura completa no celular (carregar arquivo + decidir + confirmar)
    ou só **decidir/confirmar** uma importação começada no computador? Recomendo **completa**, mas na
    etapa 6b-5, depois do lado a lado.
11. **"Conciliados com diferença"**: contar só **valor** e **data do cartão** (descrição diferente é
    normal: o Finup guarda o nome que você escreveu). Recomendo **sim**.

---

## Decisões de 12/11/2026

| # | Tema | Decisão |
|---|---|---|
| 1 e 2 | Parcela da mesma série e mesmo número com centavos de diferença | **Atualiza sozinha a previsão** (não é "parecido"); a diferença aparece na Conferência como "previsão ajustada de R$ X para R$ Y". |
| 3 | Compra em dólar / IOF estimados | Pergunta **"É este?"** mostrando **"estimado × real"**; confirmando, fica o valor real. |
| 4 | "Já lançado" automático com descrição diferente | Continua **automático**, com o par visível e o botão **"Não é este"**. |
| 5 | "Também em outra fatura" | Só quando o outro lançamento **não está conciliado**, e **como pergunta** ("é o mesmo, lançado na fatura errada?"). |
| 6 | Recorrente com mais de R$ 0,50 de diferença | Reconhecer pela loja/favorecido, **até ±50%**, e **sempre perguntar**; confirmando, baixa pelo valor do cartão com a classificação do agendamento. |
| 7 | Conciliar Fatura | **Unificar** com a Importar, com a opção "só conferir" — na **última** etapa. |
| 8 | Excluir na Conciliar Fatura | Só **à vista não conciliado de fatura fechada**, com confirmação; nunca conciliado, nunca parcela. |
| 9 | Data do sistema (regra nova, substitui o "dia 15 do mês anterior") | À vista = data da compra; parcela N = **mesmo dia da compra, N−1 meses depois** (compra 05/11 em 3× → 05/11, 05/12, 05/01); mês sem o dia → **último dia do mês** (31/01 → 28/02). Em todas as parcelas fica guardada a **data da compra original**, visível no lançamento. **Implementação só depois do levantamento abaixo.** |
| 10 | Celular | Liberar a importação completa numa **etapa própria**, depois da comparação lado a lado. |
| 11 | Conciliados "com diferença" | Contar só **valor** e **data do cartão**, não a descrição. |

### Etapa 1 (regras de candidato) — implementada em 12/11/2026

- Possível duplicata e "É este?" só com **valor igual (±R$ 0,01)**; centavos na mesma parcela da mesma
  série → ajuste automático da previsão (1 e 2); parcela de outra série ou com outro número (fora da
  exceção "mesma série + mesmo valor") nunca é proposta; **conciliado nunca** é candidato.
- Aviso "parecido" passa a exigir a **mesma parcela** e o **mesmo valor**.
- "Também em outra fatura" (5): só não conciliado de fatura aberta, como pergunta.
- Estimado (3): mantém a pergunta e mostra "estimado × real".
- Conciliados com diferença (11): só valor e data do cartão.
- Conciliar Fatura: cruzamento sem conciliado, sem valor diferente e sem outra parcela; excluir só
  à vista não conciliado de fatura fechada, com confirmação (8).
- **Fatura aberta** não depende só do cabeçalho do arquivo: cabeçalho do Itaú quando diz; senão
  fatura marcada como fechada e o **calendário do cartão** (aberta até o dia de fechamento) — vale
  para CSV.
- Simulação do arquivo real (Personalite 11/2026, teste1): sugestões que violam as regras 1 → **0**;
  "conciliados com diferença" na reimportação 186 → **4** (só as diferenças reais de valor).
- **Fica para etapas próprias:** recorrente acima de R$ 0,50 (6), unificação da Conciliar (7),
  celular (10) e a data do sistema (9).

---

## Levantamento — data do sistema (decisão 9), só leitura

### Onde está a regra do dia 15 hoje

`installmentSystemDate(fatura, num, fallback, financialStartDay)` em `src/lib/parcelas.js:55-58`:
parcela N > 1 → dia `financialMonthStartDay` (15 no ambiente) do mês **anterior** à fatura; parcela 1
/ à vista → a data recebida (a do cartão). Quem usa:

| Onde | O quê |
|---|---|
| `src/lib/linhasFaturaImportada.js:62,74,83` (`applyReferenceFatura`) | data das linhas da Importar Fatura (Itaú e Dindin) e das parcelas geradas |
| `src/components/Import/ImportPanel.jsx` (`computeSaveDate`, parcelas futuras da importação e da conciliação) | data gravada na importação |
| `src/components/Import/ImportPreviewModal.jsx:44` | prévia do Resumo da Importação |
| `src/context/AppContext.jsx` `criarParcelasGerencial` (**não protegida**) | parcelas criadas pelo Novo Lançamento parcelado no cartão |
| "Corrigir Datas" da reedição (`correctedDateForFatura`) | outra regra antiga (dia de fechamento da fatura) — teria de seguir a nova |

**Funções protegidas:** nenhuma chama `installmentSystemDate`. Elas localizam a fatura por
`faturaMesAnoOf(card, date, faturaMonthYear)` — a **fatura gravada vence a data**, então mudar a data
não muda a fatura de nenhum lançamento que tenha `fatura_month_year`. Ponto de atenção:
`applyEnsureGerencial` grava a **etapa A** (transferência "Reserva Gerencial") com a **data do
lançamento**; mudar a data das parcelas mudaria a data dessas transferências na próxima passagem do
motor — comportamento a confirmar antes de recalcular existentes, sem alterar a função.

`installmentKey` usa a fatura (a data só quando não há fatura), então o índice único
`uq_lancamentos_installment` **não** é afetado.

### O que muda em cada área

| Área | Usa | Efeito da regra nova |
|---|---|---|
| Faturas, conferência, pagamento da fatura, agendamentos gerenciais | `fatura_month_year` | nenhum |
| Relatórios (Demonstrativo, KPIs), Painel, Orçamento | `date` (mês financeiro da data) | a parcela pode **mudar de mês** quando o dia da compra cai entre o fechamento e o dia 15 (ex.: fechamento 13, compra dia 14) |
| Fluxo de Caixa | `date` dos lançamentos futuros; o cartão entra pelo pagamento da fatura | só onde a parcela é mostrada individualmente |
| Reservas / grupos gerenciais | data da etapa A (= data do lançamento), razão diário por data, viradas por período | a transferência gerencial da parcela muda de dia (e às vezes de período) — pode cair em **período já virado** (exige estorno pela guarda de virada) |

### Onde a data da compra original já fica guardada

`lancamentos.date_cartao`: no Itaú, a parcela N traz a data da **compra original** (é o que o arquivo
mostra), e a importação grava isso; parcela 1 e à vista, a data da compra. **Não** fica nas parcelas
**projetadas** (futuras, criadas pela importação ou pelo Novo Lançamento): `date_cartao` vazio. E o
casamento da importação usa `date_cartao` como "data no cartão" (janelas de dias, reimportação), então
preenchê-lo nas projeções muda o casamento. **Recomendação:** coluna nova e aditiva `data_compra`
(TEXT, AAAA-MM-DD) gravada em todas as parcelas da série (vinda do `date_cartao` da parcela 1 ou da
linha do Itaú), usada para exibir "parcelado — compra em 05/11" e para calcular a data; `date_cartao`
continua sendo "o que veio no arquivo".

### Quantas parcelas existentes mudariam (cartão, despesa, total > 1; só SELECT, 12/11/2026)

O teste1 recebeu o backup do vm: os números dos dois são iguais.

| | teste1 | vm |
|---|---:|---:|
| Parcelas de cartão | 624 | 624 |
| Data da compra conhecida (própria `date_cartao` / irmã da série / parcela 1) | 444 / 160 / 4 | 444 / 160 / 4 |
| Sem como saber a data da compra | 16 | 16 |
| Já estão na data da regra nova | 148 | 148 |
| **Mudariam de data** | **460** | **460** |
| … conciliadas | 58 | 58 |
| … não conciliadas (quase todas previsões futuras) | 402 | 402 |
| **Mudariam de mês** | **151** | **151** |
| … conciliadas | 18 | 18 |
| … não conciliadas | 133 | 133 |

**Correção (12/11/2026, implementação da regra):** a contagem acima tomou a `date_cartao` de toda
parcela como data da compra. Na parcela por extenso ("Seguradora Parc8"), na anuidade e em outros
extratos ela é a data da **cobrança**; a regra implementada (`dataCompraDaParcela`) lê a data como
compra ou como cobrança pela distância à fatura da parcela. Com essa leitura, a prévia do lote (vm,
só SELECT, só NÃO conciliadas) fica:

| Tipo | Não conciliadas | Mudam de dia | Mudam de mês financeiro |
|---|---:|---:|---:|
| Despesa | 12 | 9 | 7 |
| Gerencial | 338 | 261 | 49 |
| Contas Anuais | 83 | 56 | 0 |
| Pharma | 94 | 69 | 8 |
| **Total** | **527** | **395** | **64** |

Conciliadas (fora do lote): 82. Sem como saber a data da compra: 15. A maior parte de quem muda de
mês é compra feita no dia 14 (entre o fechamento, dia 13, e o início do mês financeiro, dia 15): hoje
as parcelas dela ficam no dia 15 (mês financeiro seguinte); na regra nova, no dia 14.

### Regra 2 (transferência gerencial) — sem mudança em função protegida

A etapa A das parcelas **2 em diante** já não usa a data do lançamento: é criada por
`reconcileFaturaState` (`AppContext.jsx`, linha da `aDate`) e pelo "Executar Gerenciais"
(`provisaoGerencial.js`) com `prevMonthScheduleDate(fatura)` — dia de início do mês financeiro do mês
anterior à fatura. `applyEnsureGerencial` só cria a etapa A da **parcela 1 / à vista**, com a data do
lançamento, que é a data da compra. A regra 2 já vale hoje; nenhuma função protegida precisa mudar
para as parcelas criadas daqui em diante. Para o **lote das antigas**: a parcela 1 re-datada não teria
a etapa A acompanhando (`applyEnsureGerencial` só atualiza a etapa A quando o valor muda) — a decidir
na etapa do lote.

### Recomendação

1. **Aplicar só nas importações e parcelamentos novos** primeiro (regra numa função única que
   substitui `installmentSystemDate`, com `data_compra` gravada), testado no teste1.
2. **Recalcular as existentes depois, em lote separado e reversível**, só as **não conciliadas** (as
   previsões futuras, 402): script de backfill com prévia (quantas mudam de data e de mês, quantas
   caem em período de reserva já virado), histórico em `historico_alteracoes` (lote próprio, `autor`
   sistema, valor anterior da data) e seção de reversão pelo lote — no padrão de `supabase/backfill/`.
3. **Conciliadas (58) não mudam**: o conciliado nunca é alterado.
4. As 16 sem data da compra ficam como estão e aparecem numa lista para revisão manual.
5. Antes do passo 2: confirmar o comportamento da etapa A do gerencial ao mudar a data de uma parcela
   (sem alterar a função protegida) e rodar a guarda de período virado na prévia.

---

## Etapa 6b — tela nova da conferência (12/11/2026, teste1)

| Item | O que ficou | Onde |
|---|---|---|
| 1. Resumo | Três números (Novos · Já estão no Finup · Pedem sua decisão) e total do arquivo × o que fica na fatura | `ConferenciaBlocos.jsx` (`ResumoConferencia`), `blocosConferencia.js` (`resumoDosBlocos`) |
| 2. "É este?" | Um cartão por pergunta ("1 de N"), lado a lado com diferenças realçadas, "Sim, é este" / "Não, é outro — importar como novo" com a frase do que acontece; vários candidatos lado a lado; atalhos Alt+S, Alt+O, Alt+. e Alt+, (`tela:importarFatura`, trocáveis em Configurações › Atalhos) | `CartoesDecisao`, `perguntasDeDecisao`, `camposLadoALado`, `fraseSim`/`fraseNao` |
| 3. Blocos | Novos (tabela editável de sempre) · Já estão no Finup (par numa linha, "Não é este" onde a regra deixa) · Já conciliados antes (só consulta) · Não entram · Aguardando o banco (só informação) | `BlocoConferencia` e listas |
| 4. Recorrente > R$ 0,50 | Mesmo favorecido/loja, mesma conta, recorrente do usuário, até ±50% e ocorrência pendente na fatura da linha → "É este agendamento?". Sem resposta nada é importado nem baixado; "Sim" = classificação do agendamento + baixa pelo valor do cartão (`baixarCobrancaRecorrente`) | `recorrenteParecido.js` |
| 5. Linguagem | 17 rótulos → 6 (`ROTULO`): Novo, Já está no Finup, Já conciliado antes, É este?, Não entra, Aguardando o banco | — |
| 6. Etapa 6c | Lugar da sugestão no cartão (entre a comparação e os botões) e ao lado da categoria dos Novos; formato e validação em `sugestaoAssistente.js`; nada chama a IA | `SugestaoAssistente` |

Nada do que é gravado mudou, exceto a regra do item 4. Nenhuma função protegida foi tocada (a baixa
do item 4 chama `baixarCobrancaRecorrente`, que chama as protegidas como antes).

**Simulação com o arquivo real** (Personalite, fatura 11/2026, 227 linhas, teste1, só leitura):

| Bloco | A — reimportar hoje | B — antes da importação de 10/11 |
|---|---:|---:|
| Pedem sua decisão | 0 | 0 |
| Novos | 0 | 33 |
| Já estão no Finup | 0 | 80 |
| Já conciliados antes | 227 | 114 |
| Não entram | 0 | 0 |
| Aguardando o banco (parcelas do Finup) | 3 | 3 |
| Recorrente com valor diferente (> R$ 0,50) | 0 | 0 |

Ficam fora deste item: celular (decisão 10) e unificação com a Conciliar Fatura (decisão 7).
