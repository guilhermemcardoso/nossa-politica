import { z } from "zod";
import { ItemIndice, Parlamentar } from "../comum/saida";

/*
 * Arquivos do Senado publicados na branch `dados`, no mesmo formato da Câmara
 * (`etl/comum/saida.ts`).
 */

export { Agregados, ListaVotacoes } from "../comum/saida";

export const Senador = Parlamentar;
export type Senador = z.infer<typeof Senador>;

export const IndiceSenadores = z.object({
  versao: z.literal(1),
  atualizadoEm: z.string(),
  senadores: z.array(ItemIndice),
});
