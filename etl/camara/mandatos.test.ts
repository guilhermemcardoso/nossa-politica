import { describe, expect, it } from "vitest";
import historicoGravado from "./__fixtures__/api/historico-204379.json";
import type { Legislatura } from "./api";
import { ItemHistorico } from "./esquemas";
import { calcularMandato, diasEntre } from "./mandatos";

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
const historico = historicoGravado.dados.map((h) => ItemHistorico.parse(h));

function item(
  dataHora: string,
  situacao: string | null,
  partido = "ABC",
): ItemHistorico {
  return {
    id: 1,
    nome: "Fulana",
    nomeEleitoral: "FULANA",
    siglaPartido: partido,
    siglaUf: "SP",
    idLegislatura: 57,
    urlFoto: "",
    dataHora,
    situacao,
    condicaoEleitoral: "Titular",
    descricaoStatus: "",
  };
}

describe("calcularMandato", () => {
  it("cobre a legislatura anterior inteira, com o partido do fim", () => {
    const mandato = calcularMandato(historico, L56, "2026-10-09");
    expect(mandato).toMatchObject({
      partido: "MDB",
      periodos: [{ inicio: "2019-02-01", fim: "2023-01-31" }],
      diasEmExercicio: diasEntre("2019-02-01", "2023-01-31"),
      emExercicio: false,
    });
  });

  it("vai até hoje na legislatura atual", () => {
    const mandato = calcularMandato(historico, L57, "2026-10-09");
    expect(mandato).toMatchObject({
      partido: "MDB",
      periodos: [{ inicio: "2023-02-01", fim: "2026-10-09" }],
      emExercicio: true,
    });
  });

  it("separa períodos quando há licença e troca de partido no meio", () => {
    const mandato = calcularMandato(
      [
        item("2023-02-01T12:00", "Exercício", "ABC"),
        item("2024-03-10T10:00", "Licença"),
        item("2024-07-01T10:00", "Exercício", "XYZ"),
        item("2025-01-15T10:00", "Exercício", "XYZ"), // troca de partido não fecha o período
        item("2025-06-01T10:00", "Afastado", "XYZ"),
      ],
      L57,
      "2026-10-09",
    );
    expect(mandato?.periodos).toEqual([
      { inicio: "2023-02-01", fim: "2024-03-09" },
      { inicio: "2024-07-01", fim: "2025-05-31" },
    ]);
    expect(mandato?.partido).toBe("XYZ");
    expect(mandato?.emExercicio).toBe(false);
  });

  it("retorna null se não houver histórico na legislatura", () => {
    expect(
      calcularMandato(historico, { ...L57, id: 99 }, "2026-10-09"),
    ).toBeNull();
  });
});
