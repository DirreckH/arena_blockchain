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

- local consolidated repo-side MVP gate before external rehearsal:
  - `pnpm run api:test:mvp-repo`
  - includes:
- `pnpm run api:test:identity`
  - covers the main repo-side user-identity boundaries, including requester self, respondent account, respondent rewards, discussion, leaderboard, and related public-surface regressions
- `pnpm run api:test:payout-release`
    - `pnpm run api:test:hardening`
    - `pnpm run validation:repo:test`
    - `pnpm run backend:release:repo:test`
- `pnpm run shared:test`
- `pnpm run api:typecheck`
- `pnpm --filter @arena/api test:arena`
- `pnpm --filter @arena/api test:validation-chain`
- `pnpm run validation:repo:test`
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

Before every staging/prod promotion, compare the new env against the previous
secret set and store only the fingerprinted audit artifact:

```powershell
pnpm run backend:secrets:rotate:check -- --previous-env <path-to-previous-env> --current-env <path-to-release-env>
```

This audit checks that JWT, on-chain signers, payout signer, operator bearer
token, and configured webhook bearer tokens have actually rotated. The emitted
report contains SHA-256 fingerprints only, never the raw secret values.

To materialize the external closure input packet on the current machine before
real values are filled, generate the local staging templates and manifest:

```powershell
pnpm run backend:closure:materials:fill
pnpm run backend:closure:inputs:prepare
```

`backend:closure:materials:fill` now also discovers non-local legacy deploy
artifacts under `validation-rehearsal/deployments/deployment.legacy.<network>.json`
and uses them to hydrate `ARENA_CONTRACT_ADDRESS` when the root `deployment.json`
is only a local placeholder.

That command creates local-only files for:

- `config/staging.env`
- `config/staging.previous.env`
- `config/staging.closure-inputs.json`

The manifest records the canonical env paths, the target `validation:deploy`
network name, the operator token source contract, the current latest local proof
proposition candidate, and the exact external evidence command shape that should
be used after the real staging/testnet values are filled. It also records:

- current release env keys still missing real values
- previous release env keys still missing real values
- public GitHub/Vercel base-url candidates discovered from the repo metadata
- a `recommendedBaseUrlCandidate` when discovery can rank one host above the others

If you want the helper to spend extra time probing those public host candidates
for unauthenticated route hints on the current machine, run:

```powershell
pnpm run backend:closure:inputs:prepare -- --probe-public-hosts
```

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
3. `pnpm run api:prisma:deploy -- --env-file .env.prod`
4. `pnpm run validation:db:deploy -- --env-file .env.prod`
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
pnpm run api:prisma:deploy -- --env-file $env:ARENA_ENV_FILE
pnpm run validation:db:deploy -- --env-file $env:ARENA_ENV_FILE
docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml down --remove-orphans
docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml build
docker compose --env-file $env:ARENA_ENV_FILE -f docker-compose.prod.yml up -d --no-deps api scheduler-worker nginx
```

On this Windows setup, the absolute forward-slash path is the reliable form for
`ARENA_ENV_FILE`; a relative path did not resolve consistently through Docker
Compose.

For a clean VM / staging machine where the backend is already booted outside the
repo's local Docker rehearsal path, use the same script in external mode:

```powershell
pnpm run backend:release:rehearse:local -- --mode external --env-file <path-to-release-env> --base-url <https://host> --auth-token <operator-token> --proposition-id <id>
pnpm run backend:release:rehearse:external -- --env-file <path-to-release-env> --base-url <https://host> --auth-token <operator-token> --proposition-id <id>
pnpm run backend:release:evidence:external -- --env-file <path-to-release-env> --previous-env <path-to-previous-env> --base-url <https://host> --auth-token <operator-token> --proposition-id <id> --yes
```

That external mode intentionally skips local `docker compose` and instead
executes the proposition-proof sequence against the running environment:

```powershell
pnpm run backend:release:host:check -- --env-file <path-to-release-env>
pnpm run backend:release:check -- --base-url <https://host> --auth-token <operator-token>
pnpm run validation:ops:brief -- --proposition-id <id> --env-file <path-to-release-env> --base-url <https://host> --auth-token <operator-token>
pnpm run validation:proof:capture -- --proposition-id <id> --env-file <path-to-release-env> --base-url <https://host> --auth-token <operator-token>
```

Treat `backend:release:rehearse:external` as the minimum external proposition
proof entrypoint, and `backend:release:evidence:external` as the canonical
one-shot release evidence path when you want the same staging / clean-VM run to
also archive the surrounding operator evidence in one summary artifact.

The one-shot evidence command wraps the external rehearsal above and can also
optionally include:

- `--operator-monitoring-proof`
- `--validation-preflight`
- `--validation-deploy`
- `--validation-network <name>`
- database rollback rehearsal evidence
- secret rotation audit evidence
- dependency audit evidence

By default it writes the consolidated summary to:

- `validation-rehearsal/<propositionId>/external-release-evidence-summary.json`

Use that one-shot path for the real `N3/N4/N8/N10/N11` non-local evidence
bundle once the target host is healthy and the release env + previous env are
both available.

If that command is running on the same host that can directly control the
staged `docker compose` stack, prefer:

```powershell
pnpm run backend:release:rehearse:external -- --env-file <path-to-release-env> --base-url <https://host> --auth-token <operator-token> --proposition-id <id> --operator-monitoring-proof
```

That keeps the proposition proof flow above, and also captures
`validation-local/runtime-contract-operator-proof.json` in the same evidence
run so the final archive already contains the degraded -> recovered
runtime-contract operator proof.

Use that path for the real `N4` proof run after staging or the clean VM has:

- real non-local env vars
- a healthy runtime contract
- one target proposition ready for proof capture

For a non-local promotion, also capture the operator-authenticated degraded ->
recovered runtime-contract proof once the environment is otherwise healthy:

```powershell
pnpm run backend:release:proof:operator -- --env-file <path-to-release-env> --base-url <https://host>
```

That command now also reprints the same-environment proposition follow-up
commands so operators can move directly into:

- `pnpm run validation:ops:brief -- --proposition-id <id> --env-file <path-to-release-env> --base-url <https://host> --auth-token <operator-token>`
- `pnpm run validation:proof:capture -- --proposition-id <id> --env-file <path-to-release-env> --base-url <https://host> --auth-token <operator-token>`

