/**
 * Confere os arquivos de dados antes do deploy: formato (Zod) e limites de
 * bom senso. Se algo falhar, o deploy não sai e o site continua com os dados
 * anteriores.
 *
 *   pnpm etl:validar [pasta]   # padrão: ./dados
 *
 * Câmara é obrigatória. Senado, emendas e TSE são conferidos quando aparecem
 * em `fontes.json`, para que o deploy funcione enquanto uma fonte nova ainda
 * não foi publicada pela primeira vez.
 */
import { join } from "node:path";
import type { z } from "zod";
import { IndiceDeputados } from "./camara/saida";
import { Fontes } from "./comum/fontes";
import { Agregados, ListaVotacoes, Parlamentar } from "./comum/saida";
import {
  DiagnosticoEmendas,
  EmendasDoParlamentar,
  EmendasPorUf,
} from "./emendas/saida";
import { lerJson, listarArquivos } from "./lib/arquivos";
import { IndiceSenadores } from "./senado/saida";
import { DiagnosticoTse, EleicoesDoParlamentar } from "./tse/saida";

/** Com suplentes, cada legislatura passa do número de cadeiras. */
const LIMITES = {
  camara: { parlamentares: 513, naMediana: 400 },
  senado: { parlamentares: 81, naMediana: 70 },
};
/** Fração mínima do valor das emendas individuais com autor identificado. */
const MINIMO_EMENDAS_IDENTIFICADAS = 0.95;
/** Fração mínima de parlamentares ligados a alguma eleição do TSE. */
const MINIMO_COM_ELEICOES = 0.9;
const UFS = 27;

export async function validarPastaDeDados(pasta: string): Promise<string[]> {
  const problemas: string[] = [];

  const ler = async <S extends z.ZodType>(
    arquivo: string,
    esquema: S,
  ): Promise<z.infer<S> | undefined> => {
    try {
      return esquema.parse(await lerJson(join(pasta, arquivo)));
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      problemas.push(`${arquivo}: ${mensagem.slice(0, 500)}`);
      return undefined;
    }
  };

  /** Valida todos os JSON de uma pasta; retorna quantos são. */
  const lerPasta = async (subpasta: string, esquema: z.ZodType) => {
    const arquivos = (await listarArquivos(join(pasta, subpasta))).filter((f) =>
      f.endsWith(".json"),
    );
    for (const arquivo of arquivos) {
      await ler(join(subpasta, arquivo), esquema);
      if (problemas.length > 20) break;
    }
    return arquivos.length;
  };

  const fontes = await ler("fontes.json", Fontes);

  // Câmara e Senado: mesmo formato
  const casas = [
    { casa: "camara", indice: IndiceDeputados, chave: "deputados" },
    { casa: "senado", indice: IndiceSenadores, chave: "senadores" },
  ] as const;
  const totais = { camara: 0, senado: 0 };
  for (const { casa, indice, chave } of casas) {
    if (casa === "senado" && !fontes?.senado) continue;
    const limite = LIMITES[casa];

    const lista = (await ler(`${casa}/${chave}.json`, indice)) as
      | Record<string, unknown[]>
      | undefined;
    const itens = lista?.[chave];
    if (itens && itens.length < limite.parlamentares) {
      problemas.push(
        `${casa}/${chave}.json: só ${itens.length} (mínimo ${limite.parlamentares}).`,
      );
    }
    const agregados = await ler(`${casa}/agregados.json`, Agregados);
    for (const l of agregados?.legislaturas ?? []) {
      if (l.casa.n < limite.naMediana) {
        problemas.push(
          `${casa}/agregados.json: legislatura ${l.idLegislatura} com só ${l.casa.n} na mediana.`,
        );
      }
    }
    await ler(`${casa}/votacoes.json`, ListaVotacoes);
    const arquivos = await lerPasta(`${casa}/${chave}`, Parlamentar);
    if (itens && arquivos !== itens.length) {
      problemas.push(
        `${casa}/${chave}/: ${arquivos} arquivos, mas o índice lista ${itens.length}.`,
      );
    }
    totais[casa] = arquivos;
  }

  if (fontes?.emendas) {
    const ufs = await ler("emendas/ufs.json", EmendasPorUf);
    if (ufs && Object.keys(ufs.ufs).length !== UFS) {
      problemas.push(
        `emendas/ufs.json: ${Object.keys(ufs.ufs).length} UFs (esperado ${UFS}).`,
      );
    }
    await lerPasta("emendas/parlamentares", EmendasDoParlamentar);
    const diagnostico = await ler(
      "emendas/_diagnostico.json",
      DiagnosticoEmendas,
    );
    if (diagnostico) {
      const { identificadas, naoIdentificadas } = diagnostico;
      const total = identificadas.empenhado + naoIdentificadas.empenhado;
      const fracao = total > 0 ? identificadas.empenhado / total : 1;
      if (fracao < MINIMO_EMENDAS_IDENTIFICADAS) {
        problemas.push(
          `emendas: só ${(fracao * 100).toFixed(1)}% do valor com autor identificado ` +
            `(mínimo ${MINIMO_EMENDAS_IDENTIFICADAS * 100}%).`,
        );
      }
    }
  }

  if (fontes?.tse) {
    await lerPasta("tse/parlamentares", EleicoesDoParlamentar);
    const diagnostico = await ler("tse/_diagnostico.json", DiagnosticoTse);
    const parlamentares = totais.camara + totais.senado;
    if (diagnostico && parlamentares > 0) {
      const fracao = diagnostico.comEleicoes / parlamentares;
      if (fracao < MINIMO_COM_ELEICOES) {
        problemas.push(
          `tse: só ${(fracao * 100).toFixed(1)}% dos parlamentares com eleições ` +
            `(mínimo ${MINIMO_COM_ELEICOES * 100}%).`,
        );
      }
    }
  }

  return problemas;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pasta = process.argv[2] ?? "dados";
  validarPastaDeDados(pasta).then((problemas) => {
    if (problemas.length === 0) {
      console.log(`✓ Dados em ${pasta} válidos.`);
      return;
    }
    console.error(
      `✗ ${problemas.length} problema(s) nos dados:\n  ${problemas.join("\n  ")}`,
    );
    process.exit(1);
  });
}
