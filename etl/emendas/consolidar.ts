import {
  type Casa,
  type ParlamentarConhecido,
  procurarPorNome,
} from "../comum/parlamentares";
import { centavos } from "../lib/estatistica";
import type { EmendasDoParlamentar, EmendasPorUf } from "./saida";

export interface LinhaEmenda {
  ano: number;
  tipo: string;
  nomeAutor: string;
  codigoMunicipio: string;
  municipio: string;
  codigoUf: string;
  funcao: string;
  empenhado: number;
  pago: number;
}

/** Código IBGE da UF (2 primeiros dígitos) → sigla */
const UF_IBGE: Record<string, string> = {
  "11": "RO",
  "12": "AC",
  "13": "AM",
  "14": "RR",
  "15": "PA",
  "16": "AP",
  "17": "TO",
  "21": "MA",
  "22": "PI",
  "23": "CE",
  "24": "RN",
  "25": "PB",
  "26": "PE",
  "27": "AL",
  "28": "SE",
  "29": "BA",
  "31": "MG",
  "32": "ES",
  "33": "RJ",
  "35": "SP",
  "41": "PR",
  "42": "SC",
  "43": "RS",
  "50": "MS",
  "51": "MT",
  "52": "GO",
  "53": "DF",
};

export const siglaDaUf = (codigo: string) => UF_IBGE[codigo.slice(0, 2)] ?? "";

const ehIndividual = (tipo: string) => tipo.startsWith("Emenda Individual");

/** Data de referência: as emendas à LOA do ano X são apresentadas em outubro/novembro de X-1. */
const dataDeApresentacao = (ano: number) => `${ano - 1}-11-01`;

const emExercicioEntre = (
  p: ParlamentarConhecido,
  inicio: string,
  fim: string,
) => p.periodos.some((x) => x.inicio <= fim && x.fim >= inicio);

/**
 * "RIBAMAR ANTONIO DA SILVA (EX-PARLAMENTAR RICARDO SILVA, NOS TERMOS ART. 78
 * LDO 2025...)": emenda de quem deixou o mandato, assumida pelo sucessor. O
 * autor registrado, e quem a indica hoje, é o sucessor.
 */
