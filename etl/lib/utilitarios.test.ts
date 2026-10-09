import { describe, expect, it } from "vitest";
import { z } from "zod";
import { hojeEmBrasilia } from "./arquivos";
import { mapearComLimite } from "./concorrencia";
import { centavos, mediana, percentual } from "./estatistica";
import { mascararDocumento, slugificar } from "./texto";
import { ErroDeFormato, validarLinhas } from "./validacao";

describe("estatística", () => {
  it("calcula a mediana de listas pares, ímpares e vazias", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(mediana([])).toBeNull();
  });

  it("calcula percentual com uma casa e trata base zero", () => {
    expect(percentual(2, 3)).toBe(66.7);
    expect(percentual(0, 0)).toBeNull();
  });

  it("arredonda para centavos", () => {
    expect(centavos(0.1 + 0.2)).toBe(0.3);
  });
});

describe("texto", () => {
  it("gera slugs sem acento", () => {
    expect(slugificar("Acácio Favacho")).toBe("acacio-favacho");
    expect(slugificar("  Zé  D'Ávila ")).toBe("ze-d-avila");
  });

  it("mascara CPF de pessoa física e formata CNPJ", () => {
    expect(mascararDocumento("111.222.333/44  -  ")).toBe("***.222.333-**");
    expect(mascararDocumento("085.324.290/0013-1 ")).toBe("08.532.429/0001-31");
    expect(mascararDocumento("")).toBe("");
  });
});

describe("mapearComLimite", () => {
  it("respeita o limite e preserva a ordem", async () => {
    let ativos = 0;
    let maximo = 0;
    const resultado = await mapearComLimite([1, 2, 3, 4, 5], 2, async (n) => {
      ativos++;
      maximo = Math.max(maximo, ativos);
      await new Promise((r) => setTimeout(r, 5 - n));
      ativos--;
      return n * 10;
    });
    expect(resultado).toEqual([10, 20, 30, 40, 50]);
    expect(maximo).toBe(2);
  });
});

describe("validarLinhas", () => {
  const Esquema = z.object({ id: z.number() });

  it("descarta poucas linhas inválidas", () => {
    const linhas = [
      ...Array.from({ length: 199 }, (_, id) => ({ id })),
      { id: "x" },
    ];
    expect(validarLinhas(Esquema, linhas, "teste")).toHaveLength(199);
  });

  it("interrompe quando muitas linhas mudam de formato", () => {
    const linhas = [{ id: 1 }, { id: "2" }, { codigo: 3 }];
    expect(() => validarLinhas(Esquema, linhas, "teste")).toThrow(
      ErroDeFormato,
    );
  });
});

it("usa a data de Brasília, não a UTC", () => {
  // 01:00 UTC do dia 10 ainda é dia 9 em Brasília (UTC-3)
  expect(hojeEmBrasilia(new Date("2026-10-10T01:00:00Z"))).toBe("2026-10-09");
});
