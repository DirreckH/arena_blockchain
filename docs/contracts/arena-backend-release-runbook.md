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

For non-local promotion, reward payout is now part of the release contract as
well. Treat these as required outside `ARENA_VALIDATION_ENVIRONMENT=local`:

- `ARENA_REWARD_PAYOUT_ERC20_ADDRESS`
- `ARENA_REWARD_PAYOUT_OPERATOR_PRIVATE_KEY`

For secret rotation evidence, also keep access to:

- the previous release env or secret export used as the comparison baseline
- the current release env or secret export promoted in this window

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

## 3. Host preflight modes

Use the host preflight before promoting containers or treating a release env as
deployable:

```powershell
pnpm run backend:release:host:check -- --env-file <path-to-release-env>
```

Default behavior is now strict and intended for real staging/prod promotion.
It blocks these local-only leftovers:

- `ARENA_VALIDATION_ENVIRONMENT=local`
- `RPC_URL` or `ARENA_COMPOSE_RPC_URL` pointing at `localhost`, `127.0.0.1`,
  `::1`, `0.0.0.0`, or `host.docker.internal`
- placeholder contract/token addresses such as
  `0x0000000000000000000000000000000000000001`,
  `0x0000000000000000000000000000000000000002`, or
  `0x0000000000000000000000000000000000000010`
- the local Hardhat bootstrap signer being reused for validation or payout keys

For repo-side Docker rehearsal only, opt in explicitly:

```powershell
pnpm run backend:release:host:check -- --allow-local-rehearsal --env-file validation-local/release-rehearsal.env
```

`pnpm run backend:release:rehearse:local` now passes that override
automatically. Do not reuse `--allow-local-rehearsal` for external staging or
prod hosts.

When the blocker is the Windows host itself rather than the release env, recover
that machine before retrying release preflight:

```powershell
pnpm run backend:release:host:recover -- --clean-safe-caches --restart-docker --wait-for-docker-ms 180000
pnpm run backend:release:host:check -- --env-file <path-to-release-env>
```

Use that helper when Docker Desktop, WSL state, or low `C:` capacity prevents a
clean VM / staging rehearsal from starting at all.

For a real staging host or clean VM that is already booted outside the repo's
local Docker rehearsal path, hydrate the closure env packet first when needed:

```powershell
pnpm run backend:closure:materials:fill
pnpm run backend:closure:inputs:prepare
```

That helper path now also recognizes non-local legacy deploy artifacts at
`validation-rehearsal/deployments/deployment.legacy.<network>.json` so
`ARENA_CONTRACT_ADDRESS` can follow the canonical `pnpm run legacy:deploy`
output instead of depending only on the root `deployment.json`.

Then use the dedicated external wrapper instead:

```powershell
pnpm run backend:release:rehearse:external -- --env-file <path-to-release-env> --base-url <https://host> --auth-token <operator-token> --proposition-id <id>
pnpm run backend:release:evidence:external -- --env-file <path-to-release-env> --previous-env <path-to-previous-env> --base-url <https://host> --auth-token <operator-token> --proposition-id <id> --yes
```

That external path keeps the strict non-local host preflight, then runs:

- `pnpm run backend:release:check -- --base-url <https://host> --auth-token <operator-token>`
- `pnpm run validation:ops:brief -- --proposition-id <id> --env-file <path-to-release-env> --base-url <https://host> --auth-token <operator-token>`
- `pnpm run validation:proof:capture -- --proposition-id <id> --env-file <path-to-release-env> --base-url <https://host> --auth-token <operator-token>`

If the same command is running on the host that can directly control the staged
`docker compose` stack, append:

- `--operator-monitoring-proof`
  - run `pnpm run backend:release:proof:operator -- --env-file <path-to-release-env> --base-url <https://host>`
  - capture the degraded -> recovered scheduler-worker runtime-contract proof in the same evidence run
  - include `validation-local/runtime-contract-operator-proof.json` in the final proof archive alongside `validation-rehearsal/<id>/`

When `backend:release:check` still reports a blocked contract, prefer its emitted
`Suggested rerun commands after remediation` block over inventing ad hoc follow-up
commands. The script now reprints the canonical release-check rerun and, when a
stored proof record already names the target proposition, the matching
`validation:proof:capture` rerun as well.

If the same external rehearsal also needs to preflight and redeploy the
validation contract first, append:

- `--validation-preflight`
  - run `pnpm run validation:preflight -- --env-file <path-to-release-env>`
