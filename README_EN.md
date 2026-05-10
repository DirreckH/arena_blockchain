# Arena

English | [简体中文](./README.md)

[![Status](https://img.shields.io/badge/status-active_mvp_baseline-0A66C2?style=flat-square)](./README_EN.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2-FFF100?style=flat-square&logo=ethereum&logoColor=black)](https://hardhat.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)

Arena is a dual-layer Web3 / AI system that puts respondent adjudication and result-driven validation markets on the same product path.

In more protocol-native language, Arena can be summarized as:

`Arena = short-term judgment oracle + long-term domain reputation graph`

It is designed for subjective decision-making in DAOs and onchain communities: in the short term it produces callable collective decision signals, and in the long term it accumulates domain-specific judgment reputation across participants.

It is not a generic prediction market, it is not a demo that loosely stitches together surveys, trading, and wallet login, and it is not simply a Snapshot replacement. Arena's adjudication layer produces verifiable outcomes, the validation layer handles staking, settlement, and refunds around those outcomes, and before resolution the public surface exposes progress, not directional signal.

The repository already contains three concrete baselines:

- `Product shape`: a Chinese-first frontend shell with continuous flows across discovery, market detail, drafts, challenge submission, adjudication, watchlist, and results.
- `Application runtime`: a NestJS API, Prisma, Redis, state machines, and the shared Arena domain model covering proposition, market, bet, reward, reputation, watchlist, and internal ops flows.
- `Validation chain`: a Hardhat / Solidity validation-market contract path plus runtime chain integration for the minimum credible settlement loop of non-rolling, single-question, binary markets.

## 🧭 Protocol Positioning

From a product perspective, Arena is better described not as a pure prediction market, but as a judgment-oracle protocol for subjective decision contexts.

It can be abstracted into two layers:

`Arena = Consensus Oracle + Domain Reputation Graph`

More plainly:

`Arena = judgment oracle + domain reputation graph`

Each layer solves a different problem:

- `Consensus Oracle`
  - Solves "how is the crowd judging this question right now?"
  - Fits DAO and onchain-community workflows such as grant funding, proposal screening, contribution verification, whitelist admission, and content moderation.
  - Produces short-cycle decision signals that can be consumed by governance contracts, grant protocols, task platforms, or content protocols.

```json
{
  "proposal_id": "grant-2026-042",
  "epoch": 12,
  "support_rate": 76.4,
  "verified_participants": 1832,
  "confidence": 0.82,
  "result": "support"
}
```

- `Domain Reputation Graph`
  - Solves "whose judgment should carry more weight?"
  - Arena continuously records how participants judge questions across domains such as AI model evaluation, DeFi risk recognition, DAO governance, open-source contribution review, and content curation.
  - What accumulates over time is not a one-off voting preference, but domain-specific judgment reputation derived from long-run behavior.

These two layers form Arena's core flywheel:

`short-term consensus output -> enters reputation history -> affects future task weighting -> improves future signal quality -> keeps compounding domain reputation`

That is what makes Arena different from ordinary DAO voting. It does not stop at "who supports this outcome?" It also asks:

- Who supported this conclusion?
- Have these participants been reliable before?
- In which domain have they been reliable?
- Can this result be called directly by an external protocol?

From that perspective, Arena is not just a voting interface replacement. It can become a judgment-signal layer on top of Snapshot, DAO governance systems, grant platforms, task platforms, and content protocols.

The current repository's `Adjudication layer + Validation layer` is the minimum runnable protocol path for that thesis:

- `Adjudication layer` produces the short-term judgment result and enforces the process constraints around it.
- `Validation layer` handles capital validation, settlement, and refunds around the result.
- `Reputation` domain and runtime pieces support the accumulation of long-term domain reputation and later weighting logic.

## 🚀 TL;DR

- What this is
  - A Web3 / AI dual-layer system for DAOs and onchain communities: it emits short-term judgment-oracle signals, accumulates long-term domain reputation, and uses validation markets to verify and settle around outcomes.
- What already runs
  - The frontend product shell, the API / shared-domain baseline, and the validation-chain contract plus minimal runtime integration.
- Fastest way to try it
  - `pnpm install`
  - `pnpm web:dev`
  - Open `http://localhost:5173`
  - Type `demo` in the login flow
- Where to look for full local integration
  - Start with "Quick Start" below, then follow "Detailed Setup" for API and validation-chain runtime.

## ⚡ Quick Start

### 30-second product-shell run

If you only want to see the current Arena product shape, you do not need a database, Redis, or chain runtime yet:

```powershell
pnpm install
pnpm web:dev
```

Then open:

- `http://localhost:5173`

For the first pass, use the `demo` login shortcut and walk through the full shell: home, market detail, drafts, challenge submission, adjudication, results, and watchlist.

### Minimal local integration

If you want the frontend to talk to a local API, the shortest path is:

```powershell
pnpm install
Copy-Item .env.example .env
pnpm deps:up
pnpm exec hardhat compile
pnpm exec hardhat node
pnpm api:prisma:migrate
pnpm api:dev
```

Then start the frontend in another terminal:

```powershell
$env:VITE_API_BASE_URL="http://localhost:4000"
$env:VITE_CHAIN_ID="1337"
pnpm web:dev
```

Full validation-chain deployment, role wiring, and preflight checks are covered later under "Detailed Setup".

## 🌱 Why This Project Exists

Arena is not trying to answer "how do we make a fancier betting page." It is trying to answer a more difficult set of system questions:

- If outcomes come from real respondent answers, how do we avoid leaking directional signal before resolution?
- If a user can be both a respondent and a verifier trading around the outcome, how do we preserve information boundaries?
- If the product needs to become visible and testable early, how do we let the frontend shape the product with mocks first and then progressively replace them with real backend and chain capability?
- If the chain is only a good fit for custody and settlement, how do we avoid forcing the entire adjudication-production process on-chain?

Arena therefore uses a dual-layer model:

- `Adjudication layer`
  - Handles propositions, dispatch, responses, review, effective sample counting, freeze / reveal, and official result generation.
- `Validation layer`
  - Handles markets, positions, native-asset stake, official-result-driven settlement, and claim / refund.

These are not two separate products. They are different responsibility surfaces in the same user narrative.

## 🔄 Minimum Platform Loop

The current MVP system loop can be summarized as:

`candidate proposition -> proposition publish -> validation market create/open -> respondent adjudication -> public progress surface -> freeze / reveal -> official result -> chain settlement -> user claim / refund`

The boundaries are intentionally split:

- The adjudication layer does not expose directional intermediate state to the validation layer.
- The validation layer does not feed market direction, pricing bias, or bet distribution back into the adjudication layer.
- Before resolution, only time progress, effective-sample progress, and public state are exposed.
- The contract does not recompute who won. It consumes an off-chain official result and executes a fixed settlement rule.

One lifecycle detail is worth calling out explicitly:

- Once a proposition enters the publish / live path, the runtime first enqueues validation `create_market` and `open_market`.
- Only after respondent sample and freeze / reveal conditions are satisfied does the runtime continue with `freeze_market` and `resolve_market`.

## ✨ Core Design

### 1. Dual-layer product structure

Arena is not a single-layer prediction market. It separates consensus production from the validation capital layer around the outcome:

- `Proposition`
  - Created, scheduled, published, frozen, revealed, and settled.
- `Market`
  - Bound one-to-one to a proposition and transitions through live / frozen / settled / cancelled states.
- `Bet / Position`
  - One user, one market, one position, tracking stake and final outcome around a single binary question.

### 2. Public progress without direction leakage

The repository already has explicit separation across public progress, validation surface, and adjudication surface.

That means:

- The frontend can show how much effective sample is still needed and how long remains before reveal.
- The frontend cannot show which side is currently leading before reveal.
- Backend state machines, view models, and surface mappers are organized around that boundary.

### 3. Mock-first seams that can be replaced with real capability

Arena intentionally lets the frontend establish product shape first, then swap adapters over to real capability.

The frontend already contains:

- a seeded public/discovery demo read model
- a public mock adapter for validation markets
- an authenticated demo session
- demo fallback behavior when real API requests fail

That is not throwaway fake data. It is a deliberate product-contract layer that lets B-track stabilize interaction quality before A-track replaces internals with real runtime paths.

### 4. Validation-chain only carries the minimum credible settlement scope

The current validation-chain scope is intentionally narrow:

- `consensus`
- `binary`
- `non_rolling`
- `final`

In other words:

- single question
- binary choice
- non-rolling
- one-shot final settlement

The README does not claim survey, hybrid, rolling, AMM, order book, or multi-asset betting as already implemented capability.

## ✨ What Is Already Landed

The items below are backed by actual code, tests, or runtime boundaries in the repository. They are not just roadmap statements.

### Frontend product shell

- `/zh` already combines discovery and validation-market feeds.
- `/zh/markets` and `/zh/event/:marketId` already provide ranking and detail experiences.
- `/zh/challenges` and `/zh/drafts` are already wired to real backend draft / submit APIs.
- `/zh/adjudication` already reads and submits respondent tasks.
- `/zh/results`, `/zh/watchlist`, and `/zh/activity` already contain account-shell logic with real/demo switching behavior.
- The demo session supports typing `demo` directly to enter a seeded full-session experience.

### Shared domain and application layer

- `packages/shared` already defines Arena enums, DTOs, surface contracts, policy, reward, reputation, tags, adjudication, and validation-settlement semantics.
- `apps/api` already contains proposition, market, bet, reward-ledger, response-review, watchlist, account-export, reputation, and tag services.
- Prisma migrations already cover the Arena core schema, state-machine refinement, reward ledger, quality / reputation, internal ops, and validation-chain foundation.
- The API already exposes Swagger docs, request tracing, RBAC, health endpoints, Redis queue plumbing, and internal monitoring surfaces.

### Validation-chain

- `contracts/validation/ArenaValidationMarket.sol` already carries the validation-market protocol path.
- `scripts/deploy-validation-market.cjs` already supports deployment and role assignment for admin / operator / oracle / pauser.
- The API runtime already integrates the `create_market`, `open_market`, `freeze_market`, and `resolve_market` command queue.
- Sync, projector, monitoring, cursor, and event-ledger paths already have implementation and test coverage.
- Minimum cancel / refund / pauser paths already have runbooks and tests.

## 🏗️ Technical Architecture

```text
apps/web
  -> discovery / public progress / validation detail / challenge submission / respondent shell
  -> @arena/shared

apps/api
  -> proposition runtime
  -> adjudication services
  -> validation services
  -> Prisma / Redis / JWT / internal ops
  -> @arena/shared

contracts/validation
  -> ArenaValidationMarket

runtime flow
  -> proposition publish
  -> validation command queue
  -> chain events
  -> sync worker
  -> DB projection
  -> frontend surfaces
```

- Frontend: `React 18`, `Vite 6`, `TypeScript`, `React Router 7`, `Tailwind CSS`
- Backend: `NestJS 11`, `Prisma`, `BullMQ`, `Redis`, `ethers`
- Contracts: `Solidity 0.8.20`, `Hardhat`, `OpenZeppelin`
- Shared domain: `@arena/shared`
- Database: `PostgreSQL`

## 🔀 Runtime Modes

Arena is more accurately described as layered runtime modes than a single mock or single live mode:

- `anonymous browse`
  - The frontend tries public APIs first and falls back to seeded demo feeds on failure.
- `demo session`
  - Typing `demo` enters a full demo session without real wallet signing while preserving the full product shell.
- `wallet-authenticated session`
  - After real wallet login, the frontend accesses real account / draft / adjudication / validation-write APIs.
- `validation-chain runtime`
  - Proposition runtime drives chain-side create / open / freeze / resolve through queues, then the sync worker projects state back into the read model.

That means Arena currently serves two development goals at the same time:

- seeing the product shape as quickly as possible
- running the full proposition -> backend -> chain -> projection integration loop

## ⚙️ Environment Requirements

- `Node.js 18+`
- `pnpm`
- `Docker Desktop` with `docker compose`
- a local `Hardhat` RPC

For full local integration you also need:

- `PostgreSQL`
- `Redis`
- a configured `.env`
- a deployed validation contract

## 🔐 Environment Configuration

1. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Adjust local values as needed.

### Key variables from root `.env.example`

| Variable | Meaning | Default / Notes |
| --- | --- | --- |
| `PORT` | API port | `4000` |
| `DATABASE_URL` | Prisma / Postgres connection string | Matches local docker compose defaults |
| `REDIS_URL` | Redis connection string | `redis://127.0.0.1:6379/0` |
| `JWT_SECRET` | JWT secret | Replace with a real random value |
| `RPC_URL` | Hardhat / EVM RPC | `http://127.0.0.1:8545` |
| `CHAIN_ID` | Runtime chain ID | `1337` |
| `ARENA_CONTRACT_ADDRESS` | Legacy Arena contract address | Must not be reused as the validation address |
| `ARENA_VALIDATION_CONTRACT_ADDRESS` | Validation-market contract address | Required for full integration |
| `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY` | Operator signer private key | Used by validation runtime |
| `ARENA_VALIDATION_ORACLE_PRIVATE_KEY` | Oracle signer private key | Used by validation runtime |
| `ARENA_VALIDATION_PAUSER_PRIVATE_KEY` | Pauser signer private key | Used by validation runtime |
| `OPERATOR_WALLET_ADDRESSES` | Operator wallet list | Used by RBAC, comma-separated |
| `ADMIN_WALLET_ADDRESSES` | Admin wallet list | Used by RBAC, comma-separated |
| `SYSTEM_WALLET_ADDRESSES` | System wallet list | Used by RBAC, comma-separated |

### Extra note for frontend local integration

The frontend default API base URL lives in [`apps/web/src/features/api/arena-api.ts`](./apps/web/src/features/api/arena-api.ts) and defaults to `http://localhost:3000`. If your local API runs on the default `4000` port, explicitly set:

```powershell
$env:VITE_API_BASE_URL="http://localhost:4000"
$env:VITE_CHAIN_ID="1337"
pnpm web:dev
```

Otherwise the frontend will send API requests to `3000` and then fall back to demo feeds when they fail.

## 🛠️ Detailed Setup

### Path A: fastest frontend shell

If you only want to run the Arena frontend shell as quickly as possible, without database or chain runtime:

```powershell
pnpm install
pnpm web:dev
```

Then open:

- `http://localhost:5173`

You can:

- browse home, ranking, detail, and category views
- enter the full seeded demo session by typing `demo`
- exercise the drafts, challenge-submission, adjudication, results, and watchlist shell flows

This path is best for B-track work, product review, and UI iteration.

### Path B: API + frontend local integration

If you want to run the real API and point the frontend at it locally:

1. Install dependencies

   ```powershell
   pnpm install
   Copy-Item .env.example .env
   ```

2. Start Postgres and Redis

   ```powershell
   pnpm deps:up
   ```

3. Compile the root Hardhat artifacts first

   ```powershell
   pnpm exec hardhat compile
   ```

   Do not skip this step. API readiness depends on the root Hardhat artifact, and `artifacts/` is not checked into version control.

4. Start a local Hardhat RPC

   ```powershell
   pnpm exec hardhat node
   ```

5. Apply Prisma migrations

   ```powershell
   pnpm api:prisma:migrate
   ```

6. Start the API

   ```powershell
   pnpm api:dev
   ```

7. Start the frontend in another terminal and point it to API port `4000`

   ```powershell
   $env:VITE_API_BASE_URL="http://localhost:4000"
   $env:VITE_CHAIN_ID="1337"
   pnpm web:dev
   ```

8. Check health and docs

   - `GET http://localhost:4000/health/live`
   - `GET http://localhost:4000/health/ready`
   - `GET http://localhost:4000/docs`

### Path C: full validation-chain local integration

If your goal is the full A-track runtime path across proposition / queue / chain / sync / projection:

1. Complete Path B first.

2. Choose a validation signer and admin strategy

   The two simplest local options are:

   - Option A
     - Reuse one funded Hardhat account as `admin + operator + oracle + pauser`.
     - Put the same private key into:
       - `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY`
       - `ARENA_VALIDATION_ORACLE_PRIVATE_KEY`
       - `ARENA_VALIDATION_PAUSER_PRIVATE_KEY`
     - Set `ARENA_VALIDATION_ADMIN_ADDRESS` to the address derived from that same key.
     - In this mode, the constructor already gives all three roles to the admin, so no extra grants are needed.
   - Option B
     - Use three separate signers.
     - In addition to private keys, set these before deployment:
       - `ARENA_VALIDATION_OPERATOR_ADDRESS`
       - `ARENA_VALIDATION_ORACLE_ADDRESS`
       - `ARENA_VALIDATION_PAUSER_ADDRESS`
     - The deployment script will grant roles to those addresses.

   If you skip this part, `validation:chain:check` will fail because the signers either lack on-chain roles or do not match the configured addresses.

3. Compile contracts

   ```powershell
   pnpm exec hardhat compile
   ```

4. Deploy the validation contract

   ```powershell
   pnpm run validation:deploy --network localhost
   ```

5. Write the emitted `ARENA_VALIDATION_CONTRACT_ADDRESS` back into `.env`

   Also make sure your chosen signer configuration remains present in `.env`:

   - `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY`
   - `ARENA_VALIDATION_ORACLE_PRIVATE_KEY`
   - `ARENA_VALIDATION_PAUSER_PRIVATE_KEY`
   - `ARENA_VALIDATION_ADMIN_ADDRESS`

   If you are using the separate-address mode, also keep:

   - `ARENA_VALIDATION_OPERATOR_ADDRESS`
   - `ARENA_VALIDATION_ORACLE_ADDRESS`
   - `ARENA_VALIDATION_PAUSER_ADDRESS`

6. Run validation preflight checks

   ```powershell
   pnpm run validation:env:check
   pnpm run validation:deps:check
   pnpm run validation:chain:check
   pnpm run validation:db:deploy
   pnpm run validation:db:status
   ```

7. Start the API and run the real proposition -> create/open/freeze/resolve -> sync runtime path.

This path is best for A-track work, validation-chain integration, and runtime verification.

## 🧪 Common Commands

| Category | Command | Meaning |
| --- | --- | --- |
| Frontend dev | `pnpm web:dev` | Start Vite |
| Frontend build | `pnpm web:build` | Build the web app |
| Frontend check | `pnpm web:check` | TypeScript noEmit check |
| Shared tests | `pnpm shared:test` | Run `@arena/shared` tests |
| API dev | `pnpm api:dev` | Start NestJS |
| API build | `pnpm api:build` | Build the API |
| API typecheck | `pnpm api:typecheck` | Prisma generate + TypeScript check |
| Dependencies up | `pnpm deps:up` | Start Postgres / Redis |
| Dependencies down | `pnpm deps:down` | Stop Postgres / Redis |
| Prisma migrate | `pnpm api:prisma:migrate` | Apply local migrations |
| Validation preflight | `pnpm validation:preflight` | Combined env / deps / chain checks |
| Validation deploy | `pnpm validation:deploy --network localhost` | Deploy the validation contract |
| Validation test | `pnpm validation:test` | Run validation-chain tests |
| CI-aligned checks | `pnpm ci:check` | Web + shared + API baseline checks |

## ✅ Validation And Regression

The recommended local verification order is:

### Frontend / workspace baseline

```powershell
pnpm run check
pnpm run shared:test
pnpm run api:typecheck
pnpm run api:build
```

### Validation-chain baseline

```powershell
pnpm run validation:env:check
pnpm run validation:deps:check
pnpm run validation:chain:check
pnpm run validation:test
```

### Health / docs

- `GET /health/live`
- `GET /health/ready`
- `GET /docs`

## 🗂️ Repository Structure

```text
Arena/
├─ apps/
│  ├─ web/                    # React + Vite Chinese-first product shell
│  └─ api/                    # NestJS API, Prisma, queues, validation runtime
├─ packages/
│  └─ shared/                 # Arena domain enums, DTOs, surfaces, engines
├─ contracts/
│  ├─ validation/             # ArenaValidationMarket contract
│  └─ Arena.sol               # legacy Arena / PK contract path
├─ docs/
│  ├─ arena-project-understanding.md
│  └─ contracts/              # phase specs, runbooks, runtime integration docs
├─ scripts/                   # deploy / env-check / validation helper scripts
├─ test/                      # root Hardhat / contract tests
├─ docker-compose.yml         # Postgres + Redis
└─ README_EN.md
```

By responsibility:

- `apps/web`
  - Product presentation layer, mock/real adapters, demo session, wallet UX.
- `apps/api`
  - Proposition runtime, respondent / validation services, RBAC, monitoring, queue, sync.
- `packages/shared`
  - Shared semantics across frontend and backend; currently the most stable Arena product contract.
- `contracts/validation`
  - The current validation-chain protocol mainline.
- `docs/contracts`
  - Current validation-chain phase documents, runbooks, and runtime integration notes.

## 📌 Current State

Arena is past the stage of being just an idea or a page mock, but it is not pretending to be a complete production system yet.

What can be claimed clearly today:

- a browsable, demoable product shell with replaceable mock/real seams
- a runnable NestJS + Prisma + Redis + shared-domain baseline
- application runtime across proposition / adjudication / validation
- validation-market contracts, deployment scripts, sync, projection, monitoring, and runbooks

What it explicitly does not claim:

- survey / hybrid / rolling are already complete
- the frontend is already prepared for every future trading model
- the old legacy Arena contract is still the core protocol path
- production-grade rollback / observability / operator platform are fully complete

## 📚 Further Reading

If you want to go deeper, this is a good reading order:

### Project understanding

- [docs/arena-project-understanding.md](./docs/arena-project-understanding.md)
- [AGENTS.md](./AGENTS.md)

### Validation-chain spec and integration

- [docs/contracts/arena-phase1-spec.md](./docs/contracts/arena-phase1-spec.md)
- [docs/contracts/arena-phase3-backend-integration.md](./docs/contracts/arena-phase3-backend-integration.md)
- [docs/contracts/arena-phase4-foundation.md](./docs/contracts/arena-phase4-foundation.md)
- [docs/contracts/arena-phase5-runtime-closure.md](./docs/contracts/arena-phase5-runtime-closure.md)
- [docs/contracts/arena-phase6-runtime-integration.md](./docs/contracts/arena-phase6-runtime-integration.md)

### Runbooks / troubleshooting

- [docs/contracts/arena-validation-chain-runbook.md](./docs/contracts/arena-validation-chain-runbook.md)
- [docs/contracts/arena-validation-blocker-clearance.md](./docs/contracts/arena-validation-blocker-clearance.md)

## 📄 License

The repository does not currently declare a top-level open-source license. If you intend to publish it openly, add a `LICENSE` file first and then lock the license statement into the README and badges.
