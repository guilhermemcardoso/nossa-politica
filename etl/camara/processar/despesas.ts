import { centavos } from "../../lib/estatistica";
import { mascararDocumento } from "../../lib/texto";
import { LIMITE_MAIORES_NOTAS } from "../config";
import type { Despesa } from "../esquemas";
import type { DespesasDoAno, NotaFiscal, ParcialAno } from "../parcial";

/**
 * Soma as despesas da cota parlamentar por deputado e legislatura: por mês,
 * por categoria e as maiores notas. Despesas de lideranças (sem deputado)
 * ficam de fora. Valores negativos (compensações de passagens) entram na soma,
 * porque o valor líquido é o que de fato saiu da cota.
 */
export function processarDespesas(linhas: Despesa[]): ParcialAno["despesas"] {
  const acumulado = new Map<
    string,
    {
      porMes: Map<string, number>;
      porCategoria: Map<string, number>;
      notas: NotaFiscal[];
    }
  >();

  for (const linha of linhas) {
    if (linha.idDeputado === undefined) continue;
    const chave = `${linha.idDeputado}|${linha.codigoLegislatura}`;
    let item = acumulado.get(chave);
    if (!item) {
      item = { porMes: new Map(), porCategoria: new Map(), notas: [] };
      acumulado.set(chave, item);
    }

    const mes = `${linha.ano}-${String(linha.mes).padStart(2, "0")}`;
    const categoria = linha.descricao.trim();
    item.porMes.set(mes, (item.porMes.get(mes) ?? 0) + linha.valorLiquido);
    item.porCategoria.set(
      categoria,
      (item.porCategoria.get(categoria) ?? 0) + linha.valorLiquido,
    );
    if (linha.valorLiquido > 0) {
      item.notas.push({
        data: linha.dataEmissao.slice(0, 10) || `${mes}-01`,
        categoria,
        fornecedor: linha.fornecedor.trim(),
        documento: mascararDocumento(linha.cnpjCPF),
        valor: linha.valorLiquido,
        url: linha.urlDocumento,
      });
    }
  }

  const resultado: ParcialAno["despesas"] = {};
  for (const [chave, item] of acumulado) {
    const [idDeputado, idLegislatura] = chave.split("|");
    const despesas: DespesasDoAno = {
      porMes: arredondar(item.porMes),
      porCategoria: arredondar(item.porCategoria),
      maioresNotas: maioresNotas(item.notas),
    };
    resultado[idDeputado] ??= {};
    resultado[idDeputado][idLegislatura] = despesas;
  }
  return resultado;
}

export function maioresNotas(notas: NotaFiscal[]): NotaFiscal[] {
  return [...notas]
    .sort((a, b) => b.valor - a.valor || a.data.localeCompare(b.data))
    .slice(0, LIMITE_MAIORES_NOTAS)
    .map((n) => ({ ...n, valor: centavos(n.valor) }));
}

function arredondar(mapa: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...mapa]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, centavos(v)]),
  );
}
