import { join } from "node:path";
import type { Periodo } from "../camara/mandatos";
import { lerJson, listarArquivos } from "../lib/arquivos";
import { mesmoNome, normalizarNome } from "../lib/texto";
import { Parlamentar } from "./saida";

/*
 * Cadastro de deputados e senadores já publicados pelas cargas da Câmara e do
 * Senado, usado para cruzar fontes que identificam políticos só pelo nome
 * (Portal da Transparência, TSE).
 */

export type Casa = "camara" | "senado";

export interface ParlamentarConhecido {
  casa: Casa;
  id: number;
  nome: string;
  nomeCivil?: string;
  /** Nome atual e os de outras épocas (sem o civil) */
  nomes: string[];
  ufs: Set<string>;
  periodos: Periodo[];
}

const PASTAS: Record<Casa, string> = {
  camara: join("camara", "deputados"),
  senado: join("senado", "senadores"),
};

export async function carregarParlamentares(
  pastaDados: string,
): Promise<ParlamentarConhecido[]> {
  const todos: ParlamentarConhecido[] = [];
  for (const casa of Object.keys(PASTAS) as Casa[]) {
    const pasta = join(pastaDados, PASTAS[casa]);
    for (const arquivo of await listarArquivos(pasta)) {
      if (!arquivo.endsWith(".json")) continue;
      const p = Parlamentar.parse(await lerJson(join(pasta, arquivo)));
      todos.push({
        casa,
        id: p.id,
        nome: p.nome,
        nomeCivil: p.nomeCivil,
        nomes: [p.nome, ...(p.outrosNomes ?? [])],
        ufs: new Set(p.legislaturas.map((l) => l.uf).filter(Boolean)),
        periodos: p.legislaturas.flatMap((l) => l.periodos),
      });
    }
  }
  if (todos.length === 0) {
    throw new Error(
      `Nenhum parlamentar em ${pastaDados}: rode antes as cargas da Câmara e do Senado.`,
    );
  }
  return todos;
}

/** Esteve em exercício em algum dia do ano? */
export function emExercicioNoAno(
  p: ParlamentarConhecido,
  ano: number,
): boolean {
  const inicio = `${ano}-01-01`;
  const fim = `${ano}-12-31`;
  return p.periodos.some(
    (periodo) => periodo.inicio <= fim && periodo.fim >= inicio,
  );
}

export type ModoDeBusca = "exato" | "tolerante";

/**
 * Procura parlamentares por algum dos nomes do campo. "exato" compara sem
 * acentos e pontuação; "tolerante" usa `mesmoNome`. O filtro decide quem é
 * candidato (por exemplo, quem estava em exercício no ano).
 */
export function procurarPorNome(
  parlamentares: ParlamentarConhecido[],
  nome: string,
  campo: (p: ParlamentarConhecido) => Array<string | undefined>,
  filtro: (p: ParlamentarConhecido) => boolean = () => true,
  modo: ModoDeBusca = "exato",
): ParlamentarConhecido[] {
  const alvo = normalizarNome(nome);
  const corresponde =
    modo === "exato"
      ? (v: string) => normalizarNome(v) === alvo
      : (v: string) => mesmoNome(v, nome);
  return parlamentares.filter(
    (p) =>
      filtro(p) &&
      campo(p).some((v) => v !== undefined && v !== "" && corresponde(v)),
  );
}