The follow-up hints intentionally print `<operator-token>` instead of the real
bearer token so release logs and copied terminal output do not leak secrets.
The same placeholder rule also applies to rerun guidance from the external
rehearsal wrappers, even when the original token was loaded from the env file.

Archive the resulting `validation-local/runtime-contract-operator-proof.json`
alongside the proposition-scoped `validation-rehearsal/<id>/` proof artifacts.

If host preflight is blocked by low `C:` space or an unhealthy Docker Desktop /
WSL stack on the current machine, run the recovery helper before retrying the
rehearsal:

```powershell
pnpm run backend:release:host:recover -- --clean-safe-caches --restart-docker --wait-for-docker-ms 180000
pnpm run backend:release:host:check -- --env-file <path-to-release-env>
```

That recovery path is the canonical repo-side `N3/N4` response when the host is
the blocker rather than the release env itself.

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

## Database backup and rollback rehearsal

Treat Postgres backup and restore as the only supported schema rollback path for
MVP release work. Prisma deploy remains one-way in this repo; do not invent ad
hoc reverse SQL during an incident.

Before any staging/prod migration window:

1. capture a restorable snapshot

```powershell
pnpm run backend:db:backup -- --env-file <path-to-release-env> --output validation-rehearsal/db-backups/<timestamp>.dump
```

2. prove that the migration sequence plus restore path is executable

```powershell
pnpm run backend:db:rollback:rehearse -- --env-file <path-to-release-env> --yes
```

3. if recovery is required, restore from the captured snapshot instead of
   attempting a manual down migration

```powershell
pnpm run backend:db:restore -- --env-file <path-to-release-env> --input <path-to-backup.dump> --yes
```

The backup script writes a sibling metadata file (`<backup>.json`) with the
masked target connection and schema details so operators can verify they are
restoring the intended snapshot.

## Security audit

Before release sign-off, run both dependency audit scopes and keep the reports
with the release evidence:

```powershell
pnpm run backend:security:audit:prod
pnpm run backend:security:audit:all
```

- `backend:security:audit:prod` is the production release gate.
- `backend:security:audit:all` keeps toolchain/dev vulnerabilities visible even
  when they do not ship in the runtime image.

If a dependency audit still fails, document the advisory IDs, package paths, and
mitigation/upgrade plan before promotion.

## Rollback

1. stop new `api` and `scheduler-worker` containers
2. bring up the previous tagged image with the same `.env.prod`
3. restore the pre-deploy Postgres snapshot:

```powershell
pnpm run backend:db:restore -- --env-file <path-to-release-env> --input <path-to-backup.dump> --yes
```

4. rerun `/health/ready` and `backend:release:check`
5. if restore fails, stop promotion and treat the database recovery path itself
   as the release blocker
