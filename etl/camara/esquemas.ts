import { z } from "zod";

/*
 * Formato bruto das fontes da Câmara. Só os campos usados são declarados;
 * o Zod descarta o resto. Números que às vezes chegam como texto usam
 * `z.coerce`.
 */

const numero = z.coerce.number();
const textoOuVazio = z
  .string()
  .nullish()
  .transform((v) => v ?? "");

// --- API: /deputados?idLegislatura=N

export const DeputadoDaLista = z.object({
  id: z.number(),
  nome: z.string(),
  siglaPartido: textoOuVazio,
  siglaUf: textoOuVazio,
  idLegislatura: z.number(),
  urlFoto: textoOuVazio,
});
export type DeputadoDaLista = z.infer<typeof DeputadoDaLista>;

// --- API: /deputados/{id}/historico

export const ItemHistorico = z.object({
  id: z.number(),
  nome: z.string(),
  nomeEleitoral: textoOuVazio,
  siglaPartido: textoOuVazio,
  siglaUf: textoOuVazio,
  idLegislatura: z.number(),
  urlFoto: textoOuVazio,
  dataHora: z.string(),
  situacao: z.string().nullable(),
  condicaoEleitoral: z.string().nullable(),
  descricaoStatus: textoOuVazio,
});
export type ItemHistorico = z.infer<typeof ItemHistorico>;

// --- Arquivo: cotas/Ano-AAAA.json (Cota para o Exercício da Atividade Parlamentar)

export const Despesa = z.object({
  // Ausente nas despesas de lideranças, que não são de um deputado
  idDeputado: numero.optional(),
  codigoLegislatura: numero,
  descricao: z.string(),
  fornecedor: textoOuVazio,
  cnpjCPF: textoOuVazio,
  dataEmissao: textoOuVazio,
  valorLiquido: numero,
  mes: numero,
  ano: numero,
  urlDocumento: textoOuVazio,
});
export type Despesa = z.infer<typeof Despesa>;

// --- Arquivo: votacoes-AAAA.json

export const Votacao = z.object({
  id: z.string(),
  data: z.string(),
  siglaOrgao: z.string(),
  aprovacao: z.number().nullish(),
  votosSim: numero,
  votosNao: numero,
  votosOutros: numero,
  descricao: textoOuVazio,
});
export type Votacao = z.infer<typeof Votacao>;

// --- Arquivo: votacoesProposicoes-AAAA.json

export const VotacaoProposicao = z.object({
  idVotacao: z.string(),
  proposicao_: z.object({
    id: z.number(),
    titulo: textoOuVazio,
    ementa: textoOuVazio,
  }),
});
export type VotacaoProposicao = z.infer<typeof VotacaoProposicao>;

// --- Arquivo: votacoesVotos-AAAA.json

export const Voto = z.object({
  idVotacao: z.string(),
  voto: textoOuVazio,
  deputado_: z.object({
    id: numero,
    siglaPartido: textoOuVazio,
    siglaUf: textoOuVazio,
    idLegislatura: numero,
  }),
});
export type Voto = z.infer<typeof Voto>;

// --- Arquivo: votacoesOrientacoes-AAAA.json

export const Orientacao = z.object({
  idVotacao: z.string(),
  siglaBancada: z.string(),
  orientacao: textoOuVazio,
});
export type Orientacao = z.infer<typeof Orientacao>;

// --- Arquivo: eventos-AAAA.json

export const Evento = z.object({
  id: z.number(),
  dataHoraInicio: z.string(),
  situacao: textoOuVazio,
  descricaoTipo: textoOuVazio,
  localCamara: z
    .object({ nome: textoOuVazio })
    .nullish()
    .transform((v) => v ?? { nome: "" }),
});
export type Evento = z.infer<typeof Evento>;

// --- Arquivo: eventosPresencaDeputados-AAAA.json

export const Presenca = z.object({
  idEvento: z.number(),
  idDeputado: numero,
});
export type Presenca = z.infer<typeof Presenca>;

// --- Arquivo: proposicoes-AAAA.json

export const Proposicao = z.object({
  id: z.number(),
  siglaTipo: z.string(),
  numero: numero,
  ano: numero,
  ementa: textoOuVazio,
  dataApresentacao: z.string(),
  ultimoStatus: z.object({
    data: textoOuVazio,
    descricaoSituacao: textoOuVazio,
  }),
});
export type Proposicao = z.infer<typeof Proposicao>;

// --- Arquivo: proposicoesAutores-AAAA.json

export const AutorProposicao = z.object({
  idProposicao: z.number(),
  idDeputadoAutor: numero.optional(),
  codTipoAutor: numero,
  ordemAssinatura: numero,
  proponente: numero,
});
export type AutorProposicao = z.infer<typeof AutorProposicao>;
