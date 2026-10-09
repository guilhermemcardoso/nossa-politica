/**
 * Emendas parlamentares (Portal da Transparência).
 *
 *   pnpm etl:emendas [--dados pasta]
 *
 * Usa o arquivo completo de emendas do Portal, que não exige chave de API.
 * Precisa das cargas da Câmara e do Senado já feitas na mesma pasta, porque o
 * autor das emendas vem só pelo nome.
 */
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { buscarLegislaturas } from "../camara/api";
import { LEGISLATURAS_NO_SITE } from "../camara/config";
import { registrarFonte } from "../comum/fontes";
import { carregarParlamentares } from "../comum/parlamentares";
import { escreverJson, hojeEmBrasilia, recriarPasta } from "../lib/arquivos";
import { lerCsvDoZip, numeroBrasileiro } from "../lib/csv";
import { baixarArquivo } from "../lib/http";
import { ValidadorDeLinhas } from "../lib/validacao";
import { consolidarEmendas, type LinhaEmenda } from "./consolidar";
import {
  DiagnosticoEmendas,
  EmendasDoParlamentar,
  EmendasPorUf,
} from "./saida";

const URL_EMENDAS =
  "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO";

const valor = z.string().transform(numeroBrasileiro).pipe(z.number().finite());

const LinhaCsv = z
  .object({
    "Ano da Emenda": z.coerce.number().int(),
    "Tipo de Emenda": z.string().min(1),
    "Nome do Autor da Emenda": z.string(),
    "Código Município IBGE": z.string(),
    Município: z.string(),
    "Código UF IBGE": z.string(),
    "Nome Função": z.string(),
    "Valor Empenhado": valor,
    "Valor Pago": valor,
    "Valor Restos A Pagar Pagos": valor,
  })
  .transform(
    (l): LinhaEmenda => ({
      ano: l["Ano da Emenda"],
      tipo: l["Tipo de Emenda"].trim(),
      nomeAutor: l["Nome do Autor da Emenda"].trim(),
      codigoMunicipio: l["Código Município IBGE"].trim(),
      municipio: l.Município.trim(),
      codigoUf: l["Código UF IBGE"].trim(),
      funcao: l["Nome Função"].trim(),
      empenhado: l["Valor Empenhado"],
      // Pago no próprio ano + restos a pagar pagos nos anos seguintes
      pago: l["Valor Pago"] + l["Valor Restos A Pagar Pagos"],
    }),
  );

async function main() {
  const { values } = parseArgs({
    options: { dados: { type: "string", default: "dados" } },
  });
  const pastaEmendas = join(values.dados, "emendas");
  const atualizadoEm = new Date().toISOString();

  // Emendas apresentadas durante as legislaturas do site: a LOA do ano X é
  // emendada em X-1, então o primeiro ano é o seguinte ao início da legislatura
  const legislaturas = await buscarLegislaturas(
    LEGISLATURAS_NO_SITE,
    hojeEmBrasilia(),
  );
  const anoInicial = Number(legislaturas[0].dataInicio.slice(0, 4)) + 1;

  const parlamentares = await carregarParlamentares(values.dados);
  console.log(`Parlamentares para cruzar: ${parlamentares.length}`);

  const zip = join(tmpdir(), "nossa-politica-etl", "emendas.zip");
  await baixarArquivo(URL_EMENDAS, zip);
  const validador = new ValidadorDeLinhas(LinhaCsv, "EmendasParlamentares.csv");
  const linhas: LinhaEmenda[] = [];
  await lerCsvDoZip(zip, "EmendasParlamentares.csv", (bruta) => {
    const linha = validador.validar(bruta);
    if (linha) linhas.push(linha);
  });
  validador.concluir();
  await rm(zip);
  console.log(`Linhas de emendas: ${linhas.length.toLocaleString("pt-BR")}`);

  const saida = consolidarEmendas(
    linhas,
    parlamentares,
    anoInicial,
    atualizadoEm,
  );

  const pastaParlamentares = join(pastaEmendas, "parlamentares");
  await recriarPasta(pastaParlamentares);
  for (const p of saida.parlamentares) {
    await escreverJson(
      join(pastaParlamentares, `${p.casa}-${p.id}.json`),
      EmendasDoParlamentar.parse(p),
    );
  }
  await escreverJson(
    join(pastaEmendas, "ufs.json"),
    EmendasPorUf.parse(saida.ufs),
  );
  await escreverJson(
    join(pastaEmendas, "_diagnostico.json"),
    DiagnosticoEmendas.parse(saida.diagnostico),
  );
  await registrarFonte(values.dados, "emendas", {
    atualizadoEm,
    origem: [
      {
        descricao: "Portal da Transparência: emendas parlamentares",
        url: "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares",
      },
    ],
  });

  const { identificadas, naoIdentificadas } = saida.diagnostico;
  const fracao =
    identificadas.empenhado /
    (identificadas.empenhado + naoIdentificadas.empenhado);
  console.log(
    `Pronto: ${saida.parlamentares.length} parlamentares com emendas; ` +
      `${(fracao * 100).toFixed(1)}% do valor individual identificado ` +
      `(${naoIdentificadas.autores} autores sem correspondência ou ambíguos).`,
  );
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
