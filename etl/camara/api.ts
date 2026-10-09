import { z } from "zod";
import { buscarJson, type OpcoesHttp } from "../lib/http";
import { extrairDados, validarLinhas } from "../lib/validacao";
import { API } from "./config";
import { DeputadoDaLista, ItemHistorico } from "./esquemas";

const Legislatura = z.object({
  id: z.number(),
  dataInicio: z.string(),
  dataFim: z.string(),
});
export type Legislatura = z.infer<typeof Legislatura>;

const RespostaPaginada = z.object({
  dados: z.array(z.unknown()),
  links: z.array(z.object({ rel: z.string(), href: z.string() })),
});

const LIMITE_PAGINAS = 1000;

/**
 * Segue os links `next` da API. A última página às vezes ainda traz um `next`
 * apontando para uma página vazia, então também para na primeira página vazia.
 */
export async function buscarTodasAsPaginas(
  url: string,
  opcoes: OpcoesHttp = {},
): Promise<unknown[]> {
  const linhas: unknown[] = [];
  let proxima: string | undefined = url;
  for (let i = 0; proxima; i++) {
    if (i === LIMITE_PAGINAS) {
      throw new Error(`Mais de ${LIMITE_PAGINAS} páginas a partir de ${url}`);
    }
    const pagina = RespostaPaginada.parse(await buscarJson(proxima, opcoes));
    if (pagina.dados.length === 0) break;
    linhas.push(...pagina.dados);
    proxima = pagina.links.find((l) => l.rel === "next")?.href;
  }
  return linhas;
}

/** As `quantidade` legislaturas mais recentes que já começaram. */
export async function buscarLegislaturas(
  quantidade: number,
  hoje: string,
  opcoes: OpcoesHttp = {},
): Promise<Legislatura[]> {
  const json = await buscarJson(
    `${API}/legislaturas?ordem=DESC&ordenarPor=id&itens=${quantidade + 1}`,
    opcoes,
  );
  return z
    .array(Legislatura)
    .parse(extrairDados(json, "legislaturas"))
    .filter((l) => l.dataInicio <= hoje)
    .slice(0, quantidade)
    .sort((a, b) => a.id - b.id);
}

/** Todos que exerceram mandato na legislatura, incluindo suplentes. */
export async function buscarDeputadosDaLegislatura(
  idLegislatura: number,
  opcoes: OpcoesHttp = {},
): Promise<DeputadoDaLista[]> {
  const linhas = await buscarTodasAsPaginas(
    `${API}/deputados?idLegislatura=${idLegislatura}&itens=100&ordem=ASC&ordenarPor=nome`,
    opcoes,
  );
  return validarLinhas(
    DeputadoDaLista,
    linhas,
    `deputados da legislatura ${idLegislatura}`,
    0,
  );
}

const DeputadoDoArquivo = z.object({
  uri: z.string(),
  nomeCivil: z.string().nullish(),
});

/**
 * Nome civil de todos os deputados, do arquivo em massa `deputados.json`
 * (um arquivo de ~4 MB em vez de uma chamada por deputado). Serve para a busca
 * e para cruzar com o TSE, que usa o nome completo.
 */
export async function buscarNomesCivis(
  opcoes: OpcoesHttp = {},
): Promise<Map<number, string>> {
  const json = await buscarJson(
    "https://dadosabertos.camara.leg.br/arquivos/deputados/json/deputados.json",
    opcoes,
  );
  const linhas = validarLinhas(
    DeputadoDoArquivo,
    extrairDados(json, "deputados.json"),
    "deputados.json",
  );
  const nomes = new Map<number, string>();
  for (const { uri, nomeCivil } of linhas) {
    const id = Number(uri.split("/").pop());
    if (Number.isInteger(id) && nomeCivil) nomes.set(id, nomeCivil.trim());
  }
  return nomes;
}

/** Entradas, saídas, licenças e trocas de partido de um deputado. */
export async function buscarHistorico(
  idDeputado: number,
  opcoes: OpcoesHttp = {},
): Promise<ItemHistorico[]> {
  const json = await buscarJson(
    `${API}/deputados/${idDeputado}/historico`,
    opcoes,
  );
  return validarLinhas(
    ItemHistorico,
    extrairDados(json, `histórico do deputado ${idDeputado}`),
    `histórico do deputado ${idDeputado}`,
    0,
  );
}
