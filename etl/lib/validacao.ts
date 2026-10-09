import type { z } from "zod";

export class ErroDeFormato extends Error {}

/**
 * Valida as linhas de uma fonte com Zod. Algumas linhas com lixo são toleradas
 * (e descartadas), mas se a fração inválida passar de `tolerancia` a fonte
 * provavelmente mudou de formato, e a carga é interrompida antes de publicar
 * dado errado.
 */
export function validarLinhas<S extends z.ZodType>(
  esquema: S,
  linhas: readonly unknown[],
  fonte: string,
  tolerancia = 0.01,
): z.infer<S>[] {
  const validas: z.infer<S>[] = [];
  const exemplos: string[] = [];
  let invalidas = 0;

  for (const [indice, linha] of linhas.entries()) {
    const resultado = esquema.safeParse(linha);
    if (resultado.success) {
      validas.push(resultado.data);
    } else {
      invalidas++;
      if (exemplos.length < 3) {
        const problema = resultado.error.issues[0];
        exemplos.push(
          `linha ${indice}: ${problema.path.join(".") || "(raiz)"} — ${problema.message}`,
        );
      }
    }
  }

  if (linhas.length > 0 && invalidas / linhas.length > tolerancia) {
    throw new ErroDeFormato(
      `${fonte}: ${invalidas} de ${linhas.length} linhas fora do formato esperado. ` +
        `A fonte pode ter mudado. Exemplos:\n  ${exemplos.join("\n  ")}`,
    );
  }
  if (invalidas > 0) {
    console.warn(
      `⚠ ${fonte}: ${invalidas} de ${linhas.length} linhas descartadas (${exemplos[0]})`,
    );
  }
  return validas;
}

/** Lê o array `dados` dos arquivos da Câmara (`{ "dados": [...] }`). */
export function extrairDados(json: unknown, fonte: string): unknown[] {
  if (
    typeof json === "object" &&
    json !== null &&
    "dados" in json &&
    Array.isArray(json.dados)
  ) {
    return json.dados;
  }
  throw new ErroDeFormato(`${fonte}: arquivo sem o array "dados".`);
}