- `--validation-deploy`
  - run `pnpm run validation:preflight -- --env-file <path-to-release-env> --deploy-validation --network validation`
- `--validation-network <name>`
  - override the default non-local Hardhat alias when `--validation-deploy` should target something other than `validation`

Treat `backend:release:rehearse:external` as the minimum external proposition
proof entrypoint, and `backend:release:evidence:external` as the canonical
one-shot non-local evidence bundle path when the same run should also capture
operator monitoring proof, validation deploy/preflight evidence, rollback
rehearsal evidence, secret rotation evidence, and dependency audit evidence in
one summary artifact.

Use the one-shot path for the real `N3/N4/N8/N10/N11` clean-VM / staging
evidence bundle once the target host is healthy and both the staged release env
and previous env are available. The summary artifact defaults to:

- `validation-rehearsal/<id>/external-release-evidence-summary.json`

Use the minimum external wrapper when only proposition proof capture is needed.
The script can
reuse `ARENA_INTERNAL_OPERATOR_BEARER_TOKEN` from the supplied `--env-file`, so
`--auth-token` is optional only when that env file already contains the staged
operator bearer token.

Once the environment is otherwise healthy, also capture the operator-authenticated
degraded -> recovered runtime-contract proof:

```powershell
pnpm run backend:release:proof:operator -- --env-file <path-to-release-env> --base-url <https://host>
```

That command now also reprints the same-environment proposition follow-up
commands so operators can move directly into:

- `pnpm run validation:ops:brief -- --proposition-id <id> --env-file <path-to-release-env> --base-url <https://host> --auth-token <operator-token>`
- `pnpm run validation:proof:capture -- --proposition-id <id> --env-file <path-to-release-env> --base-url <https://host> --auth-token <operator-token>`

Archive the resulting `validation-local/runtime-contract-operator-proof.json`
alongside the matching proposition-scoped `validation-rehearsal/<id>/` proof
artifacts.

## 4. Release sequence

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
pnpm run api:prisma:deploy -- --env-file <path-to-release-env>
pnpm run validation:db:deploy -- --env-file <path-to-release-env>
pnpm run validation:db:status -- --env-file <path-to-release-env>
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

8. Run strict host preflight against the final release env before promotion:

```powershell
pnpm run backend:release:host:check -- --env-file <path-to-release-env>
```

9. Capture a restorable database snapshot and prove the rollback drill before a
   migration-bearing promotion:

```powershell
pnpm run backend:db:backup -- --env-file <path-to-release-env> --output validation-rehearsal/db-backups/<timestamp>.dump
pnpm run backend:db:rollback:rehearse -- --env-file <path-to-release-env> --yes
```

10. Verify secret rotation and dependency audit evidence:

```powershell
pnpm run backend:secrets:rotate:check -- --previous-env <path-to-previous-env> --current-env <path-to-release-env>
pnpm run backend:security:audit:prod
pnpm run backend:security:audit:all
```

Do not treat a green `live` check as sufficient. The current deployment contract requires `releaseReadiness.status=ready`.

## 5. Gate interpretation

`releaseChecklist` currently models these backend gates:

- `env`: required config is present and validation preflight can run.
- `database`: API + validation migrations are applied.
- `build`: backend artifacts are built.
- `readiness`: public readiness, scheduler queue, and validation runtime-readiness all look healthy enough to accept traffic.
- `validation-runtime`: appears only when validation-chain runtime dependencies are degraded.

`releaseReadiness.blockingDependencies` is the canonical list of unresolved blockers. Use it as the operator truth, not just the top-level `status`.

## 6. Blocking dependency mapping

When `backend:release:check` fails, reconcile the blocker against the runtime contract:

- `env`
  - Run `pnpm run validation:env:check`.
  - Fix missing or invalid env values first.

- `database`
  - Run `pnpm run api:prisma:deploy -- --env-file <path-to-release-env>`.
  - Run `pnpm run validation:db:deploy -- --env-file <path-to-release-env>`.
  - Confirm with `pnpm run validation:db:status -- --env-file <path-to-release-env>`.

- `redis`
  - Restore `REDIS_URL` connectivity.
  - Recheck `/system/queues/overview` and validation runtime-readiness.

- `scheduler_queue`
  - Inspect `GET /system/queues/overview`.
  - Treat a paused or disconnected scheduler queue as release-blocking.

- `rpc`
  - Restore RPC connectivity.
  - Confirm `CHAIN_ID` matches the provider.
  - Rerun `pnpm run validation:chain:check -- --env-file <path-to-release-env>`.

