// Reglas de partido compartidas entre el formulario del dashboard y la API.
import type { SetScore } from './schemas.js'

/** "Las Ónas Vóley" → "las-onas-voley". Vacío si no queda ningún carácter válido. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Slug base del partido: "2026-09-20-vs-las-onas". La API añade "-2", "-3"... si ya existe. */
export function matchSlugBase(playedOn: string, opponentName: string): string {
  const rival = slugify(opponentName).slice(0, 60).replace(/-+$/, '') || 'rival'
  return `${playedOn}-vs-${rival}`
}

/** Sets ganados y perdidos a partir de los parciales. Los sets empatados no cuentan. */
export function tallySets(sets: SetScore[]): { won: number; lost: number } {
  let won = 0
  let lost = 0
  for (const set of sets) {
    if (set.us > set.them) won += 1
    else if (set.us < set.them) lost += 1
  }
  return { won, lost }
}
