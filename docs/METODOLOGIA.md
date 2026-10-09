# Metodologia

Como cada número do site é calculado a partir dos dados oficiais. Toda regra vale igualmente para todos os parlamentares. O código está em `etl/` (uma pasta por fonte, mais `etl/comum/` com o que Câmara e Senado compartilham).

- [Câmara dos Deputados](#câmara-dos-deputados)
- [Senado Federal](#senado-federal)
- [Emendas parlamentares](#emendas-parlamentares)
- [Eleições (TSE)](#eleições-tse)
- [Medianas](#medianas-comparações) e [validação](#validação)

# Câmara dos Deputados

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

- Legislatura atual (57ª, 2023–2027) e anterior (56ª, 2019–2023), nas duas casas.
- Entram todos os que exerceram mandato, inclusive suplentes. Cada legislatura é calculada separadamente.
- **Nomes:** além do nome parlamentar atual, ficam guardados o nome civil e os nomes usados em outras épocas ("Capitão Derrite" → "Guilherme Derrite"), para cruzar com fontes que usam o nome da época.

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

# Senado Federal

O Senado segue as mesmas regras da Câmara, com as diferenças abaixo. O código está em `etl/senado/`.

## Fontes

| Dado | Fonte | Atualização |
| --- | --- | --- |
| Senadores, mandatos, exercícios e filiações | [API de Dados Abertos Legislativos](https://legis.senado.leg.br/dadosabertos/docs/): `/senador/lista/legislatura`, `/senador/{código}/mandatos` e `/filiacoes` | Diária |
| Votações nominais e votos | API: `/votacao` (a nova; o endpoint legado de votações foi desativado) | Diária |
| Orientação das bancadas | API: `/plenario/votacao/orientacaoBancada` | Diária |
| Projetos de autoria | API: `/processo?codigoParlamentarAutor=` | Diária |
| Despesas da cota (CEAPS) | [API de Dados Abertos Administrativos](https://adm.senado.gov.br/adm-dadosabertos/swagger-ui/index.html): `/senadores/despesas_ceaps/{ano}` | Diária |

Como os volumes são pequenos (81 cadeiras, poucas centenas de votações por ano), cada carga refaz tudo.

## Diferenças em relação à Câmara

- **Quem entra:** senadores e suplentes com algum período de exercício na legislatura. Suplentes que nunca assumiram ficam de fora.
- **Exercício:** vem dos "exercícios" de cada mandato. Um mandato de senador dura duas legislaturas.
- **Partido:** o da filiação vigente na data. Entre uma desfiliação e a filiação seguinte, aparece "S/Partido".
- **Presença:** o Senado não publica presença por sessão, mas cada votação nominal registra, para cada senador, o voto ou o motivo da ausência. A presença é calculada sobre as votações nominais no período em exercício:
  - **Presente:** votou (Sim, Não, Abstenção ou "Votou", nas secretas), presidiu a sessão ou estava presente sem registrar voto (P-NRV).
  - **Ausência com motivo oficial:** licença (LS, LP…), missão (MIS) e atividade parlamentar (AP). Conta como ausência, mas o site mostra o total à parte.
  - **Ausente:** não compareceu (NCom).
- **Votações secretas:** entram na presença, mas não no alinhamento, porque não há o voto de cada um.
- **Primeiro autor:** é o primeiro nome da autoria do projeto. A comparação de nomes tolera variações de grafia ("Jean Paul Prates" e "Jean-Paul Prates").
- **Viraram norma:** projetos com norma gerada.
- **Despesas:** não têm link para o documento, e o próprio Senado já mascara o CPF de fornecedores pessoa física. A legislatura de cada despesa é definida pelo mês.

# Emendas parlamentares

Fonte: o [arquivo completo de emendas do Portal da Transparência](https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares), que não exige chave de API. Código em `etl/emendas/`.

- **Período:** emendas dos anos 2020 em diante. A emenda ao orçamento do ano X é apresentada em X-1, então 2020 é o primeiro ano apresentado dentro das legislaturas do site.
- **Valores:**
  - **Empenhado:** o valor reservado no orçamento.
  - **Pago:** o pago no próprio ano mais os restos a pagar pagos nos anos seguintes.
- **Por parlamentar:** só emendas individuais (com finalidade definida e "transferências especiais", as emendas Pix), porque emendas de bancada, comissão e relator não têm um autor único.
- **Por estado:** todos os tipos, pelo destino do recurso. Emendas nacionais ou para vários estados ficam de fora do total por estado.
- **Município:** 60% das linhas indicam só o estado de destino, não o município. Por isso o site mostra os dois recortes.
- **Identificação do autor:** o Portal identifica o autor só pelo nome. O cruzamento procura, na ordem:
  1. Entre quem estava em exercício na data em que a emenda foi apresentada (1º de novembro do ano anterior); depois, em qualquer dia desse ano; depois, no ano da emenda.
  2. Pelo nome parlamentar atual, por nomes de outras épocas ou pelo nome civil. Um nome exato em qualquer data vale mais que um nome aproximado na data certa.
  3. Tolerando sufixos ("Nelsinho Trad Filho"), nomes do meio omitidos e uma letra de diferença em nomes longos.
- **Emendas herdadas:** emendas de quem deixou o mandato e foram assumidas pelo sucessor ("FULANO (EX-PARLAMENTAR BELTRANO, NOS TERMOS ART. 78 LDO…)") contam para o sucessor, que é quem o Portal registra como autor.
- **Conferência:** autores não identificados ficam em `emendas/_diagnostico.json`. Na primeira carga, 100% do valor das emendas individuais foi identificado.

# Eleições (TSE)

Fonte: [Portal de Dados Abertos do TSE](https://dadosabertos.tse.jus.br/), com candidatos, bens declarados e votação por município e zona. Código em `etl/tse/`.

- **Eleições:** as gerais de 2014 a 2026. 2014 elegeu os senadores mais antigos da 56ª legislatura.
- **Cargos:** presidente, governador, senador e suplentes, deputado federal, estadual e distrital.
- **Votos:** nominais no 1º turno, somados por município e zona. O resultado ("Eleito por QP", "Suplente", "Não eleito"…) é o do último turno disputado.
- **Bens:** só o total por tipo de bem. A descrição de cada bem não é publicada no site, porque inclui endereços.
- **Identificação:** o TSE não divulga o CPF dos candidatos. O cruzamento usa o nome civil completo mais a UF do mandato; nas eleições sem correspondência por nome civil, usa o nome de urna. Quando a mesma pessoa tem mais de um registro na eleição (candidatura trocada, substituída ou indeferida), fica a principal: apta, depois a que resultou em eleição, depois a mais votada. Se os registros parecerem de pessoas diferentes, a eleição fica de fora.
- **Atualização:** eleições passadas não mudam e ficam guardadas. Aos domingos, a eleição mais recente é reprocessada, para pegar segundo turno, recontagens e decisões da Justiça Eleitoral.

# Comum às duas casas

## Medianas (comparações)

- **Quem entra:** parlamentares com pelo menos 90 dias em exercício na legislatura, para que suplentes de passagem não distorçam a comparação.
- **Grupos:** a casa inteira (Câmara ou Senado), cada partido e cada estado.
- **Partido e estado de cada parlamentar:** os do fim da legislatura, ou de hoje na legislatura atual.
- **Indicadores:** presença, projetos apresentados, projetos como primeiro autor, projetos que viraram norma e gasto médio mensal.

## Validação

- **Na carga:** cada linha das fontes é validada com Zod. Se mais de 1% das linhas de um arquivo vier fora do formato, a carga daquela fonte para, porque a fonte provavelmente mudou, e ela fica com os dados da carga anterior.
- **Antes do deploy:** `pnpm etl:validar` confere o formato de todos os arquivos e limites de bom senso:
  - pelo menos 513 deputados e 81 senadores;
  - 95% do valor das emendas com autor identificado;
  - 90% dos parlamentares ligados a alguma eleição.

  Se algo falhar, o site continua com os dados anteriores.