- `arena_artifact` or `validation_artifact`
  - Rebuild artifacts with `pnpm exec hardhat compile`.

- `validation_contract`
  - Confirm `ARENA_VALIDATION_CONTRACT_ADDRESS` points to a deployed contract on the configured chain.
  - Rerun `pnpm run validation:chain:check -- --env-file <path-to-release-env>`.

- `validation_contract_code`
  - Deploy or repoint the validation contract with `pnpm run validation:deploy -- --env-file <path-to-release-env> --network validation`, then rerun `pnpm run validation:chain:check -- --env-file <path-to-release-env>`.

- `validation_contract_bytecode`
  - Recompile and redeploy the validation contract with `pnpm exec hardhat compile` and `pnpm run validation:deploy -- --env-file <path-to-release-env> --network validation`.

- `validation_operator_signer`, `validation_oracle_signer`, `validation_pauser_signer`
  - Fund the signer.
  - Grant the required on-chain role.
  - Rerun `pnpm run validation:chain:check -- --env-file <path-to-release-env>`.

- `reward_payout_token`
  - Confirm `ARENA_REWARD_PAYOUT_ERC20_ADDRESS` points to the real payout token
    on the target chain.
  - Ensure the configured asset symbol still matches operator expectations.

- `reward_payout_operator_signer`
  - Replace any local bootstrap signer with the staged payout operator key from
    Secrets/KMS.
  - Fund the signer and grant the payout path whatever on-chain permissions the
    selected token/distributor requires.

The runtime contract already returns dependency-specific `operatorActions`. Prefer those commands over ad hoc recovery.

## 6.1 Schema rollback rule

For this repo, migration rollback is backup-and-restore, not down-migration SQL.

- Before any staging/prod migration window, capture a backup with:

```powershell
pnpm run backend:db:backup -- --env-file <path-to-release-env> --output validation-rehearsal/db-backups/<timestamp>.dump
```

- To rehearse the path end to end, use:

```powershell
pnpm run backend:db:rollback:rehearse -- --env-file <path-to-release-env> --yes
```

- If release rollback is required, restore the pre-window snapshot:

```powershell
pnpm run backend:db:restore -- --env-file <path-to-release-env> --input <path-to-backup.dump> --yes
```

The restore path drops and recreates the target schema before `pg_restore`, so
only run it against an explicitly approved environment.

## 6.2 Secret rotation and dependency audit rule

Non-local promotion now requires two additional operator proofs:

- secret rotation proof

```powershell
pnpm run backend:secrets:rotate:check -- --previous-env <path-to-previous-env> --current-env <path-to-release-env>
```

This emits a fingerprint-only JSON report and fails when JWT, signer keys,
payout signer, operator bearer token, or configured webhook bearer tokens were
not rotated from the previous release material.

- dependency security proof

```powershell
pnpm run backend:security:audit:prod
pnpm run backend:security:audit:all
```

`backend:security:audit:prod` is the shipping gate. `backend:security:audit:all`
keeps dev/toolchain advisories explicit in the release packet even when they do
not ship in the runtime image.

## 7. Local validation note

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

Local Docker rehearsal still uses `validation-local/release-rehearsal.env`,
`host.docker.internal`, and the bootstrap local chain settings on purpose. The
strict host preflight only allows that shape when `--allow-local-rehearsal` is
set.

## 8. Proposition proof note

For proposition-scoped public proof after an environment-backed rehearsal, the
repo now exposes two public-surface checks plus one combined verdict:

```powershell
pnpm run validation:public-results:check -- --proposition-id <id> [--base-url <url>]
pnpm run validation:public-integrity:check -- --proposition-id <id> [--base-url <url>]
pnpm run validation:proof:capture -- --proposition-id <id> --env-file <path-to-release-env> [--auth-token <token>] [--base-url <url>]
```

`validation:proof:capture` now treats proposition proof as complete only when
all four surfaces align:

- backend `releaseReadiness.status=ready`
- internal proposition rehearsal `status=ready`
- proposition is visible in `GET /arena/public/results/settled`
- proposition is visible in `GET /arena/public/integrity/overview?propositionId=<id>`

## 9. Unified operator briefing

For one proposition-scoped operator entrypoint that bridges release gating,
runtime hardening, beta proof, and internal operating follow-through, use:

```powershell
pnpm run validation:ops:brief -- --proposition-id <id> --env-file <path-to-release-env> [--base-url <url>] [--auth-token <token>]
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
