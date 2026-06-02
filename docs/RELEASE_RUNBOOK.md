# Arena Release Runbook

`Updated`: 2026-06-02  
`Scope`: Phase 2 release pipeline minimum viable contract

## Runtime shape

The backend production shape is now split into two process roles:

- `ARENA_PROCESS_ROLE=api`
  - serves HTTP traffic
  - exposes `/health/live`, `/health/ready`, and internal operator routes
- `ARENA_PROCESS_ROLE=worker`
  - runs scheduler cron jobs
  - consumes BullMQ queues
  - does not listen on the public HTTP port
  - reports container health through the Redis-backed scheduler worker heartbeat instead of the API `/health/live` endpoint

This avoids duplicate scheduler/worker execution when the backend is deployed as multiple containers.

## Required files

- backend image: `apps/api/Dockerfile`
- compose entrypoint: `docker-compose.prod.yml`
- reverse proxy config: `ops/nginx/arena.conf`
- CI gate: `.github/workflows/backend-release.yml`
- backend runtime contract: `docs/contracts/arena-backend-release-runbook.md`

## Repo-side CI gate

The GitHub release workflow should verify the repo-side release contract, not try
to perform a full local bring-up inside CI.

Current CI intent:

- `pnpm run shared:test`
- `pnpm run api:typecheck`
- `pnpm --filter @arena/api test:arena`
- `pnpm --filter @arena/api test:validation-chain`
- `pnpm run backend:build`
- `pnpm run backend:release:repo:test`
- `pnpm run backend:release:repo:check`
- `docker build -f apps/api/Dockerfile -t arena-api:<sha> .`

Environment-backed rehearsal stays separate:

- local workstation: `pnpm run backend:release:env:prepare` + `docker compose ...`
- clean VM / staging machine: full release rehearsal and smoke checks

## Secrets and env rollout

Prepare `.env.prod` outside the image with production values for:

- `NODE_ENV=production`
- `ARENA_PROCESS_ROLE`
- `PORT=4000`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `AUTH_CHALLENGE_TTL`
- `RPC_URL`
- `CHAIN_ID`
- `ARENA_CONTRACT_ADDRESS`
- `ARENA_VALIDATION_ENVIRONMENT`
- `ARENA_VALIDATION_CONTRACT_ADDRESS`
- `ARENA_VALIDATION_SYNC_CONFIRMATIONS`
- `ARENA_VALIDATION_SYNC_BATCH_SIZE`
- `ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS`
- `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY`
- `ARENA_VALIDATION_ORACLE_PRIVATE_KEY`
- `ARENA_VALIDATION_PAUSER_PRIVATE_KEY`
- optional webhook and role address mappings
- optional image overrides:
  - `ARENA_BUILDER_IMAGE`
  - `ARENA_RUNTIME_IMAGE`

Do not bake `.env.prod` or secrets into the Docker image.

For local release rehearsal against the checked-out repo, generate a compose-safe
env file from the current `.env` first:

1. `pnpm run backend:release:env:prepare`
2. `pnpm run backend:release:host:check`
3. use `ARENA_ENV_FILE=<absolute path to validation-local/release-rehearsal.env>`

That rehearsal env keeps the app secrets in a file, but also rewrites the app
runtime dependencies to container-safe host service addresses:

- `COMPOSE_PROJECT_NAME=<repo>-release-rehearsal`
- `ARENA_COMPOSE_DATABASE_URL=postgresql://arena:arena@host.docker.internal:5432/...`
- `ARENA_COMPOSE_REDIS_URL=redis://host.docker.internal:6379/0`
- `ARENA_COMPOSE_RPC_URL=http://host.docker.internal:8545`

This lets the API and worker containers use the same host Postgres / Redis /
Hardhat dependencies that the checked-out repo already uses for local bring-up,
so host-side migration commands and container-side runtime checks describe the
same environment during rehearsal.

The generated `COMPOSE_PROJECT_NAME` keeps the release rehearsal stack isolated
from the default `docker-compose.yml` local dependency stack, so `docker compose
... down` on the rehearsal path does not accidentally tear down the host
Postgres / Redis containers used by local development.

If Docker Hub access is degraded, override the builder image without editing the
Dockerfile itself:

- keep `ARENA_RUNTIME_IMAGE` on the GCR distroless runtime unless you need a different runtime base
- set `ARENA_BUILDER_IMAGE` to a reachable Node 22 builder image mirror before `docker compose build`

## Deploy order

1. `docker compose -f docker-compose.prod.yml --env-file .env.prod build`
2. ensure the target Postgres / Redis / RPC dependencies are reachable
3. `pnpm run api:prisma:deploy`
4. `pnpm run validation:db:deploy`
5. `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d api scheduler-worker nginx`

Local release rehearsal uses the same order, but with:

```powershell
$env:ARENA_ENV_FILE='F:/arena_blockchain/validation-local/release-rehearsal.env'
pnpm run backend:release:rehearse:local
```

That script expands to the same guarded local sequence:

```powershell
pnpm run backend:release:host:check
pnpm run validation:prepare:local
pnpm run api:prisma:deploy
pnpm run validation:db:deploy
docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml down --remove-orphans
docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml build
docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml up -d --no-deps api scheduler-worker nginx
```

On this Windows setup, the absolute forward-slash path is the reliable form for
`ARENA_ENV_FILE`; a relative path did not resolve consistently through Docker
Compose.

## Smoke checks

Run these after deployment:

1. `GET /health/live`
2. `GET /health/ready`
3. `GET /system/queues/overview`
4. `GET /arena/internal/monitoring/runtime-contract`
5. `docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml ps scheduler-worker`
6. `pnpm run backend:release:check -- --base-url <url> --auth-token <operator-token>`

For a validation-enabled environment, also rerun one proposition proof closure when practical.

For local release rehearsal, also verify:

- `docker compose -f docker-compose.prod.yml config` resolves successfully with `ARENA_ENV_FILE=validation-local/release-rehearsal.env`
- `docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml config` resolves successfully
- `pnpm run backend:release:host:check` passes before starting the build
- the host `validation:prepare:local` dependencies are up before starting the release containers
- the API container can reach `host.docker.internal:5432`, `host.docker.internal:6379`, and `host.docker.internal:8545`
- local release `up` uses `--no-deps` so the isolated rehearsal stack does not start a second Docker-managed Postgres or Redis when the host dependencies are already the source of truth

## Zero-downtime / restart note

- restart `scheduler-worker` first when only worker code/config changed
- restart `api` after worker is healthy
- keep Redis and Postgres intact across deploys
- migrations should be applied before replacing API/worker containers

## Rollback

1. stop new `api` and `scheduler-worker` containers
2. bring up the previous tagged image with the same `.env.prod`
3. rerun `/health/ready` and `backend:release:check`
4. if the failure is migration-related, stop and inspect manually before any schema rollback
