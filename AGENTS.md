# AGENTS.md

This file defines the permanent working model for this repository.
It is written for Web3 / dApp projects and should live at the project root.
Human contributors and AI agents should treat it as the default operating contract unless a more specific project rule explicitly overrides part of it.

This repository uses a:

`product-shape-driven + progressive capability delivery` dual-track model

In plain terms:

- Group B defines what the product should feel like
- Group A makes that product real without collapsing the intended experience

## 1. Core Delivery Model

This project is developed in two parallel tracks.

- Group A builds the skeleton, engineering substrate, backend, contracts, indexing, and real capabilities.
- Group B builds the frontend, product shape, user flows, wallet-facing UX, and visual polish.
- Group B is allowed to move early with mocks, static fixtures, fake wallet states, and simulated chain results.
- Group A then replaces mocked capability with real implementation behind the product shape that Group B has made concrete.
- Group B continues refining interaction quality and visual fidelity while Group A completes real integration.

This is the default mode of execution. Do not convert it into a strict waterfall unless explicitly requested.
The intended sequence is:

product shape becomes visible
-> interaction starts to feel real
-> user experience becomes testable
-> real capability progressively replaces mock behavior

## 2. A-Track And B-Track

Every task should be classified before work starts:

- `A-track`: scaffold, architecture, backend, contracts, data model, indexer, RPC integration, auth, deployment, production hardening
- `B-track`: frontend, interaction, product flow, wallet UX, transaction states, copy, visual design, responsiveness
- `A+B`: integration work that connects real capability into an already-shaped flow

If a task spans both sides, preserve the distinction in the implementation plan instead of blurring ownership.

## 3. Group Ownership

### Group A owns

Group A is the `Architecture` side of the project.
Its job is system engineering, not product cosmetics.

- repo structure and app bootstrapping
- environment setup and deployment baseline
- smart contract architecture
- Solidity or equivalent contract implementation
- ABI generation and contract versioning
- backend services and API routes
- off-chain persistence and server-side business logic
- indexer, subgraph, event ingestion, or other read-model pipelines
- queueing, streaming, and agent orchestration infrastructure
- wallet auth, signature verification, session binding, permissions
- RPC providers, chain configuration, and network environment management
- replacing frontend mocks with real chain and backend integration
- observability, reliability, performance, and production readiness

### Group B owns

Group B is the `Product` side of the project.
Its job is product expression, not infrastructure ownership.

- frontend pages, components, and layout system
- product shape and user journey design
- transaction UX and wallet interaction flow
- empty/loading/success/failure/cancelled/pending states
- mock data presentation and fixture-driven screens
- responsive behavior and perceived performance
- copy clarity, affordances, visual hierarchy, and frontend polish
- high-trust UX around signing, approvals, gas, waiting, and failure recovery
- product language: how AI is presented, how Web3 is abstracted, how data/risk/reward are communicated, and how agents feel alive

## 4. Product-First Principle

Frontend is not a skin layer in this repository.

For AI + Web3 + agentic products, the user experience is part of the product logic.
That means:

- Group B is not just drawing screens
- Group B is defining product behavior
- Group A should treat that behavior as an implementation target, not as decorative output

When Group B says:

`after this user action, the product should feel like this`

Group A is expected to implement the API, service, agent workflow, queue, cache, stream, contract, or indexer behavior needed to make it real.

## 5. Web3-Specific Design Principle

In a dApp, the user experiences the product before they evaluate the implementation substrate.
Therefore:

- Group B should make the end-to-end product shape visible early, even if powered by mocks.
- Group A should preserve that product shape when introducing real contracts, indexers, and backend logic.
- Real integration should replace internals before it rewrites a validated user flow.

The user-facing flow is not disposable.
The implementation behind it is expected to evolve.

## 6. Track Guardrails

Each side should protect its own quality bar.

### Group A guardrails

- do not get pulled into incidental padding, animation, or visual-tuning work unless the task is explicitly `A+B`
- do not let short-term UI pressure erode contract design, domain clarity, data flow, or system stability
- do not hide real capability constraints that will invalidate product behavior later

### Group B guardrails

- do not let incomplete backend or contract work limit product exploration too early
- do not reduce ambitious flows to match current system limitations if the limitation is temporary
- do not treat mock-first work as disposable throwaway work

## 7. Operating Rules

All agents must follow these defaults:

1. Prefer parallel progress over waiting for another track.
2. Group B may ship mock-first flows before contracts or APIs are ready.
3. Group A should provide provisional interfaces as early as possible, even before final implementation exists.
4. Frontend work should not block on finalized contract deployment if ABI shape, fixture payloads, or adapter mocks can unblock it.
5. Contract and backend work should not wait for final visual polish.
6. Replace mocks through adapters, not through broad UI rewrites.
7. Keep reversible seams between mock mode and real mode.
8. Treat chain-specific constraints as implementation details unless they materially change the product promise.

## 8. Source Of Truth

The source of truth is intentionally split.

### Group B is primary for

- page structure
- user journey
- component state model
- transaction progression UX
- wallet interaction wording
- what the user sees, clicks, waits on, and recovers from

### Group A is primary for

- contract behavior
- backend correctness
- event semantics
- indexing rules
- permission and auth rules
- data consistency
- network and environment constraints

When the two sides conflict:

1. preserve the validated user flow if possible
2. adapt the implementation layer first
3. only redesign the flow when real contract or system behavior makes the existing UX incorrect or deceptive

