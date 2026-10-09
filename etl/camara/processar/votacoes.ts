import type { Orientacao, Votacao, VotacaoProposicao, Voto } from "../esquemas";
import type { ParcialAno, ResumoVotacao, VotoCompacto } from "../parcial";

const LIMITE_DESCRICAO = 600;

/**
 * Mantém só as votações nominais do Plenário: as que têm voto registrado por
 * deputado. Votações simbólicas e de comissões não dizem como cada um votou.
 */
export function processarVotacoes(fontes: {
  votacoes: Votacao[];
  votacoesProposicoes: VotacaoProposicao[];
  votos: Voto[];
  orientacoes: Orientacao[];
}): Pick<ParcialAno, "votacoes" | "votos"> {
  const doPlenario = new Map(
    fontes.votacoes
      .filter((v) => v.siglaOrgao === "PLEN")
      .map((v) => [v.id, v]),
  );

  const votos: Record<string, VotoCompacto[]> = {};
  const nominais = new Set<string>();
  for (const voto of fontes.votos) {
    if (!doPlenario.has(voto.idVotacao) || voto.voto === "") continue;
    nominais.add(voto.idVotacao);
    const idDeputado = String(voto.deputado_.id);
    votos[idDeputado] ??= [];
    votos[idDeputado].push([
      voto.idVotacao,
      voto.voto,
      voto.deputado_.siglaPartido,
    ]);
  }

  const proposicaoDa = new Map<string, ResumoVotacao["proposicao"]>();
  for (const vp of fontes.votacoesProposicoes) {
    if (proposicaoDa.has(vp.idVotacao)) continue;
    proposicaoDa.set(vp.idVotacao, {
      id: vp.proposicao_.id,
      titulo: vp.proposicao_.titulo,
      ementa: vp.proposicao_.ementa,
    });
  }

  const orientacoesDa = new Map<string, Record<string, string>>();
  for (const o of fontes.orientacoes) {
    if (!nominais.has(o.idVotacao) || o.orientacao === "") continue;
    const mapa = orientacoesDa.get(o.idVotacao) ?? {};
    mapa[o.siglaBancada.trim()] = o.orientacao;
    orientacoesDa.set(o.idVotacao, mapa);
  }

  const votacoes: ResumoVotacao[] = [...nominais]
    .map((id) => {
      const v = doPlenario.get(id) as Votacao;
      return {
        id,
        data: v.data,
        descricao: v.descricao.trim().slice(0, LIMITE_DESCRICAO),
        aprovada: v.aprovacao === 1 ? true : v.aprovacao === 0 ? false : null,
        placar: { sim: v.votosSim, nao: v.votosNao, outros: v.votosOutros },
        proposicao: proposicaoDa.get(id) ?? null,
        orientacoes: orientacoesDa.get(id) ?? {},
      };
    })
    .sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));

  return { votacoes, votos };
}
