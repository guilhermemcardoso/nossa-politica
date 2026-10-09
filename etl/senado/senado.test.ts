import { describe, expect, it } from "vitest";
import type { Legislatura } from "../camara/api";
import { Parlamentar } from "../comum/saida";
import amostra from "./__fixtures__/amostra.json";
import {
  classificarComparecimento,
  consolidarSenado,
  type DadosDoSenador,
  primeiroAutor,
} from "./consolidar";
import {
  DespesaCeaps,
  ListaDaLegislatura,
  OrientacaoSenado,
  ProcessoSenado,
  RespostaFiliacoes,
  RespostaMandatos,
  SenadorDaLista,
  VotacaoSenado,
} from "./esquemas";
import { calcularMandatoSenador, partidoNaData } from "./mandatos";

/*
 * Respostas reais das APIs do Senado, recortadas: Alan Rick (5672), titular
 * desde 2023, e Adilson Gomes (5918), suplente que nunca assumiu.
 */

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

const lista = ListaDaLegislatura.parse(
  amostra.senadoresLegislatura57,
).ListaParlamentarLegislatura.Parlamentares.Parlamentar.map((p) =>
  SenadorDaLista.parse(p),
);
const mandatos = (codigo: "5672" | "5918") =>
  RespostaMandatos.parse(amostra.mandatos[codigo]).MandatoParlamentar
    .Parlamentar.Mandatos;
const filiacoes = (codigo: "5672" | "5918") =>
  RespostaFiliacoes.parse(amostra.filiacoes[codigo]).FiliacaoParlamentar
    .Parlamentar.Filiacoes;

describe("mandatos do Senado", () => {
  it("usa os exercícios do mandato e o partido da data", () => {
    const m = calcularMandatoSenador(
      mandatos("5672"),
      filiacoes("5672"),
      L57,
      HOJE,
    );
    expect(m).toMatchObject({
      uf: "AC",
      partido: "REPUBLICANOS",
      periodos: [{ inicio: "2023-02-01", fim: HOJE }],
      emExercicio: true,
    });
    // Mandato começou em 2023: nada na legislatura anterior
    expect(
      calcularMandatoSenador(mandatos("5672"), filiacoes("5672"), L56, HOJE),
    ).toBeNull();
  });

  it("deixa de fora suplente que nunca assumiu", () => {
    expect(
      calcularMandatoSenador(mandatos("5918"), filiacoes("5918"), L57, HOJE),
    ).toBeNull();
  });

  it("acha o partido vigente em cada data", () => {
    const f = filiacoes("5672");
    expect(partidoNaData(f, "2024-06-01")).toBe("UNIÃO");
    expect(partidoNaData(f, "2025-11-11")).toBe("S/Partido");
    expect(partidoNaData(f, "2026-01-01")).toBe("REPUBLICANOS");
  });
});

describe("regras do Senado", () => {
  it("classifica comparecimento nas votações nominais", () => {
    expect(classificarComparecimento("Sim")).toBe("presente");
    expect(classificarComparecimento("Votou")).toBe("presente"); // votação secreta
    expect(classificarComparecimento("P-NRV")).toBe("presente");
    expect(classificarComparecimento("Presidente (art. 51 RISF)")).toBe(
      "presente",
    );
    expect(classificarComparecimento("LS")).toBe("justificada");
    expect(classificarComparecimento("MIS")).toBe("justificada");
    expect(classificarComparecimento("AP")).toBe("justificada");
    expect(classificarComparecimento("NCom")).toBe("ausente");
    expect(classificarComparecimento("NA")).toBeNull();
  });

  it("extrai o primeiro autor da autoria", () => {
    expect(
      primeiroAutor(
        "Senador Alan Rick (UNIÃO/AC), Senadora Damares Alves (REPUBLICANOS/DF)",
      ),
    ).toBe("Alan Rick");
    expect(primeiroAutor("Senadora Damares Alves (REPUBLICANOS/DF)")).toBe(
      "Damares Alves",
    );
  });
});

describe("consolidarSenado com amostra real", () => {
  const senadores = new Map<number, DadosDoSenador>();
  for (const s of lista) {
    const codigo = String(s.IdentificacaoParlamentar.CodigoParlamentar) as
      | "5672"
      | "5918";
    senadores.set(Number(codigo), {
      lista: s,
      mandatos: mandatos(codigo),
      filiacoes: filiacoes(codigo),
      processos:
        codigo === "5672"
          ? amostra.processos.map((p) => ProcessoSenado.parse(p))
          : [],
    });
  }
  const saida = consolidarSenado({
    legislaturas: [L56, L57],
    senadores,
    votacoes: amostra.votacoes.map((v) => VotacaoSenado.parse(v)),
    orientacoes: amostra.orientacoes.votacoes.map((o) =>
      OrientacaoSenado.parse(o),
    ),
    despesas: amostra.despesas.map((d) => DespesaCeaps.parse(d)),
    hoje: HOJE,
    atualizadoEm: "2026-10-09T09:00:00.000Z",
  });
  const [alan] = saida.senadores;
  const mandato = alan.legislaturas[0];

  it("gera arquivos no formato comum, só com quem exerceu", () => {
    expect(saida.senadores.map((s) => s.slug)).toEqual(["alan-rick"]);
    expect(() => Parlamentar.parse(alan)).not.toThrow();
    expect(alan).toMatchObject({
      nomeCivil: "Alan Rick Miranda",
      partido: "REPUBLICANOS",
    });
    expect(alan.urlFoto).toMatch(/^https:/);
  });

  it("conta presença nas votações nominais, inclusive secretas", () => {
    expect(mandato.presenca).toMatchObject({
      sessoes: 3,
      presencas: 3,
      ausenciasJustificadas: 0,
      percentual: 100,
    });
  });

  it("compara com a maioria do partido e com o governo, fora das secretas", () => {
    // 7041: todos do partido votaram Sim; governo orientou Não
    // 7042: maioria dos colegas votou Não; governo orientou Sim
    expect(mandato.votacoes.alinhamentoPartido).toEqual({
      consideradas: 2,
      alinhadas: 1,
      percentual: 50,
    });
    expect(mandato.votacoes.alinhamentoGoverno).toEqual({
      consideradas: 2,
      alinhadas: 1,
      percentual: 50,
    });
    expect(saida.votacoes.votacoes.find((v) => v.id === "6973")?.secreta).toBe(
      true,
    );
  });

  it("soma as despesas da cota do senador", () => {
    expect(mandato.despesas.porMes).toEqual([
      { mes: "2025-01", valor: 4723.62 },
    ]);
    expect(mandato.despesas.maioresNotas[0]).toMatchObject({
      valor: 4000,
      documento: "860.***.***-53",
    });
  });

  it("conta projetos e separa os de primeiro autor", () => {
    // PEC 17 e PL 2036 são dele; PEC 49 e 12 são de outros; RQS e PRS não são projetos
    expect(mandato.proposicoes).toMatchObject({
      apresentadas: 4,
      comoPrimeiroAutor: 2,
      viraramNorma: 0,
      porTipo: { PEC: 3, PL: 1 },
    });
  });
});
