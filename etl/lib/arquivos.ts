import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function lerJson(caminho: string): Promise<unknown> {
  return JSON.parse(await readFile(caminho, "utf8"));
}

export async function lerJsonSeExistir(
  caminho: string,
): Promise<unknown | undefined> {
  try {
    return await lerJson(caminho);
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw erro;
  }
}

/** JSON compacto: os arquivos são lidos por máquina, e o tamanho importa. */
export async function escreverJson(
  caminho: string,
  dados: unknown,
): Promise<void> {
  await mkdir(dirname(caminho), { recursive: true });
  await writeFile(caminho, JSON.stringify(dados));
}

export async function listarArquivos(pasta: string): Promise<string[]> {
  try {
    return await readdir(pasta);
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw erro;
  }
}

export async function recriarPasta(pasta: string): Promise<void> {
  await rm(pasta, { recursive: true, force: true });
  await mkdir(pasta, { recursive: true });
}

/** Data de hoje no fuso de Brasília (AAAA-MM-DD). */
export function hojeEmBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(agora);
}
