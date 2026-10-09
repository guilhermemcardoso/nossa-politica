# Metodologia: Câmara dos Deputados

Como cada número do site é calculado a partir dos dados oficiais. Toda regra vale igualmente para todos os deputados. O código está em `etl/camara/`.

## Fontes

| Dado | Fonte | Atualização |
| --- | --- | --- |
| Deputados, mandatos, licenças e trocas de partido | [API de Dados Abertos](https://dadosabertos.camara.leg.br/swagger/api.html): `/deputados` e `/deputados/{id}/historico` | Diária |
| Despesas da cota parlamentar | [Arquivo anual da Cota](https://www.camara.leg.br/cota-parlamentar/) (`cotas/Ano-AAAA.json.zip`) | Diária (ano atual e anterior) |
| Votações, votos e orientações | [Arquivos em massa](https://dadosabertos.camara.leg.br/arquivos): `votacoes`, `votacoesVotos`, `votacoesOrientacoes`, `votacoesProposicoes` | Diária (ano atual e anterior) |
| Sessões e presenças | Arquivos em massa: `eventos`, `eventosPresencaDeputados` | Diária (ano atual e anterior) |
| Projetos e autores | Arquivos em massa: `proposicoes`, `proposicoesAutores` | Diária; todos os anos aos domingos |

Os arquivos em massa substituem milhares de chamadas à API. Por isso não esbarram no limite de requisições da API nem na janela de 3 meses do endpoint `/votacoes`. A data de cada carga fica em `fontes.json`.

## Escopo

- Legislatura atual (57ª, 2023–2027) e anterior (56ª, 2019–2023).
- Entram todos os que exerceram mandato, inclusive suplentes. Cada legislatura é calculada separadamente.

## Período em exercício

O histórico do deputado na API informa posse, licença, afastamento e fim de mandato. Cada registro "Exercício" abre um período. Licença ou afastamento o fecha no dia anterior; o fim de mandato o fecha no próprio dia. Trocas de partido não interrompem o período.

Os períodos servem de base para presença e gasto mensal: o deputado não é cobrado por sessões nem meses em que estava licenciado ou ainda não havia tomado posse.

## Presença

- **Sessões consideradas:** sessões deliberativas do Plenário já encerradas, ou seja, as que têm votação.
- **Fora da conta:** sessões solenes, audiências e reuniões de comissão, porque cada deputado participa de comissões diferentes.
- **Cálculo:** presenças registradas ÷ sessões realizadas durante os períodos em exercício.
- **Limitação:** a Câmara não informa no arquivo de presença quais faltas foram justificadas (missão oficial, saúde). Uma ausência no site é só "não registrou presença".

## Despesas (cota parlamentar)

- **Valor usado:** o valor líquido de cada documento.
- **Compensações:** as negativas, como passagens reembolsadas, são descontadas, porque o que importa é o que de fato saiu da cota.
- **Legislatura:** cada despesa entra na legislatura indicada no próprio registro.
- **Gasto médio por mês** = total ÷ meses em exercício (dias em exercício ÷ 30,44). Fica vazio com menos de 30 dias em exercício.
- **O que é comparável:** o teto da cota varia por estado (por causa das passagens). Por isso o site compara o gasto também com a mediana do mesmo estado.
- **Fora da conta:** despesas de lideranças partidárias, porque não são de um deputado.
- **LGPD:** o CPF de fornecedores pessoa física é mascarado (`***.222.333-**`). CNPJs de empresas aparecem completos.

## Projetos

- **Tipos contados:** projetos de lei (PL), projetos de lei complementar (PLP), propostas de emenda à Constituição (PEC) e projetos de decreto legislativo (PDL).
- **Tipos fora:** requerimentos, emendas e pareceres. São dezenas de milhares por ano e inflariam a conta.
- **Apresentados:** todos os projetos em que o deputado assina como autor, inclusive como coautor.
- **Como primeiro autor:** só aqueles em que ele é o primeiro a assinar. **É a comparação mais justa entre deputados.** Algumas bancadas assinam projetos em grupo, e isso multiplica o número de "apresentados" de cada membro: na 56ª legislatura, a mediana de apresentados do PT foi 184, e a de primeiro autor, 24.
- **Viraram norma:** projetos com situação "Transformado em Norma Jurídica" (lei, emenda constitucional ou decreto legislativo).
- **Limitação:** um projeto apensado (tramitando em conjunto) a outro que virou lei não conta para o autor do apensado.

## Votações

- **Votações consideradas:** só as nominais do Plenário. Votações simbólicas não registram o voto de cada deputado.
- **Alinhamento com o governo:** percentual de votos iguais à orientação da bancada do Governo.
  - Entram só as votações em que o governo orientou "Sim" ou "Não" e o deputado votou.
  - Abstenção e obstrução contam como voto diferente.
- **Alinhamento com o partido:** percentual de votos iguais ao da maioria dos colegas de partido naquela votação.
  - O partido considerado é o do deputado no momento do voto.
  - O voto do próprio deputado não entra no cálculo da maioria.
  - Exige pelo menos 3 colegas votando Sim ou Não; empates não contam.
  - **Por que não a orientação do partido:** quando o partido está num bloco, a Câmara publica a orientação em nome do bloco, com o nome cortado ("Bl UniPpPsd..."). Assim não dá para saber, de forma confiável, a que partidos ela vale.

## Medianas (comparações)

- **Quem entra:** deputados com pelo menos 90 dias em exercício na legislatura, para que suplentes de passagem não distorçam a comparação.
- **Grupos:** a Câmara inteira, cada partido e cada estado.
- **Partido e estado de cada deputado:** os do fim da legislatura, ou de hoje na legislatura atual.
- **Indicadores:** presença, projetos apresentados, projetos como primeiro autor, projetos que viraram norma e gasto médio mensal.

## Validação

Antes de publicar, cada linha das fontes é validada com Zod. Se mais de 1% das linhas de um arquivo vier fora do formato, a carga para: a fonte provavelmente mudou. Antes do deploy, `pnpm etl:validar` confere o formato de todos os arquivos e limites de bom senso, como pelo menos 513 deputados por legislatura. Se algo falhar, o site continua com os dados anteriores.
