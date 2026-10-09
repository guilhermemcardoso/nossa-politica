import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";
import type { ParlamentarConhecido } from "../comum/parlamentares";
import { dividirLinhaCsv, lerCsvDoZip, numeroBrasileiro } from "../lib/csv";
import {
  consolidarEmendas,
  identificarAutor,
  type LinhaEmenda,
  nomeSemObservacao,
  siglaDaUf,
} from "./consolidar";

function parlamentar(
  casa: "camara" | "senado",
  id: number,
  nomes: string[],
  periodos: Array<[string, string]>,
  nomeCivil?: string,
): ParlamentarConhecido {
  return {
    casa,
    id,
    nome: nomes[0],
    nomes,
    nomeCivil,
    ufs: new Set(["SP"]),
    periodos: periodos.map(([inicio, fim]) => ({ inicio, fim })),
  };
}

/* Casos reais encontrados no cruzamento, simplificados */
const PARLAMENTARES = [
  // Licenciado em nov/2022 para disputar o Senado; senador a partir de 2023
  parlamentar(
    "camara",
    178836,
    ["Alan Rick"],
    [
      ["2019-02-01", "2022-07-13"],
      ["2022-11-12", "2023-01-31"],
    ],
  ),
  parlamentar("senado", 5672, ["Alan Rick"], [["2023-02-01", "2026-10-09"]]),
  // Mudou de nome parlamentar
  parlamentar(
    "camara",
    220660,
    ["Yury Bruno", "Yury do Paredão"],
    [["2023-02-01", "2026-10-09"]],
  ),
  // Licenciado quase todo o tempo; um homônimo parcial estava em exercício
  parlamentar(
    "camara",
    178962,
    ["Carlos Gomes"],
    [
      ["2023-02-01", "2023-11-07"],
      ["2024-12-03", "2024-12-09"],
    ],
  ),
  parlamentar(
    "camara",
    222429,
    ["Luis Carlos Gomes"],
    [["2023-02-08", "2026-03-24"]],
  ),
  // Assumiu em 2025 no lugar de quem saiu; o Portal usa o nome civil
  parlamentar(
    "camara",
    233594,
    ["Rafael Fera"],
    [["2025-07-31", "2026-10-09"]],
    "RAFAEL BENTO PEREIRA",
  ),
  parlamentar(
    "senado",
    4525,
    ["Nelsinho Trad"],
    [["2019-02-01", "2026-10-09"]],
    "Nelson Trad Filho",
  ),
];

const quem = (nome: string, ano: number) =>
  identificarAutor(PARLAMENTARES, nome, ano).map((p) => `${p.casa}-${p.id}`);

describe("identificação do autor da emenda", () => {
  it("usa quem estava em exercício quando a emenda foi apresentada", () => {
    // Emendas de 2022 foram apresentadas em 2021, quando era deputado
    expect(quem("ALAN RICK", 2022)).toEqual(["camara-178836"]);
    // Emendas de 2024 foram apresentadas em 2023, já como senador
    expect(quem("ALAN RICK", 2024)).toEqual(["senado-5672"]);
  });

  it("amplia para o ano todo se o autor estava licenciado na data", () => {
    // Em 01/11/2022 estava licenciado; voltou dias depois
    expect(quem("ALAN RICK", 2023)).toEqual(["camara-178836"]);
  });

  it("reconhece nomes antigos, sufixos e nome civil", () => {
    expect(quem("YURY DO PAREDAO", 2024)).toEqual(["camara-220660"]);
    expect(quem("NELSINHO TRAD FILHO", 2021)).toEqual(["senado-4525"]);
  });

  it("prefere nome exato fora da data a nome aproximado na data", () => {
    expect(quem("CARLOS GOMES", 2025)).toEqual(["camara-178962"]);
  });

  it("atribui ao sucessor a emenda herdada de ex-parlamentar", () => {
    const nome =
      "RAFAEL BENTO (EX-PARLAMENTAR LEBRAO, NOS TERMOS ART. 78 LDO 2025 E DA MENSAGEM 95-CN, DE 06.11.25)";
    expect(nomeSemObservacao(nome)).toBe("RAFAEL BENTO");
    expect(quem(nome, 2025)).toEqual(["camara-233594"]);
  });

  it("não inventa correspondência", () => {
    expect(quem("FULANO DE TAL", 2024)).toEqual([]);
  });
});

