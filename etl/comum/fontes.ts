import { join } from "node:path";
import { z } from "zod";
import { escreverJson, lerJsonSeExistir } from "../lib/arquivos";

/*
 * `fontes.json`: quando cada fonte foi atualizada e de onde vêm os dados.
 * Cada carga atualiza só a própria chave; as outras são preservadas.
 */

const Origem = z.object({ descricao: z.string(), url: z.string() });

export const Fonte = z.object({
  atualizadoEm: z.string(),
  origem: z.array(Origem),
  /** ano → quando o ano foi processado pela última vez */
  anos: z.record(z.string(), z.string()).optional(),
});
export type Fonte = z.infer<typeof Fonte>;

export const NOMES_DAS_FONTES = ["camara", "senado", "emendas", "tse"] as const;
export type NomeDaFonte = (typeof NOMES_DAS_FONTES)[number];

export const Fontes = z.object({
  versao: z.literal(1),
  camara: Fonte.optional(),
  senado: Fonte.optional(),
  emendas: Fonte.optional(),
  tse: Fonte.optional(),
});
export type Fontes = z.infer<typeof Fontes>;

export async function lerFontes(pastaDados: string): Promise<Fontes> {
  const resultado = Fontes.safeParse(
    await lerJsonSeExistir(join(pastaDados, "fontes.json")),
  );
  return resultado.success ? resultado.data : { versao: 1 };
}

export async function registrarFonte(
  pastaDados: string,
  nome: NomeDaFonte,
  fonte: Fonte,
): Promise<void> {
  const fontes = await lerFontes(pastaDados);
  await escreverJson(
    join(pastaDados, "fontes.json"),
    Fontes.parse({ ...fontes, [nome]: fonte }),
  );
}
