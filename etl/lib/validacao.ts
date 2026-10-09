import type { z } from "zod";

export class ErroDeFormato extends Error {}

/**
 * Valida linhas de uma fonte com Zod, uma a uma (serve para arquivos lidos em
 * fluxo). Algumas linhas com lixo são toleradas e descartadas, mas se a fração
 * inválida passar de `tolerancia` a fonte provavelmente mudou de formato, e
 * `concluir()` interrompe a carga antes de publicar dado errado.
 */
export class ValidadorDeLinhas<S extends z.ZodType> {
  private total = 0;
  private invalidas = 0;
  private readonly exemplos: string[] = [];

  constructor(
    private readonly esquema: S,
    private readonly fonte: string,
    private readonly tolerancia = 0.01,
  ) {}

  validar(linha: unknown): z.infer<S> | undefined {
    const indice = this.total++;
    const resultado = this.esquema.safeParse(linha);
    if (resultado.success) return resultado.data;
    this.invalidas++;
    if (this.exemplos.length < 3) {
      const problema = resultado.error.issues[0];
      this.exemplos.push(
        `linha ${indice}: ${problema.path.join(".") || "(raiz)"} — ${problema.message}`,
      );
    }
    return undefined;
  }

  concluir(): void {
    const { total, invalidas, exemplos, fonte } = this;
    if (total > 0 && invalidas / total > this.tolerancia) {
      throw new ErroDeFormato(
        `${fonte}: ${invalidas} de ${total} linhas fora do formato esperado. ` +
          `A fonte pode ter mudado. Exemplos:\n  ${exemplos.join("\n  ")}`,
      );
    }
    if (invalidas > 0) {
      console.warn(
        `⚠ ${fonte}: ${invalidas} de ${total} linhas descartadas (${exemplos[0]})`,
      );
    }
  }
}

/** Valida um array de linhas de uma vez (ver {@link ValidadorDeLinhas}). */
export function validarLinhas<S extends z.ZodType>(
  esquema: S,
  linhas: readonly unknown[],
  fonte: string,
  tolerancia = 0.01,
): z.infer<S>[] {
  const validador = new ValidadorDeLinhas(esquema, fonte, tolerancia);
  const validas: z.infer<S>[] = [];
  for (const linha of linhas) {
    const valida = validador.validar(linha);
    if (valida !== undefined) validas.push(valida);
  }
  validador.concluir();
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
