/**
 * Confere os arquivos de dados antes do deploy: formato (Zod) e limites de
 * bom senso. Se algo falhar, o deploy não sai e o site continua com os dados
 * anteriores.
 *
 *   pnpm etl:validar [pasta]   # padrão: ./dados
 */
import { join } from "node:path";
import {
  Agregados,
  Deputado,
  Fontes,
  IndiceDeputados,
  ListaVotacoes,
} from "./camara/saida";
import { lerJson, listarArquivos } from "./lib/arquivos";

/** A Câmara tem 513 cadeiras; com suplentes, cada legislatura passa disso. */
const MINIMO_DEPUTADOS = 513;
const MINIMO_NA_MEDIANA = 400;

export async function validarPastaDeDados(pasta: string): Promise<string[]> {
  const problemas: string[] = [];
  const camara = join(pasta, "camara");

  const tentar = async <T>(arquivo: string, ler: () => Promise<T>) => {
    try {
      return await ler();
    } catch (erro) {
      problemas.push(
        `${arquivo}: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
      return undefined;
    }
  };

  await tentar("fontes.json", async () =>
    Fontes.parse(await lerJson(join(pasta, "fontes.json"))),
  );
  await tentar("camara/votacoes.json", async () =>
    ListaVotacoes.parse(await lerJson(join(camara, "votacoes.json"))),
  );

  const indice = await tentar("camara/deputados.json", async () =>
    IndiceDeputados.parse(await lerJson(join(camara, "deputados.json"))),
  );
  if (indice && indice.deputados.length < MINIMO_DEPUTADOS) {
    problemas.push(
      `camara/deputados.json: só ${indice.deputados.length} deputados (mínimo ${MINIMO_DEPUTADOS}).`,
    );
  }

  const agregados = await tentar("camara/agregados.json", async () =>
    Agregados.parse(await lerJson(join(camara, "agregados.json"))),
  );
  for (const l of agregados?.legislaturas ?? []) {
    if (l.casa.n < MINIMO_NA_MEDIANA) {
      problemas.push(
        `camara/agregados.json: legislatura ${l.idLegislatura} com só ${l.casa.n} deputados na mediana.`,
      );
    }
  }

  const arquivos = (await listarArquivos(join(camara, "deputados"))).filter(
    (f) => f.endsWith(".json"),
  );
  if (indice && arquivos.length !== indice.deputados.length) {
    problemas.push(
      `camara/deputados/: ${arquivos.length} arquivos, mas o índice lista ${indice.deputados.length}.`,
    );
  }
  for (const arquivo of arquivos) {
    await tentar(`camara/deputados/${arquivo}`, async () =>
      Deputado.parse(await lerJson(join(camara, "deputados", arquivo))),
    );
    if (problemas.length > 20) break;
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
