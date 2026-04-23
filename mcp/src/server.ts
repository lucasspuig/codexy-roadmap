import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";

import { toolDefs, handlers } from "./tools.js";

const PORT = Number(process.env.PORT ?? 3100);
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

if (!AUTH_TOKEN) {
  console.error("⚠ MCP_AUTH_TOKEN no configurado — el server no requerirá auth.");
}

// ─── MCP Server ───
const server = new McpServer(
  { name: "codexy-roadmap", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

for (const def of toolDefs) {
  server.registerTool(
    def.name,
    {
      description: def.description,
      inputSchema: def.inputSchema.shape ?? {},
    },
    async (args: unknown) => {
      const handler = handlers[def.name];
      if (!handler) {
        return {
          content: [
            { type: "text" as const, text: `Tool no implementada: ${def.name}` },
          ],
          isError: true,
        };
      }
      try {
        return await handler(args);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            { type: "text" as const, text: `Error ejecutando ${def.name}: ${msg}` },
          ],
          isError: true,
        };
      }
    },
  );
}

// ─── HTTP transport ───
const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "codexy-roadmap-mcp", version: "0.1.0" });
});

// Auth middleware: chequea header Authorization: Bearer <MCP_AUTH_TOKEN>
function authCheck(req: express.Request, res: express.Response): boolean {
  if (!AUTH_TOKEN) return true; // sin auth configurada, permitido (solo dev)
  const h = req.header("authorization") ?? "";
  if (h !== `Bearer ${AUTH_TOKEN}`) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

// Map sessionId → transport (para permitir conexiones múltiples / stateful)
const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  if (!authCheck(req, res)) return;

  const sessionId = (req.header("mcp-session-id") ?? "") as string;
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    const newId = randomUUID();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newId,
      onsessioninitialized: (id) => {
        transports.set(id, transport!);
      },
    });
    transport.onclose = () => {
      if (transport!.sessionId) transports.delete(transport!.sessionId);
    };
    await server.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  if (!authCheck(req, res)) return;
  const sessionId = (req.header("mcp-session-id") ?? "") as string;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(400).json({ error: "invalid_session" });
    return;
  }
  await transport.handleRequest(req, res);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[codexy-mcp] listo en :${PORT} · tools: ${toolDefs.length} · auth: ${AUTH_TOKEN ? "on" : "OFF (dev)"}`,
  );
});
