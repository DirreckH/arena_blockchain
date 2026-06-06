# Arena Backend Release Runbook

`Scope`: backend deployment + validation-chain runtime contract

This runbook turns the existing backend runtime contract into one repeatable release check. Use it when promoting a real environment, verifying a local operator stack, or diagnosing why `GET /arena/internal/monitoring/runtime-contract` is still blocked.

## 1. Required configuration

The backend env schema currently requires these core values before the API can boot:

- `NODE_ENV`
- `PORT`
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

Optional but operationally relevant values:

- `REQUESTER_DELIVERY_WEBHOOK_BEARER_TOKENS`
- `OPERATOR_WALLET_ADDRESSES`
- `ADMIN_WALLET_ADDRESSES`
- `SYSTEM_WALLET_ADDRESSES`

Repo-side operator helpers also use:

- `ARENA_INTERNAL_API_BASE_URL`
- `ARENA_INTERNAL_OPERATOR_BEARER_TOKEN`

For `ARENA_VALIDATION_ENVIRONMENT=local`, `pnpm run validation:bootstrap:local`
now seeds `ARENA_INTERNAL_OPERATOR_BEARER_TOKEN` into `.env` using the same
JWT payload shape the backend expects for operator/admin identities. That keeps
plain `pnpm run backend:release:check` aligned with the local bootstrap contract
instead of requiring a second manual token step before runtime-contract checks.

## 2. Canonical release check

Against a running backend, use:

```powershell
pnpm run backend:release:check -- --auth-token <operator-bearer-token> --base-url <http://host:port>
```

Behavior:

- fetches `GET /arena/internal/monitoring/runtime-contract`
- writes the snapshot to `backend-release-readiness.json` by default
- prints environment, release gate status, blocking dependencies, blocked gate commands, and validation-specific operator remediation
- exits `0` when `releaseReadiness.status=ready`
- exits `1` when `releaseReadiness.status=blocked`

For local operator work, the same command can reuse `.env` values:

```powershell
pnpm run backend:release:check
```

That local shortcut assumes the repo `.env` was bootstrapped through
`pnpm run validation:bootstrap:local` or otherwise already contains a valid
`ARENA_INTERNAL_OPERATOR_BEARER_TOKEN`.

## 3. Release sequence

Use this order for the current backend contract:

1. Populate env vars and secrets.
2. Install dependencies:

```powershell
pnpm install
```

3. Build shared + API artifacts:

```powershell
pnpm run backend:build
```

4. Apply database migrations in repo order:

```powershell
pnpm run api:prisma:deploy
pnpm run validation:db:deploy
pnpm run validation:db:status
```

5. Start the backend and scheduler-backed runtime:

```powershell
pnpm run api:start
```

6. Check public and internal readiness:

```text
GET /health/live
GET /health/ready
GET /system/queues/overview
GET /arena/internal/monitoring/validation-chain/runtime-readiness
GET /arena/internal/monitoring/runtime-contract
```

7. Run the canonical repo-side release check:

```powershell
pnpm run backend:release:check -- --auth-token <operator-bearer-token> --base-url <http://host:port>
```

Do not treat a green `live` check as sufficient. The current deployment contract requires `releaseReadiness.status=ready`.

## 4. Gate interpretation

`releaseChecklist` currently models these backend gates:

- `env`: required config is present and validation preflight can run.
- `database`: API + validation migrations are applied.
- `build`: backend artifacts are built.
- `readiness`: public readiness, scheduler queue, and validation runtime-readiness all look healthy enough to accept traffic.
- `validation-runtime`: appears only when validation-chain runtime dependencies are degraded.

`releaseReadiness.blockingDependencies` is the canonical list of unresolved blockers. Use it as the operator truth, not just the top-level `status`.

## 5. Blocking dependency mapping

When `backend:release:check` fails, reconcile the blocker against the runtime contract:

- `env`
  - Run `pnpm run validation:env:check`.
  - Fix missing or invalid env values first.

- `database`
  - Run `pnpm run api:prisma:deploy`.
  - Run `pnpm run validation:db:deploy`.
  - Confirm with `pnpm run validation:db:status`.

- `redis`
  - Restore `REDIS_URL` connectivity.
  - Recheck `/system/queues/overview` and validation runtime-readiness.

- `scheduler_queue`
  - Inspect `GET /system/queues/overview`.
  - Treat a paused or disconnected scheduler queue as release-blocking.

