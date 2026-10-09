import type { Legislatura } from "../camara/api";
import { dentroDosPeriodos } from "../camara/mandatos";
import {
  comparar,
  maioriaDosColegas,
  normalizarVoto,
  orientacaoDoGoverno,
  type PlacarPartido,
} from "../comum/alinhamento";
import {
  atribuirSlugs,
  ContadorAlinhamento,
  CRITERIO_MEDIANAS,
  calcularMedianas,
  ehTipoDeProjeto,
  LIMITE_LISTA_PROPOSICOES,
  maioresNotas,
  mediaMensal,
} from "../comum/consolidacao";
import type {
  Agregados,
  ItemIndice,
  ListaVotacoes,
  MandatoNaLegislatura,
  NotaFiscal,
  Parlamentar,
  ResumoVotacao,
} from "../comum/saida";
import { centavos, percentual } from "../lib/estatistica";
import { mascararDocumento, mesmoNome, removerAcentos } from "../lib/texto";
import type {
  DespesaCeaps,
  Filiacao,
  MandatoSenado,
  OrientacaoSenado,
  ProcessoSenado,
  SenadorDaLista,
  VotacaoSenado,
} from "./esquemas";
import { calcularMandatoSenador, type MandatoSenador } from "./mandatos";

export interface DadosDoSenador {
  lista: SenadorDaLista;
  mandatos: MandatoSenado[];
  filiacoes: Filiacao[];
  processos: ProcessoSenado[];
}

export interface EntradaSenado {
  legislaturas: Legislatura[];
  senadores: Map<number, DadosDoSenador>;
  votacoes: VotacaoSenado[];
  orientacoes: OrientacaoSenado[];
  despesas: DespesaCeaps[];
  hoje: string;
  atualizadoEm: string;
}

export interface IndiceSenadores {
  versao: 1;
  atualizadoEm: string;
  senadores: ItemIndice[];
}

export interface SaidaSenado {
  senadores: Parlamentar[];
  indice: IndiceSenadores;
  agregados: Agregados;
  votacoes: ListaVotacoes;
}

const normalizar = (texto: string) =>
  removerAcentos(texto).toUpperCase().replace(/\s+/g, " ").trim();

// --- Presença nas votações nominais

export type Comparecimento = "presente" | "justificada" | "ausente" | null;

/**
 * Cada votação nominal registra, para cada senador, o voto ou o motivo da
 * ausência. "Votou" aparece nas votações secretas; P-NRV é "presente, não
 * registrou voto". Licenças (LS, LP...), missão (MIS) e atividade parlamentar
 * (AP) são ausências com motivo oficial; NCom é "não compareceu".
 */
export function classificarComparecimento(sigla: string): Comparecimento {
  const s = normalizar(sigla);
  if (
    ["SIM", "NAO", "ABSTENCAO", "VOTOU", "P-NRV", "OBSTRUCAO"].includes(s) ||
    s.startsWith("PRESIDENTE")
  ) {
    return "presente";
  }
  if (s === "AP" || s === "MIS" || /^L[A-Z]{1,3}$/.test(s))
    return "justificada";
  if (s === "NCOM") return "ausente";
  return null; // "NA" (dispositivo não citado) e códigos desconhecidos
}

/** "Senador Romário (PL/RJ), Senadora ..." → "Romário" */
export function primeiroAutor(autoria: string): string {
  const primeiro = autoria.split(/\),\s*/)[0] ?? "";
  return primeiro
    .replace(/\s*\(.*$/, "")
    .replace(/^Senador(a)?\s+/i, "")
    .trim();
}

const SECRETA = "S";