describe("consolidarEmendas", () => {
  const linha = (dados: Partial<LinhaEmenda>): LinhaEmenda => ({
    ano: 2024,
    tipo: "Emenda Individual - Transferências com Finalidade Definida",
    nomeAutor: "YURY DO PAREDAO",
    codigoMunicipio: "2304400",
    municipio: "FORTALEZA",
    codigoUf: "2300000",
    funcao: "Saúde",
    empenhado: 100,
    pago: 80,
    ...dados,
  });

  const saida = consolidarEmendas(
    [
      linha({}),
      linha({
        tipo: "Emenda Individual - Transferências Especiais",
        codigoMunicipio: "Sem informação",
        empenhado: 50,
        pago: 50,
      }),
      linha({ ano: 2019 }), // antes do período do site
      linha({
        tipo: "Emenda de Bancada",
        nomeAutor: "BANCADA DO CEARA",
        empenhado: 1000,
        pago: 0,
      }),
      linha({ nomeAutor: "FULANO DE TAL", empenhado: 10, pago: 10 }),
    ],
    PARLAMENTARES,
    2020,
    "2026-10-09T09:00:00.000Z",
  );

  it("soma por parlamentar, tipo, UF e município", () => {
    const [yury] = saida.parlamentares;
    expect(yury).toMatchObject({
      casa: "camara",
      id: 220660,
      total: { empenhado: 150, pago: 130 },
      porAno: [{ ano: 2024, quantidade: 2, empenhado: 150, pago: 130 }],
      porUf: [{ uf: "CE", empenhado: 150 }],
      porMunicipio: [
        {
          codigoIbge: "2304400",
          municipio: "FORTALEZA",
          uf: "CE",
          empenhado: 100,
        },
      ],
    });
    expect(yury.porTipo.map((t) => t.tipo)).toEqual([
      "Transferências com Finalidade Definida",
      "Transferências Especiais",
    ]);
  });

  it("soma todos os tipos no destino, inclusive bancada", () => {
    expect(saida.ufs.ufs.CE).toMatchObject({ empenhado: 1160, pago: 140 });
    expect(saida.ufs.ufs.CE.porParlamentar).toEqual([
      { casa: "camara", id: 220660, empenhado: 150, pago: 130 },
    ]);
  });

  it("lista no diagnóstico quem não foi identificado", () => {
    expect(saida.diagnostico.autores).toEqual([
      expect.objectContaining({
        nome: "FULANO DE TAL",
        motivo: "sem correspondência",
        empenhado: 10,
      }),
    ]);
  });

  it("converte o código IBGE da UF em sigla", () => {
    expect(siglaDaUf("3500000")).toBe("SP");
    expect(siglaDaUf("-1")).toBe("");
  });
});

describe("CSV dentro de zip", () => {
  const pastas: string[] = [];
  afterAll(async () => {
    for (const p of pastas) await rm(p, { recursive: true, force: true });
  });

  it("divide linhas com aspas e converte números brasileiros", () => {
    expect(dividirLinhaCsv('"a";"b; c";"d ""e"""')).toEqual([
      "a",
      "b; c",
      'd "e"',
    ]);
    expect(numeroBrasileiro("1.450.000,25")).toBe(1450000.25);
    expect(numeroBrasileiro("-2113,91")).toBe(-2113.91);
  });

  it("lê CSV em Latin-1 de dentro do zip, linha a linha", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "csv-"));
    pastas.push(pasta);
    const latin1 = Buffer.from(
      '"Município";"Valor"\n"SÃO PAULO";"10,50"\n"BRASÍLIA";"2,00"\n',
      "latin1",
    );
    const zip = join(pasta, "teste.zip");
    await writeFile(
      zip,
      zipSync({
        "dados.csv": new Uint8Array(latin1),
        "leiame.txt": strToU8("x"),
      }),
    );

    const linhas: Array<Record<string, string>> = [];
    const total = await lerCsvDoZip(zip, "dados.csv", (l) => linhas.push(l));
    expect(total).toBe(2);
    expect(linhas).toEqual([
      { Município: "SÃO PAULO", Valor: "10,50" },
      { Município: "BRASÍLIA", Valor: "2,00" },
    ]);
  });
});
