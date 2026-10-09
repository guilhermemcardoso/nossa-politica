import { describe, expect, it } from "vitest";
import type { ParlamentarConhecido } from "../comum/parlamentares";
import { candidaturaPrincipal, cruzarEleicoes } from "./cruzar";
import type { Candidatura } from "./saida";

function candidatura(dados: Partial<Candidatura>): Candidatura {
  return {
    ano: 2022,
    sq: "1",
    cargo: "Deputado Federal",
    uf: "MG",
    partido: "PL",
    numero: "2222",
    nome: "NIKOLAS FERREIRA DE OLIVEIRA",
    nomeUrna: "NIKOLAS FERREIRA",
    situacaoCandidatura: "APTO",
    resultado: "ELEITO POR QP",
    votos: 1_492_047,
    bens: { total: 37_000, porTipo: [{ tipo: "Veículo", valor: 37_000 }] },
    ...dados,
  };
}

const parlamentar = (
  dados: Partial<ParlamentarConhecido>,
): ParlamentarConhecido => ({
  casa: "camara",
  id: 209787,
  nome: "Nikolas Ferreira",
  nomes: ["Nikolas Ferreira"],
  nomeCivil: "NIKOLAS FERREIRA DE OLIVEIRA",
  ufs: new Set(["MG"]),
  periodos: [],
  ...dados,
});

describe("cruzamento com o TSE", () => {
  it("liga pelo nome civil e pela UF, sem expor sequencial nem nome civil", () => {
    const { porParlamentar } = cruzarEleicoes(
      [parlamentar({})],
      [candidatura({}), candidatura({ ano: 2026, sq: "2", votos: 3_119_318 })],
      "2026-10-09T09:00:00.000Z",
    );
    expect(porParlamentar[0].eleicoes.map((e) => [e.ano, e.votos])).toEqual([
      [2022, 1_492_047],
      [2026, 3_119_318],
    ]);
    expect(porParlamentar[0].eleicoes[0]).not.toHaveProperty("sq");
    expect(porParlamentar[0].eleicoes[0]).not.toHaveProperty("nome");
  });

  it("ignora homônimo de outro estado", () => {
    const { porParlamentar, semEleicoes } = cruzarEleicoes(
      [parlamentar({})],
      [candidatura({ uf: "SP" })],
      "2026-10-09T09:00:00.000Z",
    );
    expect(porParlamentar).toEqual([]);
    expect(semEleicoes).toHaveLength(1);
  });

  it("usa o nome de urna quando o nome civil mudou", () => {
    const { porParlamentar } = cruzarEleicoes(
      [parlamentar({ nomeCivil: "NIKOLAS F. DE OLIVEIRA SILVA" })],
      [candidatura({})],
      "2026-10-09T09:00:00.000Z",
    );
    expect(porParlamentar[0].eleicoes).toHaveLength(1);
  });

  it("aceita candidatura a presidente fora das UFs do mandato", () => {
    const { porParlamentar } = cruzarEleicoes(
      [parlamentar({})],
      [candidatura({ cargo: "Presidente", uf: "BR", ano: 2018 })],
      "2026-10-09T09:00:00.000Z",
    );
    expect(porParlamentar[0].eleicoes[0].cargo).toBe("Presidente");
  });

  it("fica com a candidatura principal quando há mais de um registro", () => {
    // Caso real (2018): registro como senador abandonado e candidatura a deputado eleita
    const principal = candidaturaPrincipal([
      candidatura({
        sq: "1",
        cargo: "Senador",
        situacaoCandidatura: "CADASTRADO",
        resultado: "",
        votos: 0,
      }),
      candidatura({
        sq: "2",
        situacaoCandidatura: "INAPTO",
        resultado: "",
        votos: 0,
      }),
      candidatura({ sq: "3", resultado: "ELEITO POR QP", votos: 82_528 }),
    ]);
    expect(principal.sq).toBe("3");
  });

  it("prefere o nome civil ao de urna na mesma eleição", () => {
    const { porParlamentar } = cruzarEleicoes(
      [parlamentar({ nomeCivil: "JOSE DA SILVA", nomes: ["Zé Silva"] })],
      [
        candidatura({
          sq: "1",
          nome: "JOSE DA SILVA",
          nomeUrna: "JOSE DA SILVA",
        }),
        candidatura({
          sq: "2",
          nome: "JOSE CARLOS DA SILVA",
          nomeUrna: "ZE SILVA",
        }),
      ],
      "2026-10-09T09:00:00.000Z",
    );
    expect(porParlamentar[0].eleicoes.map((e) => e.nomeUrna)).toEqual([
      "JOSE DA SILVA",
    ]);
  });

  it("deixa de fora a eleição se os registros forem de pessoas diferentes", () => {
    const { ambiguos, porParlamentar } = cruzarEleicoes(
      [parlamentar({ nomeCivil: undefined, nomes: ["Zé Silva"] })],
      [
        candidatura({ sq: "1", nome: "JOSE DA SILVA", nomeUrna: "ZE SILVA" }),
        candidatura({
          sq: "2",
          nome: "JOSE CARLOS DA SILVA",
          nomeUrna: "ZE SILVA",
        }),
      ],
      "2026-10-09T09:00:00.000Z",
    );
    expect(ambiguos).toHaveLength(1);
    expect(porParlamentar).toEqual([]);
  });
});
