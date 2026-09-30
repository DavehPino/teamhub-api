# teamhub-api

API de gestión de un equipo deportivo: actividades, partidos con sus videos, plantel, formaciones, flyers con IA y
sincronización de resultados con CourtTrack. Cada deploy sirve a un equipo (una base de datos y un bucket).

Stack:

- **Runtime:** Vercel Functions en TypeScript (`api/`, handlers `Request → Response`)
- **Base de datos:** Supabase Postgres (el esquema vive en `supabase/migrations/`)
- **Videos e imágenes:** bucket compatible con S3 (Cloudflare R2 recomendado)
- **Resultados:** microservicio [courtrack-service](https://github.com/DavehPino/courtrack-service)

Cliente actual: [coyotes-website](https://github.com/DavehPino/coyotes-website), que llama a `/api/*` en su propio
dominio y Vercel reescribe esas rutas a este proyecto. Este repo nació de la carpeta `api/` de ese proyecto.

## Puesta en marcha

### 1. Dependencias

```bash
npm install
npm i -g vercel        # CLI de Vercel para `vercel dev` y deploy
```

### 2. Supabase

1. Crea un proyecto en <https://supabase.com/dashboard> (o usa uno existente).
2. Aplica las migraciones **en orden**:
   - SQL Editor: ejecuta cada archivo de `supabase/migrations/` por orden de nombre y después `supabase/seed.sql`
     (datos de ejemplo).
   - CLI: `npx supabase login`, `npx supabase link --project-ref <ref>` y `npx supabase db push`.
3. En Project Settings → API Keys, copia la URL y la **secret key** en `SUPABASE_URL` y `SUPABASE_SECRET_KEY`.
4. Crea el equipo propio en `teams` con `is_own_team = true`: su nombre es el que usan el asistente de flyers y
   la validación de ligas de CourtTrack.

> El plan Free pausa el proyecto tras 7 días sin actividad. El cron diario `sync-videos` de `vercel.json` lo evita.

### 3. Bucket (Cloudflare R2)

1. En Cloudflare → R2, crea el bucket y un API token con permiso **Object Read & Write** sobre él
   (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`). Usa `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   y `S3_REGION=auto`. Para AWS S3, deja `S3_ENDPOINT` vacío y pon la región real.
2. El navegador del dashboard sube videos, imágenes y flyers directo al bucket con URLs firmadas: la regla CORS
   del bucket (`GET` y `PUT`, exponiendo `ETag`) debe incluir los orígenes del dashboard. Ver el README del cliente.
3. Deja `STORAGE_PUBLIC_BASE_URL` vacío para URLs firmadas temporales (bucket privado) o pon el dominio público.

### 4. Variables de entorno

```bash
cp .env.example .env.local   # y rellena los valores
```

Carga las mismas variables en Vercel → Settings → Environment Variables. Obligatorias: `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY`. `TEAM_PROFILE` describe al equipo
(deporte, ciudad, colores, tono) para el asistente de flyers. `DEFAULT_ORG_SLUG` (por defecto `coyotes`) es la
organización que atiende las peticiones sin cabecera `x-org-slug`.

### Multi-tenant

Cada petición pertenece a una organización (tabla `organizations`). La app móvil envía su slug en `x-org-slug`; la web de
Coyotes no envía nada y usa la organización por defecto. Las lecturas son públicas (invitados). Las escrituras exigen
ser miembro de la organización (`org_members`) con `Authorization: Bearer <jwt de Supabase Auth>`; las palabras clave
compartidas (`x-admin-safeword`, `x-flyers-safeword`) solo abren la organización por defecto. En el bucket, la
organización por defecto conserva sus rutas y las demás viven bajo `orgs/<slug>/`.

### Onboarding de clubes y miembros (app móvil)

La app registra a la persona con Supabase Auth (email y contraseña) y usa su `access_token` como `Authorization: Bearer`.
Flujo mínimo:

1. **Crear un club** — `POST /api/me/org-create { name, theme? }` (`theme`: `primary`, `accent`, `accent_2` en `#rrggbb` y `logo_url` https, todos opcionales). Solo cuentas con permiso de creador (hoy lo concede el dueño del
   servicio con `npm run org-admin -- grant-creator <email> [max_orgs]`; después lo escribirá la pasarela de pago en la tabla
   `org_creators`). Sin permiso responde **402 `plan_required`** (la app muestra el muro de pago); con el tope alcanzado,
   409 `org_limit_reached`. El slug sale del nombre; la persona queda como administrador y se crea su equipo propio.
2. **Invitar** — `POST /api/admin/invite-create { role?, max_uses? }` (cabecera `x-org-slug`) → `{ code: "K7QM-X2PA", … }`.
   El código **no caduca**, sirve `max_uses` veces (sin límite si se omite) y se puede revocar con `invite-revoke`.
3. **Unirse** — `POST /api/me/invite-accept { code }` → `{ slug, name, role, already_member }`. Si ya es miembro no gasta un uso.
4. **Mis clubes** — `GET /api/me/orgs` → `{ orgs: [{ slug, name, role }], can_create_org }`. La app guarda el `slug` del club
   activo y lo envía en `x-org-slug` en todas las peticiones.
5. **Invitados** sin cuenta: basta el slug. `GET /api/lookups/org` devuelve el nombre y el tema; el resto de lecturas son públicas.

| Endpoint | Quién | Qué hace |
|---|---|---|
| `GET /api/me/orgs` · `POST /api/me/org-create` · `invite-accept` · `org-leave` | Cualquier cuenta con sesión | Ver mis clubes, crear uno, unirse con código, salir (409 `last_admin` si es el único administrador) |
| `POST /api/admin/members` · `member-role` · `member-remove` | Administrador del club con sesión | Listar miembros, cambiar su rol (`admin`/`coach`), quitarlos. Un club nunca se queda sin administrador |
| `POST /api/admin/invites` · `invite-create` · `invite-revoke` | Administrador del club con sesión | Listar, crear y revocar códigos |
| Resto de `POST /api/admin/*` y `/api/flyers/*` | Administrador o entrenador (`coach`) | Cargar datos deportivos |

Las safewords compartidas (web de Coyotes) **no** sirven para gestionar miembros. Para nombrar al primer administrador de un
club que aún no tiene ninguno (p. ej. Coyotes): `npm run org-admin -- add-member coyotes <email> admin`. `npm run org-admin -- list`
muestra clubes, miembros y quién puede crear clubes. Borrar un club: `select delete_organization('<uuid>', '<slug>')` (no borra
sus archivos del bucket ni las cuentas).

### 5. Desarrollo

```bash
npm run dev          # vercel dev en http://localhost:3200 (requiere `vercel link`)
```

Para usarlo desde el front: `API_PROXY=http://localhost:3200 npm run dev` en coyotes-website. courtrack-service
corre en el puerto 3100 (`COURTRACK_SYNC_URL=http://localhost:3100`).

### 6. Deploy

Proyecto de Vercel propio (`framework: null`, salida `public/`). El cliente reescribe `/api/:path*` a
`https://<dominio-teamhub-api>/api/:path*` desde su `vercel.json`, así que no hace falta CORS.

### Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | `vercel dev` en el puerto 3200 con las variables de `.env.local` |
| `npm run build` | Comprueba el límite de funciones y hace el typecheck (lo usa Vercel) |
| `npm run typecheck` | Solo TypeScript |
| `npm run check:functions` | Comprueba que `api/` no supere las 12 Vercel Functions del plan Hobby |
| `npm run db:types` | Genera los tipos de Supabase (`shared/database.types.ts`) tras cada migración |

### Contratos compartidos

`shared/` (esquemas zod, tipos de la base de datos y constantes de dominio) es la fuente de los contratos. El
cliente mantiene una copia en su propia carpeta `shared/`: tras cambiar un contrato o regenerar los tipos, copia los
archivos al cliente.

## Cómo editar datos a mano

Cancelar actividades, los resúmenes y las portadas todavía se hace en **Supabase → Table Editor**
(o con SQL). `supabase/seed.sql` es un ejemplo completo y se puede ejecutar varias veces sin duplicar filas:
`npx supabase db query --linked -f supabase/seed.sql`.

1. **Equipos** (`teams`): un registro con `is_own_team = true` (el equipo de este deploy) y uno por rival. `short_name` (3 letras)
   se usa como escudo cuando no hay `logo_url`.
2. **Actividades** (`weekly_activities`): una fila por actividad con `activity_date` (día), `start_time`/`end_time`
   (hora local, opcionales), `activity_type` (`entrenamiento`, `partido`, `amistoso`, `torneo`, `fisico`,
   `video_analisis`, `reunion`, `otro`), `location`, `description`, `opponent_team_id` (rival, opcional) e
   `is_cancelled`. Las canceladas y las que ya empezaron no se muestran.
3. **Partidos** (`matches`): `slug` único en kebab-case (p.ej. `2026-09-06-vs-onas`; es la URL
   la ruta del partido en el dashboard y la carpeta del bucket), `played_on`, `start_time`, `opponent_team_id`, `is_home`,
   `location`, `competition_id` (fila de `competitions`), `phase`, `sets_won`, `sets_lost` y `set_scores` con los parciales:
   `[{"us":25,"them":20},{"us":22,"them":25}]`. `summary` admite saltos de línea y `cover_image_url` es la portada
   del carrusel (sin ella se muestran los escudos). Solo aparecen los partidos con `played_on <= hoy`.
4. **Videos** (`videos`): los del bucket los crea el cron (abajo). Para enlaces externos crea una fila con
   `source = 'external'`, `url` (YouTube se incrusta; el resto abre en pestaña nueva), `match_id`, `set_number`
   (opcional) y `status = 'ready'`. Los videos con `status = 'archived'` no se muestran.

### Convención del bucket de videos

El formulario de alta sube los videos a esta ruta. También se pueden subir por fuera (consola de R2, rclone,
Cyberduck…) siguiendo la misma convención:

```
<S3_VIDEO_PREFIX>games/<slug-del-partido>/<archivo>.mp4   → se vincula al partido con ese slug
<S3_VIDEO_PREFIX><cualquier-otra-ruta>.mp4               → queda sin partido (status "pending")

games/2026-09-06-vs-onas/set-1.mp4      → partido 2026-09-06-vs-onas, "Set 1"
games/2026-09-06-vs-onas/resumen.mp4    → mismo partido, sin set
```

Si el archivo empieza por `set-N` se rellena `set_number`. El cron `GET /api/cron/sync-videos` se ejecuta a diario
desde Vercel y es idempotente: crea filas nuevas, refresca tamaño y URL de las existentes, vincula las que aún no tienen
partido y **nunca** pisa el título, la categoría o el set editados a mano. Los archivos borrados del bucket solo se
cuentan (`missing_in_bucket`); las filas se borran a mano. Para lanzarlo al momento:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio-teamhub-api>/api/cron/sync-videos
# → {"scanned":3,"created":3,"updated":0,"linked_to_match":3,"missing_in_bucket":0}
```

Después del sync, cambia el título y el set de cada video desde **Editar partido → Videos** (o `sort_order` en el Table
Editor).

## API

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/lookups/teams` | Rivales por nombre (sin caché) |
| GET | `/api/lookups/competitions` | Competiciones con su número de partidos y sus temporadas de CourtTrack (sin caché) |
| GET | `/api/lookups/players` | Plantel: activos primero, por número y nombre (sin caché) |
| GET | `/api/lookups/lineups` | Formaciones con sus jugadores en cancha (`slots` con `x`/`y` de 0 a 1), la editada más recientemente primero (sin caché) |
| GET | `/api/activities?from=YYYY-MM-DD&limit=30` | Próximas actividades no canceladas, de la más cercana a la más lejana, con el rival embebido |
| GET | `/api/matches?until=YYYY-MM-DD&limit=50&competition_id=&courtrack_league_id=` | Partidos jugados hasta la fecha, del más reciente al más antiguo; opcionalmente de una competición y de una temporada |
| GET | `/api/matches/:slug` | Detalle con parciales, videos ordenados y `courtrack_id` (404 si no existe) |
| GET | `/api/matches/:slug?view=stats` | `MatchStats` desde CourtTrack: por set, progresión punto a punto, tiempos, cambios, acciones de cada equipo y formación inicial propia; totales y estadísticas de cada jugador propio; MVP y duración real. Visto desde el equipo propio (`us`/`them`). 404 `no_stats` si el partido no vino del sync, 503 si el microservicio no está configurado. Caché de una hora |
| GET | `/api/videos/:id/playback` | URL de reproducción (pública o firmada temporal) |
| GET | `/api/cron/sync-videos` | Sincroniza el bucket; requiere `Authorization: Bearer <CRON_SECRET>` |

Escritura: todas requieren la cabecera `x-admin-safeword` con `ADMIN_SAFEWORD` codificada con `encodeURIComponent`.

| Método | Ruta | Respuesta |
|---|---|---|
| POST | `/api/admin/verify` | `{ ok: true }` o 401 |
| POST | `/api/admin/activities` | 201 Activity: crea la actividad y, si se pide, el rival (409 si el nombre ya existe) |
| POST | `/api/admin/activity-update` | Activity: edita la actividad `id` con los campos del alta |
| POST | `/api/admin/activity-delete` | `{ ok: true }`: borra la actividad |
| POST | `/api/admin/matches` | 201 `{ id, slug, opponent }`: crea el partido y, si se pide, el rival (409 si el nombre ya existe) |
| POST | `/api/admin/match-update` | `{ id, slug, opponent }`: edita el partido `id` con los campos del alta; el slug no cambia |
| POST | `/api/admin/match-delete` | `{ ok: true }`: borra el partido, sus videos y sus archivos del bucket |
| POST | `/api/admin/courtrack-status` | `CourtrackSyncStatus`: cupo, temporadas configuradas (abiertas y finalizadas) con su último sync y últimas ejecuciones (proxy a courtrack-service; 503 sin configurar) |
| POST | `/api/admin/courtrack-sync` | `{ league_id?, dry_run? }`: con `league_id`, `CourtrackSyncResult` de esa temporada; sin él, `CourtrackSyncAllResult` de todas las ligas activas (un cupo). 429 `quota_exceeded` si se agotó el cupo |
| POST | `/api/admin/courtrack-catalog` | Catálogo de CourtTrack: `{ resource: 'clientes' }`, `{ resource: 'ligas', id_cliente }`, `{ resource: 'equipos', id_cliente, liga_id }` o `{ resource: 'descubrir', id_cliente }` (ligas donde juega el equipo propio) |
| POST | `/api/admin/leagues` | `CourtrackLeague[]`: temporadas configuradas |
| POST | `/api/admin/league-create` | 201 `CourtrackLeague`: alta de una liga (`{ id_cliente, cliente_name, liga_id, team_name, competition }`; 409 si ya tiene temporada abierta) |
| POST | `/api/admin/league-update` | `CourtrackLeague`: cambia `team_name` (400 si la temporada ya finalizó) |
| POST | `/api/admin/league-delete` | `{ ok: true }`: quita la temporada; partidos y competición se conservan |
| POST | `/api/admin/league-snapshot` | `CourtrackLeagueSnapshot`: clasificación y fixture guardados en el último sync de la temporada |
| POST | `/api/admin/team-link-create` | `{ ok: true }`: vincula un nombre de CourtTrack a un rival (`{ courtrack_name, team_id }`) |
| POST | `/api/admin/player-create` | 201 Player: `{ name, jersey_number?, primary_position, secondary_position? }` (409 si el número ya lo usa un activo) |
| POST | `/api/admin/player-update` | Player: los campos del alta más `id` e `is_active` |
| POST | `/api/admin/player-delete` | `{ ok: true }`: borra el jugador y lo quita de todas las formaciones |
| POST | `/api/admin/lineup-save` | Lineup: sin `id` crea la formación; con `id` reemplaza nombre, notas y todos sus `slots` (máx. 7: 6 titulares y 1 líbero, jugadores activos; 409 si el nombre ya existe) |
| POST | `/api/admin/lineup-delete` | `{ ok: true }`: borra la formación |
| POST | `/api/admin/video-update` | Video: cambia `title` y `set_number` |
| POST | `/api/admin/video-delete` | `{ ok: true }`: borra el archivo del bucket y la fila del video |
| POST | `/api/admin/uploads/start` | Crea la subida multiparte y devuelve una URL firmada por trozo (6 h de validez) |
| POST | `/api/admin/uploads/complete` | 201 Video: cierra la subida y registra el video en el partido |
| POST | `/api/admin/uploads/abort` | Descarta los trozos de una subida cancelada o fallida |

Flyers: `GET /api/flyers/library` es libre; los `POST` requieren la cabecera `x-flyers-safeword` con `FLYERS_SAFEWORD`
codificada con `encodeURIComponent` (la de admin no sirve aquí, ni al revés).

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/flyers/library` | `{ images, flyers }` del bucket con sus URLs de lectura |
| POST | `/api/flyers/verify` | `{ ok: true }` o 401 |
| POST | `/api/flyers/suggest` | `{ flyer, message, model }`: la IA reescribe el flyer (`{ prompt, flyer, today, assets: [{ id, name }] }`); 503 sin `OPENROUTER_API_KEY` |
| POST | `/api/flyers/upload-url` | `{ id, url, headers }`: URL firmada para subir una imagen (`kind: "image"`, WebP o PNG) o el PNG de un flyer (`kind: "flyer"`) |
| POST | `/api/flyers/image-save` | 201 imagen: registra la imagen subida con `{ id, contentType, name }` (409 si ya hay 20) |
| POST | `/api/flyers/image-rename` | Imagen con el nuevo `name` |
| POST | `/api/flyers/image-delete` | `{ ok: true }`: borra la imagen y su JSON |
| POST | `/api/flyers/flyer-save` | 201 flyer: registra el PNG subido con `{ id, source, label, flyer }` (409 si ya hay 50) |
| POST | `/api/flyers/flyer-delete` | `{ ok: true }`: borra el PNG y su JSON |

Los contratos viven en `shared/schemas.ts`; el acceso a datos está centralizado en `api/_lib/` para poder añadir
autenticación más adelante sin rehacer rutas.

### Límite de 12 funciones (plan Hobby de Vercel)

Vercel crea una Serverless Function por **cada archivo** de `api/` (salvo los que empiezan por `_`, como `api/_lib/`)
y el plan Hobby rechaza el deploy con más de 12:
`No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan`.

Por eso las rutas de escritura se agrupan en archivos con un segmento dinámico y una tabla de handlers (`routeFor`
en `api/_lib/http.ts` responde 404 a lo que no esté en la tabla):

| Archivo | Rutas |
|---|---|
| `api/lookups/[resource].ts` | `GET /api/lookups/teams`, `/competitions`, `/players`, `/lineups` |
| `api/admin/[action].ts` | `/api/admin/verify`, `/activities`, `/activity-update`, `/activity-delete`, `/matches`, `/match-update`, `/match-delete`, `/video-update`, `/video-delete`, `/courtrack-status`, `/courtrack-sync`, `/courtrack-catalog`, `/leagues`, `/league-create`, `/league-update`, `/league-delete`, `/league-snapshot`, `/team-link-create`, `/player-create`, `/player-update`, `/player-delete`, `/lineup-save`, `/lineup-delete` |
| `api/admin/uploads/[step].ts` | `/api/admin/uploads/start`, `/complete`, `/abort` |
| `api/flyers/[action].ts` | `GET /api/flyers/library`; `POST /api/flyers/verify`, `/suggest`, `/upload-url`, `/image-save`, `/image-rename`, `/image-delete`, `/flyer-save`, `/flyer-delete` |

Al añadir un endpoint:

- **No crees un archivo nuevo** si puede ir en uno existente: una escritura de admin es una entrada más en
  `api/admin/[action].ts`; una lectura nueva puede agruparse igual (p.ej. `api/[resource].ts`).
- La lógica va en `api/_lib/`, que no cuenta como función.
- `npm run build` (y por tanto el deploy) empieza con `npm run check:functions`, que falla si `api/` supera las 12
  funciones y lista cuáles son.
