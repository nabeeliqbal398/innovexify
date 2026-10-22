# syntax=docker/dockerfile:1
# Debian (glibc) rather than Alpine: the musl build of argon2 could not be installed. A compiler is used in the build stage only.
FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
# argon2 compiles a native module here (its prebuilt binary isn't picked up in the image). Only this stage has the toolchain;
# the runtime stage copies the built node_modules and stays slim.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps && npx prisma generate

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --legacy-peer-deps && npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production
# Run as the unprivileged `node` user that ships with the image.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node package.json ./
# Uploaded files live here. Mount a volume on it (docker-compose.prod.yml does) so they outlive the container.
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 4000
# Apply pending migrations (never `db push`), then start. A failed migration stops the container instead of serving a broken schema.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
