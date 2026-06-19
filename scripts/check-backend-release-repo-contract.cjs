#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const {
  fail,
  info,
  pass,
} = require("./_validation-common.cjs");

const REQUIRED_FILES = [
  "package.json",
  "apps/api/Dockerfile",
  "apps/api/prisma/schema.prisma",
  "docker-compose.prod.yml",
  ".github/workflows/backend-release.yml",
  ".dockerignore",
  "docs/RELEASE_RUNBOOK.md",
  "ops/nginx/arena.conf",
  "scripts/audit-node-dependencies.cjs",
  "scripts/backup-postgres-database.cjs",
  "scripts/check-secret-rotation.cjs",
  "scripts/check-backend-release-host-preflight.cjs",
  "scripts/recover-backend-release-host.cjs",
  "scripts/prove-runtime-contract-operator-monitoring.cjs",
  "scripts/restore-postgres-database.cjs",
  "scripts/run-database-rollback-rehearsal.cjs",
  "scripts/run-backend-release-rehearsal.cjs",
  "scripts/run-external-release-evidence.cjs",
  "scripts/sync-prisma-runtime-artifacts.cjs",
];

const REQUIRED_RULES = [
  {
    filePath: "package.json",
    label: "package.json",
    checks: [
      {
        description: "pinned pnpm package manager version",
        pattern: /"packageManager"\s*:\s*"pnpm@10\.32\.0"/u,
      },
      {
        description: "validation repo test script",
        pattern: /"validation:repo:test"\s*:\s*"node --test scripts\/bootstrap-validation-local\.test\.cjs scripts\/prepare-validation-local\.test\.cjs scripts\/prepare-local-reward-payout-token\.test\.cjs scripts\/prepare-backend-local\.test\.cjs scripts\/check-validation-env\.test\.cjs scripts\/check-validation-runtime-deps\.test\.cjs scripts\/check-validation-contract\.test\.cjs scripts\/run-validation-preflight\.test\.cjs scripts\/run-validation-deploy\.test\.cjs scripts\/run-legacy-deploy\.test\.cjs scripts\/drive-validation-proof\.test\.cjs scripts\/capture-validation-proof\.test\.cjs scripts\/capture-validation-operator-briefing\.test\.cjs scripts\/capture-validation-rehearsal-evidence\.test\.cjs scripts\/export-validation-rehearsal-evidence\.test\.cjs scripts\/check-public-settled-result\.test\.cjs scripts\/check-public-integrity-overview\.test\.cjs"/u,
      },
      {
        description: "release host preflight script",
        pattern: /"backend:release:host:check"\s*:\s*"node (?:-- )?scripts\/check-backend-release-host-preflight\.cjs"/u,
      },
      {
        description: "release host recovery script",
        pattern: /"backend:release:host:recover"\s*:\s*"node (?:-- )?scripts\/recover-backend-release-host\.cjs"/u,
      },
      {
        description: "runtime-contract operator proof script",
        pattern: /"backend:release:proof:operator"\s*:\s*"node (?:-- )?scripts\/prove-runtime-contract-operator-monitoring\.cjs"/u,
      },
      {
        description: "local release rehearsal script",
        pattern: /"backend:release:rehearse:local"\s*:\s*"node (?:-- )?scripts\/run-backend-release-rehearsal\.cjs"/u,
      },
      {
        description: "external release rehearsal script",
        pattern: /"backend:release:rehearse:external"\s*:\s*"node (?:-- )?scripts\/run-backend-release-rehearsal\.cjs --mode external"/u,
      },
      {
        description: "external release evidence orchestration script",
        pattern: /"backend:release:evidence:external"\s*:\s*"node (?:-- )?scripts\/run-external-release-evidence\.cjs"/u,
      },
      {
        description: "database backup script",
        pattern: /"backend:db:backup"\s*:\s*"node (?:-- )?scripts\/backup-postgres-database\.cjs"/u,
      },
      {
        description: "database restore script",
        pattern: /"backend:db:restore"\s*:\s*"node (?:-- )?scripts\/restore-postgres-database\.cjs"/u,
      },
      {
        description: "database rollback rehearsal script",
        pattern: /"backend:db:rollback:rehearse"\s*:\s*"node (?:-- )?scripts\/run-database-rollback-rehearsal\.cjs"/u,
      },
      {
        description: "secret rotation audit script",
        pattern: /"backend:secrets:rotate:check"\s*:\s*"node (?:-- )?scripts\/check-secret-rotation\.cjs"/u,
      },
      {
        description: "production dependency security audit script",
        pattern: /"backend:security:audit:prod"\s*:\s*"node (?:-- )?scripts\/audit-node-dependencies\.cjs"/u,
      },
      {
        description: "full dependency security audit script",
        pattern: /"backend:security:audit:all"\s*:\s*"node (?:-- )?scripts\/audit-node-dependencies\.cjs --include-dev"/u,
      },
    ],
  },
  {
    filePath: "apps/api/Dockerfile",
    label: "apps/api/Dockerfile",
    checks: [
      {
        description: "multi-stage builder base image",
        pattern: /^ARG BUILDER_IMAGE=node:22-bookworm-slim$/mu,
      },
      {
        description: "builder image override support",
        pattern: /^FROM \$\{BUILDER_IMAGE\} AS base$/mu,
      },
      {
        description: "pnpm fetch layer",
        pattern: /pnpm fetch --filter @arena\/api\.\.\. --prod=false/u,
      },
      {
        description: "targeted API source copy",
        pattern: /COPY apps\/api\/src apps\/api\/src/u,
      },
      {
        description: "targeted shared source copy",
        pattern: /COPY packages\/shared\/src packages\/shared\/src/u,
      },
      {
        description: "API build step",
        pattern: /pnpm --filter @arena\/api build/u,
      },
      {
        description: "production dependency stage",
        pattern: /^FROM base AS prod-deps$/mu,
      },
      {
        description: "production dependency install step",
        pattern: /pnpm install --offline --frozen-lockfile --filter @arena\/api\.\.\. --prod --ignore-scripts --package-import-method=hardlink/u,
      },
      {
        description: "Prisma runtime artifact sync step",
        pattern: /node scripts\/sync-prisma-runtime-artifacts\.cjs --build-root \/build-root --deploy-root \/app/u,
      },
      {
        description: "targeted Prisma sync script copy",
        pattern: /COPY scripts\/sync-prisma-runtime-artifacts\.cjs scripts\/sync-prisma-runtime-artifacts\.cjs/u,
      },
      {
        description: "runtime pnpm metadata copy from production dependency stage",
        pattern: /COPY --from=prod-deps \/app\/node_modules\/\.modules\.yaml \/app\/node_modules\/\.modules\.yaml/u,
      },
      {
        description: "runtime pnpm workspace state copy from production dependency stage",
        pattern: /COPY --from=prod-deps \/app\/node_modules\/\.pnpm-workspace-state-v1\.json \/app\/node_modules\/\.pnpm-workspace-state-v1\.json/u,
      },
      {
        description: "runtime pnpm store copy from production dependency stage",
        pattern: /COPY --from=prod-deps \/app\/node_modules\/\.pnpm \/app\/node_modules\/\.pnpm/u,
      },
      {
        description: "runtime API node_modules copy from production dependency stage",
        pattern: /COPY --from=prod-deps \/app\/apps\/api\/node_modules \/app\/apps\/api\/node_modules/u,
      },
      {
        description: "runtime workspace root markers",
        pattern: /COPY pnpm-workspace\.yaml hardhat\.config\.js hardhat\.config\.cjs \/app\//u,
      },
      {
        description: "runtime contract artifacts copy",
        pattern: /COPY artifacts \/app\/artifacts/u,
      },
      {
        description: "runtime shared package manifest copy",
        pattern: /COPY --from=build \/app\/packages\/shared\/package\.json \/app\/packages\/shared\/package\.json/u,
      },
      {
        description: "runtime shared dist copy",
        pattern: /COPY --from=build \/app\/packages\/shared\/dist \/app\/packages\/shared\/dist/u,
      },
      {
        description: "runtime API package manifest copy",
        pattern: /COPY --from=build \/app\/apps\/api\/package\.json \/app\/apps\/api\/package\.json/u,
      },
      {
        description: "distroless runtime image",
        pattern: /^ARG RUNTIME_IMAGE=gcr\.io\/distroless\/nodejs22-debian12$/mu,
      },
      {
        description: "runtime image override support",
        pattern: /^FROM \$\{RUNTIME_IMAGE\} AS runtime$/mu,
      },
      {
        description: "container healthcheck",
        pattern: /^HEALTHCHECK .*\/health\/live/mu,
      },
      {
        description: "runtime app entrypoint",
        pattern: /CMD \["\/app\/apps\/api\/dist\/apps\/api\/src\/main\.js"\]/u,
      },
    ],
    customChecks: [
      (contents) => {
        const builderArgIndex = contents.indexOf(
          "ARG BUILDER_IMAGE=node:22-bookworm-slim",
        );
        const runtimeArgIndex = contents.indexOf(
          "ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12",
        );
        const firstFromIndex = contents.indexOf("FROM ${BUILDER_IMAGE} AS base");

        if (
          builderArgIndex === -1 ||
          runtimeArgIndex === -1 ||
          firstFromIndex === -1
        ) {
          return null;
        }

        if (runtimeArgIndex > firstFromIndex) {
          return "declares `ARG RUNTIME_IMAGE=...` after the first `FROM`; keep runtime image overrides in the Dockerfile global ARG scope so `FROM ${RUNTIME_IMAGE}` resolves during compose builds.";
        }

        if (contents.includes("COPY . .")) {
          return "still uses `COPY . .` in the backend image build path; keep the Docker build context narrowly scoped to the API/runtime inputs so local release rehearsal does not push unnecessary workspace data into the Docker Desktop disk.";
        }

        return null;
      },
    ],
  },
  {
    filePath: "apps/api/prisma/schema.prisma",
    label: "apps/api/prisma/schema.prisma",
    checks: [
      {
        description: "Prisma client generator",
        pattern: /^generator client \{$/mu,
      },
      {
        description: "Prisma client binary target for distroless Debian OpenSSL 3 runtimes",
        pattern: /binaryTargets\s*=\s*\[[^\]]*"debian-openssl-3\.0\.x"[^\]]*\]/u,
      },
    ],
  },
  {
    filePath: "docker-compose.prod.yml",
    label: "docker-compose.prod.yml",
    checks: [
      {
        description: "API service",
        pattern: /^  api:$/mu,
      },
      {
        description: "scheduler worker service",
        pattern: /^  scheduler-worker:$/mu,
      },
      {
        description: "nginx service",
        pattern: /^  nginx:$/mu,
      },
      {
        description: "env_file secret loading",
        pattern: /env_file:\s*\n\s*-\s*\$\{ARENA_ENV_FILE:-\.env\.prod\}/u,
      },
      {
        description: "compose-safe database override",
        pattern: /ARENA_COMPOSE_DATABASE_URL/u,
      },
      {
        description: "builder image build arg override",
        pattern: /BUILDER_IMAGE:\s*\$\{ARENA_BUILDER_IMAGE:-node:22-bookworm-slim\}/u,
      },
      {
        description: "runtime image build arg override",
        pattern: /RUNTIME_IMAGE:\s*\$\{ARENA_RUNTIME_IMAGE:-gcr\.io\/distroless\/nodejs22-debian12\}/u,
      },
      {
        description: "compose-safe redis override",
        pattern: /ARENA_COMPOSE_REDIS_URL/u,
      },
      {
        description: "compose-safe RPC override",
        pattern: /ARENA_COMPOSE_RPC_URL/u,
      },
      {
        description: "api process role",
        pattern: /ARENA_PROCESS_ROLE:\s*api/u,
      },
      {
        description: "worker process role",
        pattern: /ARENA_PROCESS_ROLE:\s*worker/u,
      },
      {
        description: "scheduler worker healthcheck override",
        pattern: /scheduler-worker:[\s\S]*healthcheck:[\s\S]*worker-healthcheck\.js/u,
      },
      {
        description: "host.docker.internal host-gateway mapping",
        pattern: /host\.docker\.internal:host-gateway/u,
      },
    ],
    customChecks: [
      (contents) =>
        contents.includes("/app/dist/apps/api/src/main.js")
          ? "still overrides the worker container entrypoint with the pre-split `/app/dist/...` path; use the image CMD or the `/app/apps/api/dist/...` runtime path that matches the current Dockerfile layout."
          : null,
    ],
  },
  {
    filePath: ".github/workflows/backend-release.yml",
    label: ".github/workflows/backend-release.yml",
    checks: [
      {
        description: "verify job",
        pattern: /^\s+verify:$/mu,
      },
      {
        description: "docker job",
        pattern: /^\s+docker:$/mu,
      },
      {
        description: "repo-side release contract check step",
        pattern: /pnpm run backend:release:repo:check/u,
      },
      {
        description: "validation repo test step",
        pattern: /pnpm run validation:repo:test/u,
      },
      {
        description: "docker image build step",
        pattern: /docker build -f apps\/api\/Dockerfile/u,
      },
    ],
    customChecks: [
      (contents) =>
        contents.includes("pnpm run backend:prepare:local")
          ? "still runs `pnpm run backend:prepare:local`; keep local bring-up out of CI and use the repo-side release contract check instead."
          : null,
    ],
  },
  {
    filePath: ".dockerignore",
    label: ".dockerignore",
    checks: [
      {
        description: "exclude root .env files from the Docker build context",
        pattern: /^\.env$/mu,
      },
      {
        description: "exclude .env variants from the Docker build context",
        pattern: /^\.env\.\*$/mu,
      },
      {
        description: "allow .env.example through the build context",
        pattern: /^!\.env\.example$/mu,
      },
      {
        description: "exclude validation-local artifacts",
        pattern: /^validation-local$/mu,
      },
      {
        description: "exclude validation-rehearsal artifacts",
        pattern: /^validation-rehearsal$/mu,
      },
      {
        description: "exclude Codex temp workspace artifacts",
        pattern: /^\.codex-temp$/mu,
      },
      {
        description: "exclude per-app dist artifacts",
        pattern: /^apps\/\*\/dist$/mu,
      },
      {
        description: "exclude the web app from backend image builds",
        pattern: /^apps\/web$/mu,
      },
      {
        description: "exclude docs from backend image builds",
        pattern: /^docs$/mu,
      },
    ],
  },
  {
    filePath: "docs/RELEASE_RUNBOOK.md",
    label: "docs/RELEASE_RUNBOOK.md",
    checks: [
      {
        description: "release rehearsal env preparation command",
        pattern: /pnpm run backend:release:env:prepare/u,
      },
      {
        description: "validation repo test command",
        pattern: /pnpm run validation:repo:test/u,
      },
      {
        description: "compose env-file invocation for local release rehearsal",
        pattern: /docker compose --env-file \$env:ARENA_ENV_FILE -f docker-compose\.prod\.yml/u,
      },
      {
        description: "host preflight command",
        pattern: /pnpm run backend:release:host:check/u,
      },
      {
        description: "host recovery command",
        pattern: /pnpm run backend:release:host:recover -- --clean-safe-caches --restart-docker --wait-for-docker-ms 180000/u,
      },
      {
        description: "runtime-contract operator proof command",
        pattern: /pnpm run backend:release:proof:operator -- --env-file <path-to-release-env> --base-url <https:\/\/host>/u,
      },
      {
        description: "local release rehearsal command",
        pattern: /pnpm run backend:release:rehearse:local/u,
      },
      {
        description: "external release rehearsal command",
        pattern: /pnpm run backend:release:rehearse:external -- --env-file <path-to-release-env> --base-url <https:\/\/host> --auth-token <operator-token> --proposition-id <id>/u,
      },
      {
        description: "external release evidence command",
        pattern: /pnpm run backend:release:evidence:external -- --env-file <path-to-release-env> --previous-env <path-to-previous-env> --base-url <https:\/\/host> --auth-token <operator-token> --proposition-id <id> --yes/u,
      },
      {
        description: "local release rehearsal up command without compose dependencies",
        pattern: /docker compose --env-file \$env:ARENA_ENV_FILE -f docker-compose\.prod\.yml up -d --no-deps api scheduler-worker nginx/u,
      },
      {
        description: "runtime contract smoke check",
        pattern: /GET \/arena\/internal\/monitoring\/runtime-contract/u,
      },
      {
        description: "scheduler worker container health inspection",
        pattern: /docker compose --env-file \$env:ARENA_ENV_FILE -f docker-compose\.prod\.yml ps scheduler-worker/u,
      },
      {
        description: "release readiness command",
        pattern: /pnpm run backend:release:check -- --base-url <url> --auth-token <operator-token>/u,
      },
      {
        description: "rollback section",
        pattern: /^## Rollback$/mu,
      },
      {
        description: "database backup command",
        pattern: /pnpm run backend:db:backup/u,
      },
      {
        description: "database restore command",
        pattern: /pnpm run backend:db:restore/u,
      },
      {
        description: "database rollback rehearsal command",
        pattern: /pnpm run backend:db:rollback:rehearse/u,
      },
      {
        description: "secret rotation check command",
        pattern: /pnpm run backend:secrets:rotate:check/u,
      },
      {
        description: "production dependency audit command",
        pattern: /pnpm run backend:security:audit:prod/u,
      },
      {
        description: "full dependency audit command",
        pattern: /pnpm run backend:security:audit:all/u,
      },
    ],
  },
  {
    filePath: "ops/nginx/arena.conf",
    label: "ops/nginx/arena.conf",
    checks: [
      {
        description: "proxy to API container",
        pattern: /proxy_pass http:\/\/api:4000;/u,
      },
    ],
  },
];

