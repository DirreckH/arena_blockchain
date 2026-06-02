const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  checkBackendReleaseRepoContract,
} = require("./check-backend-release-repo-contract.cjs");

test("check-backend-release-repo-contract passes when release assets and CI contract are present", async () => {
  const workspace = createWorkspace({
    "package.json": [
      "{",
      '  "packageManager": "pnpm@10.32.0",',
      '  "scripts": {',
      '    "backend:release:host:check": "node scripts/check-backend-release-host-preflight.cjs",',
      '    "backend:release:rehearse:local": "node scripts/run-backend-release-rehearsal.cjs"',
      "  }",
      "}",
      "",
    ].join("\n"),
    "scripts/check-backend-release-host-preflight.cjs": "module.exports = {};\n",
    "scripts/run-backend-release-rehearsal.cjs": "module.exports = {};\n",
    "scripts/sync-prisma-runtime-artifacts.cjs": "module.exports = {};\n",
    "apps/api/prisma/schema.prisma": [
      "generator client {",
      '  provider      = "prisma-client-js"',
      '  binaryTargets = ["native", "debian-openssl-3.0.x"]',
      "}",
      "",
    ].join("\n"),
    "apps/api/Dockerfile": [
      "ARG BUILDER_IMAGE=node:22-bookworm-slim",
      "ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12",
      "FROM ${BUILDER_IMAGE} AS base",
      "RUN pnpm fetch --filter @arena/api... --prod=false",
      "COPY apps/api/src apps/api/src",
      "COPY packages/shared/src packages/shared/src",
      "RUN pnpm --filter @arena/api build",
      "FROM base AS prod-deps",
      "COPY scripts/sync-prisma-runtime-artifacts.cjs scripts/sync-prisma-runtime-artifacts.cjs",
      "RUN pnpm install --offline --frozen-lockfile --filter @arena/api... --prod --ignore-scripts --package-import-method=hardlink",
      "RUN node scripts/sync-prisma-runtime-artifacts.cjs --build-root /build-root --deploy-root /app",
      "FROM ${RUNTIME_IMAGE} AS runtime",
      "COPY pnpm-workspace.yaml hardhat.config.js hardhat.config.cjs /app/",
      "COPY --from=prod-deps /app/node_modules/.modules.yaml /app/node_modules/.modules.yaml",
      "COPY --from=prod-deps /app/node_modules/.pnpm-workspace-state-v1.json /app/node_modules/.pnpm-workspace-state-v1.json",
      "COPY --from=prod-deps /app/node_modules/.pnpm /app/node_modules/.pnpm",
      "COPY --from=prod-deps /app/apps/api/node_modules /app/apps/api/node_modules",
      "COPY artifacts /app/artifacts",
      "COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json",
      "COPY --from=build /app/packages/shared/dist /app/packages/shared/dist",
      "COPY --from=build /app/apps/api/package.json /app/apps/api/package.json",
      'HEALTHCHECK CMD ["/nodejs/bin/node","-e","fetch(\'http://127.0.0.1:4000/health/live\')"]',
      'CMD ["/app/apps/api/dist/apps/api/src/main.js"]',
      "",
    ].join("\n"),
    "docker-compose.prod.yml": [
      "services:",
      "  api:",
      "    build:",
      "      args:",
      "        BUILDER_IMAGE: ${ARENA_BUILDER_IMAGE:-node:22-bookworm-slim}",
      "        RUNTIME_IMAGE: ${ARENA_RUNTIME_IMAGE:-gcr.io/distroless/nodejs22-debian12}",
      "    env_file:",
      "      - ${ARENA_ENV_FILE:-.env.prod}",
      "    environment:",
      "      ARENA_PROCESS_ROLE: api",
      "      DATABASE_URL: ${ARENA_COMPOSE_DATABASE_URL:-postgresql://arena:arena@postgres:5432/arena?schema=public&connect_timeout=5}",
      "      REDIS_URL: ${ARENA_COMPOSE_REDIS_URL:-redis://redis:6379/0}",
      "      RPC_URL: ${ARENA_COMPOSE_RPC_URL:-http://host.docker.internal:8545}",
      "    extra_hosts:",
      '      - "host.docker.internal:host-gateway"',
      "  scheduler-worker:",
      "    build:",
      "      args:",
      "        BUILDER_IMAGE: ${ARENA_BUILDER_IMAGE:-node:22-bookworm-slim}",
      "        RUNTIME_IMAGE: ${ARENA_RUNTIME_IMAGE:-gcr.io/distroless/nodejs22-debian12}",
      "    env_file:",
      "      - ${ARENA_ENV_FILE:-.env.prod}",
      "    environment:",
      "      ARENA_PROCESS_ROLE: worker",
      "    healthcheck:",
      '      test: ["CMD", "/nodejs/bin/node", "/app/apps/api/dist/apps/api/src/worker-healthcheck.js"]',
      "  nginx:",
      "",
    ].join("\n"),
    ".github/workflows/backend-release.yml": [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - name: Backend release repo contract",
      "        run: pnpm run backend:release:repo:check",
      "  docker:",
      "    steps:",
      "      - name: Build backend image",
      "        run: docker build -f apps/api/Dockerfile -t arena-api:${{ github.sha }} .",
      "",
    ].join("\n"),
    ".dockerignore": [
      ".codex-temp",
      ".env",
      ".env.*",
      "!.env.example",
      "apps/web",
      "apps/*/dist",
      "docs",
      "validation-local",
      "validation-rehearsal",
      "",
    ].join("\n"),
    "docs/RELEASE_RUNBOOK.md": [
      "## Secrets and env rollout",
      "pnpm run backend:release:env:prepare",
      "pnpm run backend:release:host:check",
      "pnpm run backend:release:rehearse:local",
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml build",
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml up -d --no-deps api scheduler-worker nginx",
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml ps scheduler-worker",
      "## Smoke checks",
      "GET /health/ready",
      "GET /arena/internal/monitoring/runtime-contract",
      "pnpm run backend:release:check -- --base-url <url> --auth-token <operator-token>",
      "## Rollback",
      "",
    ].join("\n"),
    "ops/nginx/arena.conf": [
      "server {",
      "  location / {",
      "    proxy_pass http://api:4000;",
      "  }",
      "}",
      "",
    ].join("\n"),
  });
  const logger = createLogger();

  const exitCode = await checkBackendReleaseRepoContract({
    cwd: workspace,
    logger,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(logger.failMessages, []);
  assert.deepEqual(logger.passMessages, [
    "Backend release repo contract passed.",
  ]);
  assert.equal(
    logger.infoMessages.includes(
      "Validated repo-side release assets, CI gate, and rehearsal documentation.",
    ),
    true,
  );
});

test("check-backend-release-repo-contract fails when CI still depends on local bring-up and release assets are incomplete", async () => {
  const workspace = createWorkspace({
    "package.json": "{\n}\n",
    "apps/api/Dockerfile": "FROM node:22-bookworm-slim AS base\n",
    "docker-compose.prod.yml": [
      "services:",
      "  api:",
      "    environment:",
      "      ARENA_PROCESS_ROLE: api",
      "",
    ].join("\n"),
    ".github/workflows/backend-release.yml": [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - name: Local backend release check",
      "        run: pnpm run backend:prepare:local",
      "",
    ].join("\n"),
    ".dockerignore": "node_modules\n",
    "docs/RELEASE_RUNBOOK.md": "## Smoke checks\nGET /health/ready\n",
  });
  const logger = createLogger();

  const exitCode = await checkBackendReleaseRepoContract({
    cwd: workspace,
    logger,
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(logger.passMessages, []);
  assert.deepEqual(logger.failMessages, [
    "Backend release repo contract is incomplete.",
  ]);
  assert.equal(
    logger.infoMessages.includes(
      "- package.json is missing: pinned pnpm package manager version",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "- Missing file: ops/nginx/arena.conf",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "- Missing file: scripts/check-backend-release-host-preflight.cjs",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "- Missing file: scripts/run-backend-release-rehearsal.cjs",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "- .github/workflows/backend-release.yml still runs `pnpm run backend:prepare:local`; keep local bring-up out of CI and use the repo-side release contract check instead.",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "- .dockerignore is missing: exclude root .env files from the Docker build context",
    ),
    true,
  );
  assert.equal(
    logger.infoMessages.includes(
      "- apps/api/Dockerfile declares `ARG RUNTIME_IMAGE=...` after the first `FROM`; keep runtime image overrides in the Dockerfile global ARG scope so `FROM ${RUNTIME_IMAGE}` resolves during compose builds.",
    ),
    false,
  );
});

test("check-backend-release-repo-contract fails when runtime image ARG is not in global Dockerfile scope", async () => {
  const workspace = createWorkspace({
    "package.json": [
      "{",
      '  "packageManager": "pnpm@10.32.0",',
      '  "scripts": {',
      '    "backend:release:host:check": "node scripts/check-backend-release-host-preflight.cjs",',
      '    "backend:release:rehearse:local": "node scripts/run-backend-release-rehearsal.cjs"',
      "  }",
      "}",
      "",
    ].join("\n"),
    "scripts/check-backend-release-host-preflight.cjs": "module.exports = {};\n",
    "scripts/run-backend-release-rehearsal.cjs": "module.exports = {};\n",
    "scripts/sync-prisma-runtime-artifacts.cjs": "module.exports = {};\n",
    "apps/api/Dockerfile": [
      "ARG BUILDER_IMAGE=node:22-bookworm-slim",
      "FROM ${BUILDER_IMAGE} AS base",
      "RUN pnpm fetch --filter @arena/api... --prod=false",
      "COPY apps/api/src apps/api/src",
      "COPY packages/shared/src packages/shared/src",
      "RUN pnpm --filter @arena/api build",
      "FROM base AS prod-deps",
      "COPY scripts/sync-prisma-runtime-artifacts.cjs scripts/sync-prisma-runtime-artifacts.cjs",
      "RUN pnpm install --offline --frozen-lockfile --filter @arena/api... --prod --ignore-scripts --package-import-method=hardlink",
      "ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12",
      "FROM ${RUNTIME_IMAGE} AS runtime",
      "COPY artifacts /app/artifacts",
      "COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json",
      "COPY --from=build /app/packages/shared/dist /app/packages/shared/dist",
      'HEALTHCHECK CMD ["/nodejs/bin/node","-e","fetch(\'http://127.0.0.1:4000/health/live\')"]',
      'CMD ["/app/apps/api/dist/apps/api/src/main.js"]',
      "",
    ].join("\n"),
    "docker-compose.prod.yml": [
      "services:",
      "  api:",
      "    build:",
      "      args:",
      "        BUILDER_IMAGE: ${ARENA_BUILDER_IMAGE:-node:22-bookworm-slim}",
      "        RUNTIME_IMAGE: ${ARENA_RUNTIME_IMAGE:-gcr.io/distroless/nodejs22-debian12}",
      "    env_file:",
      "      - ${ARENA_ENV_FILE:-.env.prod}",
      "    environment:",
      "      ARENA_PROCESS_ROLE: api",
      "      DATABASE_URL: ${ARENA_COMPOSE_DATABASE_URL:-postgresql://arena:arena@postgres:5432/arena?schema=public&connect_timeout=5}",
      "      REDIS_URL: ${ARENA_COMPOSE_REDIS_URL:-redis://redis:6379/0}",
      "      RPC_URL: ${ARENA_COMPOSE_RPC_URL:-http://host.docker.internal:8545}",
      "    extra_hosts:",
      '      - "host.docker.internal:host-gateway"',
      "  scheduler-worker:",
      "    build:",
      "      args:",
      "        BUILDER_IMAGE: ${ARENA_BUILDER_IMAGE:-node:22-bookworm-slim}",
      "        RUNTIME_IMAGE: ${ARENA_RUNTIME_IMAGE:-gcr.io/distroless/nodejs22-debian12}",
      "    env_file:",
      "      - ${ARENA_ENV_FILE:-.env.prod}",
      "    environment:",
      "      ARENA_PROCESS_ROLE: worker",
      "  nginx:",
      "",
    ].join("\n"),
    ".github/workflows/backend-release.yml": [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - name: Backend release repo contract",
      "        run: pnpm run backend:release:repo:check",
      "  docker:",
      "    steps:",
      "      - name: Build backend image",
      "        run: docker build -f apps/api/Dockerfile -t arena-api:${{ github.sha }} .",
      "",
    ].join("\n"),
    ".dockerignore": [
      ".codex-temp",
      ".env",
      ".env.*",
      "!.env.example",
      "apps/web",
      "apps/*/dist",
      "docs",
      "validation-local",
      "validation-rehearsal",
      "",
    ].join("\n"),
    "docs/RELEASE_RUNBOOK.md": [
      "## Secrets and env rollout",
      "pnpm run backend:release:env:prepare",
      "pnpm run backend:release:host:check",
      "pnpm run backend:release:rehearse:local",
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml build",
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml up -d --no-deps api scheduler-worker nginx",
      "## Smoke checks",
      "GET /health/ready",
      "GET /arena/internal/monitoring/runtime-contract",
      "pnpm run backend:release:check -- --base-url <url> --auth-token <operator-token>",
      "## Rollback",
      "",
    ].join("\n"),
    "ops/nginx/arena.conf": [
      "server {",
      "  location / {",
      "    proxy_pass http://api:4000;",
      "  }",
      "}",
      "",
    ].join("\n"),
  });
  const logger = createLogger();

  const exitCode = await checkBackendReleaseRepoContract({
    cwd: workspace,
    logger,
  });

  assert.equal(exitCode, 1);
  assert.equal(
    logger.infoMessages.includes(
      "- apps/api/Dockerfile declares `ARG RUNTIME_IMAGE=...` after the first `FROM`; keep runtime image overrides in the Dockerfile global ARG scope so `FROM ${RUNTIME_IMAGE}` resolves during compose builds.",
    ),
    true,
  );
});

test("check-backend-release-repo-contract fails when Prisma omits the distroless runtime binary target", async () => {
  const workspace = createWorkspace({
    "package.json": [
      "{",
      '  "packageManager": "pnpm@10.32.0",',
      '  "scripts": {',
      '    "backend:release:host:check": "node scripts/check-backend-release-host-preflight.cjs",',
      '    "backend:release:rehearse:local": "node scripts/run-backend-release-rehearsal.cjs"',
      "  }",
      "}",
      "",
    ].join("\n"),
    "scripts/check-backend-release-host-preflight.cjs": "module.exports = {};\n",
    "scripts/run-backend-release-rehearsal.cjs": "module.exports = {};\n",
    "scripts/sync-prisma-runtime-artifacts.cjs": "module.exports = {};\n",
    "apps/api/prisma/schema.prisma": [
      "generator client {",
      '  provider = "prisma-client-js"',
      "}",
      "",
    ].join("\n"),
    "apps/api/Dockerfile": [
      "ARG BUILDER_IMAGE=node:22-bookworm-slim",
      "ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12",
      "FROM ${BUILDER_IMAGE} AS base",
      "RUN pnpm fetch --filter @arena/api... --prod=false",
      "COPY apps/api/src apps/api/src",
      "COPY packages/shared/src packages/shared/src",
      "RUN pnpm --filter @arena/api build",
      "FROM base AS prod-deps",
      "COPY scripts/sync-prisma-runtime-artifacts.cjs scripts/sync-prisma-runtime-artifacts.cjs",
      "RUN pnpm install --offline --frozen-lockfile --filter @arena/api... --prod --ignore-scripts --package-import-method=hardlink",
      "RUN node scripts/sync-prisma-runtime-artifacts.cjs --build-root /build-root --deploy-root /app",
      "FROM ${RUNTIME_IMAGE} AS runtime",
      "COPY pnpm-workspace.yaml hardhat.config.js hardhat.config.cjs /app/",
      "COPY --from=prod-deps /app/node_modules/.modules.yaml /app/node_modules/.modules.yaml",
      "COPY --from=prod-deps /app/node_modules/.pnpm-workspace-state-v1.json /app/node_modules/.pnpm-workspace-state-v1.json",
      "COPY --from=prod-deps /app/node_modules/.pnpm /app/node_modules/.pnpm",
      "COPY --from=prod-deps /app/apps/api/node_modules /app/apps/api/node_modules",
      "COPY artifacts /app/artifacts",
      "COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json",
      "COPY --from=build /app/packages/shared/dist /app/packages/shared/dist",
      "COPY --from=build /app/apps/api/package.json /app/apps/api/package.json",
      'HEALTHCHECK CMD ["/nodejs/bin/node","-e","fetch(\'http://127.0.0.1:4000/health/live\')"]',
      'CMD ["/app/apps/api/dist/apps/api/src/main.js"]',
      "",
    ].join("\n"),
    "docker-compose.prod.yml": [
      "services:",
      "  api:",
      "    build:",
      "      args:",
      "        BUILDER_IMAGE: ${ARENA_BUILDER_IMAGE:-node:22-bookworm-slim}",
      "        RUNTIME_IMAGE: ${ARENA_RUNTIME_IMAGE:-gcr.io/distroless/nodejs22-debian12}",
      "    env_file:",
      "      - ${ARENA_ENV_FILE:-.env.prod}",
      "    environment:",
      "      ARENA_PROCESS_ROLE: api",
      "      DATABASE_URL: ${ARENA_COMPOSE_DATABASE_URL:-postgresql://arena:arena@postgres:5432/arena?schema=public&connect_timeout=5}",
      "      REDIS_URL: ${ARENA_COMPOSE_REDIS_URL:-redis://redis:6379/0}",
      "      RPC_URL: ${ARENA_COMPOSE_RPC_URL:-http://host.docker.internal:8545}",
      "    extra_hosts:",
      '      - "host.docker.internal:host-gateway"',
      "  scheduler-worker:",
      "    build:",
      "      args:",
      "        BUILDER_IMAGE: ${ARENA_BUILDER_IMAGE:-node:22-bookworm-slim}",
      "        RUNTIME_IMAGE: ${ARENA_RUNTIME_IMAGE:-gcr.io/distroless/nodejs22-debian12}",
      "    env_file:",
      "      - ${ARENA_ENV_FILE:-.env.prod}",
      "    environment:",
      "      ARENA_PROCESS_ROLE: worker",
      "  nginx:",
      "",
    ].join("\n"),
    ".github/workflows/backend-release.yml": [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - name: Backend release repo contract",
      "        run: pnpm run backend:release:repo:check",
      "  docker:",
      "    steps:",
      "      - name: Build backend image",
      "        run: docker build -f apps/api/Dockerfile -t arena-api:${{ github.sha }} .",
      "",
    ].join("\n"),
    ".dockerignore": [
      ".codex-temp",
      ".env",
      ".env.*",
      "!.env.example",
      "apps/web",
      "apps/*/dist",
      "docs",
      "validation-local",
      "validation-rehearsal",
      "",
    ].join("\n"),
    "docs/RELEASE_RUNBOOK.md": [
      "## Secrets and env rollout",
      "pnpm run backend:release:env:prepare",
      "pnpm run backend:release:host:check",
      "pnpm run backend:release:rehearse:local",
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml build",
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml up -d --no-deps api scheduler-worker nginx",
      "## Smoke checks",
      "GET /health/ready",
      "GET /arena/internal/monitoring/runtime-contract",
      "pnpm run backend:release:check -- --base-url <url> --auth-token <operator-token>",
      "## Rollback",
      "",
    ].join("\n"),
    "ops/nginx/arena.conf": [
      "server {",
      "  location / {",
      "    proxy_pass http://api:4000;",
      "  }",
      "}",
      "",
    ].join("\n"),
  });
  const logger = createLogger();

  const exitCode = await checkBackendReleaseRepoContract({
    cwd: workspace,
    logger,
  });

  assert.equal(exitCode, 1);
  assert.equal(
    logger.infoMessages.includes(
      "- apps/api/prisma/schema.prisma is missing: Prisma client binary target for distroless Debian OpenSSL 3 runtimes",
    ),
    true,
  );
});

test("check-backend-release-repo-contract fails when scheduler worker still overrides the pre-split runtime entrypoint", async () => {
  const workspace = createWorkspace({
    "package.json": [
      "{",
      '  "packageManager": "pnpm@10.32.0",',
      '  "scripts": {',
      '    "backend:release:host:check": "node scripts/check-backend-release-host-preflight.cjs",',
      '    "backend:release:rehearse:local": "node scripts/run-backend-release-rehearsal.cjs"',
      "  }",
      "}",
      "",
    ].join("\n"),
    "scripts/check-backend-release-host-preflight.cjs": "module.exports = {};\n",
    "scripts/run-backend-release-rehearsal.cjs": "module.exports = {};\n",
    "scripts/sync-prisma-runtime-artifacts.cjs": "module.exports = {};\n",
    "apps/api/Dockerfile": [
      "ARG BUILDER_IMAGE=node:22-bookworm-slim",
      "ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12",
      "FROM ${BUILDER_IMAGE} AS base",
      "RUN pnpm fetch --filter @arena/api... --prod=false",
      "COPY apps/api/src apps/api/src",
      "COPY packages/shared/src packages/shared/src",
      "RUN pnpm --filter @arena/api build",
      "FROM base AS prod-deps",
      "COPY scripts/sync-prisma-runtime-artifacts.cjs scripts/sync-prisma-runtime-artifacts.cjs",
      "RUN pnpm install --offline --frozen-lockfile --filter @arena/api... --prod --ignore-scripts --package-import-method=hardlink",
      "RUN node scripts/sync-prisma-runtime-artifacts.cjs --build-root /build-root --deploy-root /app",
      "FROM ${RUNTIME_IMAGE} AS runtime",
      "COPY artifacts /app/artifacts",
      "COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json",
      "COPY --from=build /app/packages/shared/dist /app/packages/shared/dist",
      'HEALTHCHECK CMD ["/nodejs/bin/node","-e","fetch(\'http://127.0.0.1:4000/health/live\')"]',
      'CMD ["/app/apps/api/dist/apps/api/src/main.js"]',
      "",
    ].join("\n"),
    "docker-compose.prod.yml": [
      "services:",
      "  api:",
      "    build:",
      "      args:",
      "        BUILDER_IMAGE: ${ARENA_BUILDER_IMAGE:-node:22-bookworm-slim}",
      "        RUNTIME_IMAGE: ${ARENA_RUNTIME_IMAGE:-gcr.io/distroless/nodejs22-debian12}",
      "    env_file:",
      "      - ${ARENA_ENV_FILE:-.env.prod}",
      "    environment:",
      "      ARENA_PROCESS_ROLE: api",
      "      DATABASE_URL: ${ARENA_COMPOSE_DATABASE_URL:-postgresql://arena:arena@postgres:5432/arena?schema=public&connect_timeout=5}",
      "      REDIS_URL: ${ARENA_COMPOSE_REDIS_URL:-redis://redis:6379/0}",
      "      RPC_URL: ${ARENA_COMPOSE_RPC_URL:-http://host.docker.internal:8545}",
      "    extra_hosts:",
      '      - "host.docker.internal:host-gateway"',
      "  scheduler-worker:",
      "    build:",
      "      args:",
      "        BUILDER_IMAGE: ${ARENA_BUILDER_IMAGE:-node:22-bookworm-slim}",
      "        RUNTIME_IMAGE: ${ARENA_RUNTIME_IMAGE:-gcr.io/distroless/nodejs22-debian12}",
      "    env_file:",
      "      - ${ARENA_ENV_FILE:-.env.prod}",
      "    environment:",
      "      ARENA_PROCESS_ROLE: worker",
      '    command: ["/app/dist/apps/api/src/main.js"]',
      "  nginx:",
      "",
    ].join("\n"),
    ".github/workflows/backend-release.yml": [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - name: Backend release repo contract",
      "        run: pnpm run backend:release:repo:check",
      "  docker:",
      "    steps:",
      "      - name: Build backend image",
      "        run: docker build -f apps/api/Dockerfile -t arena-api:${{ github.sha }} .",
      "",
    ].join("\n"),
    ".dockerignore": [
      ".codex-temp",
      ".env",
      ".env.*",
      "!.env.example",
      "apps/web",
      "apps/*/dist",
      "docs",
      "validation-local",
      "validation-rehearsal",
      "",
    ].join("\n"),
    "docs/RELEASE_RUNBOOK.md": [
      "## Secrets and env rollout",
      "pnpm run backend:release:env:prepare",
      "pnpm run backend:release:host:check",
      "pnpm run backend:release:rehearse:local",
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml build",
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml up -d --no-deps api scheduler-worker nginx",
      "## Smoke checks",
      "GET /health/ready",
      "GET /arena/internal/monitoring/runtime-contract",
      "pnpm run backend:release:check -- --base-url <url> --auth-token <operator-token>",
      "## Rollback",
      "",
    ].join("\n"),
    "ops/nginx/arena.conf": [
      "server {",
      "  location / {",
      "    proxy_pass http://api:4000;",
      "  }",
      "}",
      "",
    ].join("\n"),
  });
  const logger = createLogger();

  const exitCode = await checkBackendReleaseRepoContract({
    cwd: workspace,
    logger,
  });

  assert.equal(exitCode, 1);
  assert.equal(
    logger.infoMessages.includes(
      "- docker-compose.prod.yml still overrides the worker container entrypoint with the pre-split `/app/dist/...` path; use the image CMD or the `/app/apps/api/dist/...` runtime path that matches the current Dockerfile layout.",
    ),
    true,
  );
});

test("check-backend-release-repo-contract fails when scheduler-worker still inherits the API healthcheck contract", async () => {
  const workspace = createWorkspace({
    "package.json": [
      "{",
      '  "packageManager": "pnpm@10.32.0",',
      '  "scripts": {',
      '    "backend:release:host:check": "node scripts/check-backend-release-host-preflight.cjs",',
      '    "backend:release:rehearse:local": "node scripts/run-backend-release-rehearsal.cjs"',
      "  }",
      "}",
      "",
    ].join("\n"),
    "scripts/check-backend-release-host-preflight.cjs": "module.exports = {};\n",
    "scripts/run-backend-release-rehearsal.cjs": "module.exports = {};\n",
    "scripts/sync-prisma-runtime-artifacts.cjs": "module.exports = {};\n",
    "apps/api/prisma/schema.prisma": [
      "generator client {",
      '  provider      = "prisma-client-js"',
      '  binaryTargets = ["native", "debian-openssl-3.0.x"]',
      "}",
      "",
    ].join("\n"),
    "apps/api/Dockerfile": [
      "ARG BUILDER_IMAGE=node:22-bookworm-slim",
      "ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12",
      "FROM ${BUILDER_IMAGE} AS base",
      "RUN pnpm fetch --filter @arena/api... --prod=false",
      "COPY apps/api/src apps/api/src",
      "COPY packages/shared/src packages/shared/src",
      "RUN pnpm --filter @arena/api build",
      "FROM base AS prod-deps",
      "COPY scripts/sync-prisma-runtime-artifacts.cjs scripts/sync-prisma-runtime-artifacts.cjs",
      "RUN pnpm install --offline --frozen-lockfile --filter @arena/api... --prod --ignore-scripts --package-import-method=hardlink",
      "RUN node scripts/sync-prisma-runtime-artifacts.cjs --build-root /build-root --deploy-root /app",
      "FROM ${RUNTIME_IMAGE} AS runtime",
      "COPY artifacts /app/artifacts",
      "COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json",
      "COPY --from=build /app/packages/shared/dist /app/packages/shared/dist",
      'HEALTHCHECK CMD ["/nodejs/bin/node","-e","fetch(\'http://127.0.0.1:4000/health/live\')"]',
      'CMD ["/app/apps/api/dist/apps/api/src/main.js"]',
      "",
    ].join("\n"),
    "docker-compose.prod.yml": [
      "services:",
      "  api:",
      "    build:",
      "      args:",
      "        BUILDER_IMAGE: ${ARENA_BUILDER_IMAGE:-node:22-bookworm-slim}",
      "        RUNTIME_IMAGE: ${ARENA_RUNTIME_IMAGE:-gcr.io/distroless/nodejs22-debian12}",
      "    env_file:",
      "      - ${ARENA_ENV_FILE:-.env.prod}",
      "    environment:",
      "      ARENA_PROCESS_ROLE: api",
      "      DATABASE_URL: ${ARENA_COMPOSE_DATABASE_URL:-postgresql://arena:arena@postgres:5432/arena?schema=public&connect_timeout=5}",
      "      REDIS_URL: ${ARENA_COMPOSE_REDIS_URL:-redis://redis:6379/0}",
      "      RPC_URL: ${ARENA_COMPOSE_RPC_URL:-http://host.docker.internal:8545}",
      "    extra_hosts:",
      '      - "host.docker.internal:host-gateway"',
      "  scheduler-worker:",
      "    build:",
      "      args:",
      "        BUILDER_IMAGE: ${ARENA_BUILDER_IMAGE:-node:22-bookworm-slim}",
      "        RUNTIME_IMAGE: ${ARENA_RUNTIME_IMAGE:-gcr.io/distroless/nodejs22-debian12}",
      "    env_file:",
      "      - ${ARENA_ENV_FILE:-.env.prod}",
      "    environment:",
      "      ARENA_PROCESS_ROLE: worker",
      "  nginx:",
      "",
    ].join("\n"),
    ".github/workflows/backend-release.yml": [
      "jobs:",
      "  verify:",
      "    steps:",
      "      - name: Backend release repo contract",
      "        run: pnpm run backend:release:repo:check",
      "  docker:",
      "    steps:",
      "      - name: Build backend image",
      "        run: docker build -f apps/api/Dockerfile -t arena-api:${{ github.sha }} .",
      "",
    ].join("\n"),
    ".dockerignore": [
      ".codex-temp",
      ".env",
      ".env.*",
      "!.env.example",
      "apps/web",
      "apps/*/dist",
      "docs",
      "validation-local",
      "validation-rehearsal",
      "",
    ].join("\n"),
    "docs/RELEASE_RUNBOOK.md": [
      "## Secrets and env rollout",
      "pnpm run backend:release:env:prepare",
      "pnpm run backend:release:host:check",
      "pnpm run backend:release:rehearse:local",
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml build",
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml up -d --no-deps api scheduler-worker nginx",
      "docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml ps scheduler-worker",
      "## Smoke checks",
      "GET /health/ready",
      "GET /arena/internal/monitoring/runtime-contract",
      "pnpm run backend:release:check -- --base-url <url> --auth-token <operator-token>",
      "## Rollback",
      "",
    ].join("\n"),
    "ops/nginx/arena.conf": [
      "server {",
      "  location / {",
      "    proxy_pass http://api:4000;",
      "  }",
      "}",
      "",
    ].join("\n"),
  });
  const logger = createLogger();

  const exitCode = await checkBackendReleaseRepoContract({
    cwd: workspace,
    logger,
  });

  assert.equal(exitCode, 1);
  assert.equal(
    logger.infoMessages.includes(
      "- docker-compose.prod.yml is missing: scheduler worker healthcheck override",
    ),
    true,
  );
});

function createWorkspace(files) {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "arena-backend-release-repo-"),
  );

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(workspace, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, "utf8");
  }

  return workspace;
}

function createLogger() {
  return {
    failMessages: [],
    infoMessages: [],
    passMessages: [],
    fail(message) {
      this.failMessages.push(message);
    },
    info(message) {
      this.infoMessages.push(message);
    },
    pass(message) {
      this.passMessages.push(message);
    },
  };
}
