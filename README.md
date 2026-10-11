# Views que não parecem humanas

API determinística e explicável para o desafio 09 da Conty. Recebe views **novas por hora**, devolve sinais, motivo e uma classe: `legitimate` (compatível com orgânico), `suspicious` (combinação de anomalias) ou `indeterminate` (não há evidência suficiente ou ela é conflitante). Nenhuma classe comprova a origem das views; a API não deve liberar punições automaticamente.

## Rodar em Node 22

Use Node **22.23.3** (`.nvmrc`), npm e Git. Dependências fixadas no lockfile; `npm ci` exige Node 22. Sem banco, credenciais ou serviço externo.

```sh
git clone https://github.com/m4rk2077/conty-challenge-views-suspeitas.git
cd conty-challenge-views-suspeitas
node --version
npm ci
npm run dataset:report
npm run typecheck
npm test
npm run build
npm run examples:check
npm run readme:negative
npm start
```

`npm start` serve a API compilada em `http://127.0.0.1:3000`. `npm run dev` usa TypeScript diretamente. `PORT` altera a porta. `GET /health` informa a versão real do Node e das regras. `examples:check` inicia outro processo Node em uma porta livre, faz requests HTTP reais e encerra o processo; exige o build.

## Contrato e exemplos

`POST /classify`, JSON `{ "series": [{ "timestamp": "2026-06-01T10:00:00.000Z", "views": 120 }, ...] }`.

- Cada `views` é a quantidade **adicionada naquela hora**, nunca o total acumulado. Uma série acumulada pode ser sintaticamente válida, mas produzir conclusões sem sentido; a API não tem como adivinhar essa interpretação.
- De 2 a 720 pontos; UTC canônico `YYYY-MM-DDTHH:00:00.000Z`; datas reais e horas consecutivas, crescentes, sem lacunas/duplicatas. Normalize seu fuso para UTC antes de enviar.
- Inteiros de 0 a 1.000.000.000 por hora; a soma permanece segura em JavaScript. Corpo HTTP limitado a 100.000 bytes.
- JSON/campos inválidos: HTTP 400 com `error` e `field` (ex.: `series[1].timestamp`). Corpo grande: HTTP 413. Request válido, inclusive inconclusivo: HTTP 200.

Exemplos prontos: `examples/viral.json`, `examples/bought.json` e `examples/short.json`. Com o servidor iniciado:

```sh
curl http://127.0.0.1:3000/health
curl -H "Content-Type: application/json" --data-binary @examples/viral.json http://127.0.0.1:3000/classify
curl -H "Content-Type: application/json" --data-binary @examples/bought.json http://127.0.0.1:3000/classify
curl -H "Content-Type: application/json" --data-binary @examples/short.json http://127.0.0.1:3000/classify
```

