import { z } from "zod";

/*
 * Formatos publicados na branch `dados` comuns à Câmara e ao Senado, para que
 * o site mostre deputados e senadores com os mesmos componentes. Mudanças aqui
 * precisam ser compatíveis com os arquivos já publicados: o deploy valida os
 * dados atuais antes de a próxima carga rodar, então campos novos entram como
 * opcionais.
 */

const Percentual = z.number().min(0).max(100).nullable();

export const NotaFiscal = z.object({
  data: z.string(),
  categoria: z.string(),
  fornecedor: z.string(),
  documento: z.string(),
  valor: z.number(),
  url: z.string(),
});
export type NotaFiscal = z.infer<typeof NotaFiscal>;

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
  orientacoes: z.record(z.string(), z.string()),
  /** Votação secreta: só há o placar, não o voto de cada um (Senado) */
  secreta: z.boolean().optional(),
});
export type ResumoVotacao = z.infer<typeof ResumoVotacao>;

/**
 * Partido: voto igual ao da maioria dos colegas de partido na votação.
 * Governo: voto igual à orientação da bancada do Governo.
 */
const Alinhamento = z.object({
  /** Votações com referência "Sim" ou "Não" em que o parlamentar votou */
  consideradas: z.number().int().nonnegative(),
  alinhadas: z.number().int().nonnegative(),
  percentual: Percentual,
});
export type Alinhamento = z.infer<typeof Alinhamento>;

export const MandatoNaLegislatura = z.object({
  idLegislatura: z.number(),
  inicio: z.string(),
  fim: z.string(),
  partido: z.string(),
  uf: z.string(),
  periodos: z.array(z.object({ inicio: z.string(), fim: z.string() })),
  diasEmExercicio: z.number().int().nonnegative(),
  despesas: z.object({
    total: z.number(),
    /** Total dividido pelos meses em exercício; null com menos de 30 dias */
    mediaMensal: z.number().nullable(),
    porMes: z.array(z.object({ mes: z.string(), valor: z.number() })),
    porCategoria: z.array(
      z.object({ categoria: z.string(), valor: z.number() }),
    ),
    maioresNotas: z.array(NotaFiscal),
  }),
  proposicoes: z.object({
    apresentadas: z.number().int().nonnegative(),
    comoPrimeiroAutor: z.number().int().nonnegative(),
    viraramNorma: z.number().int().nonnegative(),
    porTipo: z.record(z.string(), z.number()),
    /** As mais recentes, até o limite; `listaCompleta` diz se coube tudo */
    lista: z.array(ProposicaoResumo.extend({ primeiroAutor: z.boolean() })),
    listaCompleta: z.boolean(),
  }),
  presenca: z.object({
    /** Câmara: sessões deliberativas. Senado: votações nominais. */
    sessoes: z.number().int().nonnegative(),
    presencas: z.number().int().nonnegative(),
    percentual: Percentual,
    /** Ausências com motivo oficial (licença, missão, atividade parlamentar). Só no Senado. */
    ausenciasJustificadas: z.number().int().nonnegative().optional(),
    /** [data, 1 = presente | 0 = ausente], uma entrada por sessão ou votação */
    calendario: z.array(
      z.tuple([z.string(), z.union([z.literal(0), z.literal(1)])]),
    ),
  }),
  votacoes: z.object({
    votosRegistrados: z.number().int().nonnegative(),
    alinhamentoPartido: Alinhamento,
    alinhamentoGoverno: Alinhamento,
    /** idVotacao → voto */
    votos: z.record(z.string(), z.string()),
  }),
});
export type MandatoNaLegislatura = z.infer<typeof MandatoNaLegislatura>;

export const Parlamentar = z.object({
  versao: z.literal(1),
  id: z.number(),
  slug: z.string(),
  nome: z.string(),
  nomeCivil: z.string().optional(),
  partido: z.string(),
  uf: z.string(),
  urlFoto: z.string(),
  emExercicio: z.boolean(),
  urlFonte: z.string(),
  atualizadoEm: z.string(),
  legislaturas: z.array(MandatoNaLegislatura),
});
export type Parlamentar = z.infer<typeof Parlamentar>;

export const ItemIndice = Parlamentar.pick({
  id: true,
  slug: true,
  nome: true,
  nomeCivil: true,
  partido: true,
  uf: true,
  urlFoto: true,
  emExercicio: true,
}).extend({ legislaturas: z.array(z.number()) });
export type ItemIndice = z.infer<typeof ItemIndice>;

export const Medianas = z.object({
  /** Quantos parlamentares entraram no cálculo */
  n: z.number().int().nonnegative(),
  presencaPercentual: z.number().nullable(),
  /** Inclui coautorias; bancadas que assinam em grupo puxam este número */
  proposicoesApresentadas: z.number().nullable(),
  proposicoesComoPrimeiroAutor: z.number().nullable(),
  viraramNorma: z.number().nullable(),
  despesaMediaMensal: z.number().nullable(),
});
export type Medianas = z.infer<typeof Medianas>;

export const Agregados = z.object({
  versao: z.literal(1),
  atualizadoEm: z.string(),
  criterio: z.string(),
  legislaturas: z.array(
    z.object({
      idLegislatura: z.number(),
      inicio: z.string(),
      fim: z.string(),
      casa: Medianas,
      partidos: z.record(z.string(), Medianas),
      ufs: z.record(z.string(), Medianas),
    }),
  ),
});
export type Agregados = z.infer<typeof Agregados>;

export const ListaVotacoes = z.object({
  versao: z.literal(1),
  atualizadoEm: z.string(),
  votacoes: z.array(ResumoVotacao.extend({ idLegislatura: z.number() })),
});
export type ListaVotacoes = z.infer<typeof ListaVotacoes>;
