import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface OpcoesHttp {
  /** Número máximo de tentativas, contando a primeira. */
  tentativas?: number;
  /** Espera antes da 2ª tentativa; dobra a cada nova tentativa. */
  esperaInicialMs?: number;
  /** Tempo máximo de cada tentativa. */
  timeoutMs?: number;
  /** Permite injetar um fetch falso nos testes. */
  fetch?: typeof fetch;
  /** Permite trocar a espera real por uma instantânea nos testes. */
  esperar?: (ms: number) => Promise<void>;
}

export class ErroHttp extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status} ao buscar ${url}`);
  }
}

const esperarDeVerdade = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 429 (limite de requisições) e erros 5xx costumam passar sozinhos. */
function deveTentarDeNovo(status: number) {
  return status === 429 || status >= 500;
}

function esperaDoRetryAfter(resposta: Response): number | undefined {
  const valor = resposta.headers.get("retry-after");
  if (!valor) return undefined;
  const segundos = Number(valor);
  if (Number.isFinite(segundos)) return segundos * 1000;
  const data = Date.parse(valor);
  return Number.isNaN(data) ? undefined : Math.max(0, data - Date.now());
}

/**
 * `fetch` com timeout e novas tentativas com espera exponencial em falhas de
 * rede, 429 e 5xx. Respeita o cabeçalho `Retry-After` quando o servidor manda.
 */
export async function buscarComRetry(
  url: string,
  opcoes: OpcoesHttp & { init?: RequestInit } = {},
): Promise<Response> {
  const {
    tentativas = 5,
    esperaInicialMs = 1000,
    timeoutMs = 60_000,
    fetch: fetchFn = fetch,
    esperar = esperarDeVerdade,
    init,
  } = opcoes;

  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    let espera = esperaInicialMs * 2 ** (tentativa - 1);
    try {
      const resposta = await fetchFn(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (resposta.ok) return resposta;
      ultimoErro = new ErroHttp(url, resposta.status);
      if (!deveTentarDeNovo(resposta.status)) throw ultimoErro;
      espera = esperaDoRetryAfter(resposta) ?? espera;
      await resposta.body?.cancel();
    } catch (erro) {
      if (erro instanceof ErroHttp && !deveTentarDeNovo(erro.status))
        throw erro;
      ultimoErro = erro;
    }
    if (tentativa < tentativas) await esperar(espera);
  }
  throw ultimoErro;
}

export async function buscarJson(
  url: string,
  opcoes: OpcoesHttp = {},
): Promise<unknown> {
  const resposta = await buscarComRetry(url, {
    ...opcoes,
    init: { headers: { accept: "application/json" } },
  });
  return resposta.json();
}

/** Baixa um arquivo grande direto para o disco, sem carregá-lo na memória. */
export async function baixarArquivo(
  url: string,
  destino: string,
  opcoes: OpcoesHttp = {},
): Promise<void> {
  await mkdir(dirname(destino), { recursive: true });
  const resposta = await buscarComRetry(url, {
    timeoutMs: 15 * 60_000,
    ...opcoes,
  });
  if (!resposta.body) throw new Error(`Resposta sem corpo: ${url}`);
  await pipeline(
    Readable.fromWeb(resposta.body as import("node:stream/web").ReadableStream),
    createWriteStream(destino),
  );
}