export function consolidarSenado(entrada: EntradaSenado): SaidaSenado {
  const { legislaturas, hoje, atualizadoEm } = entrada;
  const legislaturaDaData = (data: string) =>
    legislaturas.find((l) => l.dataInicio <= data && data <= l.dataFim);

  // Orientações por votação (casadas pelo sequencial da votação)
  const orientacoesPorSequencial = new Map<number, Record<string, string>>();
  for (const o of entrada.orientacoes) {
    const mapa: Record<string, string> = {};
    for (const { partido, voto } of o.orientacoesLideranca) {
      mapa[partido.trim()] = normalizarVoto(voto) ?? voto;
    }
    orientacoesPorSequencial.set(o.sequencialVotacao, mapa);
  }

  // Votações, placar por partido e votos por senador
  const resumos = new Map<
    string,
    { votacao: ResumoVotacao; idLegislatura: number }
  >();
  const placares = new Map<string, Map<string, PlacarPartido>>();
  const votosPorSenador = new Map<
    number,
    Array<{
      id: string;
      data: string;
      voto: string;
      partido: string;
      secreta: boolean;
    }>
  >();
  for (const v of entrada.votacoes) {
    const legislatura = legislaturaDaData(v.dataSessao);
    if (!legislatura) continue;
    const id = String(v.codigoSessaoVotacao);
    const secreta = v.votacaoSecreta === SECRETA;
    resumos.set(id, {
      idLegislatura: legislatura.id,
      votacao: {
        id,
        data: v.dataSessao,
        descricao: v.descricaoVotacao.trim(),
        aprovada:
          v.resultadoVotacao === "A"
            ? true
            : v.resultadoVotacao === "R"
              ? false
              : null,
        placar: {
          sim: v.totalVotosSim,
          nao: v.totalVotosNao,
          outros: v.totalVotosAbstencao,
        },
        proposicao:
          v.idProcesso != null
            ? {
                id: v.idProcesso,
                titulo: v.identificacao,
                ementa: v.ementa.trim(),
              }
            : null,
        orientacoes: orientacoesPorSequencial.get(v.sequencialVotacao) ?? {},
        secreta,
      },
    });

    const porPartido = new Map<string, PlacarPartido>();
    for (const voto of v.votos) {
      const lista = votosPorSenador.get(voto.codigoParlamentar) ?? [];
      lista.push({
        id,
        data: v.dataSessao,
        voto: voto.siglaVotoParlamentar,
        partido: voto.siglaPartidoParlamentar,
        secreta,
      });
      votosPorSenador.set(voto.codigoParlamentar, lista);

      const normalizado = normalizarVoto(voto.siglaVotoParlamentar);
      if (secreta || (normalizado !== "Sim" && normalizado !== "Não")) continue;
      const placar = porPartido.get(voto.siglaPartidoParlamentar) ?? {
        sim: 0,
        nao: 0,
      };
      if (normalizado === "Sim") placar.sim++;
      else placar.nao++;
      porPartido.set(voto.siglaPartidoParlamentar, placar);
    }
    placares.set(id, porPartido);
  }

  const despesasPorSenador = new Map<number, DespesaCeaps[]>();
  for (const d of entrada.despesas) {
    const lista = despesasPorSenador.get(d.codSenador) ?? [];
    lista.push(d);
    despesasPorSenador.set(d.codSenador, lista);
  }

  // Um arquivo por senador
  const semSlug: Omit<Parlamentar, "slug">[] = [];
  const mandatosPorLegislatura = new Map<number, MandatoNaLegislatura[]>();

  for (const [codigo, dados] of [...entrada.senadores].sort(
    ([a], [b]) => a - b,
  )) {
    const doSenador: MandatoNaLegislatura[] = [];
    let atual: MandatoSenador | null = null;
    for (const legislatura of legislaturas) {
      const base = calcularMandatoSenador(
        dados.mandatos,
        dados.filiacoes,
        legislatura,
        hoje,
      );
      if (!base) continue;
      atual = base;
      const mandato = montarMandato(
        base,
        legislatura,
        dados,
        votosPorSenador.get(codigo) ?? [],
        despesasPorSenador.get(codigo) ?? [],
        resumos,
        placares,
      );
      doSenador.push(mandato);
      const lista = mandatosPorLegislatura.get(legislatura.id) ?? [];
      lista.push(mandato);
      mandatosPorLegislatura.set(legislatura.id, lista);
    }
    if (!atual) continue;

    const id = dados.lista.IdentificacaoParlamentar;
    semSlug.push({
      versao: 1,
      id: codigo,
      nome: id.NomeParlamentar.trim(),
      nomeCivil: id.NomeCompletoParlamentar.trim() || undefined,
      partido: atual.partido,
      uf: atual.uf,
      urlFoto:
        id.UrlFotoParlamentar.replace(/^http:/, "https:") ||
        `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${codigo}.jpg`,
      emExercicio: atual.emExercicio,
      urlFonte: `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${codigo}`,
      atualizadoEm,
      legislaturas: doSenador,
    });
  }

  const senadores = atribuirSlugs(semSlug);
  return {
    senadores,
    indice: {
      versao: 1,
      atualizadoEm,
      senadores: senadores
        .map((s) => ({
          id: s.id,
          slug: s.slug,
          nome: s.nome,
          nomeCivil: s.nomeCivil,
          partido: s.partido,
          uf: s.uf,
          urlFoto: s.urlFoto,
          emExercicio: s.emExercicio,
          legislaturas: s.legislaturas.map((l) => l.idLegislatura),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    },
    agregados: {
      versao: 1,
      atualizadoEm,
      criterio: CRITERIO_MEDIANAS,
      legislaturas: legislaturas.map((l) => ({
        idLegislatura: l.id,
        inicio: l.dataInicio,
        fim: l.dataFim,
        ...calcularMedianas(mandatosPorLegislatura.get(l.id) ?? []),
      })),
    },
    votacoes: {
      versao: 1,
      atualizadoEm,
      votacoes: [...resumos.values()]
        .map(({ votacao, idLegislatura }) => ({ ...votacao, idLegislatura }))
        .sort(
          (a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id),
        ),
    },
  };
}

function montarMandato(
  base: MandatoSenador,
  legislatura: Legislatura,
  dados: DadosDoSenador,
  votos: Array<{
    id: string;
    data: string;
    voto: string;
    partido: string;
    secreta: boolean;
  }>,
  despesas: DespesaCeaps[],
  resumos: Map<string, { votacao: ResumoVotacao; idLegislatura: number }>,
  placares: Map<string, Map<string, PlacarPartido>>,
): MandatoNaLegislatura {
  const naLegislatura = (data: string) =>
    legislatura.dataInicio <= data && data <= legislatura.dataFim;

  // Despesas: o mês define a legislatura
  const porMes = new Map<string, number>();
  const porCategoria = new Map<string, number>();
  const notas: NotaFiscal[] = [];
  for (const d of despesas) {
    const mes = `${d.ano}-${String(d.mes).padStart(2, "0")}`;
    if (!naLegislatura(`${mes}-01`)) continue;
    const categoria =
      d.tipoDespesa && d.tipoDespesa !== "null"
        ? d.tipoDespesa.trim()
        : "Não informado";
    porMes.set(mes, (porMes.get(mes) ?? 0) + d.valorReembolsado);
    porCategoria.set(
      categoria,
      (porCategoria.get(categoria) ?? 0) + d.valorReembolsado,
    );
    if (d.valorReembolsado > 0) {
      notas.push({
        data: d.data.slice(0, 10) || `${mes}-01`,
        categoria,
        fornecedor: d.fornecedor.trim(),
        documento: mascararDocumento(d.cpfCnpj),
        valor: d.valorReembolsado,
        url: "",
      });
    }
  }
  const total = centavos([...porMes.values()].reduce((s, v) => s + v, 0));

  // Presença e votos
  const calendario: Array<[string, 0 | 1]> = [];
  let justificadas = 0;
  const votosRegistrados: Record<string, string> = {};
  const partido = new ContadorAlinhamento();
  const governo = new ContadorAlinhamento();
  for (const v of votos.sort((a, b) => a.data.localeCompare(b.data))) {
    const resumo = resumos.get(v.id);
    if (resumo?.idLegislatura !== legislatura.id) continue;
    if (!dentroDosPeriodos(v.data, base.periodos)) continue;

    const comparecimento = classificarComparecimento(v.voto);
    if (comparecimento === null) continue;
    calendario.push([v.data, comparecimento === "presente" ? 1 : 0]);
    if (comparecimento === "justificada") justificadas++;
    if (comparecimento !== "presente") continue;

    votosRegistrados[v.id] = v.voto;
    if (v.secreta) continue;
    const placar = placares.get(v.id)?.get(v.partido);
    partido.registrar(comparar(v.voto, maioriaDosColegas(placar, v.voto)));
    governo.registrar(
      comparar(v.voto, orientacaoDoGoverno(resumo.votacao.orientacoes)),
    );
  }
  const presencas = calendario.filter(([, p]) => p === 1).length;

  // Projetos
  const nome = dados.lista.IdentificacaoParlamentar.NomeParlamentar;
  const proprios = dados.processos
    .filter((p) => ehTipoDeProjeto(p.identificacao.split(" ")[0]))
    .filter((p) => naLegislatura(p.dataApresentacao.slice(0, 10)))
    .sort(
      (a, b) =>
        b.dataApresentacao.localeCompare(a.dataApresentacao) || b.id - a.id,
    )
    .map((p) => ({
      id: p.id,
      sigla: p.identificacao,
      tipo: p.identificacao.split(" ")[0],
      ementa: p.ementa.trim(),
      dataApresentacao: p.dataApresentacao.slice(0, 10),
      situacao: p.situacaoAtual.trim(),
      dataSituacao: p.dataSituacaoAtual.slice(0, 10),
      primeiroAutor: mesmoNome(primeiroAutor(p.autoria), nome),
      virouNorma: p.normaGerada != null && p.normaGerada !== "",
    }));
  const porTipo: Record<string, number> = {};
  for (const p of proprios) porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + 1;

  return {
    idLegislatura: legislatura.id,
    inicio: legislatura.dataInicio,
    fim: legislatura.dataFim,
    partido: base.partido,
    uf: base.uf,
    periodos: base.periodos,
    diasEmExercicio: base.diasEmExercicio,
    despesas: {
      total,
      mediaMensal: mediaMensal(total, base.diasEmExercicio),
      porMes: [...porMes]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, valor]) => ({ mes, valor: centavos(valor) })),
      porCategoria: [...porCategoria]
        .map(([categoria, valor]) => ({ categoria, valor: centavos(valor) }))
        .sort((a, b) => b.valor - a.valor),
      maioresNotas: maioresNotas(notas),
    },
    proposicoes: {
      apresentadas: proprios.length,
      comoPrimeiroAutor: proprios.filter((p) => p.primeiroAutor).length,
      viraramNorma: proprios.filter((p) => p.virouNorma).length,
      porTipo,
      lista: proprios
        .slice(0, LIMITE_LISTA_PROPOSICOES)
        .map(({ virouNorma: _, ...p }) => p),
      listaCompleta: proprios.length <= LIMITE_LISTA_PROPOSICOES,
    },
    presenca: {
      sessoes: calendario.length,
      presencas,
      percentual: percentual(presencas, calendario.length),
      ausenciasJustificadas: justificadas,
      calendario,
    },
    votacoes: {
      votosRegistrados: Object.keys(votosRegistrados).length,
      alinhamentoPartido: partido.resultado(),
      alinhamentoGoverno: governo.resultado(),
      votos: votosRegistrados,
    },
  };
}
