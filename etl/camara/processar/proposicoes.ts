import { ehTipoDeProjeto } from "../../comum/consolidacao";
import { TIPO_AUTOR_DEPUTADO } from "../config";
import type { AutorProposicao, Proposicao } from "../esquemas";
import type { ParcialAno } from "../parcial";

/**
 * Projetos (PL, PLP, PEC, PDL) que têm deputados como autores. Cada deputado
 * que assina como proponente é contado como autor; a ordem de assinatura
 * permite separar o primeiro autor dos coautores.
 */
export function processarProposicoes(fontes: {
  proposicoes: Proposicao[];
  autores: AutorProposicao[];
}): Pick<ParcialAno, "proposicoes" | "autorias"> {
  const projetos = new Map(
    fontes.proposicoes
      .filter((p) => ehTipoDeProjeto(p.siglaTipo))
      .map((p) => [p.id, p]),
  );

  const autorias: ParcialAno["autorias"] = {};
  const usadas = new Set<number>();
  const vistas = new Set<string>();
  for (const autor of fontes.autores) {
    if (
      autor.codTipoAutor !== TIPO_AUTOR_DEPUTADO ||
      autor.idDeputadoAutor === undefined ||
      autor.proponente !== 1 ||
      !projetos.has(autor.idProposicao)
    ) {
      continue;
    }
    const chave = `${autor.idDeputadoAutor}|${autor.idProposicao}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    usadas.add(autor.idProposicao);
    const idDeputado = String(autor.idDeputadoAutor);
    autorias[idDeputado] ??= [];
    autorias[idDeputado].push([autor.idProposicao, autor.ordemAssinatura]);
  }

  const proposicoes = [...usadas]
    .map((id) => projetos.get(id) as Proposicao)
    .map((p) => ({
      id: p.id,
      sigla: `${p.siglaTipo} ${p.numero}/${p.ano}`,
      tipo: p.siglaTipo,
      ementa: p.ementa.trim(),
      dataApresentacao: p.dataApresentacao.slice(0, 10),
      situacao: p.ultimoStatus.descricaoSituacao.trim(),
      dataSituacao: p.ultimoStatus.data.slice(0, 10),
    }))
    .sort((a, b) => a.id - b.id);

  return { proposicoes, autorias };
}
