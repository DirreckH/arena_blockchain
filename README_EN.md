# Arena

English | [简体中文](./README.md)

[![Status](https://img.shields.io/badge/status-consensus_prediction_market_mvp-0A66C2?style=flat-square)](./README_EN.md)

Arena is a consensus prediction market: it turns "how a real target group will ultimately judge something" into a tradable, verifiable, and settleable market.

Traditional prediction markets are good at trading external events: prices, games, elections, and public news. Arena focuses on a different, more frequent class of outcomes that show up in business, AI, and community decision-making: which option a target audience will support, which direction real users will choose, or whether a proposal, piece of content, product concept, or contribution will pass collective validation.

Those outcomes usually live inside surveys, polls, research reports, or internal review workflows. They carry signal, but they rarely have market incentives, public progress, settlement records, or composable financial expression. Arena's core idea is simple: once collective judgment can be defined, sampled, hidden, revealed, and settled, it can become a new prediction-market asset.

The current minimum loop is:

`create an outcome market -> participants stake / verify -> target group responds -> effective samples form -> consensus result is revealed -> market settles`

Before reveal, the market shows progress but not direction. Participants can take positions without seeing the live response trend; once sample and time conditions are met, Arena reveals the official result and settles claims or refunds around it.

## TL;DR

- `One-liner`: Arena is a Web3 prediction market for trading collective consensus outcomes.
- `Core asset`: not just betting on public news, but trading how a defined group will ultimately choose or judge.
- `Core experience`: market creation, hidden sampling, public progress, result reveal, settlement.
- `Current MVP`: non-rolling, single-question, binary consensus markets.
- `Live demo`: `pnpm install` -> `pnpm web:dev` -> open `http://localhost:5173` -> type `demo`.
- `Current status`: browsable product shell, real backend paths, demo fallback, and minimum on-chain settlement capability.

## Why This Market Matters

Many important decisions do not have a natural price feed, but they do have a clear group outcome.

Brands want to know whether a target audience will accept a new concept. AI teams want to know which model output human reviewers trust more. DAOs want to know whether a grant, proposal, or contribution will pass community validation. Content platforms want to know whether a creator, curation result, or governance action will be accepted by the intended community.

Today, these questions usually fall into three imperfect categories:

- `Surveys`: collect answers, but do not create market risk or externally settleable outcomes.
- `Votes`: express preferences, but often become identity or mobilization contests and rarely preserve hidden sampling.
- `Traditional prediction markets`: trade events well, but lack stable resolution sources for subjective group outcomes.

Arena combines the useful parts into one product path: define a resolvable group question, open a market around the future result, then use effective samples to produce the official outcome and settle the market.

This is not a survey page with wallet login. It is a way to make collective consensus tradable and verifiable.

## Why Now

Three shifts make consensus markets more timely:

- `AI is creating more subjective evaluation`: model outputs, content quality, preference signals, and safety boundaries increasingly depend on human feedback, but that feedback is still trapped in closed labeling and scoring systems.
- `On-chain settlement lowers trust costs`: custody, settlement, and claim records belong in a transparent settlement layer, while the full sampling workflow does not need to be forced on-chain.
- `Communities and brands need faster decision markets`: DAOs, creator communities, consumer brands, and content platforms need something faster than research studies and more incentive-aligned than ordinary voting.

Arena starts with a narrow, legible market type: binary, non-rolling, one-shot consensus questions. That is small enough to demo end to end in a hackathon MVP, but broad enough to expand into AI evaluation, consumer research, DAO governance, content validation, and open task markets.

## How The Product Works

The user story is direct.

1. A market creator proposes a resolvable question.
2. Arena defines the target group, sample requirements, time window, and binary outcomes.
3. Market participants stake or verify before reveal.
4. The target group submits answers; Arena reviews them and counts effective samples.
5. The frontend shows progress, but not which side is leading.
6. Once resolution conditions are met, Arena reveals the official result.
7. The market settles from that result, and users claim gains or receive refunds.

This creates two useful roles at once:

- `Market participants`: express a view before reveal, take risk, then claim gains or receive refunds after settlement.
- `Market creators`: launch an outcome market with progress, incentives, and settlement records instead of a static poll or survey.

## Example Markets

Arena can turn many hard-to-trade questions into prediction markets.

| Scenario | Market that can be formed |
| --- | --- |
| AI model evaluation | Will target reviewers choose Model A or Model B? |
| Consumer brand testing | Will core users prefer concept A or concept B? |
| DAO grants | Will effective samples support this project entering the next round? |
| Content governance | Will the target community say this content should be promoted or removed? |
| Product roadmap | Will beta users accept this feature direction? |
| Contribution review | Will maintainers validate this open-source contribution? |

The shared pattern is that the result is not an external price feed. It is a clearly defined collective consensus outcome. Arena's goal is to give these outcomes markets, progress, and settlement.

## Why Judges And Investors Should Care

Arena's hackathon value is not "another prediction-market UI." It introduces a new supply source for markets: collective consensus outcomes.

- `New asset class`: turns research, review, preference testing, and community validation into tradable results.
- `New market supply`: markets do not need to wait for public news; brands, DAOs, AI teams, and platforms can create them directly.
- `New trust model`: direction is hidden before reveal, then settlement happens around the official result.
- `Expansion path`: from the binary MVP into rolling questions, multi-question research, AI evaluation markets, and requester dashboards.
- `Demoable today`: the repository already runs a product shell, demo session, market detail views, results, account state, and a local settlement path.

That makes Arena closer to infrastructure for continuously creating new markets than a one-off betting page.

## Current MVP

The current version is intentionally narrow. The goal is to run one complete consensus prediction-market path, not to build a full exchange all at once.

In scope:

- Non-rolling propositions.
- Single-question survey / outcome markets.
- Binary outcomes.
- Simple staking and one-shot settlement.
- Platform dispatch, answer submission, basic review, effective-sample counting, and unified reveal.
- Pre-reveal progress display without direction leakage.
- Replaceable seams between demo sessions and real APIs.

Explicitly out of scope:

- Complex long surveys.
- Deep open-ended answer analysis.
- Rolling propositions and periodic settlement.
- Complex AMMs.
- Complex order books.
- Multi-asset staking.
- Any pre-reveal directional intermediate state.

## What You Can See Today

The current repository already has a demoable product shape:

- Home and market feed.
- Market ranking and detail pages.
- Challenge / draft creation path.
- Response task reading and submission path.
- Results, watchlist, activity, and account shell.
- Type `demo` to enter a full seeded session.
- API failures can fall back to demo data so the product remains visible.
- The local backend and validation-chain can run the minimum settlement path.

## Quick Start

To view the product shell without preparing a database, Redis, or local chain:

```powershell
pnpm install
pnpm web:dev
```

Open:

- `http://localhost:5173`

For the first pass, type `demo` in the login flow and walk through home, market detail, drafts, challenge submission, adjudication, results, and watchlist.

## Developer Appendix

The following details are kept for reproducibility and continued development. For a hackathon demo, the "Quick Start" path is usually enough.

### Local Integration

If you want the local backend, validation runtime, and frontend to work together, use the repository wrapper:

```powershell
pnpm install
pnpm run backend:prepare:local
```

Then start the frontend in another terminal:

```powershell
$env:VITE_API_BASE_URL="http://localhost:4000"
$env:VITE_CHAIN_ID="1337"
pnpm web:dev
```

`backend:prepare:local` reuses `validation:prepare:local`, prepares the local validation runtime, starts the backend when needed, waits for `/health/live` and `/health/ready`, and runs the backend release check.

### Technical Shape

```text
apps/web      -> market presentation, demo session, wallet UX
apps/api      -> proposition, response, result, validation services
packages      -> shared domain and DTOs
contracts     -> validation market contract
scripts       -> local startup, deploy, and check scripts
```

Main stack:

- Frontend: `React 18`, `Vite 6`, `TypeScript`, `React Router 7`, `Tailwind CSS`
- Backend: `NestJS 11`, `Prisma`, `BullMQ`, `Redis`, `ethers`
- Contracts: `Solidity 0.8.20`, `Hardhat`, `OpenZeppelin`
- Database: `PostgreSQL`

### Common Commands

| Category | Command |
| --- | --- |
| Frontend dev | `pnpm web:dev` |
| Frontend build | `pnpm web:build` |
| Frontend check | `pnpm web:check` |
| API dev | `pnpm api:dev` |
| API build | `pnpm api:build` |
| API typecheck | `pnpm api:typecheck` |
| Dependencies up | `pnpm deps:up` |
| Local backend prepare | `pnpm backend:prepare:local` |
| Local validation prepare | `pnpm validation:prepare:local` |
| Validation test | `pnpm validation:test` |
| CI-aligned check | `pnpm ci:check` |

### Validation Baseline

This is a README narrative update, so code tests are not required. When code baselines are needed, use:

```powershell
pnpm run check
pnpm run shared:test
pnpm run api:typecheck
pnpm run api:build
```

Validation-chain baseline:

```powershell
pnpm run validation:env:check
pnpm run validation:deps:check
pnpm run validation:chain:check
pnpm run validation:test
```

### Repository Structure

```text
Arena/
├─ apps/
│  ├─ web/
│  └─ api/
├─ packages/
│  └─ shared/
├─ contracts/
│  ├─ validation/
│  └─ Arena.sol
├─ docs/
│  ├─ PRODUCT_SCOPE.md
│  └─ contracts/
├─ scripts/
├─ test/
├─ docker-compose.yml
└─ README_EN.md
```

## Current State

Arena is past the idea-or-page-mock stage, but it is not claiming to be a complete production system yet.

What can be claimed clearly today:

- a browsable, demoable consensus prediction-market product shell with replaceable mock / real seams
- runnable application services and local data dependencies
- application paths across proposition / result production / validation
- validation-market contract, deploy scripts, sync, projection, monitoring, and runbooks

What it explicitly does not claim:

- survey / hybrid / rolling are already complete
- complex AMMs, order books, or multi-asset markets are complete
- the frontend is already prepared for every future trading model
- the old legacy Arena contract is still the core protocol path
- production-grade rollback / observability / operator platform are fully complete

## Further Reading

- [docs/PRODUCT_SCOPE.md](./docs/PRODUCT_SCOPE.md)
- [AGENTS.md](./AGENTS.md)
- [docs/contracts/arena-phase1-spec.md](./docs/contracts/arena-phase1-spec.md)
- [docs/contracts/arena-phase3-backend-integration.md](./docs/contracts/arena-phase3-backend-integration.md)
- [docs/contracts/arena-validation-chain-runbook.md](./docs/contracts/arena-validation-chain-runbook.md)

## License

The repository does not currently declare a top-level open-source license. If you intend to publish it openly, add a `LICENSE` file first and then lock the license statement into the README and badges.
