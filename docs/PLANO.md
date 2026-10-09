# Plano: Plataforma de Transparência Política

Oct 8, 2026 · @Guilherme Muniz Cardoso

## Visão geral

O objetivo é um site em Next.js na Cloudflare onde qualquer pessoa, sem conhecimento técnico, encontra um político e entende em 30 segundos o que ele fez: quanto gastou, quantos projetos apresentou e aprovou, como votou e se compareceu. O site também é um blog, e cada post publicado vai automaticamente para as redes sociais.

Todo o desenvolvimento acontece no Claude Code, rodando no seu computador e controlado pelo celular via Remote Control. O código vai para o GitHub, e o GitHub Actions publica na Cloudflare sozinho.

Princípios que guiam as decisões:

- **Fonte oficial sempre visível:** todo número tem um link para a API ou o arquivo de origem e a data da última atualização.
- **Comparação, nunca número solto:** um gasto aparece ao lado da mediana da casa e do partido. Sem contexto, R$ 400 mil não significa nada para um leigo.
- **Neutralidade:** os mesmos indicadores para todos os políticos, sem adjetivos, rankings de "pior" ou cores partidárias.
- **Linguagem simples:** "Cota parlamentar" vira "Dinheiro para despesas do mandato", com o termo técnico em um tooltip.
- **Escopo inicial:** deputados federais e senadores da legislatura atual e da anterior. Assembleias estaduais e câmaras municipais ficam para depois, porque não têm APIs padronizadas.

## Stack e decisões a tomar juntos

Toda a stack é gratuita: o único custo é o domínio próprio, de cerca de R$ 40 por ano, exigido pelos anúncios. Tudo fica em TypeScript e no ecossistema GitHub + Cloudflare, para que o Claude Code consiga operar o projeto inteiro só com git e linha de comando.

| Camada | Escolha | Por quê |
| --- | --- | --- |
| Framework | Next.js (App Router), TypeScript, Tailwind, shadcn/ui | Definido por você |
| Hospedagem | Cloudflare Workers (plano Free) com `@opennextjs/cloudflare` | Permite uso comercial; arquivos estáticos sem limite de banda; 100 mil requisições dinâmicas por dia |
| Cache sob demanda | Cache incremental do OpenNext no Cloudflare R2 | R2 é grátis até 10 GB; usado só nas páginas de detalhe (ver abaixo) |
| Código e CI/CD | Repositório público no GitHub + GitHub Actions, deploy com Wrangler | Actions é ilimitado em repositório público, e o código aberto reforça a transparência |
| Dados | Arquivos JSON pré-calculados, sem banco no MVP | Explicado em "Precisamos de banco de dados?" logo abaixo |
| Coleta de dados (ETL) | Scripts TypeScript em GitHub Actions agendado | Roda por até 6 h por execução, longe dos limites de CPU do Worker |
| Validação | Zod | As APIs públicas mudam de formato sem aviso; o Zod acusa antes de publicar dado errado |
| Gráficos | shadcn Charts (Recharts) | Mesmo visual do shadcn, acessível, open source |
| Busca de políticos | MiniSearch no navegador | Índice de cerca de 600 nomes cabe em poucos KB; acha "joao" quando o nome é "João" |
| Blog | Arquivos MDX no repositório (Velite) | Um post é um commit: o Claude Code escreve, você aprova pelo celular |
| Imagens de compartilhamento | `next/og`, geradas no build | Não gasta CPU do Worker a cada acesso |
| Analytics | Cloudflare Web Analytics | Grátis e sem cookies |
| Erros | Sentry, plano gratuito | Alerta quando o ETL ou uma página quebra |
| Testes e qualidade | Vitest, Playwright e Biome | Tudo open source, roda no Actions |
| Anúncios | Google AdSense | Exige domínio próprio e aprovação do site; veja os cuidados em Riscos |
| Domínio | `.com.br` próprio, com DNS na Cloudflare | Cerca de R$ 40 por ano no Registro.br; o DNS da Cloudflare é grátis |

**Precisamos de banco de dados?** No começo, não. O site precisa de dados prontos, não de um banco: cada página mostra resumos que mudam no máximo uma vez por dia. O ETL calcula tudo no GitHub Actions e grava arquivos JSON; o Next.js gera as páginas a partir deles.

