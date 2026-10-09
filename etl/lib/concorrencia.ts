/**
 * Aplica `fn` a cada item com no máximo `limite` chamadas em paralelo,
 * preservando a ordem dos resultados.
 */
export async function mapearComLimite<T, R>(
  itens: readonly T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;

  async function trabalhador() {
    while (proximo < itens.length) {
      const indice = proximo++;
      resultados[indice] = await fn(itens[indice], indice);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, trabalhador),
  );
  return resultados;
}