PowerShell:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/health'
foreach ($example in @('viral', 'bought', 'short')) {
  $body = Get-Content -Raw -LiteralPath "examples/$example.json"
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/classify' -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 5
}
```

O exemplo curto é um caso em que a API prefere não acusar. Resposta completa:

```json
{
  "classification": "indeterminate",
  "reason": "A série tem 2 horas e 300 views; são necessárias pelo menos 24 horas e 1000 views para avaliar os padrões.",
  "signals": {
    "sample_hours": 2,
    "total_views": 300,
    "baseline_first_8h": 150,
    "peak_views": 180,
    "peak_hour_index": 1,
    "peak_end_hour_index": 1,
    "peak_to_baseline": 1.2,
    "max_hourly_increase_ratio": 1.5,
    "max_hourly_drop_ratio": 0,
    "concentration_4h": 1,
    "post_peak_retention": null,
    "post_peak_cv": null,
    "elevated_repeat_hours": 0
  },
  "triggered_rules": ["insufficient_evidence"],
  "rules_version": "1"
}
```

## Sinais e critérios (regras versão 1)

Valores centrais em `src/rules.ts`; cálculo puro em `src/signals.ts`; decisões em `src/classifier.ts`. API e avaliador chamam a **mesma** função `classify` com validação de entrada.

| Sinal | Cálculo e limiar relevante |
|---|---|
| `sample_hours`, `total_views` | Exigir pelo menos 24 horas e 1.000 views; abaixo disso, abstenção |
| `baseline_first_8h` | Mediana das primeiras oito horas (ou das horas disponíveis em série curta) |
| `peak_views`, `peak_hour_index`, `peak_end_hour_index` | Maior valor, primeiro índice desse valor e fim de seu platô contíguo; índices começam em zero |
| `peak_to_baseline` | Pico / máximo(1, baseline); elevado se ≥ 8 |
| `max_hourly_increase_ratio` | Maior `views[i] / máximo(1, views[i-1])`; salto abrupto se ≥ 6 |
| `max_hourly_drop_ratio` | Maior queda relativa entre horas consecutivas com valor anterior > 0; abrupta se ≥ 0,85 |
| `concentration_4h` | Maior soma em quatro horas consecutivas / total; concentrado se ≥ 0,40 |
| `post_peak_retention` | Média das seis horas **após o fim do platô do pico** / pico. Cauda incompleta ou pico zero: `null`. Colapso ≤ 0,15; sustentação ≥ 0,25 |
| `post_peak_cv` | Desvio padrão populacional / média dessas seis horas; `null` quando indisponível ou média zero. Variação natural candidata se ≥ 0,05 |
| `elevated_repeat_hours` | Maior trecho consecutivo de inteiros exatamente iguais e ≥ máximo(20, 3 × baseline). Mecânico se ≥ 6 horas |

Ordem das decisões:

1. Série curta/volume insuficiente: `indeterminate`.
2. Pico elevado com salto, queda, concentração **ou** repetição, junto de cauda sustentada e variável: `indeterminate`, por conflito.
3. Pico elevado **e** salto abrupto **e** repetição elevada ≥ 6 horas: `suspicious` (platô mecânico).
4. Pico elevado **e** salto abrupto **e** queda abrupta **e** concentração alta **e** retenção ≤ 0,15: `suspicious` (rajada com colapso).
5. Pico elevado com algum sinal de alerta, ou sem cauda completa: `indeterminate` se não confirmou as combinações anteriores.
6. Pico elevado com cauda sustentada variável, sem os alertas acima: `legitimate`, compatível com viral orgânico.
7. Ausência das combinações anteriores: `legitimate`, compatível com orgânico.

Nenhum sinal isolado acusa. Sinais numéricos não são arredondados antes da decisão; somente o motivo é formatado para leitura. Motivos citam os sinais que acionaram a regra, e `triggered_rules` identifica a decisão. Um salto de 12× diluído em 96 horas pode ficar inconclusivo; um salto de 90× com colapso e concentração suficiente gera suspeita. Testes variam amplitude, baseline, duração da subida, ruído e posição do pico.

## Dataset independente

`src/generator.ts` define causas/rótulos **antes** de produzir as curvas. Não importa classificador, sinais ou limiares. PRNG determinístico Mulberry32; versão do gerador `1`; sem rede social real, relógio externo ou ajuste de labels pela previsão. Cada exemplo registra família, label, seed do conjunto e parâmetros de geração inspecionáveis.

| Família | Causa sintética/rótulo |
|---|---|
| `organic_stable` | Atividade orgânica constante com ruído, legítima |
| `organic_growth` | Crescimento orgânico gradual, legítima |
| `organic_seasonal` | Oscilação orgânica diária, legítima |
| `organic_viral` | Descoberta orgânica, subida gradual e cauda variável, legítima |
| `organic_flash` | Divulgação legítima de duração curta, inclusive subida instantânea; pode se confundir com compra |
| `organic_low_count` | Alcance orgânico baixo e discretizado, legítima |
| `bought_burst` | Compra concentrada de views em uma janela curta, suspeita |
| `mechanical_plateau` | Injeção artificial do mesmo número horário, suspeita |
| `abrupt_collapse` | Injeção artificial elevada que termina abruptamente, suspeita |
| `smooth_boost` | Impulso artificial gradual com forma igual ao viral; a origem suspeita não pode ser reconhecida só pela curva |

Variações: 72/96 horas; baseline 30–220 (1–9 para baixo alcance), amplitude 12–90×, início entre a hora 12 e 32 horas antes do fim; ruído 6–28%, rampa viral 5–9 horas e decaimento 10–20 horas. Flash dura 1–3 horas, rampa 0–3; rajada dura 1–5; platô 8–18; colapso 4–8. Parâmetros não usados por uma família continuam registrados para manter um schema comum.

`data/development.json`: seed **20261001**, 20 por família, 200 exemplos. Usado para inspecionar comportamento durante desenvolvimento. `data/validation.json`: seed **20261009**, 40 por família, 400 exemplos; usado para a métrica publicada após definir as regras. As seeds e contagens estão em `DATASET_CONFIG`. A correção da cauda do platô veio de uma regressão concreta na revisão; nenhum limiar foi otimizado pela métrica de validação.

```sh
npm run dataset:report
npm run dataset:evaluate -- --split development
# Explorar outra seed (substitui validation.json; restaure o padrão antes de npm test):
npm run dataset:generate -- --seed 12345
npm run dataset:evaluate
npm run dataset:report
```

`dataset:report` gera ambos os conjuntos e exemplos, depois avalia validação. `dataset:generate -- --seed N` mantém desenvolvimento fixo e muda somente a seed de validação, que deve ser uint32 diferente da seed de desenvolvimento. O comando de avaliação imprime JSON com matriz, resultados por família, denominadores, FPR, abstenção, detecção suspeita e versões. Nenhuma execução reescreve o README para encobrir divergências.

## Medição publicada

<!-- FPR: 0.033333 -->
<!-- LEGITIMATE_ABSTENTION: 0.300000 -->
<!-- VALIDATION_SEED: 20261009 -->
<!-- VALIDATION_TOTAL: 400 -->
<!-- RULES_VERSION: 1 -->

Validação fixa: 400 exemplos, **240 legítimos e 160 suspeitos**, seed 20261009, gerador 1, regras 1. FPR = legítimos classificados como `suspicious` / **todos** os legítimos, incluindo os inconclusivos no denominador.

FPR medido: **3.3333% (8/240)**.

Abstenção legítima: **30.0000% (72/240)**. Abstenções não são falsos positivos; a taxa separada mostra o custo de não decidir.

| Causa real \ decisão | legitimate | suspicious | indeterminate |
|---|---:|---:|---:|
| Legítima | 160 | 8 | 72 |
| Suspeita | 40 | 68 | 52 |

Detecção de suspeitos: **42,5% (68/160)**; falsos negativos decididos como legítimos: **25% (40/160)**; abstenção suspeita: **32,5% (52/160)**. O denominador da detecção inclui abstenções.

| Família (40 exemplos cada) | legitimate | suspicious | indeterminate |
|---|---:|---:|---:|
| organic_stable | 40 | 0 | 0 |
| organic_growth | 40 | 0 | 0 |
| organic_seasonal | 40 | 0 | 0 |
| organic_viral | 40 | 0 | 0 |
| organic_flash | 0 | 8 | 32 |
| organic_low_count | 0 | 0 | 40 |
| bought_burst | 0 | 12 | 28 |
| mechanical_plateau | 0 | 40 | 0 |
| abrupt_collapse | 0 | 16 | 24 |
| smooth_boost | 40 | 0 | 0 |

Esses resultados são específicos do gerador e da proporção igual das famílias; não estimam a fraude ou o FPR em uma rede social. Todos os oito falsos positivos são flashes orgânicos. A família `smooth_boost` compartilha forma/distribuições com `organic_viral`, com causas diferentes: a série horária não contém informação suficiente para distinguir esses rótulos. Esses erros são publicados, não retirados do dataset.

`tests/evaluation.test.ts` lê o README e avalia o **arquivo real** de validação com o classificador real, compara o FPR/abstenção visíveis, marcadores, seed, quantidade e versão. Outro teste reproduz o arquivo byte a byte a partir da seed. O controle negativo altera o número em memória; `npm run readme:negative` também adultera **temporariamente o arquivo**, executa o mesmo teste (deve sair com código 1 pela divergência), e restaura o original em `finally`. Se alterar o número publicado, `npm test` falha.

## Validação executada

Validação local em Windows/PowerShell com Node **22.23.3**:

| Verificação | Resultado observado |
|---|---|
| `npm ci` | Instalação limpa do lockfile; auditoria npm sem vulnerabilidades reportadas |
| `npm run dataset:report` | 200 exemplos de desenvolvimento e 400 de validação; FPR/abstenção acima; regeneração sem diff em dataset/exemplos |
| `npm run typecheck` e `npm run build` | Passaram com TypeScript strict |
| `npm test` | **103 testes passaram em 5 arquivos**, incluindo sinais, fronteiras, 32 combinações de perturbações, API, reprodução do dataset e métricas do README |
| `npm run examples:check` | Servidor compilado em outro processo Node 22: viral legítimo, compra suspeita, série curta inconclusiva; JSON inválido HTTP 400 |
| `npm run readme:negative` | O teste real falhou com exit 1 após adulteração do FPR visível; README original restaurado byte a byte |
| `curl` e `Invoke-RestMethod` | Health mostrou Node 22.23.3; os três JSONs de exemplo retornaram as classes documentadas |
| Revisão independente por dois agentes de IA | Contrato/API/sinais e dataset/métricas/documentação revisados; explicação do conflito por concentração corrigida e coberta por regressão; nenhum bloqueio restante reportado |

O [workflow Node 22](https://github.com/m4rk2077/conty-challenge-views-suspeitas/actions) repete instalação, regeneração sem diff, typecheck, testes, controle negativo, build e requests HTTP em checkout limpo Linux.

## Limites e revisão

Só há contagens agregadas: faltam origem, contas, dispositivos, região e retenção de audiência. Os limiares são heurísticos, não um modelo treinado nem probabilidade de fraude. Baseline das primeiras horas pode estar contaminado; janelas curtas, múltiplos picos, contadores arredondados, campanhas legítimas com horário marcado e boosts graduais podem escapar ou ser confundidos. Uma série exatamente igual pode ter causas legítima e artificial. Antes de uso real, seriam necessários dados consentidos, validação externa por fonte/tamanho de audiência e revisão humana das suspeitas.

Sem persistência, autenticação, deploy ou conexão real com redes; servidor local para demonstrar o contrato. A detecção conservadora sacrifica cobertura e não identifica as compras suaves deste dataset. Mais dados sintéticos não resolvem a ausência de evidência causal.

**Uso de IA:** código, dataset sintético, testes e documentação foram implementados com IA (Codex). A revisão técnica foi feita por agentes de IA, com execução de testes, medição, exemplos e correção de falhas concretas. Marco ainda não realizou revisão humana. Labels são causas simuladas, não validação humana de fraude. A execução e a revisão não são declaradas como trabalho humano.

Fonte do contrato: [enunciado oficial do desafio 09](https://challenge.appconty.com/desafios/bots-visualizacao). Nenhum formulário da plataforma foi enviado.
