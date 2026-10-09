import { describe, expect, it } from "vitest";
import amostra from "./__fixtures__/amostra-arquivos.json";
import { type BrutosDoAno, processarAno } from "./ano";
import { ParcialAno } from "./parcial";

/** Linhas reais dos arquivos em massa da Câmara, recortadas. */
const brutos = amostra as BrutosDoAno;
const parcial = processarAno(2025, brutos, "2026-10-09T09:00:00.000Z");

describe("processarAno com amostra real dos arquivos", () => {
  it("gera um parcial no formato esperado", () => {
    expect(() => ParcialAno.parse(parcial)).not.toThrow();
  });

  describe("despesas", () => {
    it("soma por mês e categoria, por deputado e legislatura", () => {
      const despesas = parcial.despesas["204379"]["57"];
      expect(despesas.porMes).toEqual({
        "2025-01": 750,
        "2025-02": 750,
        "2025-03": 750,
        "2025-04": 750,
      });
      expect(despesas.porCategoria).toEqual({
        "MANUTENÇÃO DE ESCRITÓRIO DE APOIO À ATIVIDADE PARLAMENTAR": 3000,
      });
    });

    it("ignora despesas de liderança, que não têm deputado", () => {
      expect(Object.keys(parcial.despesas).sort()).toEqual(["204379", "62881"]);
    });

    it("desconta compensações negativas e não as lista como notas", () => {
      const despesas = parcial.despesas["62881"]["57"];
      expect(despesas.porMes).toEqual({ "2025-01": 6500, "2025-03": -2113.91 });
      expect(despesas.maioresNotas.map((n) => n.valor)).toEqual([6500]);
    });

    it("mascara o CPF de fornecedor pessoa física (LGPD)", () => {
      const [nota] = parcial.despesas["62881"]["57"].maioresNotas;
      expect(nota.documento).toBe("***.222.333-**");
      expect(JSON.stringify(parcial)).not.toContain("111.222.333");
    });
  });

  describe("votações", () => {
    it("mantém só votações nominais do Plenário", () => {
      // A votação da CCJC e a do Plenário sem votos na amostra ficam de fora
      expect(parcial.votacoes.map((v) => v.id)).toEqual(["2162802-89"]);
      expect(parcial.votacoes[0]).toMatchObject({
        aprovada: true,
        placar: { sim: 297, nao: 107, outros: 2 },
        proposicao: { titulo: "PL 9133/2017" },
      });
      expect(parcial.votacoes[0].orientacoes.Governo).toBe("Sim");
    });

    it("guarda o voto e o partido de cada deputado", () => {
      expect(parcial.votos["204379"]).toEqual([["2162802-89", "Sim", "MDB"]]);
      expect(parcial.votos["178937"]).toEqual([
        ["2162802-89", "Artigo 17", "PL"],
      ]);
    });
  });

  describe("presenças", () => {
    it("conta só sessões deliberativas, não as solenes", () => {
      expect(parcial.sessoes).toEqual([
        { id: 80835, data: "2025-12-16" },
        { id: 80860, data: "2025-12-19" },
      ]);
      expect(parcial.presencas["204379"]).toEqual([80835]);
    });
  });

  describe("proposições", () => {
    it("conta projetos de lei e deixa requerimentos de fora", () => {
      expect(parcial.proposicoes.map((p) => p.sigla)).toEqual([
        "PL 5615/2023",
        "PL 5865/2023",
      ]);
      expect(parcial.autorias["204379"]).toEqual(
        expect.arrayContaining([
          [2405254, 1],
          [2409564, 1],
        ]),
      );
      expect(parcial.autorias["204379"]).toHaveLength(2);
    });
  });
});
