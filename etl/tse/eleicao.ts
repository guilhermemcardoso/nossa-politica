import { rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { lerCsvDoZip, listarZip, numeroBrasileiro } from "../lib/csv";
import { centavos } from "../lib/estatistica";
import { baixarArquivo } from "../lib/http";
import { ValidadorDeLinhas } from "../lib/validacao";
import { CARGOS, type Candidatura, type ParcialEleicao } from "./saida";

const CDN = "https://cdn.tse.jus.br/estatistica/sead/odsele";

export const urlsDaEleicao = (ano: number) => ({
  candidatos: `${CDN}/consulta_cand/consulta_cand_${ano}.zip`,
  bens: `${CDN}/bem_candidato/bem_candidato_${ano}.zip`,
  votos: `${CDN}/votacao_candidato_munzona/votacao_candidato_munzona_${ano}.zip`,
});

const CODIGOS_CARGO = new Set(Object.keys(CARGOS));
const NAO_INFORMADO = /^(#NULO#?|#NE#?|-1|-3|-4)$/i;
const limpo = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return NAO_INFORMADO.test(t) ? "" : t;
};

/** CSVs por UF dentro do zip; o arquivo BRASIL repete todos e fica de fora. */
export async function arquivosPorUf(zip: string): Promise<string[]> {
  return (await listarZip(zip)).filter(
    (f) => /_[A-Z]{2}\.(csv|txt)$/i.test(f) && !/BRASIL/i.test(f),
  );
}

const LinhaCandidato = z.object({
  SQ_CANDIDATO: z.string().regex(/^\d+$/),
  NR_TURNO: z.coerce.number().int(),
  CD_CARGO: z.string(),
  SG_UF: z.string(),
  SG_PARTIDO: z.string(),
  NR_CANDIDATO: z.string(),
  NM_CANDIDATO: z.string().min(1),
  NM_URNA_CANDIDATO: z.string(),
  DS_SITUACAO_CANDIDATURA: z.string(),
  DS_SIT_TOT_TURNO: z.string(),
});

const LinhaBem = z.object({
  SQ_CANDIDATO: z.string().regex(/^\d+$/),
  DS_TIPO_BEM_CANDIDATO: z.string(),
  VR_BEM_CANDIDATO: z
    .string()
    .transform(numeroBrasileiro)
    .pipe(z.number().finite()),
});

const LinhaVoto = z.object({
  SQ_CANDIDATO: z.string().regex(/^\d+$/),
  NR_TURNO: z.coerce.number().int(),
  QT_VOTOS_NOMINAIS: z.coerce.number().int().nonnegative(),
});

/**
 * Processa uma eleição geral: candidaturas aos cargos de `CARGOS`, votos
 * nominais no 1º turno (somados por município e zona) e bens declarados.
 */
export async function baixarEProcessarEleicao(
  ano: number,
  pastaTemporaria: string,
  geradoEm: string,
): Promise<ParcialEleicao> {
  const urls = urlsDaEleicao(ano);
  const candidaturas = new Map<string, Candidatura>();

  // 1. Candidatos (uma linha por turno disputado)
  const zipCandidatos = join(pastaTemporaria, `candidatos-${ano}.zip`);
  await baixarArquivo(urls.candidatos, zipCandidatos);
  const vCandidatos = new ValidadorDeLinhas(
    LinhaCandidato,
    `candidatos ${ano}`,
  );
  for (const arquivo of await arquivosPorUf(zipCandidatos)) {
    await lerCsvDoZip(zipCandidatos, arquivo, (bruta) => {
      if (!CODIGOS_CARGO.has(bruta.CD_CARGO)) return;
      const l = vCandidatos.validar(bruta);
      if (!l) return;
      const existente = candidaturas.get(l.SQ_CANDIDATO);
      const resultado = limpo(l.DS_SIT_TOT_TURNO);
      if (existente) {
        // Linha do 2º turno: vale o resultado final
        if (l.NR_TURNO > 1 && resultado) existente.resultado = resultado;
        return;
      }
      candidaturas.set(l.SQ_CANDIDATO, {
        ano,
        sq: l.SQ_CANDIDATO,
        cargo: CARGOS[Number(l.CD_CARGO) as keyof typeof CARGOS],
        uf: l.SG_UF.trim(),
        partido: limpo(l.SG_PARTIDO),
        numero: limpo(l.NR_CANDIDATO),
        nome: l.NM_CANDIDATO.trim(),
        nomeUrna: limpo(l.NM_URNA_CANDIDATO),
        situacaoCandidatura: limpo(l.DS_SITUACAO_CANDIDATURA),
        resultado,
        votos: 0,
        bens: { total: 0, porTipo: [] },
      });
    });
  }
  vCandidatos.concluir();
  await rm(zipCandidatos);

  // 2. Bens declarados
  const zipBens = join(pastaTemporaria, `bens-${ano}.zip`);
  await baixarArquivo(urls.bens, zipBens);
  const vBens = new ValidadorDeLinhas(LinhaBem, `bens ${ano}`);
  const bens = new Map<string, Map<string, number>>();
  for (const arquivo of await arquivosPorUf(zipBens)) {
    await lerCsvDoZip(zipBens, arquivo, (bruta) => {
      if (!candidaturas.has(bruta.SQ_CANDIDATO)) return;
      const l = vBens.validar(bruta);
      if (!l) return;
      const porTipo = bens.get(l.SQ_CANDIDATO) ?? new Map<string, number>();
      const tipo = limpo(l.DS_TIPO_BEM_CANDIDATO) || "Outros";
      porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + l.VR_BEM_CANDIDATO);
      bens.set(l.SQ_CANDIDATO, porTipo);
    });
  }
  vBens.concluir();
  await rm(zipBens);
  for (const [sq, porTipo] of bens) {
    const c = candidaturas.get(sq) as Candidatura;
    const lista = [...porTipo]
      .map(([tipo, valor]) => ({ tipo, valor: centavos(valor) }))
      .sort((a, b) => b.valor - a.valor);
    c.bens = {
      total: centavos(lista.reduce((s, b) => s + b.valor, 0)),
      porTipo: lista,
    };
  }

  // 3. Votos: centenas de MB compactados, lidos em fluxo
  const zipVotos = join(pastaTemporaria, `votos-${ano}.zip`);
  await baixarArquivo(urls.votos, zipVotos);
  const vVotos = new ValidadorDeLinhas(LinhaVoto, `votos ${ano}`);
  for (const arquivo of await arquivosPorUf(zipVotos)) {
    await lerCsvDoZip(zipVotos, arquivo, (bruta) => {
      const c = candidaturas.get(bruta.SQ_CANDIDATO);
      if (!c) return;
      const l = vVotos.validar(bruta);
      if (l && l.NR_TURNO === 1) c.votos += l.QT_VOTOS_NOMINAIS;
    });
  }
  vVotos.concluir();
  await rm(zipVotos);

  return {
    versao: 1,
    ano,
    geradoEm,
    candidaturas: [...candidaturas.values()].sort((a, b) =>
      a.sq.localeCompare(b.sq),
    ),
  };
}
