import { centavos, mediana, percentual } from "../lib/estatistica";
import { slugificar } from "../lib/texto";
import {
  type Comparacao,
  comparar,
  maioriaDosColegas,
  normalizarVoto,
  orientacaoDoGoverno,
  type PlacarPartido,
} from "./alinhamento";
import type { Legislatura } from "./api";
import {
  DIAS_MINIMOS_PARA_MEDIANA,
  LIMITE_LISTA_PROPOSICOES,
  SITUACAO_VIROU_NORMA,
} from "./config";
import type { DeputadoDaLista, ItemHistorico } from "./esquemas";
import { calcularMandato, dentroDosPeriodos, type Mandato } from "./mandatos";
import type {
  NotaFiscal,
  ParcialAno,
  ProposicaoResumo,
  ResumoVotacao,
} from "./parcial";
import { maioresNotas } from "./processar/despesas";
import type {
  Agregados,
  Deputado,
  IndiceDeputados,
  ListaVotacoes,
  MandatoNaLegislatura,
  Medianas,
} from "./saida";

export interface EntradaConsolidacao {
  legislaturas: Legislatura[];
  /** idLegislatura → deputados da lista da API */
  deputadosPorLegislatura: Map<number, DeputadoDaLista[]>;
  /** idDeputado → histórico */
  historicos: Map<number, ItemHistorico[]>;
  parciais: ParcialAno[];
  hoje: string;
  atualizadoEm: string;
}

export interface SaidaConsolidacao {
  deputados: Deputado[];
  indice: IndiceDeputados;
  agregados: Agregados;
  votacoes: ListaVotacoes;
}

const DIAS_POR_MES = 365.25 / 12;

const legislaturaDaData = (legislaturas: Legislatura[], data: string) =>
  legislaturas.find((l) => l.dataInicio <= data && data <= l.dataFim);

