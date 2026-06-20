# Arena

English | [Chinese](./README.md)

[![Status](https://img.shields.io/badge/status-crowd_consensus_prediction_market_mvp-0A66C2?style=flat-square)](./README_EN.md)

Arena is a crowd consensus prediction market.

It does not only trade external facts. It turns the future judgment, choice, or acceptance of a clearly defined group into a market that can be created, joined, verified, and settled.

Traditional prediction markets are good at answering whether an external event will happen: a price move, a game result, an election outcome, or a public news event. Arena focuses on a more frequent and more participatory class of outcomes: which side a target audience will take, which direction real users will choose, whether a community will accept a proposal, or whether an audience will converge around a shared judgment.

This market matters because many high-participation, high-distribution outcomes already happen inside crowds.

"Messi vs Cristiano Ronaldo GOAT", "Is ticketing chaos more talked about than the concert itself?", and "Will AI search change how heavy internet users look things up?" are not fringe entertainment prompts. They represent real demand: people like taking positions, comparing judgments, arguing in public, and watching where the crowd lands.

Arena's opportunity is to turn consensus that currently lives inside comments, polls, surveys, community debates, and brand research into a product with market incentives, public progress, verification, and settlement records.

## TL;DR

- `One-liner`: Arena is a Web3 prediction market for trading crowd consensus outcomes.
- `Core difference`: Polymarket-style markets mainly predict external facts; Arena predicts how a target crowd will ultimately judge.
- `Important market`: sports, culture, crypto, tech, DAO, public policy, finance, and entertainment all produce high-topic, high-participation consensus questions.
- `Why users join`: people naturally want to stake, comment, verify, and share around identity, preference, taste, and group judgment.
- `Current MVP`: non-rolling, single-question, binary consensus markets.
- `Live demo`: `pnpm install` -> `pnpm web:dev` -> open `http://localhost:5173` -> type `demo`.

## Why This Is A Market

Many valuable questions do not have a natural price feed, but they do have a clear crowd outcome.

Brands want to know whether core users will accept a new concept. AI teams want to know which model output human reviewers trust more. DAOs want to know whether a proposal or grant will pass community validation. Content platforms want to know whether a creator, ranking, or governance action will be accepted by the intended community.

More importantly, highly entertaining topics have market value too.

Strong topical markets share several traits:

- `Low cognitive cost`: users instantly understand why they might care, as with "Messi vs Cristiano Ronaldo GOAT".
- `High expression value`: participants are not only guessing a result; they are expressing identity, preference, and judgment.
- `Strong distribution`: the topics naturally invite discussion, comments, sharing, and remixing.
- `High-frequency supply`: sports, pop culture, crypto narratives, tech products, and DAO governance generate new debates every day.
- `Commercial expansion`: the same mechanism can serve brand testing, community governance, AI evaluation, content validation, and user research.

Arena is not only making a market for public news outcomes. It is opening a broader source of market supply: crowd consensus results.

## Product Mechanism

Arena's minimum loop is:

`create a proposition market -> participants stake or verify -> target crowd responds -> effective samples form -> consensus result is revealed -> market settles`

Before reveal, the market shows progress but not direction.

Participants can take positions without seeing the live response trend. Once sample and time conditions are met, Arena reveals the official result and settles gains, claims, or refunds around it.

This creates two useful roles at once:

- `Market participants`: make a judgment about future crowd consensus, take risk, then claim gains or receive refunds after reveal.
- `Market creators`: get an outcome market with incentives, progress, verification, and settlement records instead of a static poll or survey.

## Why Now

Arena sits at the intersection of three shifts.

- `Attention markets are becoming topic-driven`: users increasingly form public positions around sports, culture, tech, crypto, and public events. Strong topics create a natural entry point.
- `AI and community decisions need more human feedback`: model output, content quality, brand preference, and governance decisions increasingly depend on target-crowd feedback, but current feedback often remains trapped in labeling, surveys, or simple votes.
- `On-chain settlement lowers trust costs`: custody, settlement, and claim records fit a transparent settlement layer, while the full sampling workflow does not need to be forced on-chain.

Arena starts with binary, non-rolling, one-shot consensus questions. That scope is small enough to demonstrate end to end in a hackathon MVP, and large enough to expand into AI evaluation, consumer research, DAO governance, content validation, and open task markets.

## Example Markets

Arena is especially suited to questions where the result comes from crowd judgment rather than an external price feed.

| Scenario | Market that can be formed |
| --- | --- |
| Sports debate | Will fans broadly agree that Messi deserves the modern football GOAT label more than Cristiano Ronaldo? |
| Pop culture | Will audiences broadly agree that ticketing chaos creates more social discussion than the concert itself? |
| Crypto narratives | Will crypto users broadly agree that meme coins drive retail sentiment more than AI coins? |
| Tech behavior | Will heavy internet users broadly agree that AI search is better than traditional search for ask-first workflows? |
| DAO governance | Will effective samples support a DAO grant project entering the next round? |
| Brand testing | Will core users prefer concept A over concept B? |
| AI model evaluation | Will target reviewers choose Model A's output or Model B's output? |
| Content governance | Will the target community say this content should be promoted, downranked, or removed? |

The first few categories are especially strong for demos and early growth. They are topical, entertaining, and participatory. They show that Arena is not a cold survey wrapper, but a prediction market people can willingly enter, discuss, and interact with.

## Why Investors And Judges Should Care

Arena's core claim is not "another prediction-market UI." It introduces a new supply source for markets: crowd consensus.

- `New asset`: research, review, preference testing, community validation, and entertainment debates can become tradable results.
- `More market supply`: markets do not need to wait for external news; brands, DAOs, AI teams, platforms, and communities can create them directly.
- `Lower participation barrier`: strong topical propositions let regular users participate without first understanding complex financial events.
- `Clear trust model`: direction is hidden before reveal, then settlement happens around the effective-sample result.
- `Expansion path`: start with entertainment and consensus propositions, then expand into requester dashboards, research networks, AI evaluation, and DAO governance.

For hackathon judges, Arena is no longer just a concept. The repository can demo the home feed, topic markets, staking experience, demo session, proposition creation, response tasks, results, watchlist, account state, and a minimum settlement path.

For investors, the key question is not whether a single topic can go viral. It is whether this mechanism can continuously generate new markets. Entertainment propositions are the front door; brand research, AI evaluation, and community governance are the commercial expansion paths.

## Current MVP

The current version is intentionally narrow. The goal is to run one complete crowd consensus prediction-market path, not to build a full exchange all at once.

In scope:

- Non-rolling propositions.
- Single-question survey / outcome markets.
- Binary outcomes.
- Simple staking and one-shot settlement.
- Platform dispatch, answer submission, basic review, effective-sample counting, and unified reveal.
- Pre-reveal progress display without direction leakage.
- Replaceable data paths between demo sessions and real APIs.

Explicitly out of scope:

- Complex long surveys.
- Deep open-ended answer analysis.
- Rolling propositions and periodic settlement.
- Complex AMMs.
- Complex order books.
- Multi-asset staking.
- Any pre-reveal directional intermediate state.

## What You Can Demo Today

The current repository already has a product shape suitable for judges and investors:

- Home and market feed.
- Hot, breaking, latest, and category directories.
- More topical and entertaining demo propositions.
- Market detail pages and binary participation experience.
- Featured-card comment danmaku for demo engagement.
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

```text
http://localhost:5173
```

For the first pass, type `demo` in the login flow and walk through home, market detail, drafts, challenge submission, adjudication, results, and watchlist.

## Developer Appendix

The following details are kept for reproducibility and continued development. For a hackathon demo, the "Quick Start" path is usually enough.

### Local Integration

If the local backend, validation runtime, and frontend should work together, use the repository wrapper:

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
│  └─ validation/
│     └─ Arena.sol
├─ docs/
│  └─ PRODUCT_SCOPE.md
├─ scripts/
├─ test/
├─ docker-compose.yml
└─ README_EN.md
```

## Current State

Arena is past the idea-or-page-mock stage, but it is not claiming to be a complete production system yet.

What can be claimed clearly today:

- A browsable, demoable crowd consensus prediction-market product shell with replaceable mock / real data paths.
- Runnable application services and local data dependencies.
- Application paths across proposition / result production / validation.
- Validation-market contract, deploy scripts, sync, projection, monitoring, and runbooks.

What it explicitly does not claim:

- Survey / hybrid / rolling are already complete.
- Complex AMMs, order books, or multi-asset markets are complete.
- The frontend is already prepared for every future trading model.
- The old legacy Arena contract is still the core protocol path.
- Production-grade rollback / observability / operator platform are fully complete.

## Further Reading

- [docs/PRODUCT_SCOPE.md](./docs/PRODUCT_SCOPE.md)
- [AGENTS.md](./AGENTS.md)
- [docs/contracts/arena-phase1-spec.md](./docs/contracts/arena-phase1-spec.md)
- [docs/contracts/arena-phase3-backend-integration.md](./docs/contracts/arena-phase3-backend-integration.md)
- [docs/contracts/arena-validation-chain-runbook.md](./docs/contracts/arena-validation-chain-runbook.md)

## License

The repository does not currently declare a top-level open-source license. If you intend to publish it openly, add a `LICENSE` file first and then lock the license statement into the README and badges.
