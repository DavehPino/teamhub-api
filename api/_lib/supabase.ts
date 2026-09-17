// Cliente de Supabase SOLO para servidor (clave secreta, ignora RLS).
// Los tipos se regeneran con `npm run db:types` tras cada migración.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/database.types.js'
import { env } from './env.js'

export type Db = SupabaseClient<Database>
export type Tables = Database['public']['Tables']

let client: Db | undefined

export function db(): Db {
  client ??= createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return client
}
