/**
 * Carga do Senado Federal.
 *
 *   pnpm etl:senado [--dados pasta]
 *
 * Os volumes do Senado são pequenos (81 cadeiras, poucas centenas de votações
 * por ano), então toda carga refaz tudo: não há parciais por ano.
 */
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buscarLegislaturas } from "../camara/api";
import { LEGISLATURAS_NO_SITE } from "../camara/config";
import { registrarFonte } from "../comum/fontes";
import { escreverJson, hojeEmBrasilia, recriarPasta } from "../lib/arquivos";
import { mapearComLimite } from "../lib/concorrencia";
import {
  buscarDespesas,
  buscarFiliacoes,
  buscarMandatos,
  buscarOrientacoes,
  buscarProcessosDoAutor,
  buscarSenadoresDaLegislatura,
  buscarVotacoes,
} from "./api";
import { consolidarSenado, type DadosDoSenador } from "./consolidar";
import type {
  DespesaCeaps,
  OrientacaoSenado,
  SenadorDaLista,
  VotacaoSenado,
} from "./esquemas";
import { calcularMandatoSenador } from "./mandatos";
import { Agregados, IndiceSenadores, ListaVotacoes, Senador } from "./saida";

const CONCORRENCIA = 4;

async function main() {
  const { values } = parseArgs({
    options: { dados: { type: "string", default: "dados" } },
  });
  const pastaSenado = join(values.dados, "senado");
  const hoje = hojeEmBrasilia();
  const atualizadoEm = new Date().toISOString();

  const legislaturas = await buscarLegislaturas(LEGISLATURAS_NO_SITE, hoje);
  const primeiroAno = Number(legislaturas[0].dataInicio.slice(0, 4));
  const anoAtual = Number(hoje.slice(0, 4));
  const anos = Array.from(
    { length: anoAtual - primeiroAno + 1 },
    (_, i) => primeiroAno + i,
  );

  // 1. Senadores: lista de cada legislatura, depois mandatos de cada um
  const listados = new Map<number, SenadorDaLista>();
  for (const l of legislaturas) {
    for (const s of await buscarSenadoresDaLegislatura(l.id)) {
      listados.set(s.IdentificacaoParlamentar.CodigoParlamentar, s);
    }
  }
  console.log(`Senadores listados: ${listados.size}`);

  const senadores = new Map<number, DadosDoSenador>();
  await mapearComLimite(
    [...listados],
    CONCORRENCIA,
    async ([codigo, lista]) => {
      const [mandatos, filiacoes] = await Promise.all([
        buscarMandatos(codigo),
        buscarFiliacoes(codigo),
      ]);
      // Suplentes que nunca assumiram não entram
      const exerceu = legislaturas.some(
        (l) => calcularMandatoSenador(mandatos, filiacoes, l, hoje) !== null,
      );
      if (!exerceu) return;
      const processos = await buscarProcessosDoAutor(codigo);
      senadores.set(codigo, { lista, mandatos, filiacoes, processos });
    },
  );
  console.log(`Senadores em exercício nas legislaturas: ${senadores.size}`);

  // 2. Votações, orientações e despesas, ano a ano
  const votacoes: VotacaoSenado[] = [];
  const orientacoes: OrientacaoSenado[] = [];
  const despesas: DespesaCeaps[] = [];
  for (const ano of anos) {
    const inicio = `${ano}-01-01`;
    const fim = ano === anoAtual ? hoje : `${ano}-12-31`;
    const [v, o, d] = await Promise.all([
      buscarVotacoes(inicio, fim),
      buscarOrientacoes(inicio, fim),
      buscarDespesas(ano),
    ]);
    votacoes.push(...v);
    orientacoes.push(...o);
    despesas.push(...d);
    console.log(
      `  ${ano}: ${v.length} votações, ${o.length} com orientação, ${d.length} despesas`,
    );
  }

  // 3. Consolidação e gravação
  const saida = consolidarSenado({
    legislaturas,
    senadores,
    votacoes,
    orientacoes,
    despesas,
    hoje,
    atualizadoEm,
  });

  const pastaSenadores = join(pastaSenado, "senadores");
  await recriarPasta(pastaSenadores);
  for (const senador of saida.senadores) {
    await escreverJson(
      join(pastaSenadores, `${senador.id}.json`),
      Senador.parse(senador),
    );
  }
  await escreverJson(
    join(pastaSenado, "senadores.json"),
    IndiceSenadores.parse(saida.indice),
  );
  await escreverJson(
    join(pastaSenado, "agregados.json"),
    Agregados.parse(saida.agregados),
  );
  await escreverJson(
    join(pastaSenado, "votacoes.json"),
    ListaVotacoes.parse(saida.votacoes),
  );
  await registrarFonte(values.dados, "senado", {
    atualizadoEm,
    origem: [
      {
        descricao: "Dados Abertos Legislativos do Senado Federal",
        url: "https://legis.senado.leg.br/dadosabertos/docs/",
      },
      {
        descricao: "Dados Abertos Administrativos do Senado Federal (CEAPS)",
        url: "https://adm.senado.gov.br/adm-dadosabertos/swagger-ui/index.html",
      },
    ],
  });

  console.log(
    `Pronto: ${saida.senadores.length} senadores, ${saida.votacoes.votacoes.length} votações.`,
  );
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
