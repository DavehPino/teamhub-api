// Administración de la plataforma desde la terminal (usa la clave de servicio de .env.local). Es lo que hace hoy "a mano" lo que
// más adelante hará la pasarela de pago.
//   npm run org-admin -- grant-creator <email> [max_orgs=1] [nota]   concede permiso para crear clubes (la cuenta ya debe existir)
//   npm run org-admin -- revoke-creator <email>                      quita el permiso (no borra los clubes ya creados)
//   npm run org-admin -- add-member <slug> <email> [admin|coach]     añade a una cuenta a un club (por defecto admin); p. ej. el
//                                                                    primer administrador de Coyotes
//   npm run org-admin -- list                                        clubes, sus miembros y quién puede crear clubes
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('✖ Faltan SUPABASE_URL y SUPABASE_SECRET_KEY (.env.local).')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const [command, ...args] = process.argv.slice(2)

async function findUser(email) {
  const wanted = email.trim().toLowerCase()
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === wanted)
    if (user) return user
    if (data.users.length < 200) return null
  }
}

async function requireUser(email) {
  if (!email) fail('Falta el email de la cuenta.')
  const user = await findUser(email)
  if (!user) fail(`No existe ninguna cuenta con el email ${email}. Tiene que registrarse primero en la app.`)
  return user
}

function fail(message) {
  console.error(`✖ ${message}`)
  process.exit(1)
}

async function main() {
  switch (command) {
    case 'grant-creator': {
      const [email, maxOrgs = '1', ...note] = args
      const max = Number(maxOrgs)
      if (!Number.isInteger(max) || max < 1) fail('max_orgs debe ser un entero de 1 en adelante.')
      const user = await requireUser(email)
      const { error } = await db.from('org_creators').upsert({ user_id: user.id, max_orgs: max, note: note.join(' ') || null })
      if (error) throw error
      console.log(`✔ ${email} puede crear hasta ${max} club(es).`)
      return
    }
    case 'revoke-creator': {
      const user = await requireUser(args[0])
      const { error } = await db.from('org_creators').delete().eq('user_id', user.id)
      if (error) throw error
      console.log(`✔ ${args[0]} ya no puede crear clubes (los que creó siguen existiendo).`)
      return
    }
    case 'add-member': {
      const [slug, email, role = 'admin'] = args
      if (!slug) fail('Falta el slug del club.')
      if (!['admin', 'coach'].includes(role)) fail('El rol debe ser admin o coach.')
      const user = await requireUser(email)
      const { data: org, error: orgError } = await db.from('organizations').select('id').eq('slug', slug).maybeSingle()
      if (orgError) throw orgError
      if (!org) fail(`No existe el club "${slug}".`)
      const { error } = await db.from('org_members').upsert({ org_id: org.id, user_id: user.id, role })
      if (error) throw error
      console.log(`✔ ${email} es ${role} de ${slug}.`)
      return
    }
    case 'list': {
      const { data: orgs, error } = await db.from('organizations').select('id,slug,name,created_at').order('created_at')
      if (error) throw error
      for (const org of orgs) {
        const { data: members } = await db.from('org_members').select('user_id,role').eq('org_id', org.id)
        const names = await Promise.all((members ?? []).map(async (m) => `${(await db.auth.admin.getUserById(m.user_id)).data.user?.email ?? m.user_id} (${m.role})`))
        console.log(`${org.slug.padEnd(24)} ${org.name}\n    miembros: ${names.join(', ') || '— ninguno —'}`)
      }
      const { data: creators } = await db.from('org_creators').select('user_id,max_orgs,note')
      console.log('\nPueden crear clubes:')
      for (const c of creators ?? []) {
        const email = (await db.auth.admin.getUserById(c.user_id)).data.user?.email ?? c.user_id
        console.log(`  ${email}  (hasta ${c.max_orgs})${c.note ? `  — ${c.note}` : ''}`)
      }
      if (!creators?.length) console.log('  — nadie —')
      return
    }
    default:
      fail('Comando desconocido. Usa: grant-creator · revoke-creator · add-member · list (ver el encabezado del script).')
  }
}

main().catch((error) => {
  console.error('✖', error.message ?? error)
  process.exit(1)
})