- `rpc`
  - Restore RPC connectivity.
  - Confirm `CHAIN_ID` matches the provider.
  - Rerun `pnpm run validation:chain:check`.

- `arena_artifact` or `validation_artifact`
  - Rebuild artifacts with `pnpm exec hardhat compile`.

- `validation_contract`
  - Confirm `ARENA_VALIDATION_CONTRACT_ADDRESS` points to a deployed contract on the configured chain.
  - Rerun `pnpm run validation:chain:check`.

- `validation_contract_code`
  - Deploy or repoint the validation contract, then rerun `pnpm run validation:chain:check`.

- `validation_contract_bytecode`
  - Recompile and redeploy the validation contract when on-chain runtime bytecode drifts from the local artifact.

- `validation_operator_signer`, `validation_oracle_signer`, `validation_pauser_signer`
  - Fund the signer.
  - Grant the required on-chain role.
  - Rerun `pnpm run validation:chain:check`.

The runtime contract already returns dependency-specific `operatorActions`. Prefer those commands over ad hoc recovery.

## 6. Local validation note

For `ARENA_VALIDATION_ENVIRONMENT=local`, use the local bootstrap wrapper before treating lower-level validation checks as meaningful:

```powershell
pnpm run validation:prepare:local
```

That command is expected to fail honestly when Docker/Postgres/Redis or the local Hardhat RPC are unavailable. In that case, use the emitted remediation, then rerun:

```powershell
pnpm run validation:deps:check
pnpm run validation:chain:check
pnpm run backend:release:check
```

The local prepare wrapper now distinguishes between dependency failures it can
continue through and failures that still require operator action:

- if `deps:up` fails but Postgres and Redis are already reachable, and only the
  local RPC is missing, the wrapper continues and tries to start Hardhat
  automatically
- if Postgres or Redis are still unavailable, the wrapper stops and preserves
  the current explicit remediation output instead of pretending the local stack
  is ready

If you want the repo to also start the backend process and prove the backend
runtime contract in the same local flow, use:

```powershell
pnpm run backend:prepare:local
```

That wrapper:

- runs `pnpm run validation:prepare:local`
- reuses an already-running local backend when `/health/live` already responds
- otherwise builds the backend, starts `pnpm run api:start` in the background, and writes logs to `validation-local/backend-api.log`
- waits for `GET /health/live` and `GET /health/ready`
- runs `pnpm run backend:release:check`

Use this path when the next step is proposition rehearsal or proposition-scoped
proof capture and you want the local backend process plus runtime-contract check
to be part of one executable A-track bring-up.

## 7. Proposition proof note

For proposition-scoped public proof after an environment-backed rehearsal, the
repo now exposes two public-surface checks plus one combined verdict:

```powershell
pnpm run validation:public-results:check -- --proposition-id <id> [--base-url <url>]
pnpm run validation:public-integrity:check -- --proposition-id <id> [--base-url <url>]
pnpm run validation:proof:capture -- --proposition-id <id> --auth-token <token> [--base-url <url>]
```

`validation:proof:capture` now treats proposition proof as complete only when
all four surfaces align:

- backend `releaseReadiness.status=ready`
- internal proposition rehearsal `status=ready`
- proposition is visible in `GET /arena/public/results/settled`
- proposition is visible in `GET /arena/public/integrity/overview?propositionId=<id>`

## 8. Unified operator briefing

For one proposition-scoped operator entrypoint that bridges release gating,
runtime hardening, beta proof, and internal operating follow-through, use:

```powershell
pnpm run validation:ops:brief -- --proposition-id <id> [--base-url <url>] [--auth-token <token>]
```

Behavior:

- writes one proposition-scoped operator artifact to
  `validation-rehearsal/<id>/operator-briefing.json`
- refreshes the backing artifacts that the operator path depends on:
  - `backend-release-readiness.json`
  - `validation-chain-monitoring.json`
  - `evidence-bundle.json`
  - `public-settled-result.json`
  - `public-integrity-overview.json`
- prioritizes the current operator focus in this order:
  - release readiness
  - validation-chain runtime health
  - proposition rehearsal / recovery follow-through
  - public beta proof visibility
- exits `0` only when the current proposition is green across the four no-B-track
  lanes:
  - `A-track`: release + operations closure
  - `A-track`: core runtime hardening
  - `A+B`: MVP beta gate
  - `A+B`: internal operations closure
