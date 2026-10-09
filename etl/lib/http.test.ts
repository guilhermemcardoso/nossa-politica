import { describe, expect, it, vi } from "vitest";
import { buscarComRetry, ErroHttp } from "./http";

const semEspera = { esperar: async () => {}, esperaInicialMs: 1 };

function respostas(...lista: Array<Response | Error>) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const r of lista) {
    if (r instanceof Error) fetch.mockRejectedValueOnce(r);
    else fetch.mockResolvedValueOnce(r);
  }
  return fetch;
}

describe("buscarComRetry", () => {
  it("tenta de novo em 503 e em falha de rede até dar certo", async () => {
    const fetch = respostas(
      new Response("", { status: 503 }),
      new TypeError("fetch failed"),
      new Response("ok"),
    );
    const resposta = await buscarComRetry("https://x", { fetch, ...semEspera });
    expect(await resposta.text()).toBe("ok");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("não tenta de novo em 404", async () => {
    const fetch = respostas(new Response("", { status: 404 }));
    await expect(
      buscarComRetry("https://x", { fetch, ...semEspera }),
    ).rejects.toBeInstanceOf(ErroHttp);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("desiste depois do número máximo de tentativas", async () => {
    const fetch = respostas(
      new Response("", { status: 500 }),
      new Response("", { status: 500 }),
    );
    await expect(
      buscarComRetry("https://x", { fetch, tentativas: 2, ...semEspera }),
    ).rejects.toThrow("HTTP 500");
  });

  it("respeita o Retry-After em 429 e dobra a espera nos demais casos", async () => {
    const esperas: number[] = [];
    const fetch = respostas(
      new Response("", { status: 429, headers: { "retry-after": "7" } }),
      new Response("", { status: 502 }),
      new Response("ok"),
    );
    await buscarComRetry("https://x", {
      fetch,
      esperaInicialMs: 100,
      esperar: async (ms) => {
        esperas.push(ms);
      },
    });
    expect(esperas).toEqual([7000, 200]);
  });
});
