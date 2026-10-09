import { z } from "zod";

/*
 * Emendas parlamentares (Portal da Transparência), publicadas em
 * `dados/emendas/`. Valores em reais. "Pago" soma o pago no próprio ano e os
 * restos a pagar pagos nos anos seguintes.
 */

const Valores = z.object({
  empenhado: z.number(),
  pago: z.number(),
});

export const EmendasDoParlamentar = z.object({
  versao: z.literal(1),
  casa: z.enum(["camara", "senado"]),
  id: z.number(),
  /** Nomes como aparecem no Portal (podem variar entre anos) */
  nomesNoPortal: z.array(z.string()),
  atualizadoEm: z.string(),
  total: Valores,
  porAno: z.array(Valores.extend({ ano: z.number(), quantidade: z.number() })),
  /** Transferências com finalidade definida ou "especiais" (emendas Pix) */
  porTipo: z.array(Valores.extend({ tipo: z.string() })),
  porFuncao: z.array(Valores.extend({ funcao: z.string() })),
  /** Destino por UF; "" quando a emenda é nacional ou para vários estados */
  porUf: z.array(Valores.extend({ uf: z.string() })),
  porMunicipio: z.array(
    Valores.extend({
      codigoIbge: z.string(),
      municipio: z.string(),
      uf: z.string(),
    }),
  ),
});
export type EmendasDoParlamentar = z.infer<typeof EmendasDoParlamentar>;

export const EmendasPorUf = z.object({
  versao: z.literal(1),
  atualizadoEm: z.string(),
  ufs: z.record(
    z.string(),
    Valores.extend({
      porAno: z.array(Valores.extend({ ano: z.number() })),
      /** Individual, bancada, comissão, relator */
      porTipo: z.array(Valores.extend({ tipo: z.string() })),
      /** Emendas individuais de parlamentares identificados */
      porParlamentar: z.array(
        Valores.extend({ casa: z.enum(["camara", "senado"]), id: z.number() }),
      ),
    }),
  ),
});
export type EmendasPorUf = z.infer<typeof EmendasPorUf>;

/** Autores que o cruzamento por nome não identificou, para conferência. */
export const DiagnosticoEmendas = z.object({
  atualizadoEm: z.string(),
  identificadas: Valores.extend({ autores: z.number() }),
  naoIdentificadas: Valores.extend({ autores: z.number() }),
  autores: z.array(
    Valores.extend({
      nome: z.string(),
      anos: z.array(z.number()),
      motivo: z.enum(["sem correspondência", "ambíguo"]),
    }),
  ),
});
