import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";
import type { z } from "zod";
import { baixarArquivo, type OpcoesHttp } from "../lib/http";
import { extrairDados, validarLinhas } from "../lib/validacao";
import { type FonteDoAno, urlsDoAno } from "./config";
import {
  AutorProposicao,
  Despesa,
  Evento,
  Orientacao,
  Presenca,
  Proposicao,
  Votacao,
  VotacaoProposicao,
  Voto,
} from "./esquemas";
import type { ParcialAno } from "./parcial";
import { processarDespesas } from "./processar/despesas";
import { processarPresencas } from "./processar/presencas";
import { processarProposicoes } from "./processar/proposicoes";
import { processarVotacoes } from "./processar/votacoes";

/** Linhas brutas (ainda não validadas) de cada fonte de um ano. */
export type BrutosDoAno = Record<FonteDoAno, unknown[]>;

/** Transforma as fontes brutas de um ano no resultado intermediário. */
export function processarAno(
  ano: number,
  brutos: BrutosDoAno,
  geradoEm: string,
): ParcialAno {
  const v = <S extends z.ZodType>(esquema: S, fonte: FonteDoAno) =>
    validarLinhas(esquema, brutos[fonte], `${fonte} ${ano}`);

  return {
    versao: 1,
    ano,
    geradoEm,
    despesas: processarDespesas(v(Despesa, "despesas")),
    ...processarVotacoes({
      votacoes: v(Votacao, "votacoes"),
      votacoesProposicoes: v(VotacaoProposicao, "votacoesProposicoes"),
      votos: v(Voto, "votos"),
      orientacoes: v(Orientacao, "orientacoes"),
    }),
    ...processarPresencas({
      eventos: v(Evento, "eventos"),
      presencas: v(Presenca, "presencas"),
    }),
    ...processarProposicoes({
      proposicoes: v(Proposicao, "proposicoes"),
      autores: v(AutorProposicao, "autores"),
    }),
  };
}

/**
 * Baixa os arquivos de um ano, processa e apaga os downloads. Os arquivos
 * somam centenas de MB por ano, então são lidos um de cada vez.
 */
export async function baixarEProcessarAno(
  ano: number,
  pastaTemporaria: string,
  geradoEm: string,
  opcoes: OpcoesHttp = {},
): Promise<ParcialAno> {
  const urls = urlsDoAno(ano);
  const brutos = {} as BrutosDoAno;

  for (const [fonte, url] of Object.entries(urls) as [FonteDoAno, string][]) {
    const destino = join(
      pastaTemporaria,
      `${fonte}-${ano}${url.endsWith(".zip") ? ".zip" : ".json"}`,
    );
    const inicio = Date.now();
    await baixarArquivo(url, destino, opcoes);
    brutos[fonte] = extrairDados(
      await lerJsonOuZip(destino),
      `${fonte} ${ano}`,
    );
    await rm(destino);
    console.log(
      `  ${fonte} ${ano}: ${brutos[fonte].length.toLocaleString("pt-BR")} linhas (${((Date.now() - inicio) / 1000).toFixed(0)} s)`,
    );
  }

  return processarAno(ano, brutos, geradoEm);
}

async function lerJsonOuZip(caminho: string): Promise<unknown> {
  const conteudo = await readFile(caminho);
  if (!caminho.endsWith(".zip")) return JSON.parse(conteudo.toString("utf8"));

  const arquivos = Object.values(unzipSync(conteudo));
  if (arquivos.length !== 1) {
    throw new Error(
      `${caminho}: esperava 1 arquivo no zip, achei ${arquivos.length}`,
    );
  }
  return JSON.parse(new TextDecoder().decode(arquivos[0]));
}
