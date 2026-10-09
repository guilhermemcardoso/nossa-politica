import type { Evento, Presenca } from "../esquemas";
import type { ParcialAno } from "../parcial";

/**
 * Presença é medida nas sessões deliberativas do Plenário já encerradas, onde
 * há votação. Sessões solenes, audiências e reuniões de comissão ficam de fora,
 * porque cada deputado participa de comissões diferentes.
 */
export function ehSessaoDeliberativa(evento: Evento): boolean {
  return (
    evento.descricaoTipo.startsWith("Sessão Deliberativa") &&
    evento.situacao.startsWith("Encerrada")
  );
}

export function processarPresencas(fontes: {
  eventos: Evento[];
  presencas: Presenca[];
}): Pick<ParcialAno, "sessoes" | "presencas"> {
  const sessoes = fontes.eventos
    .filter(ehSessaoDeliberativa)
    .map((e) => ({ id: e.id, data: e.dataHoraInicio.slice(0, 10) }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);
  const idsSessoes = new Set(sessoes.map((s) => s.id));

  const porDeputado = new Map<string, Set<number>>();
  for (const p of fontes.presencas) {
    if (!idsSessoes.has(p.idEvento)) continue;
    const chave = String(p.idDeputado);
    const conjunto = porDeputado.get(chave) ?? new Set();
    conjunto.add(p.idEvento);
    porDeputado.set(chave, conjunto);
  }

  const presencas = Object.fromEntries(
    [...porDeputado].map(([id, eventos]) => [
      id,
      [...eventos].sort((a, b) => a - b),
    ]),
  );
  return { sessoes, presencas };
}
