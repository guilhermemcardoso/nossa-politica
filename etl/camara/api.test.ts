import { describe, expect, it } from "vitest";
import deputadosPagina1 from "./__fixtures__/api/deputados-pagina-1.json";
import deputadosUltima from "./__fixtures__/api/deputados-pagina-ultima.json";
import historico from "./__fixtures__/api/historico-204379.json";
import legislaturas from "./__fixtures__/api/legislaturas.json";
import {
  buscarDeputadosDaLegislatura,
  buscarHistorico,
  buscarLegislaturas,
} from "./api";

/** Respostas gravadas da API da Câmara, servidas por trecho da URL. */
function apiGravada(rotas: Record<string, unknown>) {
  const chamadas: string[] = [];
  const fetch: typeof globalThis.fetch = async (entrada) => {
    const url = String(entrada);
    chamadas.push(url);
    const rota = Object.keys(rotas).find((trecho) => url.includes(trecho));
    if (!rota) return new Response("", { status: 404 });
    return Response.json(rotas[rota]);
  };
  return { fetch, chamadas };
}

describe("API da Câmara (respostas gravadas)", () => {
  it("lista as legislaturas já iniciadas, da mais antiga para a atual", async () => {
    const { fetch } = apiGravada({ "/legislaturas": legislaturas });
    const resultado = await buscarLegislaturas(2, "2026-10-09", { fetch });
    expect(resultado.map((l) => l.id)).toEqual([56, 57]);
    expect(resultado[1]).toMatchObject({
      dataInicio: "2023-02-01",
      dataFim: "2027-01-31",
    });
  });

  it("segue a paginação e para na página vazia depois da última", async () => {
    // A última página ainda traz um link `next` para uma página vazia
    const { fetch, chamadas } = apiGravada({
      "pagina=442": { dados: [], links: [] },
      "pagina=441": deputadosUltima,
      "/deputados?": {
        ...deputadosPagina1,
        links: deputadosPagina1.links.map((l) =>
          l.rel === "next"
            ? { ...l, href: l.href.replace("pagina=2", "pagina=441") }
            : l,
        ),
      },
    });
    const deputados = await buscarDeputadosDaLegislatura(57, { fetch });
    expect(deputados.map((d) => d.nome)).toEqual([
      "Abilio Brunini",
      "Acácio Favacho",
      "Zucco",
      "Zucco",
    ]);
    expect(chamadas).toHaveLength(3);
  });

  it("valida o histórico de um deputado", async () => {
    const { fetch } = apiGravada({ "/historico": historico });
    const itens = await buscarHistorico(204379, { fetch });
    expect(itens).toHaveLength(6);
    expect(
      itens.some((i) => i.descricaoStatus === "Alteração de partido"),
    ).toBe(true);
  });

  it("falha se a API mudar o formato", async () => {
    const { fetch } = apiGravada({
      "/historico": { dados: [{ id: "204379", situacao: 1 }] },
    });
    await expect(buscarHistorico(204379, { fetch })).rejects.toThrow(
      "fora do formato",
    );
  });
});
