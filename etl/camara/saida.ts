import { z } from "zod";
import { ItemIndice, Parlamentar } from "../comum/saida";

/*
 * Arquivos da Câmara publicados na branch `dados`. Os formatos são os comuns
 * a Câmara e Senado (`etl/comum/saida.ts`); aqui ficam só os nomes usados na
 * Câmara.
 */

export {
  Agregados,
  ListaVotacoes,
  MandatoNaLegislatura,
  Medianas,
} from "../comum/saida";

export const Deputado = Parlamentar;
export type Deputado = z.infer<typeof Deputado>;

export const IndiceDeputados = z.object({
  versao: z.literal(1),
  atualizadoEm: z.string(),
  deputados: z.array(ItemIndice),
});
export type IndiceDeputados = z.infer<typeof IndiceDeputados>;
