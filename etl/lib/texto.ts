export function removerAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** "João da Silva Filho" → "joao-da-silva-filho" */
export function slugificar(texto: string): string {
  return removerAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Mascara o CPF de pessoas físicas (LGPD), mantendo CNPJs de empresas.
 * "111.222.333/44" → "***.222.333-**"
 */
export function mascararDocumento(documento: string): string {
  const digitos = documento.replace(/\D/g, "");
  if (digitos.length === 11) {
    return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`;
  }
  if (digitos.length === 14) {
    return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
  }
  return documento.trim();
}

/** "Jean-Paul Prates" → "JEAN PAUL PRATES" */
export function normalizarNome(nome: string): string {
  return removerAcentos(nome)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Compara nomes tolerando pontuação, acentos e nomes do meio omitidos
 * ("Luiz do Carmo" = "Luiz Carlos do Carmo"; "Samuel Araújo" = "Dr. Samuel
 * Araújo"). Todas as palavras do nome mais curto precisam estar no mais longo,
 * com o mesmo sobrenome final.
 */
export function mesmoNome(a: string, b: string): boolean {
  const pa = normalizarNome(a).split(" ").filter(Boolean);
  const pb = normalizarNome(b).split(" ").filter(Boolean);
  if (pa.join(" ") === pb.join(" ")) return pa.length > 0;
  const [menor, maior] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  return (
    menor.length >= 2 &&
    menor.at(-1) === maior.at(-1) &&
    menor.every((palavra) => maior.includes(palavra))
  );
}
