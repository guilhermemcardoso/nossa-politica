import type { ParlamentarConhecido } from "../comum/parlamentares";
import { normalizarNome } from "../lib/texto";
import type { Candidatura, EleicoesDoParlamentar } from "./saida";

export interface ResultadoCruzamento {
  porParlamentar: EleicoesDoParlamentar[];
  semEleicoes: ParlamentarConhecido[];
  ambiguos: Array<{ parlamentar: ParlamentarConhecido; ano: number }>;
}

function indexar(
  candidaturas: Candidatura[],
  chave: (c: Candidatura) => string,
) {
  const indice = new Map<string, Candidatura[]>();
  for (const c of candidaturas) {
    const k = chave(c);
    if (k === "") continue;
    const lista = indice.get(k) ?? [];
    lista.push(c);
    indice.set(k, lista);
  }
  return indice;
}

/**
 * Uma pessoa pode ter mais de um registro na mesma eleição: candidatura
 * trocada de cargo, substituída ou indeferida. Fica a principal: apta, depois
 * a que resultou em eleição, depois a mais votada.
 */
export function candidaturaPrincipal(lista: Candidatura[]): Candidatura {
  const pontos = (c: Candidatura) => [
    c.situacaoCandidatura === "APTO" ? 1 : 0,
    c.resultado.startsWith("ELEITO") ? 1 : 0,
    c.votos,
  ];
  return [...lista].sort((a, b) => {
    const [pa, pb] = [pontos(a), pontos(b)];
    for (let i = 0; i < pa.length; i++)
      if (pa[i] !== pb[i]) return pb[i] - pa[i];
    return a.sq.localeCompare(b.sq);
  })[0];
}

/**
 * Liga cada parlamentar às suas candidaturas. O TSE não divulga o CPF, então
 * a chave é o nome civil completo mais a UF (o nome civil quase nunca se
 * repete num mesmo estado). Em eleições sem correspondência pelo nome civil
 * (mudança de nome, por exemplo), tenta o nome de urna contra os nomes
 * parlamentares. Com mais de um registro na mesma eleição, fica a
 * candidatura principal; só quando os registros parecem ser de pessoas
 * diferentes (nomes civis diferentes) a eleição fica de fora, para não mostrar
 * a candidatura de outra pessoa.
 */
export function cruzarEleicoes(
  parlamentares: ParlamentarConhecido[],
  candidaturas: Candidatura[],
  atualizadoEm: string,
): ResultadoCruzamento {
  const porNomeCivil = indexar(candidaturas, (c) => normalizarNome(c.nome));
  const porNomeUrna = indexar(candidaturas, (c) => normalizarNome(c.nomeUrna));

  const resultado: ResultadoCruzamento = {
    porParlamentar: [],
    semEleicoes: [],
    ambiguos: [],
  };

  for (const p of parlamentares) {
    const daUf = (c: Candidatura) =>
      c.cargo === "Presidente" || p.ufs.has(c.uf);
    const civis = p.nomeCivil
      ? (porNomeCivil.get(normalizarNome(p.nomeCivil)) ?? []).filter(daUf)
      : [];
    const anosCivis = new Set(civis.map((c) => c.ano));
    const deUrna = [...new Set(p.nomes.map(normalizarNome))]
      .flatMap((n) => porNomeUrna.get(n) ?? [])
      .filter((c) => daUf(c) && !anosCivis.has(c.ano));

    const porAno = new Map<number, Candidatura[]>();
    for (const c of [...civis, ...deUrna]) {
      const lista = porAno.get(c.ano) ?? [];
      if (!lista.some((x) => x.sq === c.sq)) lista.push(c);
      porAno.set(c.ano, lista);
    }

    const eleicoes: EleicoesDoParlamentar["eleicoes"] = [];
    for (const [ano, lista] of [...porAno].sort(([a], [b]) => a - b)) {
      const nomesCivis = new Set(lista.map((c) => normalizarNome(c.nome)));
      if (nomesCivis.size > 1) {
        resultado.ambiguos.push({ parlamentar: p, ano });
        continue;
      }
      const {
        sq: _sq,
        nome: _nome,
        ...candidatura
      } = candidaturaPrincipal(lista);
      eleicoes.push(candidatura);
    }

    if (eleicoes.length === 0) {
      resultado.semEleicoes.push(p);
      continue;
    }
    resultado.porParlamentar.push({
      versao: 1,
      casa: p.casa,
      id: p.id,
      atualizadoEm,
      eleicoes,
    });
  }
  return resultado;
}
