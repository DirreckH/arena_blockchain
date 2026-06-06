ARG BUILDER_IMAGE=node:22-bookworm-slim
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12
ARG PNPM_VERSION=10.32.0
FROM ${BUILDER_IMAGE} AS base
ARG PNPM_VERSION
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate && pnpm --version

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm fetch --filter @arena/api... --prod=false
COPY apps/api/nest-cli.json apps/api/nest-cli.json
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/tsconfig.build.json apps/api/tsconfig.build.json
COPY apps/api/prisma apps/api/prisma
COPY apps/api/src apps/api/src
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY packages/shared/src packages/shared/src
COPY packages/shared/tests packages/shared/tests
RUN pnpm install --offline --frozen-lockfile --filter @arena/api... --ignore-scripts --package-import-method=hardlink
RUN attempt=1; while [ "$attempt" -le 3 ]; do pnpm --filter @arena/api exec prisma generate --schema prisma/schema.prisma && break; if [ "$attempt" -eq 3 ]; then exit 1; fi; attempt=$((attempt + 1)); sleep 5; done
RUN pnpm --filter @arena/api build

FROM base AS prod-deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm fetch --filter @arena/api... --prod=false
COPY scripts/sync-prisma-runtime-artifacts.cjs scripts/sync-prisma-runtime-artifacts.cjs
RUN CI=true pnpm install --offline --frozen-lockfile --filter @arena/api... --prod --ignore-scripts --package-import-method=hardlink
COPY --from=build /app/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma /build-root/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma
RUN node scripts/sync-prisma-runtime-artifacts.cjs --build-root /build-root --deploy-root /app

FROM ${RUNTIME_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY pnpm-workspace.yaml hardhat.config.js hardhat.config.cjs /app/
COPY --from=prod-deps /app/node_modules/.modules.yaml /app/node_modules/.modules.yaml
COPY --from=prod-deps /app/node_modules/.pnpm-workspace-state-v1.json /app/node_modules/.pnpm-workspace-state-v1.json
COPY --from=prod-deps /app/node_modules/.pnpm /app/node_modules/.pnpm
COPY --from=prod-deps /app/apps/api/node_modules /app/apps/api/node_modules
COPY artifacts /app/artifacts
COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=build /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build /app/apps/api/package.json /app/apps/api/package.json
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/prisma /app/apps/api/prisma
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 CMD ["/nodejs/bin/node","-e","fetch('http://127.0.0.1:4000/health/live').then((res)=>{if(!res.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["/app/apps/api/dist/apps/api/src/main.js"]
