# Nossa Política

Site de transparência política: qualquer pessoa encontra um deputado ou senador e entende em 30 segundos o que ele fez (gastos, projetos, votos, presença). O plano completo, com as fases, está em [`docs/PLANO.md`](docs/PLANO.md).

@AGENTS.md

## Regras

- **Nunca faça push na `main`.** Toda mudança vai em uma branch nova e entra por pull request (`gh pr create`). O merge na `main` publica em produção.
- Antes de fazer push, rode `pnpm lint && pnpm typecheck && pnpm test`.
- Nunca rode `pnpm deploy` à mão: o deploy de produção é feito pelo GitHub Actions no merge.
- Segredos (tokens, chaves de API) ficam só em GitHub Secrets e nos secrets do Worker, nunca no repositório nem em `wrangler.jsonc`.
- Textos da interface em português simples, sem jargão; termo técnico vai em tooltip. Veja os princípios em `docs/PLANO.md` (neutralidade, fonte sempre visível, comparação com a mediana).
- `src/components/ui/` é gerado pelo shadcn (`pnpm dlx shadcn@latest add <componente>`). Evite editar à mão; o Biome ignora essa pasta.
- O `next` está fixado em `16.3.8` porque o `@opennextjs/cloudflare` ainda quebra com o Next 16.4 ([issue #1355](https://github.com/opennextjs/opennextjs-cloudflare/issues/1355)). Só atualize depois que a correção sair e o `pnpm preview` funcionar.
- Depois de mudar `wrangler.jsonc`, rode `pnpm cf-typegen` e faça commit do `cloudflare-env.d.ts`.
- Toda mudança no cálculo de um indicador do ETL atualiza `docs/METODOLOGIA.md` no mesmo PR.
- A pasta `dados/` é gerada pelo ETL e publicada na branch `dados`; nunca faça commit dela na `main`.

## Stack

- Next.js (App Router), TypeScript, Tailwind CSS v4 e shadcn/ui, com pnpm.
- Cloudflare Workers via `@opennextjs/cloudflare`, com cache incremental (ISR) no R2 (bucket `nossa-politica-cache`, binding `NEXT_INC_CACHE_R2_BUCKET`).
- Biome (lint e formatação), Vitest (unitários) e Playwright (E2E).
- GitHub Actions para CI, preview, deploy e ETL.
- Zod para validar dados de fontes externas e os arquivos publicados.

## Dados (ETL)

- Uma pasta por fonte em `etl/`: `camara/`, `senado/`, `emendas/` (Portal da Transparência) e `tse/`. Cada uma grava JSON na sua subpasta de `dados/`. As regras de cada indicador estão em `docs/METODOLOGIA.md`.
- `etl/comum/` tem o que é compartilhado: formatos de saída de Câmara e Senado (`saida.ts`), alinhamento, medianas, `fontes.json` e o cadastro de parlamentares usado para cruzar fontes que só trazem o nome (`parlamentares.ts`).
- O workflow `ETL` roda todo dia, na ordem Câmara → Senado → emendas → TSE. Emendas e TSE dependem dos parlamentares já gravados. Uma fonte que falha fica com os dados da carga anterior e o job termina com erro. Depois publica `dados/` na branch `dados` (um commit único, sobrescrito) e dispara o deploy.
- Resultados intermediários que não precisam ser refeitos todo dia ficam em `_parciais/`: anos da Câmara (só o atual e o anterior são reprocessados) e eleições do TSE. Aos domingos, a Câmara reprocessa todos os anos e o TSE refaz a eleição mais recente.
- **Compatibilidade:** o deploy valida os dados já publicados antes da próxima carga rodar. Campo novo num formato de saída entra como opcional, e uma fonte nova só é exigida pelo `etl:validar` depois de aparecer em `fontes.json`.
- Os testes usam respostas gravadas das APIs e amostras reais dos arquivos (pastas `__fixtures__/`), com CPFs e nomes de pessoas físicas trocados por valores fictícios.
- **Nunca** coloque CPF ou nome de pessoa física real (fornecedor, doador, passageiro) em fixtures: o repositório é público.

## Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | Servidor de desenvolvimento em http://localhost:3000 |
| `pnpm lint` | Biome: lint, formatação e ordem dos imports |
| `pnpm format` | Biome: corrige o que der automaticamente |
| `pnpm typecheck` | Gera os tipos das rotas e roda `tsc --noEmit` |
| `pnpm test` | Testes unitários (Vitest, arquivos `src/**/*.test.ts(x)` e `etl/**/*.test.ts`) |
| `pnpm test:e2e` | Testes E2E (Playwright, pasta `e2e/`). Sobe o `pnpm dev` sozinho; com `PLAYWRIGHT_BASE_URL` testa uma URL publicada |
| `pnpm build:worker` | Build do Next.js adaptado para Workers (gera `.open-next/`) |
| `pnpm preview` | Build e execução local no runtime da Cloudflare (workerd) em http://localhost:8787 |
| `pnpm cf-typegen` | Regenera `cloudflare-env.d.ts` a partir de `wrangler.jsonc` |
| `pnpm etl:camara` | Carga da Câmara em `./dados` (anos recentes e os que faltam). `--completo` reprocessa tudo (~3 min, ~3,5 GB de downloads); `--anos ""` só reconsolida |
| `pnpm etl:senado` | Carga do Senado (~1 min) |
| `pnpm etl:emendas` | Emendas do Portal da Transparência (~10 s; precisa de Câmara e Senado em `./dados`) |
| `pnpm etl:tse` | Eleições do TSE: só as que faltam. `--recente` refaz a mais recente; `--completo`, todas (~5 min, ~2 GB de downloads) |
| `pnpm etl:validar [pasta]` | Valida os arquivos de dados (formato e limites de bom senso) |

## Fluxo de uma mudança

1. `git checkout -b <tipo>/<descricao>` a partir da `main` atualizada.
2. Escreva o código e os testes, e rode lint, typecheck e testes.
3. Faça push da branch e abra o PR com `gh pr create`.
4. O workflow `CI` roda os checks e envia uma versão de preview para a Cloudflare, comentando a URL no PR. Depois roda o Playwright contra essa URL.
5. O merge na `main` dispara o workflow `Deploy`, que publica em produção.

A `main` é protegida: o merge exige PR com os checks `checks` e `preview` verdes.
