# Importar Fatura — regras de casamento (Etapa 6a, 10/11/2026)

Como cada linha do arquivo da fatura é comparada com o que já está no cartão. Vale para cartão de
crédito (aba Importar Fatura). Três etapas, nesta ordem; cada uma só olha o que as anteriores
deixaram livre:

1. `resolverLinhasRevisao` — `src/lib/revisaoImportacao.js`
2. `aplicarJaLancados` / `casarJaLancados` / `avaliarJaLancado` — `src/lib/casamentoFatura.js`
3. `aplicarCorrespondencias` / `classificarLinhaLivre` — `src/lib/importacaoCorrespondencias.js`

## Sempre

- Candidato só do **mesmo cartão** (`account_id`; a maioria das parcelas tem `card_id` NULL), do
  **mesmo tipo**, de **fatura aberta**.
- **1:1**: um lançamento do Finup representa no máximo uma linha.

## Conciliados

- Nunca aparecem como opção de escolha ("Para escolher", "Possível duplicata") nem no aviso.
- São reconhecidos **em silêncio** como "já importado" (reimportação da mesma fatura) quando é o mesmo
  exato, na mesma fatura:
  - FITID igual;
  - parcela de mesma chave/série, mesmo n/total, valor ±0,01;
  - mesmo tipo, valor ±0,01, mesma parcela e mesma data do cartão (sem data do cartão gravada, a data
    do lançamento). Parcela (total > 1) não precisa da data — a projeção conciliada pelo "Já existe"
    fica sem data do cartão.
  - A regra da data vale para qualquer origem, não só `importacao_fatura`: o lançamento manual que
    virou "Já lançado" na 1ª importação recebeu a data do cartão da fatura e está conciliado — sem
    isso, a reimportação o duplicaria.
  - Linha **sem número de parcela legível** × conciliado com parcela: mesma descrição (normalizada:
    sem acento, minúscula, espaços únicos), mesma data do cartão e valor ±0,01 → "Já existe". Sempre
    1:1 (duas compras iguais no mesmo dia = 2 linhas × 2 lançamentos; com 1 lançamento, a outra linha
    segue as regras normais). Caso real: "Yelumseg Parc8sao Paulobra" (11/11/2026).
- **Parcela colada à cidade** ("Parc8sao Paulobra"): o detector (`lib/installments.js`) lê a parcela 8
  quando o número vem colado a uma palavra de 3+ letras; a base é só o nome antes ("Yelumseg") e o
  total vem da série gravada, como no "Parc7". Não é parcela: "Parceria", "Parcial", "Parcelado",
  "Parc 2000", "Parc24h", "Parc2go".

## Mesmo lançamento, automático (não pergunta)

- FITID igual.
- Parcela da **mesma série** (serie_id da série já gravada, âncora inferida ou mesma chave de parcela)
  com mesmo n, mesmo total, mesma fatura e valor ±0,01 → "No banco ↻".
- Não conciliado com descrição-base parecida (≥ 0,7), mesma parcela, valor ±0,01 e compra até 3 dias
  → "Já existe".
- À vista ou parcela 1 (mesmo n/total): valor ±0,01, data do cartão até 3 dias, mesma fatura e **um
  único** candidato (descrição pode diferir) → "Já lançado".
- Compras gêmeas: k linhas com o mesmo conjunto de m candidatos automáticos, k ≥ m → pares 1:1 pela
  data mais próxima; as k − m que sobram são novas. k < m → pergunta.

## Pergunta

| Caso | Onde aparece |
|---|---|
| Mesmo n/total e mesma fatura, valor até ±0,50 | Possível duplicata (mesma série) ou Para escolher |
| Parcela N > 1 com mesmo n/total, valor e fatura, mas sem a série conhecida | Para escolher |
| Mesma série e mesmo valor, **outro número** de parcela ("Aramis 4/4" × 3/4) | Possível duplicata — "É a mesma" corrige o número |
| À vista, valor ±0,01, compra entre 4 e 7 dias (ou até 7 dias em fatura vizinha) | Para escolher |
| Mais de um candidato igual | Para escolher |
| Estimado (dólar/IOF), critérios de `casaEstimado` | Para escolher |
| Nome forte, mesma parcela, valor até ±5%, compra até 5 dias, fatura igual ou vizinha | Para escolher |

Sem decisão, a linha não é importada nem conciliada. A conferência da fatura lista essas linhas à
parte e **não** as conta como explicadas: "N itens ainda sem decisão — R$ X não serão importados".

Exceção mantida: o IOF que o banco agrupa numa linha só (soma dos IOFs estimados, ±20%) continua
casando sozinho com o grupo (`agruparIofs`).

## Novo direto

n ou total de parcela diferente (fora do caso da mesma série acima), parcela × à vista, outra série,
valor fora das faixas, à vista com data a mais de 7 dias, só o nome parecido. O antigo "Parecido —
é este?" (só nome) deixou de existir na importação.

**Aviso** (não muda o que é gravado): havendo lançamento não conciliado da mesma loja (nome forte),
valor até ±5%, na mesma fatura ou vizinha, a linha nova mostra nos detalhes "há uma compra parecida
no Finup: <desc> · <parcela> · R$ <valor> · fatura <mm/aaaa>".

## Nome (similaridade)

`src/lib/nomeEstabelecimento.js` é o único lugar das palavras genéricas e do corte de cidade:

- corta a cidade/sufixo depois de 2+ espaços e a cidade+país colada no fim ("3londrinabra",
  "Paulobra");
- tira palavras genéricas (compra, shop, comercio, loja, pagamento, mercado, pag, ltda, me, eireli,
  posto, farmácia…);
- `similaridade` (matchLancamento) = Dice por pares de letras do nome inteiro, prefixo (0,9) ou a
  **primeira** palavra do estabelecimento igual/prefixo, 4+ letras (0,7). A antiga regra "qualquer
  palavra de 4+ letras em comum = 0,7" saiu — era ela que juntava "Anderson Pasteis Londrina" com
  "Havan Londrina".

## Janela "Parcela correspondente encontrada"

Removida. O vínculo de parcela é decidido na revisão pelas regras acima. A sugestão de categoria e
favorecido que ela dava agora vem da irmã da série no **mesmo cartão** (`irmaDaParcela`,
`src/lib/parcelas.js`), sem janela.

## Simulação no vm (Personalite, fatura 11/2026, só SELECT)

| Status | Antes | Depois |
|---|---|---|
| Já existe | 62 | 62 |
| No banco ↻ | 62 | 62 |
| Já lançado | 68 | 65 |
| Já existe — valor diferente | 2 | 0 |
| Novo | 27 | 32 |
| Novo (com aviso) | 0 | 1 |
| Para escolher | 0 | 3 |
| Possível duplicata | 0 | 2 |
| Parecido — é este? | 6 | 0 |

Reimportar hoje a mesma fatura (tudo conciliado): 227 linhas, 0 a importar, 0 decisões, antes e
depois.

**Correção de 11/11/2026.** A simulação acima montava as linhas a partir dos lançamentos do banco (com
8/12 já gravado) e escondeu o caso "Yelumseg Parc8sao Paulobra". As simulações passam a montar as
linhas a partir do TEXTO REAL do arquivo, com o mesmo código da tela (`lib/linhasFaturaImportada.js`:
`parcelaDaLinha`, `linhasDaFaturaParaRevisao`). Com o arquivo real da fatura 11/2026 (227 linhas):
antes 226 conciliados + 1 "Novo (com aviso)"; depois 227 conciliados, 0 a importar, 0 decisões.
