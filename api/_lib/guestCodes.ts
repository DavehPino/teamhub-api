// Códigos de invitado: acceso de solo lectura sin cuenta con un código autogenerado de un solo uso (tabla org_guest_codes,
// canje atómico en la función SQL redeem_guest_code). Distinto de las invitaciones de miembro (members.ts).
import { randomInt } from 'node:crypto'
import {
  GUEST_CODE_LENGTH,
  INVITE_CODE_ALPHABET,
  normalizeInviteCode,
  type GuestAccess,
  type GuestCode,
  type GuestCodeRedeemInput,
} from '../../shared/onboarding.js'
import { delayFailure } from './admin.js'
import { HttpError, notFound } from './http.js'
import { db } from './supabase.js'
import type { Org } from './tenant.js'

/** Código de PostgreSQL para «unique_violation»: el código generado ya existía. */
const UNIQUE_VIOLATION = '23505'
/** Intentos de generar un código distinto antes de rendirse (con 31^6 combinaciones casi nunca hace falta el segundo). */
const CODE_ATTEMPTS = 5

const newGuestCode = (): string =>
  Array.from({ length: GUEST_CODE_LENGTH }, () => INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)]).join('')

/** Mensaje de una excepción de las funciones SQL (`raise exception 'codigo'`). */
const sqlCode = (error: { message?: string } | null): string => (error?.message ?? '').trim()

/** Genera un código de invitado nuevo para el club. Cada invitación es un código distinto. */
export async function createGuestCode(org: Org, createdBy: string): Promise<GuestCode> {
  for (let attempt = 1; attempt <= CODE_ATTEMPTS; attempt += 1) {
    const { data, error } = await db()
      .from('org_guest_codes')
      .insert({ org_id: org.id, code: newGuestCode(), created_by: createdBy })
      .select('code,created_at')
      .single()
    if (error?.code === UNIQUE_VIOLATION) continue
    if (error) throw error
    return data
  }
  throw new Error('No se pudo generar un código de invitado único')
}

/** Canjea un código: devuelve el club la primera vez; 404 `guest_code_invalid` si no existe, 409 `guest_code_used` si ya se usó. */
export async function redeemGuestCode(input: GuestCodeRedeemInput): Promise<GuestAccess> {
  const code = normalizeInviteCode(input.code)
  if (code.length !== GUEST_CODE_LENGTH) {
    await delayFailure()
    throw notFound('Ese código no es válido')
  }

  const { data, error } = await db().rpc('redeem_guest_code', { p_code: code })
  if (error) {
    switch (sqlCode(error)) {
      case 'guest_code_invalid':
        await delayFailure()
        throw new HttpError(404, 'guest_code_invalid', 'Ese código no es válido. Revisa que esté bien escrito o pide uno nuevo.')
      case 'guest_code_used':
        throw new HttpError(409, 'guest_code_used', 'Ese código ya se usó. Pide uno nuevo a quien te invitó.')
      default:
        throw error
    }
  }
  const access = data[0]
  if (!access) throw new Error('redeem_guest_code no devolvió el club')
  return { slug: access.slug, name: access.name }
}
