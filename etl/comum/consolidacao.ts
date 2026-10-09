import { centavos, mediana, percentual } from "../lib/estatistica";
import { slugificar } from "../lib/texto";
import type { Comparacao } from "./alinhamento";
import type {
  Alinhamento,
  MandatoNaLegislatura,
  Medianas,
  NotaFiscal,
} from "./saida";

/** Mínimo de dias em exercício para o parlamentar entrar no cálculo das medianas. */
export const DIAS_MINIMOS_PARA_MEDIANA = 90;

export const DIAS_POR_MES = 365.25 / 12;

/** Quantas proposições e notas fiscais guardar em listas por parlamentar. */
export const LIMITE_LISTA_PROPOSICOES = 100;
export const LIMITE_MAIORES_NOTAS = 10;

export function maioresNotas(notas: NotaFiscal[]): NotaFiscal[] {
  return [...notas]
    .sort((a, b) => b.valor - a.valor || a.data.localeCompare(b.data))
    .slice(0, LIMITE_MAIORES_NOTAS)
    .map((n) => ({ ...n, valor: centavos(n.valor) }));
}

/** Total por mês em exercício; null com menos de 30 dias, quando a média não diz nada. */
export function mediaMensal(
  total: number,
  diasEmExercicio: number,
): number | null {
  return diasEmExercicio >= 30
    ? centavos(total / (diasEmExercicio / DIAS_POR_MES))
    : null;
}

export const CRITERIO_MEDIANAS = `Medianas entre parlamentares com pelo menos ${DIAS_MINIMOS_PARA_MEDIANA} dias em exercício na legislatura, agrupados pelo partido e UF no fim da legislatura (ou hoje, na atual).`;

/**
 * Tipos de proposição contados como "projetos". Requerimentos, emendas e
 * pareceres ficam de fora: são dezenas de milhares por ano e inflariam a conta.
 */
export const TIPOS_DE_PROJETO = ["PL", "PLP", "PEC", "PDL"] as const;
export const ehTipoDeProjeto = (tipo: string) =>
  (TIPOS_DE_PROJETO as readonly string[]).includes(tipo);

/** Conta votações alinhadas e consideradas. */
export class ContadorAlinhamento {
  consideradas = 0;
  alinhadas = 0;

  registrar(resultado: Comparacao) {
    if (resultado === null) return;
    this.consideradas++;
    if (resultado === "alinhado") this.alinhadas++;
  }

  resultado(): Alinhamento {
    return {
      consideradas: this.consideradas,
      alinhadas: this.alinhadas,
      percentual: percentual(this.alinhadas, this.consideradas),
    };
  }
}

function medianasDe(mandatos: MandatoNaLegislatura[]): Medianas {
  const valores = (f: (m: MandatoNaLegislatura) => number | null) =>
    mandatos.map(f).filter((v): v is number => v !== null);
  const arredondada = (vs: number[]) => {
    const m = mediana(vs);
    return m === null ? null : centavos(m);
  };
  return {
    n: mandatos.length,
    presencaPercentual: arredondada(valores((m) => m.presenca.percentual)),
    proposicoesApresentadas: arredondada(
      valores((m) => m.proposicoes.apresentadas),
    ),
    proposicoesComoPrimeiroAutor: arredondada(
      valores((m) => m.proposicoes.comoPrimeiroAutor),
    ),
    viraramNorma: arredondada(valores((m) => m.proposicoes.viraramNorma)),
    despesaMediaMensal: arredondada(valores((m) => m.despesas.mediaMensal)),
  };
}

/** Medianas da casa, por partido e por UF, só com quem ficou tempo suficiente. */
export function calcularMedianas(todos: MandatoNaLegislatura[]) {
  const mandatos = todos.filter(
    (m) => m.diasEmExercicio >= DIAS_MINIMOS_PARA_MEDIANA,
  );
  const agrupar = (chave: (m: MandatoNaLegislatura) => string) => {
    const grupos = new Map<string, MandatoNaLegislatura[]>();
    for (const m of mandatos) {
      const k = chave(m);
      if (k === "") continue;
      const grupo = grupos.get(k) ?? [];
      grupo.push(m);
      grupos.set(k, grupo);
    }
    return Object.fromEntries(
      [...grupos]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, ms]) => [k, medianasDe(ms)]),
    );
  };
  return {
    casa: medianasDe(mandatos),
    partidos: agrupar((m) => m.partido),
    ufs: agrupar((m) => m.uf),
  };
}

/**
 * Slug a partir do nome. Em caso de homônimos, o de menor id fica com o slug
 * simples e os demais ganham o id no fim, para que o endereço não mude quando
 * entra um parlamentar novo com o mesmo nome.
 */
export function atribuirSlugs<T extends { id: number; nome: string }>(
  parlamentares: T[],
): Array<T & { slug: string }> {
  const usados = new Set<string>();
  return [...parlamentares]
    .sort((a, b) => a.id - b.id)
    .map((p) => {
      const base = slugificar(p.nome) || String(p.id);
      const slug = usados.has(base) ? `${base}-${p.id}` : base;
      usados.add(slug);
      return { ...p, slug };
    });
}
