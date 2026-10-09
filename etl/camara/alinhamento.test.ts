import { describe, expect, it } from "vitest";
import {
  comparar,
  maioriaDosColegas,
  normalizarVoto,
  orientacaoDoGoverno,
} from "./alinhamento";

describe("alinhamento", () => {
  it("normaliza votos e ignora o presidente da sessão", () => {
    expect(normalizarVoto("Não")).toBe("Não");
    expect(normalizarVoto("NAO")).toBe("Não");
    expect(normalizarVoto("Obstrução")).toBe("Obstrução");
    expect(normalizarVoto("Artigo 17")).toBeNull();
  });

  it("acha a orientação do Governo entre as bancadas", () => {
    expect(
      orientacaoDoGoverno({ "Bl PlFdrPTUniPp...": "Liberado", Governo: "Sim" }),
    ).toBe("Sim");
    expect(orientacaoDoGoverno({ PL: "Não" })).toBeUndefined();
  });

  it("compara voto com referência; liberado ou sem voto não conta", () => {
    expect(comparar("Sim", "Sim")).toBe("alinhado");
    expect(comparar("Abstenção", "Sim")).toBe("divergente");
    expect(comparar("Sim", "Liberado")).toBeNull();
    expect(comparar("Artigo 17", "Sim")).toBeNull();
  });

  describe("maioriaDosColegas", () => {
    it("desconta o voto do próprio deputado", () => {
      // 3 Sim (incluindo o deputado) e 2 Não: entre os colegas, empate
      expect(maioriaDosColegas({ sim: 3, nao: 2 }, "Sim")).toBeUndefined();
      expect(maioriaDosColegas({ sim: 3, nao: 2 }, "Não")).toBe("Sim");
    });

    it("exige um mínimo de colegas votando", () => {
      expect(
        maioriaDosColegas({ sim: 2, nao: 0 }, "Abstenção"),
      ).toBeUndefined();
      expect(maioriaDosColegas({ sim: 3, nao: 0 }, "Abstenção")).toBe("Sim");
      expect(maioriaDosColegas(undefined, "Sim")).toBeUndefined();
    });
  });
});
