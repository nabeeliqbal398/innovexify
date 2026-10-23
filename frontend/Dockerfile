# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM deps AS build
# Next reads the /api rewrite when it BUILDS, so the API address has to be known here (inside compose it is http://api:4000).
ARG API_ORIGIN=http://api:4000
ENV API_ORIGIN=$API_ORIGIN
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build && npm prune --omit=dev --legacy-peer-deps

FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/package.json /app/next.config.mjs ./
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
