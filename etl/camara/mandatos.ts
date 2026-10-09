import type { Legislatura } from "./api";
import type { ItemHistorico } from "./esquemas";

export interface Periodo {
  /** Primeiro dia em exercício (AAAA-MM-DD) */
  inicio: string;
  /** Último dia em exercício, inclusive (AAAA-MM-DD) */
  fim: string;
}

export interface Mandato {
  idLegislatura: number;
  nome: string;
  partido: string;
  uf: string;
  urlFoto: string;
  periodos: Periodo[];
  diasEmExercicio: number;
  /** Em exercício hoje (só pode valer para a legislatura atual). */
  emExercicio: boolean;
}

const UM_DIA = 86_400_000;

export function diasEntre(inicio: string, fim: string): number {
  return Math.round((Date.parse(fim) - Date.parse(inicio)) / UM_DIA) + 1;
}

export function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(data) + dias * UM_DIA).toISOString().slice(0, 10);
}

export function dentroDosPeriodos(data: string, periodos: Periodo[]): boolean {
  return periodos.some((p) => p.inicio <= data && data <= p.fim);
}

/**
 * Reconstrói os períodos em exercício de um deputado numa legislatura a partir
 * do histórico (posse, licenças, afastamentos, fim de mandato).
 *
 * Cada entrada com situação "Exercício" abre um período, se ainda não houver
 * um aberto. Qualquer outra situação o fecha no dia anterior, exceto o fim de
 * mandato, em que o último dia ainda conta. Entradas sem situação (registros
 * de nome e partido) não mudam o período. Tudo é limitado às datas da
 * legislatura e a hoje.
 */
export function calcularMandato(
  historico: ItemHistorico[],
  legislatura: Legislatura,
  hoje: string,
): Mandato | null {
  const itens = historico
    .filter((h) => h.idLegislatura === legislatura.id)
    .sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  if (itens.length === 0) return null;

  const limite = legislatura.dataFim < hoje ? legislatura.dataFim : hoje;
  const periodos: Periodo[] = [];
  let aberto: string | null = null;

  for (const item of itens) {
    const data = item.dataHora.slice(0, 10);
    if (item.situacao === "Exercício") {
      aberto ??= data;
    } else if (item.situacao !== null && aberto !== null) {
      const fim = item.situacao === "FIM_MANDATO" ? data : somarDias(data, -1);
      if (fim >= aberto) periodos.push({ inicio: aberto, fim });
      aberto = null;
    }
  }
  if (aberto !== null) periodos.push({ inicio: aberto, fim: limite });

  const recortados = periodos
    .map((p) => ({
      inicio:
        p.inicio < legislatura.dataInicio ? legislatura.dataInicio : p.inicio,
      fim: p.fim > limite ? limite : p.fim,
    }))
    .filter((p) => p.inicio <= p.fim);

  const ultimo =
    itens.findLast((i) => i.siglaPartido !== "") ?? itens[itens.length - 1];
  const legislaturaEmCurso = legislatura.dataFim >= hoje;

  return {
    idLegislatura: legislatura.id,
    nome: ultimo.nome.trim(),
    partido: ultimo.siglaPartido,
    uf: ultimo.siglaUf,
    urlFoto: ultimo.urlFoto,
    periodos: recortados,
    diasEmExercicio: recortados.reduce(
      (s, p) => s + diasEntre(p.inicio, p.fim),
      0,
    ),
    emExercicio: legislaturaEmCurso && aberto !== null,
  };
}
