import { z } from "zod";

/*
 * Formato bruto das APIs do Senado. Só os campos usados são declarados. As APIs
 * mais antigas convertem XML em JSON, então uma lista com um item às vezes
 * chega como objeto: `lista()` aceita os dois.
 */

const lista = <T extends z.ZodType>(item: T) =>
  z
    .union([z.array(item), item])
    .nullish()
    .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v]));

const texto = z
  .string()
  .nullish()
  .transform((v) => v ?? "");

const numero = z.coerce.number();

// --- /senador/lista/legislatura/{n}

const PeriodoLegislatura = z.object({
  NumeroLegislatura: numero,
  DataInicio: z.string(),
  DataFim: z.string(),
});

const Exercicio = z.object({
  DataInicio: z.string(),
  DataFim: z.string().optional(),
  DescricaoCausaAfastamento: z.string().optional(),
});

export const MandatoSenado = z.object({
  UfParlamentar: texto,
  DescricaoParticipacao: texto,
  PrimeiraLegislaturaDoMandato: PeriodoLegislatura.optional(),
  SegundaLegislaturaDoMandato: PeriodoLegislatura.optional(),
  Exercicios: z
    .object({ Exercicio: lista(Exercicio) })
    .nullish()
    .transform((v) => v?.Exercicio ?? []),
});
export type MandatoSenado = z.infer<typeof MandatoSenado>;

export const SenadorDaLista = z.object({
  IdentificacaoParlamentar: z.object({
    CodigoParlamentar: numero,
    NomeParlamentar: z.string(),
    NomeCompletoParlamentar: texto,
    UrlFotoParlamentar: texto,
    UrlPaginaParlamentar: texto,
  }),
});
export type SenadorDaLista = z.infer<typeof SenadorDaLista>;

export const ListaDaLegislatura = z.object({
  ListaParlamentarLegislatura: z.object({
    Parlamentares: z.object({ Parlamentar: lista(z.unknown()) }),
  }),
});

// --- /senador/{codigo}/mandatos

export const RespostaMandatos = z.object({
  MandatoParlamentar: z.object({
    Parlamentar: z.object({
      Mandatos: z
        .object({ Mandato: lista(MandatoSenado) })
        .nullish()
        .transform((v) => v?.Mandato ?? []),
    }),
  }),
});

// --- /senador/{codigo}/filiacoes

export const Filiacao = z.object({
  Partido: z.object({ SiglaPartido: z.string() }),
  DataFiliacao: z.string(),
  DataDesfiliacao: z.string().optional(),
});
export type Filiacao = z.infer<typeof Filiacao>;

export const RespostaFiliacoes = z.object({
  FiliacaoParlamentar: z.object({
    Parlamentar: z.object({
      Filiacoes: z
        .object({ Filiacao: lista(Filiacao) })
        .nullish()
        .transform((v) => v?.Filiacao ?? []),
    }),
  }),
});

// --- /votacao

export const VotoSenado = z.object({
  codigoParlamentar: numero,
  siglaPartidoParlamentar: texto,
  siglaVotoParlamentar: texto,
});
export type VotoSenado = z.infer<typeof VotoSenado>;

export const VotacaoSenado = z.object({
  codigoSessaoVotacao: numero,
  sequencialVotacao: numero,
  dataSessao: z.string(),
  descricaoVotacao: texto,
  resultadoVotacao: texto,
  votacaoSecreta: texto,
  totalVotosSim: numero.nullish().transform((v) => v ?? 0),
  totalVotosNao: numero.nullish().transform((v) => v ?? 0),
  totalVotosAbstencao: numero.nullish().transform((v) => v ?? 0),
  idProcesso: numero.nullish(),
  identificacao: texto,
  ementa: texto,
  votos: lista(VotoSenado),
});
export type VotacaoSenado = z.infer<typeof VotacaoSenado>;

// --- /plenario/votacao/orientacaoBancada/{inicio}/{fim}

export const OrientacaoSenado = z.object({
  sequencialVotacao: numero,
  orientacoesLideranca: lista(z.object({ partido: z.string(), voto: texto })),
});
export type OrientacaoSenado = z.infer<typeof OrientacaoSenado>;

// --- adm-dadosabertos: /senadores/despesas_ceaps/{ano}

export const DespesaCeaps = z.object({
  codSenador: numero,
  ano: numero,
  mes: numero,
  tipoDespesa: texto,
  cpfCnpj: texto,
  fornecedor: texto,
  data: texto,
  valorReembolsado: numero,
});
export type DespesaCeaps = z.infer<typeof DespesaCeaps>;

// --- /processo?codigoParlamentarAutor={codigo}

export const ProcessoSenado = z.object({
  id: numero,
  identificacao: z.string(),
  autoria: texto,
  ementa: texto,
  dataApresentacao: z.string(),
  situacaoAtual: texto,
  dataSituacaoAtual: texto,
  normaGerada: z.unknown().optional(),
});
export type ProcessoSenado = z.infer<typeof ProcessoSenado>;
