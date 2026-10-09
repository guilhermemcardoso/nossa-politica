import { z } from "zod";

/*
 * Resultado intermediário de um ano. Fica salvo na branch `dados`
 * (`camara/_parciais/AAAA.json`) para que a carga diária reprocesse só os
 * anos recentes e reaproveite os antigos.
 */

const Valor = z.number();
const PorChave = <T extends z.ZodType>(valor: T) => z.record(z.string(), valor);

export const NotaFiscal = z.object({
  data: z.string(),
  categoria: z.string(),
  fornecedor: z.string(),
  documento: z.string(),
  valor: Valor,
  url: z.string(),
});
export type NotaFiscal = z.infer<typeof NotaFiscal>;

export const DespesasDoAno = z.object({
  /** "AAAA-MM" → valor líquido */
  porMes: PorChave(Valor),
  /** categoria → valor líquido */
  porCategoria: PorChave(Valor),
  maioresNotas: z.array(NotaFiscal),
});
export type DespesasDoAno = z.infer<typeof DespesasDoAno>;

export const ResumoVotacao = z.object({
  id: z.string(),
  data: z.string(),
  descricao: z.string(),
  aprovada: z.boolean().nullable(),
  placar: z.object({ sim: z.number(), nao: z.number(), outros: z.number() }),
  proposicao: z
    .object({ id: z.number(), titulo: z.string(), ementa: z.string() })
    .nullable(),
  /** bancada → "Sim" | "Não" | "Liberado" | "Obstrução" */
  orientacoes: PorChave(z.string()),
});
export type ResumoVotacao = z.infer<typeof ResumoVotacao>;

/** [idVotacao, voto, partido do deputado no momento do voto] */
export const VotoCompacto = z.tuple([z.string(), z.string(), z.string()]);
export type VotoCompacto = z.infer<typeof VotoCompacto>;

export const ProposicaoResumo = z.object({
  id: z.number(),
  sigla: z.string(),
  tipo: z.string(),
  ementa: z.string(),
  dataApresentacao: z.string(),
  situacao: z.string(),
  dataSituacao: z.string(),
});
export type ProposicaoResumo = z.infer<typeof ProposicaoResumo>;

/** [idProposicao, ordem de assinatura] */
export const Autoria = z.tuple([z.number(), z.number()]);

export const ParcialAno = z.object({
  versao: z.literal(1),
  ano: z.number(),
  geradoEm: z.string(),
  /** idDeputado → idLegislatura → despesas */
  despesas: PorChave(PorChave(DespesasDoAno)),
  votacoes: z.array(ResumoVotacao),
  /** idDeputado → votos em votações nominais do Plenário */
  votos: PorChave(z.array(VotoCompacto)),
  /** Sessões deliberativas do Plenário */
  sessoes: z.array(z.object({ id: z.number(), data: z.string() })),
  /** idDeputado → ids das sessões em que registrou presença */
  presencas: PorChave(z.array(z.number())),
  proposicoes: z.array(ProposicaoResumo),
  /** idDeputado → proposições que assina como autor */
  autorias: PorChave(z.array(Autoria)),
});
export type ParcialAno = z.infer<typeof ParcialAno>;