export function consolidar(entrada: EntradaConsolidacao): SaidaConsolidacao {
  const { legislaturas, parciais, hoje, atualizadoEm } = entrada;
  const indices = indexarParciais(parciais, legislaturas);

  const ids = new Set<number>();
  for (const lista of entrada.deputadosPorLegislatura.values()) {
    for (const d of lista) ids.add(d.id);
  }

  const deputadosSemSlug: Omit<Deputado, "slug">[] = [];
  const mandatosPorLegislatura = new Map<
    number,
    Array<{ mandato: MandatoNaLegislatura }>
  >();

  for (const id of [...ids].sort((a, b) => a - b)) {
    const mandatos: Array<{ base: Mandato; legislatura: Legislatura }> = [];
    for (const legislatura of legislaturas) {
      const daLista = entrada.deputadosPorLegislatura
        .get(legislatura.id)
        ?.find((d) => d.id === id);
      if (!daLista) continue;
      const base =
        calcularMandato(entrada.historicos.get(id) ?? [], legislatura, hoje) ??
        mandatoSemHistorico(daLista);
      mandatos.push({ base, legislatura });
    }
    if (mandatos.length === 0) continue;

    const legislaturasDoDeputado = mandatos.map(({ base, legislatura }) => {
      const mandato = montarMandato(id, base, legislatura, indices);
      const lista = mandatosPorLegislatura.get(legislatura.id) ?? [];
      lista.push({ mandato });
      mandatosPorLegislatura.set(legislatura.id, lista);
      return mandato;
    });

    const atual = mandatos[mandatos.length - 1].base;
    deputadosSemSlug.push({
      versao: 1,
      id,
      nome: atual.nome,
      partido: atual.partido,
      uf: atual.uf,
      urlFoto: atual.urlFoto,
      emExercicio: atual.emExercicio,
      urlFonte: `https://www.camara.leg.br/deputados/${id}`,
      atualizadoEm,
      legislaturas: legislaturasDoDeputado,
    });
  }

  const deputados = atribuirSlugs(deputadosSemSlug);

  return {
    deputados,
    indice: {
      versao: 1,
      atualizadoEm,
      deputados: deputados
        .map((d) => ({
          id: d.id,
          slug: d.slug,
          nome: d.nome,
          partido: d.partido,
          uf: d.uf,
          urlFoto: d.urlFoto,
          emExercicio: d.emExercicio,
          legislaturas: d.legislaturas.map((l) => l.idLegislatura),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    },
    agregados: {
      versao: 1,
      atualizadoEm,
      criterio: `Medianas entre deputados com pelo menos ${DIAS_MINIMOS_PARA_MEDIANA} dias em exercício na legislatura, agrupados pelo partido e UF no fim da legislatura (ou hoje, na atual).`,
      legislaturas: legislaturas.map((l) => ({
        idLegislatura: l.id,
        inicio: l.dataInicio,
        fim: l.dataFim,
        ...calcularMedianas(
          (mandatosPorLegislatura.get(l.id) ?? []).map((m) => m.mandato),
        ),
      })),
    },
    votacoes: {
      versao: 1,
      atualizadoEm,
      votacoes: [...indices.votacoes.values()]
        .map(({ votacao, idLegislatura }) => ({ ...votacao, idLegislatura }))
        .sort(
          (a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id),
        ),
    },
  };
}

// --- Índices sobre os parciais de todos os anos

interface Indices {
  votacoes: Map<string, { votacao: ResumoVotacao; idLegislatura: number }>;
  /** idVotacao → partido → placar Sim/Não dos deputados do partido */
  placaresPorPartido: Map<string, Map<string, PlacarPartido>>;
  sessoes: Array<{ id: number; data: string }>;
  proposicoes: Map<number, ProposicaoResumo>;
  parciais: ParcialAno[];
}

function indexarParciais(
  parciais: ParcialAno[],
  legislaturas: Legislatura[],
): Indices {
  const votacoes: Indices["votacoes"] = new Map();
  const sessoes: Indices["sessoes"] = [];
  const proposicoes: Indices["proposicoes"] = new Map();
  const placaresPorPartido: Indices["placaresPorPartido"] = new Map();

  for (const parcial of parciais) {
    for (const votosDoDeputado of Object.values(parcial.votos)) {
      for (const [idVotacao, voto, partido] of votosDoDeputado) {
        const normalizado = normalizarVoto(voto);
        if (normalizado !== "Sim" && normalizado !== "Não") continue;
        const porPartido = placaresPorPartido.get(idVotacao) ?? new Map();
        const placar = porPartido.get(partido) ?? { sim: 0, nao: 0 };
        if (normalizado === "Sim") placar.sim++;
        else placar.nao++;
        porPartido.set(partido, placar);
        placaresPorPartido.set(idVotacao, porPartido);
      }
    }
    for (const votacao of parcial.votacoes) {
      const legislatura = legislaturaDaData(legislaturas, votacao.data);
      if (legislatura)
        votacoes.set(votacao.id, { votacao, idLegislatura: legislatura.id });
    }
    sessoes.push(...parcial.sessoes);
    for (const p of parcial.proposicoes) proposicoes.set(p.id, p);
  }
  sessoes.sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
  return { votacoes, placaresPorPartido, sessoes, proposicoes, parciais };
}

// --- Mandato de um deputado numa legislatura

function mandatoSemHistorico(d: DeputadoDaLista): Mandato {
  return {
    idLegislatura: d.idLegislatura,
    nome: d.nome,
    partido: d.siglaPartido,
    uf: d.siglaUf,
    urlFoto: d.urlFoto,
    periodos: [],
    diasEmExercicio: 0,
    emExercicio: false,
  };
}

function montarMandato(
  id: number,
  base: Mandato,
  legislatura: Legislatura,
  indices: Indices,
): MandatoNaLegislatura {
  const chave = String(id);
  const naLegislatura = (data: string) =>
    legislatura.dataInicio <= data && data <= legislatura.dataFim;

  // Despesas
  const porMes = new Map<string, number>();
  const porCategoria = new Map<string, number>();
  const notas: NotaFiscal[] = [];
  for (const parcial of indices.parciais) {
    const despesas = parcial.despesas[chave]?.[String(legislatura.id)];
    if (!despesas) continue;
    for (const [mes, valor] of Object.entries(despesas.porMes)) {
      porMes.set(mes, (porMes.get(mes) ?? 0) + valor);
    }
    for (const [categoria, valor] of Object.entries(despesas.porCategoria)) {
      porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + valor);
    }
    notas.push(...despesas.maioresNotas);
  }
  const total = centavos([...porMes.values()].reduce((s, v) => s + v, 0));
  const meses = base.diasEmExercicio / DIAS_POR_MES;

  // Presença
  const presentes = new Set<number>();
  for (const parcial of indices.parciais) {
    for (const idSessao of parcial.presencas[chave] ?? [])
      presentes.add(idSessao);
  }
  const sessoes = indices.sessoes.filter(
    (s) => naLegislatura(s.data) && dentroDosPeriodos(s.data, base.periodos),
  );
  const calendario = sessoes.map(
    (s) => [s.data, presentes.has(s.id) ? 1 : 0] as [string, 0 | 1],
  );
  const presencas = calendario.filter(([, p]) => p === 1).length;

  // Votações
  const votos: Record<string, string> = {};
  const partido = { consideradas: 0, alinhadas: 0 };
  const governo = { consideradas: 0, alinhadas: 0 };
  for (const parcial of indices.parciais) {
    for (const [idVotacao, voto, partidoNoVoto] of parcial.votos[chave] ?? []) {
      const registro = indices.votacoes.get(idVotacao);
      if (registro?.idLegislatura !== legislatura.id) continue;
      votos[idVotacao] = voto;
      const placar = indices.placaresPorPartido
        .get(idVotacao)
        ?.get(partidoNoVoto);
      contar(partido, comparar(voto, maioriaDosColegas(placar, voto)));
      contar(
        governo,
        comparar(voto, orientacaoDoGoverno(registro.votacao.orientacoes)),
      );
    }
  }

  // Proposições
  const autorias = new Map<number, number>();
  for (const parcial of indices.parciais) {
    for (const [idProposicao, ordem] of parcial.autorias[chave] ?? []) {
      autorias.set(
        idProposicao,
        Math.min(ordem, autorias.get(idProposicao) ?? ordem),
      );
    }
  }
  const proprias = [...autorias]
    .map(([idProposicao, ordem]) => ({
      p: indices.proposicoes.get(idProposicao),
      ordem,
    }))
    .filter(
      (x): x is { p: ProposicaoResumo; ordem: number } =>
        x.p !== undefined && naLegislatura(x.p.dataApresentacao),
    )
    .sort(
      (a, b) =>
        b.p.dataApresentacao.localeCompare(a.p.dataApresentacao) ||
        b.p.id - a.p.id,
    );
  const porTipo: Record<string, number> = {};
  for (const { p } of proprias) porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + 1;

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
      mediaMensal: base.diasEmExercicio >= 30 ? centavos(total / meses) : null,
      porMes: [...porMes]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, valor]) => ({ mes, valor: centavos(valor) })),
      porCategoria: [...porCategoria]
        .map(([categoria, valor]) => ({ categoria, valor: centavos(valor) }))
        .sort((a, b) => b.valor - a.valor),
      maioresNotas: maioresNotas(notas),
    },
    proposicoes: {
      apresentadas: proprias.length,
      comoPrimeiroAutor: proprias.filter((x) => x.ordem === 1).length,
      viraramNorma: proprias.filter(
        (x) => x.p.situacao === SITUACAO_VIROU_NORMA,
      ).length,
      porTipo,
      lista: proprias
        .slice(0, LIMITE_LISTA_PROPOSICOES)
        .map(({ p, ordem }) => ({ ...p, primeiroAutor: ordem === 1 })),
      listaCompleta: proprias.length <= LIMITE_LISTA_PROPOSICOES,
    },
    presenca: {
      sessoes: sessoes.length,
      presencas,
      percentual: percentual(presencas, sessoes.length),
      calendario,
    },
    votacoes: {
      votosRegistrados: Object.keys(votos).length,
      alinhamentoPartido: {
        ...partido,
        percentual: percentual(partido.alinhadas, partido.consideradas),
      },
      alinhamentoGoverno: {
        ...governo,
        percentual: percentual(governo.alinhadas, governo.consideradas),
      },
      votos,
    },
  };
}