export const nomeSemObservacao = (nome: string) =>
  nome.replace(/\s*\(.*$/, "").trim();

/**
 * Identifica o autor de uma emenda individual pelo nome (atual, de outras
 * épocas ou civil), entre quem estava em exercício quando a emenda foi
 * apresentada. Se ninguém estava em exercício nessa data (licença, posse
 * depois), amplia para o ano da apresentação e depois para o ano da emenda.
 * Um mesmo autor pode corresponder a registros diferentes em anos diferentes
 * (deputado que virou senador).
 */
export function identificarAutor(
  parlamentares: ParlamentarConhecido[],
  nomeNoPortal: string,
  ano: number,
): ParlamentarConhecido[] {
  const nome = nomeSemObservacao(nomeNoPortal);
  const data = dataDeApresentacao(ano);
  const filtros = [
    (p: ParlamentarConhecido) => emExercicioEntre(p, data, data),
    (p: ParlamentarConhecido) =>
      emExercicioEntre(p, `${ano - 1}-01-01`, `${ano - 1}-12-31`),
    (p: ParlamentarConhecido) =>
      emExercicioEntre(p, `${ano}-01-01`, `${ano}-12-31`),
  ];
  // Nome exato em qualquer janela vale mais que nome aproximado na data certa
  for (const modo of ["exato", "tolerante"] as const) {
    for (const filtro of filtros) {
      const encontrados = procurarPorNome(
        parlamentares,
        nome,
        (p) => [...p.nomes, p.nomeCivil],
        filtro,
        modo,
      );
      if (encontrados.length > 0) return encontrados;
    }
  }
  return [];
}

class Soma {
  empenhado = 0;
  pago = 0;
  quantidade = 0;
  somar(l: LinhaEmenda) {
    this.empenhado += l.empenhado;
    this.pago += l.pago;
    this.quantidade++;
  }
  valores() {
    return { empenhado: centavos(this.empenhado), pago: centavos(this.pago) };
  }
}

class SomaPorChave {
  private readonly mapa = new Map<string, Soma>();
  somar(chave: string, l: LinhaEmenda) {
    const soma = this.mapa.get(chave) ?? new Soma();
    soma.somar(l);
    this.mapa.set(chave, soma);
  }
  /** Do maior empenho para o menor */
  entradas(): Array<[string, Soma]> {
    return [...this.mapa].sort(([, a], [, b]) => b.empenhado - a.empenhado);
  }
}

interface Acumulado {
  casa: Casa;
  id: number;
  nomes: Set<string>;
  total: Soma;
  porAno: SomaPorChave;
  porTipo: SomaPorChave;
  porFuncao: SomaPorChave;
  porUf: SomaPorChave;
  porMunicipio: SomaPorChave;
  municipios: Map<string, { municipio: string; uf: string }>;
}

export function consolidarEmendas(
  linhas: LinhaEmenda[],
  parlamentares: ParlamentarConhecido[],
  anoInicial: number,
  atualizadoEm: string,
) {
  const porParlamentar = new Map<string, Acumulado>();
  const porUf = new Map<
    string,
    {
      total: Soma;
      porAno: SomaPorChave;
      porTipo: SomaPorChave;
      porParlamentar: SomaPorChave;
    }
  >();
  const resolucoes = new Map<string, ParlamentarConhecido[]>();
  const naoIdentificados = new Map<
    string,
    { soma: Soma; anos: Set<number>; motivo: "sem correspondência" | "ambíguo" }
  >();
  const identificadas = new Soma();
  const autoresIdentificados = new Set<string>();

  for (const l of linhas) {
    if (l.ano < anoInicial) continue;
    const uf = siglaDaUf(l.codigoUf);

    let doUf = porUf.get(uf);
    if (!doUf) {
      doUf = {
        total: new Soma(),
        porAno: new SomaPorChave(),
        porTipo: new SomaPorChave(),
        porParlamentar: new SomaPorChave(),
      };
      porUf.set(uf, doUf);
    }
    doUf.total.somar(l);
    doUf.porAno.somar(String(l.ano), l);
    doUf.porTipo.somar(l.tipo, l);

    if (!ehIndividual(l.tipo)) continue;

    const chaveResolucao = `${l.nomeAutor}|${l.ano}`;
    let candidatos = resolucoes.get(chaveResolucao);
    if (!candidatos) {
      candidatos = identificarAutor(parlamentares, l.nomeAutor, l.ano);
      resolucoes.set(chaveResolucao, candidatos);
    }
    if (candidatos.length !== 1) {
      const registro = naoIdentificados.get(l.nomeAutor) ?? {
        soma: new Soma(),
        anos: new Set<number>(),
        motivo:
          candidatos.length === 0
            ? ("sem correspondência" as const)
            : ("ambíguo" as const),
      };
      registro.soma.somar(l);
      registro.anos.add(l.ano);
      naoIdentificados.set(l.nomeAutor, registro);
      continue;
    }

    const [p] = candidatos;
    const chave = `${p.casa}-${p.id}`;
    identificadas.somar(l);
    autoresIdentificados.add(chave);
    let a = porParlamentar.get(chave);
    if (!a) {
      a = {
        casa: p.casa,
        id: p.id,
        nomes: new Set(),
        total: new Soma(),
        porAno: new SomaPorChave(),
        porTipo: new SomaPorChave(),
        porFuncao: new SomaPorChave(),
        porUf: new SomaPorChave(),
        porMunicipio: new SomaPorChave(),
        municipios: new Map(),
      };
      porParlamentar.set(chave, a);
    }
    a.nomes.add(l.nomeAutor);
    a.total.somar(l);
    a.porAno.somar(String(l.ano), l);
    a.porTipo.somar(l.tipo.replace(/^Emenda Individual - /, ""), l);
    a.porFuncao.somar(l.funcao || "Sem informação", l);
    a.porUf.somar(uf, l);
    if (/^\d{7}$/.test(l.codigoMunicipio)) {
      a.porMunicipio.somar(l.codigoMunicipio, l);
      a.municipios.set(l.codigoMunicipio, { municipio: l.municipio, uf });
    }
    doUf.porParlamentar.somar(chave, l);
  }

  const parlamentaresSaida: EmendasDoParlamentar[] = [
    ...porParlamentar.values(),
  ]
    .sort((a, b) => a.casa.localeCompare(b.casa) || a.id - b.id)
    .map((a) => ({
      versao: 1,
      casa: a.casa,
      id: a.id,
      nomesNoPortal: [...a.nomes].sort(),
      atualizadoEm,
      total: a.total.valores(),
      porAno: a.porAno
        .entradas()
        .map(([ano, s]) => ({
          ano: Number(ano),
          quantidade: s.quantidade,
          ...s.valores(),
        }))
        .sort((x, y) => x.ano - y.ano),
      porTipo: a.porTipo
        .entradas()
        .map(([tipo, s]) => ({ tipo, ...s.valores() })),
      porFuncao: a.porFuncao
        .entradas()
        .map(([funcao, s]) => ({ funcao, ...s.valores() })),
      porUf: a.porUf.entradas().map(([uf, s]) => ({ uf, ...s.valores() })),
      porMunicipio: a.porMunicipio.entradas().map(([codigoIbge, s]) => ({
        codigoIbge,
        ...(a.municipios.get(codigoIbge) as { municipio: string; uf: string }),
        ...s.valores(),
      })),
    }));

  const ufs: EmendasPorUf = {
    versao: 1,
    atualizadoEm,
    ufs: Object.fromEntries(
      [...porUf]
        .filter(([uf]) => uf !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([uf, d]) => [
          uf,
          {
            ...d.total.valores(),
            porAno: d.porAno
              .entradas()
              .map(([ano, s]) => ({ ano: Number(ano), ...s.valores() }))
              .sort((x, y) => x.ano - y.ano),
            porTipo: d.porTipo
              .entradas()
              .map(([tipo, s]) => ({ tipo, ...s.valores() })),
            porParlamentar: d.porParlamentar.entradas().map(([chave, s]) => {
              const [casa, id] = chave.split("-");
              return { casa: casa as Casa, id: Number(id), ...s.valores() };
            }),
          },
        ]),
    ),
  };

  const naoIdentificadas = new Soma();
  for (const r of naoIdentificados.values()) {
    naoIdentificadas.empenhado += r.soma.empenhado;
    naoIdentificadas.pago += r.soma.pago;
  }
  const diagnostico = {
    atualizadoEm,
    identificadas: {
      ...identificadas.valores(),
      autores: autoresIdentificados.size,
    },
    naoIdentificadas: {
      ...naoIdentificadas.valores(),
      autores: naoIdentificados.size,
    },
    autores: [...naoIdentificados]
      .map(([nome, r]) => ({
        nome,
        anos: [...r.anos].sort(),
        motivo: r.motivo,
        ...r.soma.valores(),
      }))
      .sort((a, b) => b.empenhado - a.empenhado),
  };

  return { parlamentares: parlamentaresSaida, ufs, diagnostico };
}
