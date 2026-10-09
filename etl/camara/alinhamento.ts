import { removerAcentos } from "../lib/texto";

/*
 * Dois jeitos de medir alinhamento:
 *
 * - Com o governo: compara o voto com a orientação da bancada "Governo",
 *   que a Câmara publica em cada votação.
 * - Com o partido: compara o voto com o da maioria dos colegas de partido
 *   naquela votação. Não usa a orientação do partido porque, quando ele está
 *   num bloco, a orientação sai em nome do bloco, com nome cortado
 *   ("Bl UniPpPsd..."), e não dá para saber quais partidos fazem parte.
 */

export type VotoNormalizado = "Sim" | "Não" | "Abstenção" | "Obstrução";
export type Comparacao = "alinhado" | "divergente" | null;

/** Mínimo de colegas votando Sim ou Não para existir uma "maioria do partido". */
export const MINIMO_COLEGAS = 3;

const normalizar = (texto: string) =>
  removerAcentos(texto)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

export function normalizarVoto(voto: string): VotoNormalizado | null {
  switch (normalizar(voto)) {
    case "SIM":
      return "Sim";
    case "NAO":
      return "Não";
    case "ABSTENCAO":
      return "Abstenção";
    case "OBSTRUCAO":
      return "Obstrução";
    default:
      return null; // "Artigo 17" (presidente da sessão) e vazios
  }
}

export function orientacaoDoGoverno(
  orientacoes: Record<string, string>,
): string | undefined {
  return Object.entries(orientacoes).find(
    ([bancada]) => normalizar(bancada) === "GOVERNO",
  )?.[1];
}

/**
 * Compara um voto com uma posição de referência ("Sim" ou "Não"). Sem
 * referência (orientação "Liberado", maioria empatada) ou sem voto de fato,
 * a votação não entra na conta. Abstenção e obstrução contam como divergência.
 */
export function comparar(
  voto: string,
  referencia: string | undefined,
): Comparacao {
  const v = normalizarVoto(voto);
  const r = referencia ? normalizarVoto(referencia) : null;
  if (v === null || (r !== "Sim" && r !== "Não")) return null;
  return v === r ? "alinhado" : "divergente";
}

/** Placar Sim/Não de um partido numa votação. */
export interface PlacarPartido {
  sim: number;
  nao: number;
}

/**
 * Posição da maioria do partido sem contar o próprio deputado, para que o voto
 * dele não puxe a referência. `undefined` se houver menos de
 * {@link MINIMO_COLEGAS} colegas votando Sim ou Não, ou em caso de empate.
 */
export function maioriaDosColegas(
  placar: PlacarPartido | undefined,
  votoDoDeputado: string,
): "Sim" | "Não" | undefined {
  if (!placar) return undefined;
  const proprio = normalizarVoto(votoDoDeputado);
  const sim = placar.sim - (proprio === "Sim" ? 1 : 0);
  const nao = placar.nao - (proprio === "Não" ? 1 : 0);
  if (sim + nao < MINIMO_COLEGAS || sim === nao) return undefined;
  return sim > nao ? "Sim" : "Não";
}
