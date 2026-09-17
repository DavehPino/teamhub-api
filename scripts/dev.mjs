// `vercel dev` solo lee `.env` (o las variables del proyecto en Vercel): se cargan antes las de
// `.env.local` en el entorno del proceso para que las funciones de /api las reciban.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const child = spawn('vercel', ['dev', ...process.argv.slice(2)], { stdio: 'inherit', shell: true })
child.on('exit', (code) => process.exit(code ?? 0))
