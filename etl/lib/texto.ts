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

/** Sufixos de geração que às vezes aparecem e às vezes não ("Nelsinho Trad Filho"). */
const SUFIXOS = new Set([
  "FILHO",
  "FILHA",
  "JUNIOR",
  "JR",
  "NETO",
  "NETA",
  "SOBRINHO",
]);

/** Distância de edição limitada a 1: só diz se as palavras diferem em no máximo uma letra. */
function diferemEmUmaLetra(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  const [curta, longa] = a.length < b.length ? [a, b] : [b, a];
  return curta.slice(i) === longa.slice(i + 1);
}

/** Palavras iguais, ou com uma letra de diferença em palavras longas ("Foletto"/"Folletto"). */
const palavrasIguais = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= 6 && diferemEmUmaLetra(a, b));

const palavras = (nome: string) => {
  const lista = normalizarNome(nome).split(" ").filter(Boolean);
  while (lista.length > 2 && SUFIXOS.has(lista[lista.length - 1])) lista.pop();
  return lista;
};

/**
 * Compara nomes tolerando pontuação, acentos, nomes do meio omitidos, sufixos
 * como "Filho" e uma letra de diferença em palavras longas ("Luiz do Carmo" =
 * "Luiz Carlos do Carmo"; "Samuel Araújo" = "Dr. Samuel Araújo"). O nome mais
 * curto precisa ser o começo do mais longo, ou ter todas as palavras nele com
 * o mesmo sobrenome final.
 */
export function mesmoNome(a: string, b: string): boolean {
  const pa = palavras(a);
  const pb = palavras(b);
  if (pa.length === 0 || pb.length === 0) return false;
  const [menor, maior] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (
    menor.length === maior.length &&
    menor.every((p, i) => palavrasIguais(p, maior[i]))
  ) {
    return true;
  }
  if (menor.length < 2) return false;
  // Começo do nome completo, sem os últimos sobrenomes ("Rafael Bento" = "Rafael Bento Pereira")
  if (menor.every((p, i) => palavrasIguais(p, maior[i]))) return true;
  return (
    palavrasIguais(menor[menor.length - 1], maior[maior.length - 1]) &&
    menor.every((p) => maior.some((q) => palavrasIguais(p, q)))
  );
}
