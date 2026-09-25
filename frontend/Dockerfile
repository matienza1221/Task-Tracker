# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Shared base + dependencies
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

FROM base AS deps
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# Development (Vite dev server; source is bind-mounted by compose)
# ---------------------------------------------------------------------------
FROM deps AS dev
ENV HOST=0.0.0.0
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---------------------------------------------------------------------------
# Production build
# ---------------------------------------------------------------------------
FROM deps AS build
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Production runtime: nginx serves the SPA and terminates TLS
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS prod
RUN apk add --no-cache curl
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
