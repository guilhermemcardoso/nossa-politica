export const API = "https://dadosabertos.camara.leg.br/api/v2";
const ARQUIVOS = "https://dadosabertos.camara.leg.br/arquivos";

/** Arquivos em massa da Câmara, um por ano. Evitam milhares de chamadas à API. */
export const urlsDoAno = (ano: number) => ({
  despesas: `https://www.camara.leg.br/cotas/Ano-${ano}.json.zip`,
  votacoes: `${ARQUIVOS}/votacoes/json/votacoes-${ano}.json`,
  votacoesProposicoes: `${ARQUIVOS}/votacoesProposicoes/json/votacoesProposicoes-${ano}.json`,
  votos: `${ARQUIVOS}/votacoesVotos/json/votacoesVotos-${ano}.json`,
  orientacoes: `${ARQUIVOS}/votacoesOrientacoes/json/votacoesOrientacoes-${ano}.json`,
  eventos: `${ARQUIVOS}/eventos/json/eventos-${ano}.json`,
  presencas: `${ARQUIVOS}/eventosPresencaDeputados/json/eventosPresencaDeputados-${ano}.json`,
  proposicoes: `${ARQUIVOS}/proposicoes/json/proposicoes-${ano}.json`,
  autores: `${ARQUIVOS}/proposicoesAutores/json/proposicoesAutores-${ano}.json`,
});
export type FonteDoAno = keyof ReturnType<typeof urlsDoAno>;

/** Quantas legislaturas, contando a atual, entram no site. */
export const LEGISLATURAS_NO_SITE = 2;

/** Situação final de uma proposição que virou lei, emenda ou decreto. */
export const SITUACAO_VIROU_NORMA = "Transformado em Norma Jurídica";

/** Código de autor "Deputado(a)" no arquivo de autores. */
export const TIPO_AUTOR_DEPUTADO = 10000;

/** Requisições simultâneas à API da Câmara. */
export const CONCORRENCIA_API = 4;