async function checkBackendReleaseRepoContract(options = {}) {
  const cwd = options.cwd || process.cwd();
  const logger = options.logger || { fail, info, pass };
  const failures = [];

  for (const filePath of REQUIRED_FILES) {
    const absolutePath = path.resolve(cwd, filePath);
    if (!fs.existsSync(absolutePath)) {
      failures.push(`Missing file: ${filePath}`);
    }
  }

  for (const rule of REQUIRED_RULES) {
    const absolutePath = path.resolve(cwd, rule.filePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    const contents = fs.readFileSync(absolutePath, "utf8");

    for (const check of rule.checks) {
      if (!check.pattern.test(contents)) {
        failures.push(`${rule.label} is missing: ${check.description}`);
      }
    }

    for (const customCheck of rule.customChecks || []) {
      const failure = customCheck(contents);
      if (failure) {
        failures.push(`${rule.label} ${failure}`);
      }
    }
  }

  if (failures.length > 0) {
    logger.fail("Backend release repo contract is incomplete.");
    logger.info("Repo-side release contract gaps:");
    for (const failure of failures) {
      logger.info(`- ${failure}`);
    }
    return 1;
  }

  logger.info(
    "Validated repo-side release assets, CI gate, and rehearsal documentation.",
  );
  logger.pass("Backend release repo contract passed.");
  return 0;
}

async function main() {
  const exitCode = await checkBackendReleaseRepoContract();
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  checkBackendReleaseRepoContract,
};