## 9. Required Handoff Contract Between A And B

Group B must not hand over only screenshots.
Group A must not hand over only deployed addresses.
Both sides need explicit integration contracts.

### Group B should provide

- flow definitions for each user action
- screen-level data requirements
- component states for not-connected, wrong-network, loading, signing, pending, success, rejected, reverted, failed
- mock payloads and example transaction outcomes
- assumptions about latency, confirmations, and retry behavior
- expected labels and action timing around wallet prompts

### Group A should provide

- contract ABI or typed client bindings
- write/read method semantics
- event model and event timing assumptions
- chain IDs and supported network list
- contract addresses per environment
- indexer or read-model availability and freshness guarantees
- auth and signature rules
- failure modes the UI must surface
- integration status for each mocked flow

If a piece is not ready, provide a provisional version rather than blocking the other track.

## 10. Rules For Smart Contracts

When contract work exists, Group A should assume contracts are product infrastructure, not isolated artifacts.

- Contract names, method shapes, and emitted events should be chosen with frontend readability in mind.
- ABI changes are breaking changes unless explicitly coordinated.
- Event design must support the product's read experience, not only write execution.
- Contract outputs should be made easy to consume through typed wrappers or adapters.
- Do not leak raw chain complexity into the UI if an adapter can normalize it.
- If a contract constraint changes a user promise, call it out explicitly to Group B before integration.

## 11. Rules For Indexing And Read Models

Most dApps need a read layer beyond direct RPC reads.

- If the product depends on historical data, aggregation, feeds, ranking, activity streams, or derived state, assume an indexer/subgraph/read-model is part of A-track.
- Group B may prototype against static or local fixture data that resembles the future read model.
- Group A should publish response shapes early so B-track components can stabilize before real indexing is complete.
- UI should know whether data is direct-from-chain, indexed, cached, or estimated when that distinction affects trust or freshness.

## 12. Rules For Wallet And Transaction UX

Wallet UX is not an afterthought.
It is part of the product contract.

Group B should always represent these states where relevant:

- wallet not connected
- unsupported network
- balance or allowance insufficient
- approval required
- signature requested
- transaction submitted
- transaction pending confirmation
- transaction confirmed
- user rejected
- reverted or failed

Group A should provide enough semantic detail so the UI can distinguish them.
Do not collapse all failures into a generic error if the user action differs.

## 13. Mock-First Policy

Mock-first is the default for B-track when it accelerates product clarity.

- Use fake wallets, fake balances, fake positions, fake activity, and simulated contract outcomes where needed.
- Mocks should resemble future real payloads.
- Mock mode should be easy to remove or swap through adapters, provider layers, or typed fixtures.
- Do not build mock-only component APIs that will force structural rewrites later.

Mock stage is not "fake work".
It is the product prototype layer.

A good mock is not a throwaway visual.
It is a temporary compatibility layer that helps define the product contract before the full system exists.

## 14. Definition Of Done

### A-track done means

- the capability is real, wired, and testable
- contract/backend/indexer behavior matches the intended product flow
- mocks are removed or clearly isolated behind replaceable seams
- failure modes are surfaced in a way the frontend can represent honestly
- environment-specific deployment/config details are explicit

### B-track done means

- the user flow is clear and usable
- transaction and wallet states are represented
- major edge states exist
- the frontend can accept real integration without major structural change
- visual and interaction choices support trust, clarity, and completion

### A+B integration done means

- real chain/backend capability is connected to the intended flow
- the user journey still makes sense under real latency and failure conditions
- state transitions remain coherent
- no unnecessary UX regression was introduced just to fit the implementation

## 15. Preferred Delivery Order

Unless the user explicitly asks otherwise, use this sequence:

1. create the working repo skeleton
2. make the product shape visible end-to-end with mocks
3. define stable interfaces between UI, contracts, backend, and read models
4. implement real contract/backend/indexing capability
5. connect real capability into the existing flows
6. polish frontend UX and production quality in parallel

## 16. Decision Heuristics

Use these when tradeoffs are unclear:

- If the choice is between blocking and a reversible mock, choose the reversible mock.
- If the choice is between contract purity and preserving a good user flow, prefer preserving the user flow unless it would be misleading.
- If the choice is between exposing raw chain behavior and normalizing it through an adapter, prefer normalization.
- If the choice is between frontend rewrite and backend adapter, prefer the adapter unless the UI is fundamentally wrong.
- If the choice is between visual polish and transaction clarity, land transaction clarity first.

## 17. Output Expectations For AI Agents

When an AI agent works in this repository, it should:

- identify whether the task is `A-track`, `B-track`, or `A+B`
- state assumptions that affect the other track
- keep ABI/API/data contracts explicit
- avoid rewriting unrelated work
- leave clear seams for mock-to-real replacement
- preserve validated product shape unless a real constraint forces change

If context is incomplete, do not freeze by default.
Make the smallest reasonable assumption that preserves forward motion and document it.

## 18. Project-Level Extensions

This file is the permanent default.
Projects may add more specific documents for:

- monorepo layout
- folder ownership
- coding standards
- test commands
- deployment process
- supported chains and environments
- contract release/versioning rules
- security review and audit workflow
- current-phase roadmap and page-level priorities

Those rules may extend this file, but should not casually override the A/B parallel workflow unless the project explicitly chooses a different operating model.
