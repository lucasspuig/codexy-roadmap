# Codexy Roadmap MCP Server — multi-stage build
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev=false

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 mcp

COPY --from=builder --chown=mcp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=mcp:nodejs /app/dist ./dist
COPY --from=builder --chown=mcp:nodejs /app/package.json ./

USER mcp
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O- http://localhost:3100/health || exit 1

CMD ["node", "dist/server.js"]
