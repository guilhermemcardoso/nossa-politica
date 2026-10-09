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

## Stack

- Next.js (App Router), TypeScript, Tailwind CSS v4 e shadcn/ui, com pnpm.
- Cloudflare Workers via `@opennextjs/cloudflare`, com cache incremental (ISR) no R2 (bucket `nossa-politica-cache`, binding `NEXT_INC_CACHE_R2_BUCKET`).
- Biome (lint e formatação), Vitest (unitários) e Playwright (E2E).
- GitHub Actions para CI, preview e deploy.

## Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | Servidor de desenvolvimento em http://localhost:3000 |
| `pnpm lint` | Biome: lint, formatação e ordem dos imports |
| `pnpm format` | Biome: corrige o que der automaticamente |
| `pnpm typecheck` | Gera os tipos das rotas e roda `tsc --noEmit` |
| `pnpm test` | Testes unitários (Vitest, arquivos `src/**/*.test.ts(x)`) |
| `pnpm test:e2e` | Testes E2E (Playwright, pasta `e2e/`). Sobe o `pnpm dev` sozinho; com `PLAYWRIGHT_BASE_URL` testa uma URL publicada |
| `pnpm build:worker` | Build do Next.js adaptado para Workers (gera `.open-next/`) |
| `pnpm preview` | Build e execução local no runtime da Cloudflare (workerd) em http://localhost:8787 |
| `pnpm cf-typegen` | Regenera `cloudflare-env.d.ts` a partir de `wrangler.jsonc` |

## Fluxo de uma mudança

1. `git checkout -b <tipo>/<descricao>` a partir da `main` atualizada.
2. Escreva o código e os testes, e rode lint, typecheck e testes.
3. Faça push da branch e abra o PR com `gh pr create`.
4. O workflow `CI` roda os checks e envia uma versão de preview para a Cloudflare, comentando a URL no PR. Depois roda o Playwright contra essa URL.
5. O merge na `main` dispara o workflow `Deploy`, que publica em produção.

A `main` é protegida: o merge exige PR com os checks `checks` e `preview` verdes.
