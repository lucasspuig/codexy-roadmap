# Codexy Roadmap

Panel de administración para gestionar los roadmaps de implementación de clientes Codexy. Incluye admin interno con login seguro y vista pública que los clientes ven en tiempo real (polling cada 8s).

## Stack

- **Next.js 16** (App Router, React 19, standalone output)
- **TypeScript**
- **Tailwind v4** (config en `src/app/globals.css` via `@theme`)
- **Supabase** (Auth + Postgres + RLS)
- **Docker** (multi-stage, imagen mínima para Easypanel)

## Rutas

| Ruta | Tipo | Acceso |
|---|---|---|
| `/login` | auth | público |
| `/dashboard` | admin | sesión Supabase + `profiles.activo=true` |
| `/proyectos/[id]` | admin | ídem |
| `/r/[token]` | cliente | solo token válido (64 chars hex) |
| `/api/public/[token]` | api | solo token válido, rate-limited |

## Estructura

```
src/
├── app/
│   ├── (admin)/          # rutas protegidas (dashboard, proyectos)
│   ├── api/public/       # endpoint JSON para vista cliente
│   ├── login/            # Supabase Auth email+password
│   ├── r/[token]/        # vista pública del roadmap
│   └── layout.tsx
├── components/
│   ├── admin/            # componentes exclusivos admin
│   ├── public/           # componentes exclusivos vista cliente
│   └── ui/               # botones, inputs, badges
├── lib/
│   ├── supabase/
│   │   ├── client.ts     # browser
│   │   ├── server.ts     # server components / actions
│   │   ├── admin.ts      # service-role (solo server)
│   │   └── middleware.ts
│   ├── token.ts          # generar tokens públicos 64-hex
│   └── utils.ts
├── middleware.ts         # redirige no-auth → /login
└── types/database.ts
```

## Variables de entorno

Copiar `.env.example` a `.env.local` para desarrollo. En producción (Easypanel) cargarlas desde la UI de Environment — **nunca** commitearlas.

| Variable | Scope | Secreta |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente+server | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente+server | no (respeta RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | solo server | **sí** — nunca exponer |
| `NEXT_PUBLIC_APP_URL` | cliente+server | no |
| `ROADMAP_TOKEN_SECRET` | solo server | **sí** |

## Desarrollo local

```bash
npm install
cp .env.example .env.local     # completar con tus valores
npm run dev
```

La app se levanta en http://localhost:3000.

## Base de datos

El schema vive en Supabase cloud. Tablas nuevas (con RLS):

- `roadmap_proyectos` — 1:1 con `clientes`
- `roadmap_fases` — N por proyecto
- `roadmap_items` — M por fase
- `roadmap_tokens_publicos` — acceso público por token
- `roadmap_eventos` — timeline visible al cliente (triggers auto-pueblan)
- `roadmap_plantillas` — templates reutilizables

RLS: solo `auth.users` con `profiles.activo=true` pueden escribir. La vista pública va vía `service_role` server-side, nunca expone la key al cliente.

## Deploy en Easypanel

Ver **[DEPLOY.md](./DEPLOY.md)** para el paso a paso. Resumen:

1. Crear app `roadmap` dentro del project `ventas-codexy`
2. Fuente: GitHub → `lucasspuig/codexy-roadmap` rama `main`
3. Dockerfile auto-detectado
4. Env vars (pegar en Environment)
5. Dominio → SSL auto

## Seguridad

- ✅ Supabase Auth (password hashing gestionado por Supabase)
- ✅ RLS en todas las tablas `roadmap_*`
- ✅ Service role nunca sale del server
- ✅ Tokens públicos = 32 bytes random (2^256 combinaciones)
- ✅ Middleware bloquea admin routes sin sesión
- ✅ Headers de seguridad (`X-Frame-Options: DENY`, `X-Content-Type-Options`, etc.)
- ✅ `robots: noindex, nofollow` en todas las rutas (incluyendo públicas)
- ✅ Sin XSS: todo el contenido se renderiza como texto React (escape automático)
- ✅ Rate limiting básico en `/api/public/[token]`

## Scripts

| Script | Hace |
|---|---|
| `npm run dev` | dev server (hot reload) |
| `npm run build` | build de producción |
| `npm start` | sirve el build (port 3000) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check sin emitir |
