/**
 * Carga da Câmara dos Deputados.
 *
 *   pnpm etl:camara                 # anos recentes + anos que faltam
 *   pnpm etl:camara --completo      # todos os anos das legislaturas do site
 *   pnpm etl:camara --anos 2024,2025
 *   pnpm etl:camara --anos ""        # só reconsolida, sem baixar nada
 *
 * Lê e grava em `--dados` (padrão: ./dados), que no CI é a branch `dados`.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { lerFontes, registrarFonte } from "../comum/fontes";
import {
  escreverJson,
  hojeEmBrasilia,
  lerJson,
  lerJsonSeExistir,
  listarArquivos,
  recriarPasta,
} from "../lib/arquivos";
import { mapearComLimite } from "../lib/concorrencia";
import { baixarEProcessarAno } from "./ano";
import {
  buscarDeputadosDaLegislatura,
  buscarHistorico,
  buscarLegislaturas,
  buscarNomesCivis,
} from "./api";
import { CONCORRENCIA_API, LEGISLATURAS_NO_SITE } from "./config";
import { consolidar } from "./consolidar";
import { type DeputadoDaLista, ItemHistorico } from "./esquemas";
import { ParcialAno } from "./parcial";
import { Agregados, Deputado, IndiceDeputados, ListaVotacoes } from "./saida";

const CacheHistoricos = z.object({
  atualizadoEm: z.string(),
  porDeputado: z.record(z.string(), z.array(ItemHistorico)),
});

async function main() {
  const { values } = parseArgs({
    options: {
      dados: { type: "string", default: "dados" },
      completo: { type: "boolean", default: false },
      anos: { type: "string" },
    },
  });
  const pastaDados = values.dados;
  const pastaCamara = join(pastaDados, "camara");
  const pastaParciais = join(pastaCamara, "_parciais");
  const hoje = hojeEmBrasilia();
  const atualizadoEm = new Date().toISOString();

  // 1. Legislaturas e anos
  const legislaturas = await buscarLegislaturas(LEGISLATURAS_NO_SITE, hoje);
  const primeiroAno = Number(legislaturas[0].dataInicio.slice(0, 4));
  const anoAtual = Number(hoje.slice(0, 4));
  const todosOsAnos = Array.from(
    { length: anoAtual - primeiroAno + 1 },
    (_, i) => primeiroAno + i,
  );
  console.log(
    `Legislaturas ${legislaturas.map((l) => l.id).join(" e ")}; anos ${primeiroAno}–${anoAtual}`,
  );

  const existentes = new Set(
    (await listarArquivos(pastaParciais))
      .map((f) => /^(\d{4})\.json$/.exec(f)?.[1])
      .filter(Boolean)
      .map(Number),
  );
  const anosAlvo =
    values.anos !== undefined
      ? values.anos.split(",").filter(Boolean).map(Number)
      : values.completo
        ? todosOsAnos
        : todosOsAnos.filter((a) => a >= anoAtual - 1 || !existentes.has(a));

  // 2. Arquivos em massa, um ano por vez
  const anosProcessados: Record<string, string> = {
    ...(await lerFontes(pastaDados)).camara?.anos,
  };
  const pastaTemporaria = join(tmpdir(), "nossa-politica-etl");
  for (const ano of anosAlvo) {
    console.log(`Ano ${ano}`);
    const parcial = await baixarEProcessarAno(
      ano,
      pastaTemporaria,
      atualizadoEm,
    );
    await escreverJson(join(pastaParciais, `${ano}.json`), parcial);
    anosProcessados[String(ano)] = atualizadoEm;
  }

  // 3. Deputados e históricos (API)
  const deputadosPorLegislatura = new Map<number, DeputadoDaLista[]>();
  for (const l of legislaturas) {
    deputadosPorLegislatura.set(l.id, await buscarDeputadosDaLegislatura(l.id));
  }
  const caminhoHistoricos = join(pastaParciais, "historicos.json");
  const cache = CacheHistoricos.safeParse(
    await lerJsonSeExistir(caminhoHistoricos),
  );
  const historicos = new Map<number, ItemHistorico[]>(
    cache.success && !values.completo
      ? Object.entries(cache.data.porDeputado).map(([id, h]) => [Number(id), h])
      : [],
  );
  // Quem está na legislatura atual pode mudar de partido ou situação a qualquer dia
  const atual = legislaturas[legislaturas.length - 1].id;
  const paraBuscar = [
    ...new Set(
      [...deputadosPorLegislatura]
        .flatMap(([idLeg, lista]) =>
          lista.filter((d) => idLeg === atual || !historicos.has(d.id)),
        )
        .map((d) => d.id),
    ),
  ];
  console.log(`Históricos: buscando ${paraBuscar.length} na API`);
  await mapearComLimite(paraBuscar, CONCORRENCIA_API, async (id) => {
    historicos.set(id, await buscarHistorico(id));
  });
  await escreverJson(caminhoHistoricos, {
    atualizadoEm,
    porDeputado: Object.fromEntries(historicos),
  });
  const nomesCivis = await buscarNomesCivis();

  // 4. Consolidação
  const parciais: ParcialAno[] = [];
  for (const ano of todosOsAnos) {
    parciais.push(
      ParcialAno.parse(await lerJson(join(pastaParciais, `${ano}.json`))),
    );
  }
  const saida = consolidar({
    legislaturas,
    deputadosPorLegislatura,
    historicos,
    nomesCivis,
    parciais,
    hoje,
    atualizadoEm,
  });

  // 5. Validação e gravação
  const pastaDeputados = join(pastaCamara, "deputados");
  await recriarPasta(pastaDeputados);
  for (const deputado of saida.deputados) {
    await escreverJson(
      join(pastaDeputados, `${deputado.id}.json`),
      Deputado.parse(deputado),
    );
  }
  await escreverJson(
    join(pastaCamara, "deputados.json"),
    IndiceDeputados.parse(saida.indice),
  );
  await escreverJson(
    join(pastaCamara, "agregados.json"),
    Agregados.parse(saida.agregados),
  );
  await escreverJson(
    join(pastaCamara, "votacoes.json"),
    ListaVotacoes.parse(saida.votacoes),
  );
  await registrarFonte(pastaDados, "camara", {
    atualizadoEm,
    anos: anosProcessados,
    origem: [
      {
        descricao: "Dados Abertos da Câmara dos Deputados (API v2)",
        url: "https://dadosabertos.camara.leg.br/swagger/api.html",
      },
      {
        descricao: "Arquivos em massa da Câmara dos Deputados",
        url: "https://dadosabertos.camara.leg.br/arquivos",
      },
      {
        descricao: "Cota para o Exercício da Atividade Parlamentar",
        url: "https://www.camara.leg.br/cota-parlamentar/",
      },
    ],
  });

  console.log(
    `Pronto: ${saida.deputados.length} deputados, ${saida.votacoes.votacoes.length} votações nominais.`,
  );
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
