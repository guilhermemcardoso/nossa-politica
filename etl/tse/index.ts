/**
 * Dados eleitorais do TSE: candidaturas, votos e bens declarados.
 *
 *   pnpm etl:tse                 # só eleições que ainda não foram processadas
 *   pnpm etl:tse --recente       # também reprocessa a eleição mais recente
 *   pnpm etl:tse --completo      # reprocessa todas
 *
 * Eleições passadas não mudam, então ficam guardadas em `tse/_parciais/`. Cada
 * eleição baixa algumas centenas de MB (o arquivo de votos por município).
 * Precisa das cargas da Câmara e do Senado já feitas na mesma pasta.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buscarLegislaturas } from "../camara/api";
import { LEGISLATURAS_NO_SITE } from "../camara/config";
import { lerFontes, registrarFonte } from "../comum/fontes";
import { carregarParlamentares } from "../comum/parlamentares";
import {
  escreverJson,
  hojeEmBrasilia,
  lerJson,
  listarArquivos,
  recriarPasta,
} from "../lib/arquivos";
import { cruzarEleicoes } from "./cruzar";
import { baixarEProcessarEleicao } from "./eleicao";
import { DiagnosticoTse, EleicoesDoParlamentar, ParcialEleicao } from "./saida";

async function main() {
  const { values } = parseArgs({
    options: {
      dados: { type: "string", default: "dados" },
      recente: { type: "boolean", default: false },
      completo: { type: "boolean", default: false },
    },
  });
  const pastaTse = join(values.dados, "tse");
  const pastaParciais = join(pastaTse, "_parciais");
  const hoje = hojeEmBrasilia();
  const atualizadoEm = new Date().toISOString();

  // Eleições gerais (a cada 4 anos) desde a que elegeu os senadores mais
  // antigos da legislatura anterior: mandato de 8 anos, eleitos 5 anos antes
  const legislaturas = await buscarLegislaturas(LEGISLATURAS_NO_SITE, hoje);
  const primeira = Number(legislaturas[0].dataInicio.slice(0, 4)) - 5;
  const anoAtual = Number(hoje.slice(0, 4));
  const eleicoes: number[] = [];
  for (let ano = primeira; ano <= anoAtual; ano += 4) eleicoes.push(ano);
  const maisRecente = eleicoes[eleicoes.length - 1];

  const existentes = new Set(
    (await listarArquivos(pastaParciais))
      .map((f) => /^(\d{4})\.json$/.exec(f)?.[1])
      .filter(Boolean)
      .map(Number),
  );
  const alvo = eleicoes.filter(
    (ano) =>
      values.completo ||
      !existentes.has(ano) ||
      (values.recente && ano === maisRecente),
  );

  const anos: Record<string, string> = {
    ...(await lerFontes(values.dados)).tse?.anos,
  };
  const pastaTemporaria = join(tmpdir(), "nossa-politica-etl");
  for (const ano of alvo) {
    console.log(`Eleição ${ano}`);
    const parcial = await baixarEProcessarEleicao(
      ano,
      pastaTemporaria,
      atualizadoEm,
    );
    await escreverJson(
      join(pastaParciais, `${ano}.json`),
      ParcialEleicao.parse(parcial),
    );
    anos[String(ano)] = atualizadoEm;
    console.log(
      `  ${parcial.candidaturas.length.toLocaleString("pt-BR")} candidaturas`,
    );
  }

  const candidaturas = [];
  for (const ano of eleicoes) {
    const parcial = ParcialEleicao.parse(
      await lerJson(join(pastaParciais, `${ano}.json`)),
    );
    candidaturas.push(...parcial.candidaturas);
  }

  const parlamentares = await carregarParlamentares(values.dados);
  const cruzamento = cruzarEleicoes(parlamentares, candidaturas, atualizadoEm);

  const pastaParlamentares = join(pastaTse, "parlamentares");
  await recriarPasta(pastaParlamentares);
  for (const p of cruzamento.porParlamentar) {
    await escreverJson(
      join(pastaParlamentares, `${p.casa}-${p.id}.json`),
      EleicoesDoParlamentar.parse(p),
    );
  }
  await escreverJson(
    join(pastaTse, "_diagnostico.json"),
    DiagnosticoTse.parse({
      atualizadoEm,
      comEleicoes: cruzamento.porParlamentar.length,
      semEleicoes: cruzamento.semEleicoes.map((p) => ({
        casa: p.casa,
        id: p.id,
        nome: p.nome,
      })),
      ambiguos: cruzamento.ambiguos.map(({ parlamentar: p, ano }) => ({
        casa: p.casa,
        id: p.id,
        nome: p.nome,
        ano,
      })),
    }),
  );
  await registrarFonte(values.dados, "tse", {
    atualizadoEm,
    anos,
    origem: [
      {
        descricao: "Portal de Dados Abertos do TSE: candidatos, bens e votação",
        url: "https://dadosabertos.tse.jus.br/",
      },
    ],
  });

  console.log(
    `Pronto: ${cruzamento.porParlamentar.length} de ${parlamentares.length} parlamentares ` +
      `com eleições; ${cruzamento.semEleicoes.length} sem correspondência, ` +
      `${cruzamento.ambiguos.length} eleições ambíguas deixadas de fora.`,
  );
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
