# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Shared base
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./

# ---------------------------------------------------------------------------
# Dependencies + generated Prisma client
# ---------------------------------------------------------------------------
FROM base AS deps
RUN npm ci --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate

# ---------------------------------------------------------------------------
# Development (hot reload via tsx watch; source is bind-mounted by compose)
# ---------------------------------------------------------------------------
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 4000
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# Build + migration/seed target (has dev dependencies, used by compose `migrate`)
# ---------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM build AS migrate
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx prisma/seed.ts"]

# ---------------------------------------------------------------------------
# Production runtime (no dev dependencies, non-root)
# ---------------------------------------------------------------------------
FROM base AS prod
ENV NODE_ENV=production
RUN npm ci --omit=dev --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
