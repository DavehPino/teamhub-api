// El plan Hobby de Vercel rechaza el deploy si hay más de 12 Serverless Functions.
// Cada archivo de `api/` es una función, salvo los que empiezan por `_` o `.` (o están dentro de una carpeta así).
// Para añadir un endpoint sin sumar funciones, agrégalo a un archivo que ya agrupe rutas (p.ej. `api/admin/[action].ts`).
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const LIMIT = 12
const EXTENSIONS = /\.[cm]?[jt]sx?$/

function listFunctions(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listFunctions(path)
    return EXTENSIONS.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : []
  })
}

const functions = listFunctions('api')
if (functions.length > LIMIT) {
  console.error(`✖ ${functions.length} Vercel Functions en api/ (el plan Hobby admite ${LIMIT}):`)
  for (const fn of functions) console.error(`  - ${fn}`)
  console.error('Agrupa rutas en un archivo existente con un segmento dinámico en vez de crear otro (README → Límite de 12 funciones).')
  process.exit(1)
}
console.log(`✔ ${functions.length}/${LIMIT} Vercel Functions`)
