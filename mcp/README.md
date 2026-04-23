# Codexy Roadmap MCP Server

Expone tu DB de roadmaps a Claude via MCP. Decile a Claude cosas como:

> "Marcá la fase 2 del cliente Laura Delgado como completada y agregale un ítem 'Despliegue en staging' a la fase 3"

Y Claude ejecuta las tools contra tu Supabase. Todo queda auditado en `roadmap_eventos`.

## Tools expuestas

| Tool | Qué hace |
|---|---|
| `list_clientes` | Lista clientes (con filtros) |
| `get_roadmap` | Trae proyecto + fases + items por nombre de cliente |
| `create_roadmap` | Crea roadmap desde plantilla |
| `add_fase` | Nueva fase (con items opcionales) |
| `update_fase` | Edita título/desc/estado |
| `mark_fase_done` | Marca fase completada (por orden) |
| `mark_fase_active` | Marca fase en curso |
| `add_item` | Agrega tarea a fase |
| `toggle_item` | Tilda/destilda item |
| `update_cliente` | Edita datos del cliente |
| `regenerate_public_link` | Rota el token público |
| `get_public_url` | Devuelve URL lista para compartir |

## Deploy en Easypanel

1. En el project `Ventas-Codexy` → **+ Servicio** → **App**
2. Name: `roadmap-mcp`
3. Fuente: GitHub → `lucasspuig/codexy-roadmap` → rama `main` → **ruta de construcción: `/mcp`**
4. Construcción: **Dockerfile**
5. Environment (pegá con tus valores):
   ```
   SUPABASE_URL=https://zvsqcbeupeyjtgdguwoc.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<del dashboard de Supabase>
   PUBLIC_APP_URL=https://plan.codexyoficial.com
   MCP_AUTH_TOKEN=<openssl rand -base64 48>
   PORT=3100
   ```
6. Puerto contenedor: `3100`
7. Dominio: `mcp.codexyoficial.com` (crear registro A igual que plan)
8. Deploy

Healthcheck: `GET https://mcp.codexyoficial.com/health` → `{"ok":true,...}`

## Conectar Claude Desktop

Editá `claude_desktop_config.json`:

**Mac/Linux:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Agregá:

```json
{
  "mcpServers": {
    "codexy-roadmap": {
      "transport": {
        "type": "http",
        "url": "https://mcp.codexyoficial.com/mcp",
        "headers": {
          "Authorization": "Bearer TU_MCP_AUTH_TOKEN"
        }
      }
    }
  }
}
```

Reiniciá Claude Desktop. Deberías ver "codexy-roadmap" en la lista de herramientas 🔧.

## Conectar Claude Code / API

```bash
claude mcp add --transport http codexy-roadmap \
  https://mcp.codexyoficial.com/mcp \
  --header "Authorization: Bearer TU_MCP_AUTH_TOKEN"
```

## Seguridad

- `service_role` nunca sale del server (solo el MCP lo usa)
- `MCP_AUTH_TOKEN` protege el endpoint — sin header correcto, 401
- Todo lo que hace Claude queda loggeado en `roadmap_eventos` con `actor_nombre='Claude (MCP)'`
- El server es stateless: podés escalarlo horizontal sin problemas

## Development local

```bash
cd mcp
cp .env.example .env.local
# completá .env.local con los valores reales
npm install
npm run dev
# Listening on :3100
```

Test health:
```bash
curl http://localhost:3100/health
```

Test tool list (con auth):
```bash
curl -X POST http://localhost:3100/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
