// Protección con palabras clave compartidas. No es un sistema de usuarios: evita que cualquiera con la URL del
// dashboard cree datos o gaste recursos. Hay dos, independientes, para poder dar acceso a una parte y no a la otra:
// - ADMIN_SAFEWORD (cabecera x-admin-safeword): actividades, partidos y videos.
// - FLYERS_SAFEWORD (cabecera x-flyers-safeword): imágenes y flyers del bucket y el asistente de IA.
import { createHash, timingSafeEqual } from 'node:crypto'
import { ADMIN_SAFEWORD_HEADER, FLYERS_SAFEWORD_HEADER } from '../../shared/domain.js'
import { env } from './env.js'
import { HttpError, unauthorized } from './http.js'

/** Pausa ante un intento fallido: encarece probar palabras a ciegas. */
const FAILURE_DELAY_MS = 700

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest()

function safewordFrom(request: Request, header: string): string {
  const raw = request.headers.get(header) ?? ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return ''
  }
}

type Scope = { header: string; expected: string | undefined; disabled: string }

/** Lanza 401 si la cabecera no trae la palabra clave correcta (comparación en tiempo constante). */
async function requireSafeword(request: Request, { header, expected, disabled }: Scope): Promise<void> {
  if (!expected) throw new HttpError(503, 'admin_disabled', disabled)
  const given = safewordFrom(request, header)
  if (given && timingSafeEqual(digest(given), digest(expected))) return

  await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS))
  throw unauthorized('Palabra clave incorrecta')
}

export function requireAdmin(request: Request): Promise<void> {
  return requireSafeword(request, {
    header: ADMIN_SAFEWORD_HEADER,
    expected: env.adminSafeword,
    disabled: 'La carga de datos no está configurada en el servidor (falta ADMIN_SAFEWORD).',
  })
}

export function requireFlyersAccess(request: Request): Promise<void> {
  return requireSafeword(request, {
    header: FLYERS_SAFEWORD_HEADER,
    expected: env.flyersSafeword,
    disabled: 'La sección de flyers no está configurada en el servidor (falta FLYERS_SAFEWORD).',
  })
}
