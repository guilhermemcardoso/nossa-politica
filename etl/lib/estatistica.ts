/** Mediana de uma lista de números; `null` se a lista estiver vazia. */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? (ordenados[meio - 1] + ordenados[meio]) / 2
    : ordenados[meio];
}

/** Percentual com uma casa decimal; `null` quando não há base de cálculo. */
export function percentual(parte: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((parte / total) * 1000) / 10;
}

/** Arredonda valores em reais para centavos, evitando lixo de ponto flutuante. */
export function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}
