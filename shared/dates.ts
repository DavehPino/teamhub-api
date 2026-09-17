// Utilidades de fechas "YYYY-MM-DD" sin zona horaria. Se usan en frontend y backend:
// el equipo opera en una sola ciudad y las fechas/horas son siempre locales.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** "YYYY-MM-DD" → Date en UTC (solo para aritmética; nunca para mostrar). */
export function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d))
}

export function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate)
  date.setUTCDate(date.getUTCDate() + days)
  return toIsoDate(date)
}

/** Lunes de la semana (ISO) a la que pertenece la fecha. */
export function mondayOf(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  const isoDow = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  return addDays(isoDate, 1 - isoDow)
}

/** Fecha local de hoy como "YYYY-MM-DD" (según el reloj de quien ejecuta). */
export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** "HH:MM:SS" | "HH:MM" → "HH:MM". */
export function shortTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null
}
