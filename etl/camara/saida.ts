import { z } from "zod";
import { NotaFiscal, ProposicaoResumo, ResumoVotacao } from "./parcial";

/*
 * Formato dos arquivos publicados na branch `dados`, lidos pelo site no build.
 * Qualquer mudança aqui precisa ser compatível com as páginas que os leem.
 */

const Percentual = z.number().min(0).max(100).nullable();

/**
 * Partido: voto igual ao da maioria dos colegas de partido na votação.
 * Governo: voto igual à orientação da bancada do Governo.
 */
const Alinhamento = z.object({
  /** Votações com referência "Sim" ou "Não" em que o deputado votou */
  consideradas: z.number().int().nonnegative(),
  alinhadas: z.number().int().nonnegative(),
  percentual: Percentual,
});

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
    sessoes: z.number().int().nonnegative(),
    presencas: z.number().int().nonnegative(),
    percentual: Percentual,
    /** [data, 1 = presente | 0 = ausente], uma entrada por sessão */
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

export const Deputado = z.object({
  versao: z.literal(1),
  id: z.number(),
  slug: z.string(),
  nome: z.string(),
  partido: z.string(),
  uf: z.string(),
  urlFoto: z.string(),
  emExercicio: z.boolean(),
  urlFonte: z.string(),
  atualizadoEm: z.string(),
  legislaturas: z.array(MandatoNaLegislatura),
});
export type Deputado = z.infer<typeof Deputado>;

export const ItemIndice = Deputado.pick({
  id: true,
  slug: true,
  nome: true,
  partido: true,
  uf: true,
  urlFoto: true,
  emExercicio: true,
}).extend({ legislaturas: z.array(z.number()) });

export const IndiceDeputados = z.object({
  versao: z.literal(1),
  atualizadoEm: z.string(),
  deputados: z.array(ItemIndice),
});
export type IndiceDeputados = z.infer<typeof IndiceDeputados>;

export const Medianas = z.object({
  /** Quantos deputados entraram no cálculo */
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

export const Fontes = z.object({
  versao: z.literal(1),
  camara: z.object({
    atualizadoEm: z.string(),
    /** ano → quando o ano foi processado pela última vez */
    anos: z.record(z.string(), z.string()),
    origem: z.array(z.object({ descricao: z.string(), url: z.string() })),
  }),
});
export type Fontes = z.infer<typeof Fontes>;
