# Arena API Local Development

This backend layer stays intentionally small for now: Prisma for the database
baseline, Redis for auth and queue plumbing, and a local Hardhat RPC for chain
readiness.

## Prerequisites

- Docker Desktop with `docker compose`
- Node.js 18+
- `pnpm`

## 1. Prepare environment

Copy the root env sample and adjust secrets if needed:

```bash
cp .env.example .env
```

The default values already match [docker-compose.yml](/E:/Arena/docker-compose.yml).

## 2. Start local dependencies

Start Postgres and Redis:

```bash
pnpm deps:up
```

Start a local Hardhat RPC in a separate terminal:

```bash
pnpm exec hardhat node
```

The API readiness check expects:

- Postgres at `DATABASE_URL`
- Redis at `REDIS_URL`
- JSON-RPC at `RPC_URL`
- `CHAIN_ID=1337` for the root local Hardhat network in [hardhat.config.js](/E:/Arena/hardhat.config.js)
- a compiled root Hardhat artifact at `artifacts/contracts/Arena.sol/Arena.json`

## 3. Apply Prisma migrations

Generate the Prisma client and apply local migrations:

```bash
pnpm api:prisma:migrate
```

For non-interactive environments, use:

```bash
pnpm api:prisma:deploy
```

## 4. Start the API

Development mode:

```bash
pnpm api:dev
```

Production-style local run:

```bash
pnpm api:build
pnpm api:start
```

## Health endpoints

- `GET /health/live` returns `200` once the Nest process is up.
- `GET /health/ready` returns `200` only when database, Redis, and RPC are all
  reachable and the baseline Prisma migration is present.
- `GET /health/ready` returns `503` with dependency details when one or more
  dependencies are unavailable.

## Request tracing

- Every request receives an `x-request-id`.
- `x-trace-id` is accepted from callers and echoed back. When absent it falls
  back to the request id.
- The same ids are emitted in request logs and structured error responses.

## Queue and RBAC smoke tests

- `POST /system/jobs/ping`
  Requires any authenticated JWT and exercises the demo system queue.
- `POST /system/jobs/demo-failure`
  Requires `admin` or `system` role and intentionally drives retry / failed
  handling for the demo queue path.
- `GET /system/queues/overview`
  Requires `operator`, `admin`, or `system` role and returns Redis plus queue
  availability and job counts.
- `GET /system/admin/ping`
  Requires `admin` or `system` role and is the simplest RBAC smoke test route.

Wallet role assignment is environment-driven:

- `OPERATOR_WALLET_ADDRESSES`
- `ADMIN_WALLET_ADDRESSES`
- `SYSTEM_WALLET_ADDRESSES`

## CI-aligned local checks

The recommended local check order now matches CI:

```bash
pnpm run check
pnpm run shared:test
pnpm run api:typecheck
pnpm run api:build
```
