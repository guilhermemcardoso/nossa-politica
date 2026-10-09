import type { Legislatura } from "../camara/api";
import { diasEntre, type Periodo } from "../camara/mandatos";
import type { Filiacao, MandatoSenado } from "./esquemas";

export interface MandatoSenador {
  idLegislatura: number;
  uf: string;
  partido: string;
  periodos: Periodo[];
  diasEmExercicio: number;
  emExercicio: boolean;
}

export const SEM_PARTIDO = "S/Partido";

/** Partido em que o senador estava filiado na data, ou "S/Partido". */
export function partidoNaData(filiacoes: Filiacao[], data: string): string {
  const vigente = filiacoes
    .filter(
      (f) =>
        f.DataFiliacao <= data &&
        (f.DataDesfiliacao === undefined || f.DataDesfiliacao >= data),
    )
    .sort((a, b) => b.DataFiliacao.localeCompare(a.DataFiliacao))[0];
  return vigente?.Partido.SiglaPartido ?? SEM_PARTIDO;
}

const cobreLegislatura = (m: MandatoSenado, idLegislatura: number) =>
  m.PrimeiraLegislaturaDoMandato?.NumeroLegislatura === idLegislatura ||
  m.SegundaLegislaturaDoMandato?.NumeroLegislatura === idLegislatura;

/**
 * Períodos em exercício de um senador numa legislatura, a partir dos
 * "exercícios" de todos os seus mandatos (um mandato de senador dura duas
 * legislaturas, e suplentes só exercem quando o titular se afasta). Sem
 * exercício na legislatura, retorna null: suplentes que nunca assumiram ficam
 * de fora.
 */
export function calcularMandatoSenador(
  mandatos: MandatoSenado[],
  filiacoes: Filiacao[],
  legislatura: Legislatura,
  hoje: string,
): MandatoSenador | null {
  const limite = legislatura.dataFim < hoje ? legislatura.dataFim : hoje;
  const exercicios = mandatos.flatMap((m) => m.Exercicios);

  const periodos = exercicios
    .map((e) => ({
      inicio:
        e.DataInicio < legislatura.dataInicio
          ? legislatura.dataInicio
          : e.DataInicio,
      fim: e.DataFim === undefined || e.DataFim > limite ? limite : e.DataFim,
    }))
    .filter((p) => p.inicio <= p.fim)
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  if (periodos.length === 0) return null;

  const mandato =
    mandatos.find((m) => cobreLegislatura(m, legislatura.id)) ?? mandatos[0];
  const legislaturaEmCurso = legislatura.dataFim >= hoje;

  return {
    idLegislatura: legislatura.id,
    uf: mandato?.UfParlamentar ?? "",
    partido: partidoNaData(filiacoes, limite),
    periodos,
    diasEmExercicio: periodos.reduce(
      (s, p) => s + diasEntre(p.inicio, p.fim),
      0,
    ),
    emExercicio:
      legislaturaEmCurso &&
      exercicios.some(
        (e) =>
          e.DataInicio <= hoje &&
          (e.DataFim === undefined || e.DataFim >= hoje),
      ),
  };
}