function contar(
  contador: { consideradas: number; alinhadas: number },
  resultado: Comparacao,
) {
  if (resultado === null) return;
  contador.consideradas++;
  if (resultado === "alinhado") contador.alinhadas++;
}

// --- Medianas

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

export function calcularMedianas(todos: MandatoNaLegislatura[]) {
  const mandatos = todos.filter(
    (m) => m.diasEmExercicio >= DIAS_MINIMOS_PARA_MEDIANA,
  );
  const agrupar = (chave: (m: MandatoNaLegislatura) => string) => {
    const grupos = new Map<string, MandatoNaLegislatura[]>();
    for (const m of mandatos) {
      const k = chave(m);
      if (k === "") continue;
      grupos.set(k, [...(grupos.get(k) ?? []), m]);
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

// --- Slugs

/**
 * Slug a partir do nome. Em caso de homônimos, o de menor id fica com o slug
 * simples e os demais ganham o id no fim, para que o endereço não mude quando
 * entra um deputado novo com o mesmo nome.
 */
function atribuirSlugs(deputados: Omit<Deputado, "slug">[]): Deputado[] {
  const usados = new Set<string>();
  return [...deputados]
    .sort((a, b) => a.id - b.id)
    .map((d) => {
      const base = slugificar(d.nome) || String(d.id);
      const slug = usados.has(base) ? `${base}-${d.id}` : base;
      usados.add(slug);
      return { ...d, slug };
    });
}
