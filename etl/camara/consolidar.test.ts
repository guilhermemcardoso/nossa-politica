import { describe, expect, it } from "vitest";
import type { Legislatura } from "./api";
import { consolidar } from "./consolidar";
import type { DeputadoDaLista, ItemHistorico } from "./esquemas";
import type { ParcialAno } from "./parcial";
import { Agregados, Deputado, IndiceDeputados, ListaVotacoes } from "./saida";

const L56: Legislatura = {
  id: 56,
  dataInicio: "2019-02-01",
  dataFim: "2023-01-31",
};
const L57: Legislatura = {
  id: 57,
  dataInicio: "2023-02-01",
  dataFim: "2027-01-31",
};
const HOJE = "2026-10-09";

function naLista(id: number, nome: string): DeputadoDaLista {
  return {
    id,
    nome,
    siglaPartido: "ABC",
    siglaUf: "SP",
    idLegislatura: 57,
    urlFoto: "",
  };
}

function emExercicioDesde(
  id: number,
  nome: string,
  data: string,
): ItemHistorico[] {
  return [
    {
      id,
      nome,
      nomeEleitoral: nome,
      siglaPartido: "ABC",
      siglaUf: id === 4 ? "RJ" : "SP",
      idLegislatura: 57,
      urlFoto: "",
      dataHora: `${data}T12:00`,
      situacao: "Exercício",
      condicaoEleitoral: "Titular",
      descricaoStatus: "",
    },
  ];
}

function parcial(ano: number, dados: Partial<ParcialAno>): ParcialAno {
  return {
    versao: 1,
    ano,
    geradoEm: "2026-10-09T09:00:00.000Z",
    despesas: {},
    votacoes: [],
    votos: {},
    sessoes: [],
    presencas: {},
    proposicoes: [],
    autorias: {},
    ...dados,
  };
}

const votacao = (id: string, data: string, governo: string) => ({
  id,
  data,
  descricao: "",
  aprovada: true,
  placar: { sim: 3, nao: 1, outros: 0 },
  proposicao: null,
  orientacoes: { Governo: governo },
});

/*
 * Quatro deputados do partido ABC em exercício desde o início da legislatura 57,
 * e um quinto (id 5) que entrou há poucos dias. Os ids 1 e 3 são homônimos.
 */
const saida = consolidar({
  legislaturas: [L56, L57],
  deputadosPorLegislatura: new Map([
    [56, []],
    [
      57,
      [
        naLista(1, "Maria Silva"),
        naLista(2, "João Souza"),
        naLista(3, "Maria Silva"),
        naLista(4, "Ana Lima"),
        naLista(5, "Novo Suplente"),
      ],
    ],
  ]),
  historicos: new Map([
    [1, emExercicioDesde(1, "Maria Silva", "2023-02-01")],
    [2, emExercicioDesde(2, "João Souza", "2023-02-01")],
    [3, emExercicioDesde(3, "Maria Silva", "2023-02-01")],
    [4, emExercicioDesde(4, "Ana Lima", "2023-02-01")],
    [5, emExercicioDesde(5, "Novo Suplente", "2026-09-20")],
  ]),
  parciais: [
    parcial(2024, {
      despesas: {
        "1": {
          "57": {
            porMes: { "2024-01": 1000 },
            porCategoria: { TELEFONIA: 1000 },
            maioresNotas: [],
          },
        },
      },
      proposicoes: [
        {
          id: 10,
          sigla: "PL 1/2024",
          tipo: "PL",
          ementa: "",
          dataApresentacao: "2024-05-01",
          situacao: "Transformado em Norma Jurídica",
          dataSituacao: "2025-01-01",
        },
        {
          id: 11,
          sigla: "PL 2/2024",
          tipo: "PL",
          ementa: "",
          dataApresentacao: "2024-06-01",
          situacao: "Arquivada",
          dataSituacao: "2025-01-01",
        },
      ],
      autorias: {
        "1": [[10, 1]],
        "2": [
          [10, 2],
          [11, 1],
        ],
      },
    }),
    parcial(2025, {
      despesas: {
        "1": {
          "57": {
            porMes: { "2025-02": 500 },
            porCategoria: {
              TELEFONIA: 200,
              "DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR.": 300,
            },
            maioresNotas: [],
          },
        },
      },
      sessoes: [
        { id: 100, data: "2025-03-10" },
        { id: 101, data: "2025-03-11" },
        { id: 102, data: "2025-03-12" },
      ],
      presencas: { "1": [100, 102], "2": [100, 101, 102] },
      votacoes: [
        votacao("v1", "2025-03-10", "Não"),
        votacao("v2", "2025-03-11", "Liberado"),
      ],
      votos: {
        "1": [
          ["v1", "Sim", "ABC"],
          ["v2", "Sim", "ABC"],
        ],
        "2": [["v1", "Sim", "ABC"]],
        "3": [["v1", "Sim", "ABC"]],
        "4": [["v1", "Não", "ABC"]],
      },
    }),
  ],
  hoje: HOJE,
  atualizadoEm: "2026-10-09T09:00:00.000Z",
});

