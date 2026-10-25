// Catálogo das estratégias. Todas seguem o contrato de docs/ESTRATEGIAS.md §7.
// A ordem da lista é a ordem em que aparecem na tela A2 (obrigatórias primeiro).

import reversaoPicos from './reversao-picos.js';
import spreadFixo from './spread-fixo.js';
import canal from './canal.js';
import escalonada from './escalonada.js';
import grade from './grade.js';
import dca from './dca.js';
import medias from './medias.js';

export const LISTA_ESTRATEGIAS = [reversaoPicos, spreadFixo, canal, escalonada, grade, dca, medias];

export const ESTRATEGIAS = Object.fromEntries(LISTA_ESTRATEGIAS.map((e) => [e.id, e]));

export function estrategiaPorId(id) {
  return ESTRATEGIAS[id] ?? null;
}
