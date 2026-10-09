import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

/*
 * Leitura de CSVs grandes de dentro de arquivos zip (Portal da Transparência,
 * TSE), linha a linha. Os arquivos do TSE passam de 4 GB descompactados, então
 * nada é extraído para o disco nem carregado inteiro na memória: o `unzip -p`
 * envia o conteúdo direto para o leitor.
 */

/** Remove a marca de ordem de bytes (BOM) que alguns arquivos trazem no início. */
const semBom = (texto: string) =>
  texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;

/** Divide uma linha de CSV respeitando aspas e aspas duplicadas (""). */
export function dividirLinhaCsv(linha: string, separador = ";"): string[] {
  const campos: string[] = [];
  let atual = "";
  let entreAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (entreAspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') {
        entreAspas = false;
      } else {
        atual += c;
      }
    } else if (c === '"') {
      entreAspas = true;
    } else if (c === separador) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

/** "1.450.000,00" ou "1450000,00" → 1450000 */
export function numeroBrasileiro(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  return limpo === "" ? 0 : Number(limpo);
}

/** Lista os arquivos dentro de um zip. */
export async function listarZip(caminhoZip: string): Promise<string[]> {
  const saida = await executar("unzip", ["-Z1", caminhoZip]);
  return saida.split("\n").filter(Boolean);
}

/**
 * Lê um CSV de dentro de um zip e chama `aoLer` para cada linha, como objeto
 * coluna → valor. Os arquivos públicos do governo vêm em Latin-1.
 */
export async function lerCsvDoZip(
  caminhoZip: string,
  arquivo: string,
  aoLer: (linha: Record<string, string>) => void,
  opcoes: { separador?: string; codificacao?: string } = {},
): Promise<number> {
  const { separador = ";", codificacao = "latin1" } = opcoes;
  const processo = spawn("unzip", ["-p", caminhoZip, arquivo]);
  const decodificador = new TextDecoder(codificacao);
  const texto = processo.stdout.map((pedaco: Buffer) =>
    decodificador.decode(pedaco, { stream: true }),
  );
  const erros: Buffer[] = [];
  processo.stderr.on("data", (pedaco: Buffer) => erros.push(pedaco));
  const fim = new Promise<number>((resolve) => processo.on("close", resolve));

  let cabecalho: string[] | undefined;
  let linhas = 0;
  for await (const linha of createInterface({
    input: texto,
    crlfDelay: Infinity,
  })) {
    if (linha === "") continue;
    const campos = dividirLinhaCsv(linha, separador);
    if (!cabecalho) {
      cabecalho = campos.map((c) => semBom(c).trim());
      continue;
    }
    const objeto: Record<string, string> = {};
    for (let i = 0; i < cabecalho.length; i++) objeto[cabecalho[i]] = campos[i];
    aoLer(objeto);
    linhas++;
  }

  const codigo = await fim;
  if (codigo !== 0) {
    throw new Error(
      `unzip -p ${arquivo} terminou com código ${codigo}: ${Buffer.concat(erros).toString()}`,
    );
  }
  return linhas;
}

function executar(comando: string, argumentos: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const processo = spawn(comando, argumentos);
    const saida: Buffer[] = [];
    const erros: Buffer[] = [];
    processo.stdout.on("data", (p: Buffer) => saida.push(p));
    processo.stderr.on("data", (p: Buffer) => erros.push(p));
    processo.on("error", reject);
    processo.on("close", (codigo) =>
      codigo === 0
        ? resolve(Buffer.concat(saida).toString())
        : reject(
            new Error(`${comando} falhou: ${Buffer.concat(erros).toString()}`),
          ),
    );
  });
}