- **Por que não o Neon gratuito:** o plano Free tem 0,5 GB de armazenamento e 100 horas de computação por projeto ([Neon](https://neon.com/pricing)). Só as notas da cota parlamentar de duas legislaturas devem passar desse limite (estimativa a confirmar na fase 2).
- **O meio-termo adotado:** o que exige todos os políticos ao mesmo tempo (resumos, medianas, rankings) é pré-calculado pelo ETL em JSON. O que é grande e pouco acessado (todas as notas fiscais de um político, discursos, tramitação completa de um projeto) é buscado na API oficial na primeira visita e guardado no cache do OpenNext no R2 por 24 horas.
- **Como fica o resumo de cada político:** gastos por mês e categoria, maiores notas, projetos, votos e presença, mais arquivos agregados para rankings e medianas.
- **Onde ficam os JSON:** numa branch `dados` do próprio repositório, sobrescrita a cada carga para o histórico do git não crescer.
- **Quando um banco passa a valer a pena:** contas de usuário, filtros livres sobre milhões de linhas ou alertas personalizados. Aí reavaliamos com o volume real em mãos.

**Limite a acompanhar na Cloudflare:** o plano Free dos Workers aceita 100 mil requisições dinâmicas por dia ([Easton](https://eastondev.com/blog/pt/posts/dev/20260526-cloudflare-free-limits/)); arquivos estáticos (JS, CSS, imagens) não entram nessa conta. O OpenNext dá suporte a App Router, SSG, ISR e otimização de imagens ([temps.sh](https://temps.sh/blog/cloudflare-pages-free-tier-limits-2026)). Se o tráfego passar do limite, o Workers Paid custa US$ 5 por mês.

## Arquitetura

O sistema tem dois fluxos independentes: os dados oficiais entram uma vez por dia pelo ETL, e as mudanças no site entram por pull request. As páginas principais leem arquivos JSON gerados pelo ETL, o que as deixa rápidas e imunes a instabilidades das fontes. Só as páginas de detalhe consultam a API oficial na primeira visita e guardam a resposta por 24 horas no cache do R2.

&#91;embedded content: arquitetura · fluxo de dados e fluxo de código\]

O workflow de redes roda depois do deploy de produção, só quando o merge traz um post novo do blog.

## Fluxo de trabalho pelo celular e CI/CD

Você nunca faz deploy à mão: o Claude Code abre um pull request, a Cloudflare gera um link de preview, você testa no celular e o merge publica em produção.

**Como o Remote Control funciona.** Ele conecta o app Claude (iOS/Android) ou claude.ai/code a uma sessão do Claude Code rodando no seu computador; o código e os arquivos continuam locais ([docs](https://code.claude.com/docs/en/remote-control)). No terminal, rode `claude remote-control` (ou `/remote-control` numa sessão aberta) e leia o QR code com o celular. Requisitos práticos:

- Claude Code v2.1.51 ou superior, autenticado com sua conta do claude.ai (chave de API não funciona).
- O computador precisa ficar ligado, com o terminal aberto. Sugestão: deixar uma sessão em `tmux` e desativar a suspensão automática.
- Quando o computador estiver desligado, use o **Claude Code na web** (aba Code do app), que roda na nuvem da Anthropic direto no repositório do GitHub ([docs](https://code.claude.com/docs/en/mobile)). Por isso o projeto não pode depender de nada que só existe na sua máquina.

**O ciclo de uma mudança:**

1. Você pede pelo celular: "crie a página de comparação entre dois deputados".
2. O Claude Code cria uma branch, escreve o código e roda `lint`, `typecheck` e testes localmente.
3. Ele faz push e abre o PR com `gh pr create`.
4. O GitHub Actions roda o CI: Biome, `tsc`, Vitest, build e Playwright contra o preview.
5. O GitHub Actions envia uma versão de preview para a Cloudflare (wrangler versions upload), com URL própria.
6. Você abre o link no celular e, se aprovar, pede "faça o merge" (ou aperta merge no app do GitHub).
7. O merge na `main` publica em produção pelo GitHub Actions, com wrangler deploy.

**Proteções no repositório:**

- Branch `main` protegida: merge só com CI verde.
- Quando o ETL termina, ele atualiza a branch de dados e dispara o workflow de deploy; o deploy só sai se os dados passarem na validação.
- Segredos (chave do Portal da Transparência, tokens das redes) ficam só em GitHub Secrets e nos secrets do Worker na Cloudflare, nunca no repositório.
- Um arquivo `CLAUDE.md` na raiz descreve comandos, convenções e regras (ex.: "nunca faça push direto na main"), para que qualquer sessão, local ou na nuvem, siga o mesmo padrão.

## Telas e experiência do usuário

A tela mais importante é o perfil do político: ele precisa responder "esse político trabalha, gasta bem e vota como eu esperava?" sem que a pessoa leia uma tabela. O design é pensado primeiro para o celular, porque é por ele que a maioria vai chegar, vinda das redes sociais.

| Página | Rota | O que mostra |
| --- | --- | --- |
| Início | `/` | Busca grande por nome, cidade ou partido; atalho "Quem me representa?" por estado; últimas votações importantes; últimos posts |
| Perfil do político | `/politicos/[slug]` | Cartões-resumo, gastos, projetos, votações, presença, emendas e histórico eleitoral (detalhes abaixo) |
| Comparar | `/comparar?a=…&b=…` | Dois ou três políticos lado a lado nos mesmos indicadores |
| Explorar | `/explorar` | Rankings filtráveis por estado, partido e indicador, sempre com a mediana marcada |
| Votações | `/votacoes` e `/votacoes/[id]` | O que foi votado em linguagem simples, placar e como cada um votou, com filtro por estado |
| Por estado | `/estados/[uf]` | Bancada do estado, gastos somados e emendas enviadas para o estado |
| Blog | `/blog` e `/blog/[slug]` | Análises com gráficos interativos embutidos no texto |
| Metodologia | `/metodologia` | De onde vem cada número, data de atualização e limitações |

**O perfil do político, de cima para baixo:**

1. **Cabeçalho:** foto, nome, partido, estado, cargo, mandatos anteriores e botão "Compartilhar" (gera um card de imagem).
2. **Quatro cartões-resumo:** presença (%), projetos apresentados, projetos aprovados e gasto no ano, cada um com a comparação "acima/abaixo da mediana".
3. **Gastos:** barras por mês e rosca por categoria (passagens, divulgação, combustível…), com a lista das maiores notas e o fornecedor.
4. **Projetos:** linha do tempo de proposições, com etiquetas de situação (em tramitação, aprovado, arquivado) e um resumo em uma frase.
5. **Votações:** os votos nas votações mais relevantes e o percentual de alinhamento com o partido e com o governo.
6. **Presença:** calendário estilo "heatmap" mostrando sessões com e sem presença.
7. **Emendas parlamentares:** mapa do Brasil com o valor destinado por município (dados do Portal da Transparência).
8. **Eleições:** votos recebidos, bens declarados ao TSE em cada eleição e principais doadores de campanha.

**Regras de UX para o público leigo:**

- Cada gráfico tem um título que é a conclusão ("Gastou 18% acima da mediana dos deputados"), não só o nome do dado.
- Glossário em tooltip em todo termo técnico, com componentes `Tooltip` e `HoverCard` do shadcn.
- Fonte e data de atualização embaixo de cada bloco, com link para o dado bruto.
- Acessibilidade WCAG 2.1 AA: contraste, navegação por teclado, tabela alternativa para cada gráfico e leitores de tela.
- Modo claro e escuro, carregamento rápido (meta: LCP abaixo de 2,5 s em 4G) e páginas estáticas regeneradas (ISR) após cada atualização do ETL.

## Blog e publicação automática nas redes sociais

As redes do início, Bluesky, Threads, Facebook e Instagram, têm API oficial e gratuita para postar no seu próprio perfil, então tudo roda por API. X, TikTok e LinkedIn ficam fora por enquanto.

**Como um post nasce:**

1. Você pede pelo celular: "escreva um post sobre os 10 maiores gastos com divulgação em 2026".
2. O Claude Code consulta o próprio banco do site, escreve `content/blog/<slug>.mdx` com gráficos embutidos e um bloco `social:` no cabeçalho com o texto curto de cada rede.
3. Abre o PR; você lê o preview no celular e aprova.
4. No merge, um workflow do GitHub Actions detecta posts novos, gera a imagem de compartilhamento com `next/og`, espera o deploy de produção ficar pronto e publica em cada rede.
5. O workflow grava os IDs das publicações no arquivo `content/social-log.json`. Se rodar de novo, não repete o post.

| Rede | API | Exigência principal | Custo |
| --- | --- | --- | --- |
| Bluesky | AT Protocol | Senha de app do perfil | Grátis |
| Threads | [Threads API](https://developers.facebook.com/documentation/threads/create-posts) | Permissão `threads_content_publish`; sem aprovação avançada, posta só na sua conta e nas de teste, o que basta | Grátis |
| Facebook (Página) | Graph API | App da Meta com `pages_manage_posts`, você como admin da Página | Grátis |
| Instagram | Instagram Graph API | Conta profissional (empresa ou criador) e `instagram_content_publish`; todo post precisa de imagem, que vem do card gerado | Grátis |

Para quando quiser voltar a elas: o X cobra por post desde fevereiro de 2026 ([postproxy](https://postproxy.dev/blog/x-api-pricing-2026)), o TikTok só publica em modo público depois de auditar o app ([postiz](https://docs.postiz.com/self-host/providers/tiktok)) e o LinkedIn é gratuito no perfil pessoal.

**Plano B: publicar pelo navegador.** Para redes sem API viável, dá para criar uma skill do Claude Code que abre o navegador (Claude in Chrome), preenche o post e mostra para você antes de publicar. Limitações honestas: o computador precisa estar ligado com o Chrome aberto, cada publicação pede sua confirmação e a automação pode violar os termos de uso de algumas redes. Serve para casos pontuais, não para o fluxo principal.

**Alternativa sem código:** o Postiz (open source, pode rodar na Vercel ou num VPS) já integra essas redes e tem API própria. O workflow chamaria só o Postiz, e ele cuidaria dos tokens que expiram.

## Fases de execução no Claude Code

São nove fases; cada uma termina com algo publicado em produção, para você ver progresso real a cada etapa. Em cada fase, comece pelo modo de plano (`Shift+Tab` no terminal) para revisar o plano antes de o Claude Code escrever código.

**Fase 0 — Preparação (feita por você, uma vez, no computador):**

- [ ] Instalar Node.js LTS, `pnpm`, GitHub CLI (`gh auth login`) e Wrangler, a CLI da Cloudflare (`wrangler login`)
- [ ] Instalar e atualizar o Claude Code (v2.1.51+) e fazer login com a conta do claude.ai
- [ ] Criar repositório no GitHub e conta gratuita na Cloudflare, com um token de API guardado nos GitHub Secrets
- [ ] Deixar o repositório público, para ter GitHub Actions ilimitado e grátis
- [ ] Gerar a chave da API do Portal da Transparência (conta gov.br com verificação em duas etapas)
- [ ] Testar `claude remote-control` e conectar pelo app no celular

**Fase 1 — Fundação e CI/CD.** Projeto Next.js com Tailwind e shadcn, `CLAUDE.md`, Biome, Vitest, Playwright, workflow de CI e proteção da `main`.

> Prompt: "Crie um projeto Next.js com App Router, TypeScript, Tailwind e shadcn/ui usando pnpm, configurado para Cloudflare Workers com @opennextjs/cloudflare e cache incremental no R2. Configure Biome, Vitest e Playwright. Crie um workflow do GitHub Actions que roda lint, typecheck, testes e build em cada PR, envia um preview para a Cloudflare e faz o deploy de produção no merge. Escreva um CLAUDE.md com os comandos e a regra de nunca fazer push na main. Abra um PR."

**Fase 2 — ETL da Câmara e arquivos de dados.** Tipos e esquemas Zod (políticos, mandatos, despesas, proposições, votações, votos, presenças), cliente da API da Câmara com limite de requisições, cálculo dos resumos e medianas, e gravação dos JSON na branch de dados.

> Prompt: "Escreva scripts em `etl/camara` que consomem dadosabertos.camara.leg.br/api/v2 e os arquivos em massa da Câmara, com validação Zod, retry e respeito ao limite de 3 meses em /votacoes. Gere um JSON de resumo por deputado e JSONs de medianas por casa, partido e estado. Publique os arquivos na branch `dados` e dispare o workflow de deploy. Crie o workflow agendado diário e testes com respostas gravadas da API."

**Fase 3 — Senado, Portal da Transparência e TSE.** Mesmo padrão para senadores (API nova, não o endpoint legado), emendas parlamentares e arquivos CSV do TSE com bens e votos. Um arquivo `fontes` registra quando cada fonte foi atualizada.

**Fase 4 — Busca e perfil do político.** Página inicial com busca, perfil completo com os oito blocos e cálculo das medianas na própria carga do ETL (arquivos de agregados), não na hora do acesso.

**Fase 5 — Comparar, explorar, votações e estados.** As demais páginas, reaproveitando os componentes de gráfico do perfil.

**Fase 6 — Blog.** MDX com Velite, componentes de gráfico usáveis dentro do texto, RSS, página de autor e imagens de compartilhamento com `next/og`.

**Fase 7 — Publicação nas redes.** Workflow de publicação, uma rede por PR, começando por Bluesky e Threads; depois Facebook e Instagram. Cada rede com teste em modo "dry-run".

> Prompt: "Crie `scripts/social/publish.ts` que lê posts novos do blog, gera a imagem com next/og e publica no Bluesky. Grave o resultado no arquivo content/social-log.json para não repetir. Adicione um modo --dry-run e um workflow que roda após o deploy de produção."

**Fase 8 — Lançamento.** SEO (sitemap, dados estruturados, metadados por político), auditoria de acessibilidade com axe, testes de performance no Lighthouse, Sentry, analytics, página de metodologia, domínio próprio, banner de consentimento de cookies e cadastro no Google AdSense.

**Dica para economizar contexto:** crie skills do Claude Code para tarefas repetidas, como `/novo-post` (pesquisa no banco, escreve o MDX, abre o PR) e `/nova-fonte` (cria ETL com testes no padrão do projeto).

## Riscos, questões legais e custos

O maior risco não é técnico: é publicar um número errado ou parecer partidário. Por isso a metodologia pública e a neutralidade valem tanto quanto o código. Este plano não é aconselhamento jurídico; vale uma consulta rápida a um advogado eleitoral antes do lançamento.

**Legal:**

- **Legislação eleitoral:** em período de campanha, só candidatos e partidos podem pagar impulsionamento de conteúdo sobre candidatos. Não impulsione posts que citem candidatos e mantenha o tom informativo, com os mesmos critérios para todos.
- **LGPD:** atos de agentes públicos são de interesse público, mas terceiros não são. Mascare o CPF de fornecedores pessoa física e de doadores de campanha.
- **Cookies dos anúncios:** o AdSense usa cookies, então o site precisa de banner de consentimento e de uma política de privacidade.
- **Anúncios e neutralidade:** bloqueie a categoria de anúncios políticos no AdSense, para que propaganda partidária não apareça ao lado dos dados de um político.
- **Difamação:** afirme só o que o dado mostra, com link para a fonte. Evite adjetivos como "gastão" ou "faltoso".
- **Termos de uso das redes:** automação por navegador pode suspender perfis; use as APIs oficiais sempre que existirem.

**Técnicos:**

- **APIs públicas instáveis:** formatos mudam e endpoints saem do ar (o de votações legado do Senado foi desativado em fevereiro de 2026). Mitigação: validação Zod, alerta no Sentry quando o ETL falha, e o site continua mostrando o último dado válido com a data.
- **Limites de requisição:** a API da Câmara limita o endpoint de votos. Mitigação: carga incremental diária, carga completa só uma vez, e cache de 24 horas nas páginas de detalhe.
- **Cota diária do Worker:** 100 mil requisições dinâmicas por dia no plano Free. Mitigação: alerta no painel da Cloudflare ao chegar a 80%; se virar rotina, o Workers Paid custa US$ 5 por mês.
- **Tokens que expiram:** os tokens da Meta vencem. Mitigação: workflow semanal que testa cada token e avisa antes de vencer.
- **Computador desligado:** o Remote Control para. Mitigação: o projeto roda inteiro na nuvem (Claude Code na web, Actions, Cloudflare).

**Custos mensais no plano gratuito:**

| Item | Plano | Custo |
| --- | --- | --- |
| Hospedagem | Cloudflare Workers Free + R2 (até 10 GB) | R$ 0 |
| Código, CI/CD e ETL | GitHub público + Actions | R$ 0 |
| Dados | JSON na branch de dados | R$ 0 |
| Redes sociais | APIs do Bluesky, Threads e Meta | R$ 0 |
| Analytics e erros | Cloudflare Web Analytics + Sentry gratuito | R$ 0 |
| Anúncios | Google AdSense | R$ 0 (gera receita) |
| Domínio | .com.br no Registro.br | Cerca de R$ 40 por ano |
| Claude Code | A assinatura do Claude que você já usa | Não é custo do site |
