import { z } from "zod";

/*
 * Dados eleitorais do TSE, publicados em `dados/tse/`. O CPF dos candidatos
 * não é divulgado pelo TSE, então o cruzamento com os parlamentares é por nome
 * completo e UF. Bens declarados aparecem só como totais por tipo: a descrição
 * de cada bem (que inclui endereços) não é publicada.
 */

export const CARGOS = {
  1: "Presidente",
  3: "Governador",
  5: "Senador",
  6: "Deputado Federal",
  7: "Deputado Estadual",
  8: "Deputado Distrital",
  9: "1º Suplente de Senador",
  10: "2º Suplente de Senador",
} as const;

export const Candidatura = z.object({
  ano: z.number(),
  /** Sequencial do candidato no TSE, único por eleição */
  sq: z.string(),
  cargo: z.string(),
  uf: z.string(),
  partido: z.string(),
  numero: z.string(),
  nome: z.string(),
  nomeUrna: z.string(),
  situacaoCandidatura: z.string(),
  /** "ELEITO POR QP", "SUPLENTE", "NÃO ELEITO"... (o do último turno) */
  resultado: z.string(),
  /** Votos nominais no 1º turno */
  votos: z.number().int().nonnegative(),
  bens: z.object({
    total: z.number(),
    porTipo: z.array(z.object({ tipo: z.string(), valor: z.number() })),
  }),
});
export type Candidatura = z.infer<typeof Candidatura>;

/** Resultado intermediário de uma eleição, guardado para não baixar de novo. */
export const ParcialEleicao = z.object({
  versao: z.literal(1),
  ano: z.number(),
  geradoEm: z.string(),
  candidaturas: z.array(Candidatura),
});
export type ParcialEleicao = z.infer<typeof ParcialEleicao>;

export const EleicoesDoParlamentar = z.object({
  versao: z.literal(1),
  casa: z.enum(["camara", "senado"]),
  id: z.number(),
  atualizadoEm: z.string(),
  eleicoes: z.array(Candidatura.omit({ sq: true, nome: true })),
});
export type EleicoesDoParlamentar = z.infer<typeof EleicoesDoParlamentar>;

export const DiagnosticoTse = z.object({
  atualizadoEm: z.string(),
  comEleicoes: z.number(),
  semEleicoes: z.array(
    z.object({ casa: z.string(), id: z.number(), nome: z.string() }),
  ),
  ambiguos: z.array(
    z.object({
      casa: z.string(),
      id: z.number(),
      nome: z.string(),
      ano: z.number(),
    }),
  ),
});
