# Deploy en Easypanel

Guía paso a paso para desplegar `codexy-roadmap` en Easypanel con auto-deploy desde GitHub.

## 1. Preparar el repositorio

En tu máquina local:

```bash
cd codexy-roadmap
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:lucasspuig/codexy-roadmap.git
git push -u origin main
```

## 2. Conectar GitHub a Easypanel (una sola vez)

1. Entrá a Easypanel → avatar (top-right) → **Settings** → **GitHub**
2. Clic **Install GitHub App** → autorizá acceso **solo al repo** `codexy-roadmap`
3. Volvés a Easypanel, ya debería aparecer conectado

## 3. Conseguir las keys de Supabase

Entrá a https://supabase.com/dashboard/project/zvsqcbeupeyjtgdguwoc/settings/api y copiá:

- **Project URL** — `https://zvsqcbeupeyjtgdguwoc.supabase.co`
- **anon / public key** (seguro en cliente)
- **service_role / secret key** — **NO** exponer al cliente

Guardá los valores, los vas a pegar en Easypanel en el paso 5.

## 4. Crear la app en Easypanel

1. Abrí el project **`ventas-codexy`**
2. Clic en **`+ Service`** → **App**
3. Name: `roadmap`
4. Pestaña **Fuente** → **Github**:
   | Campo | Valor |
   |---|---|
   | Propietario | `lucasspuig` |
   | Repositorio | `codexy-roadmap` |
   | Rama | `main` |
   | Ruta de construcción | `/` |
5. **Salvar**

## 5. Configurar variables de entorno

Pestaña **Environment**:

```
NEXT_PUBLIC_SUPABASE_URL=https://zvsqcbeupeyjtgdguwoc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key de Supabase>
SUPABASE_SERVICE_ROLE_KEY=<service role de Supabase>
NEXT_PUBLIC_APP_URL=https://<dominio-que-elijas>
ROADMAP_TOKEN_SECRET=<random 48 chars>
NODE_ENV=production
```

### Generar `ROADMAP_TOKEN_SECRET`
```bash
openssl rand -base64 48
```

## 6. Dominio

Pestaña **Domains** → **`+ Add Domain`**:

- Si tenés `codexy.com` apuntado al VPS: `roadmap.codexy.com`
- Si no: usá el dominio temporal que te da Easypanel

**SSL**: Let's Encrypt automático (marcá la casilla).

Actualizá `NEXT_PUBLIC_APP_URL` con la URL final.

## 7. Build settings

Pestaña **Build**:

- **Build method**: `Dockerfile` (debería estar auto-detectado)
- **Port**: `3000`
- **Build args** (opcional, para inlinear vars públicas en el build):
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://zvsqcbeupeyjtgdguwoc.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
  NEXT_PUBLIC_APP_URL=https://<dominio>
  ```

## 8. Deploy inicial

Clic **Deploy**. Primer build tarda ~3-5 min (instala deps, compila, crea imagen).

Los siguientes deploys se disparan solos con cada `git push origin main` y tardan ~1-2 min.

## 9. Crear el primer admin

Como todavía no hay usuarios en `auth.users` con un `profiles` activo para esta app, tenés 2 opciones:

### Opción A: Reutilizar tu cuenta del CRM `ventas-codexy`
Si ya tenés un admin en `profiles` con `role='admin'` y `activo=true`, **usá esa misma cuenta** (email+password) en `/login`. Ya funciona.

### Opción B: Crear usuario nuevo
1. En Supabase Dashboard → **Authentication** → **Users** → **Add user** → email + contraseña
2. En **SQL Editor**, insertá el profile:
   ```sql
   INSERT INTO public.profiles (id, email, nombre, role, activo)
   VALUES (
     '<id-del-usuario-recién-creado>',
     'vos@codexy.com',
     'Tu Nombre',
     'admin',
     true
   );
   ```
3. Iniciá sesión en `/login`

## 10. Verificación

- [ ] `https://<dominio>/login` carga la pantalla de login
- [ ] Con credenciales válidas, redirige a `/dashboard`
- [ ] Dashboard lista los clientes de la tabla `clientes` (tipo='cliente')
- [ ] "Nuevo roadmap" crea un proyecto y redirige al editor
- [ ] Editor de fases funciona (toggle estados, add/delete items)
- [ ] Copiar link público → abre en ventana privada → se ve el roadmap del cliente
- [ ] Cambiar estado de una fase → el cliente lo ve dentro de 8s

## Troubleshooting

**Build falla por memoria**: agregá `--max-old-space-size=4096` a node o usá un VPS con 2GB+.

**Logs**: Pestaña **Logs** de la app en Easypanel, tiempo real.

**Restart**: Pestaña **Deployments** → botón Restart.

**Rollback**: pestaña **Deployments** → clic en una versión anterior → Redeploy.