const deputado = (id: number) => {
  const d = saida.deputados.find((x) => x.id === id);
  if (!d) throw new Error(`deputado ${id} não encontrado`);
  return d.legislaturas[0];
};

describe("consolidar", () => {
  it("gera arquivos nos formatos publicados", () => {
    for (const d of saida.deputados)
      expect(() => Deputado.parse(d)).not.toThrow();
    expect(() => IndiceDeputados.parse(saida.indice)).not.toThrow();
    expect(() => Agregados.parse(saida.agregados)).not.toThrow();
    expect(() => ListaVotacoes.parse(saida.votacoes)).not.toThrow();
  });

  it("dá slug com id só ao homônimo de id maior", () => {
    expect(saida.deputados.map((d) => d.slug)).toEqual([
      "maria-silva",
      "joao-souza",
      "maria-silva-3",
      "ana-lima",
      "novo-suplente",
    ]);
  });

  it("soma despesas de vários anos e calcula a média por mês em exercício", () => {
    const { despesas, diasEmExercicio } = deputado(1);
    expect(despesas.total).toBe(1500);
    expect(despesas.porCategoria[0]).toEqual({
      categoria: "TELEFONIA",
      valor: 1200,
    });
    expect(despesas.mediaMensal).toBeCloseTo(
      1500 / (diasEmExercicio / (365.25 / 12)),
      1,
    );
  });

  it("calcula presença só nas sessões em que o deputado estava em exercício", () => {
    expect(deputado(1).presenca).toMatchObject({
      sessoes: 3,
      presencas: 2,
      percentual: 66.7,
    });
    expect(deputado(1).presenca.calendario).toEqual([
      ["2025-03-10", 1],
      ["2025-03-11", 0],
      ["2025-03-12", 1],
    ]);
    // Entrou depois das sessões: nenhuma conta contra ele
    expect(deputado(5).presenca).toMatchObject({
      sessoes: 0,
      percentual: null,
    });
  });

  it("compara o voto com a maioria dos colegas e com o governo", () => {
    // v1: deputados 1, 2 e 3 votaram Sim, o 4 votou Não
    expect(deputado(1).votacoes.alinhamentoPartido).toEqual({
      consideradas: 1,
      alinhadas: 1,
      percentual: 100,
    });
    expect(deputado(4).votacoes.alinhamentoPartido).toMatchObject({
      alinhadas: 0,
    });
    // Governo orientou Não em v1 e liberou em v2, que não conta
    expect(deputado(1).votacoes.alinhamentoGoverno).toEqual({
      consideradas: 1,
      alinhadas: 0,
      percentual: 0,
    });
    expect(deputado(1).votacoes.votos).toEqual({ v1: "Sim", v2: "Sim" });
  });

  it("separa primeiro autor de coautor e conta o que virou norma", () => {
    expect(deputado(1).proposicoes).toMatchObject({
      apresentadas: 1,
      comoPrimeiroAutor: 1,
      viraramNorma: 1,
    });
    expect(deputado(2).proposicoes).toMatchObject({
      apresentadas: 2,
      comoPrimeiroAutor: 1,
      viraramNorma: 1,
    });
  });

  it("calcula medianas só com quem tem 90 dias ou mais em exercício", () => {
    const l57 = saida.agregados.legislaturas.find(
      (l) => l.idLegislatura === 57,
    );
    expect(l57?.casa.n).toBe(4);
    expect(l57?.partidos.ABC.n).toBe(4);
    expect(l57?.ufs.RJ.n).toBe(1);
    expect(l57?.casa.proposicoesApresentadas).toBe(0.5);
  });

  it("marca quem está em exercício hoje", () => {
    expect(saida.indice.deputados.every((d) => d.emExercicio)).toBe(true);
    expect(saida.indice.deputados.map((d) => d.nome)).toEqual([
      "Ana Lima",
      "João Souza",
      "Maria Silva",
      "Maria Silva",
      "Novo Suplente",
    ]);
  });
});
