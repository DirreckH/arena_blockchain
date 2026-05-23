# AGENTS.md

This file defines the repository's default delivery protocol for software product projects.
Human contributors and AI agents should treat it as the operating contract unless a more specific project rule overrides part of it.

This repository uses `product-shape-driven + progressive capability delivery`:

- Group B defines the intended product experience
- Group A makes that experience real without collapsing it

## 1. Core Delivery Model

This project is developed in two parallel tracks.

- Group A builds systems, integrations, data layers, and real capability.
- Group B shapes the frontend, flows, interaction quality, and visual polish.
- Group B may move early with mocks and fixtures.
- Group A progressively replaces mocked behavior with real implementation behind the validated product shape.

This is the default mode of execution. Do not convert it into a strict waterfall unless explicitly requested.
Default sequence:

product shape becomes visible
-> interaction feels real
-> user experience becomes testable
-> real capability replaces mock behavior

## 2. A-Track And B-Track

Every task should be classified before work starts:

- `Group A` means the owner of `A-track` work
- `Group B` means the owner of `B-track` work
- `A-track`: scaffold, architecture, backend, integrations, data model, read model, auth, deployment, production hardening
- `B-track`: frontend productization based on the existing design direction, including interaction refinement, flow completion, usability, copy, visual polish, and responsiveness
- `A+B`: integration work that connects real capability into an already-shaped flow

If a task spans both sides, preserve the distinction in the implementation plan instead of blurring ownership.

## 3. Group Ownership

### Group A owns

Group A is the `Architecture` side of the project.
Its job is system engineering, not product cosmetics.

- repo bootstrap, architecture, services, and APIs
- persistence, read models, caching, events, and business logic
- auth, permissions, providers, infrastructure, and deployment
- replacing frontend mocks with real integration
- observability, reliability, performance, and production readiness

### Group B owns

Group B is the `Product` side of the project.
Its job is product expression, not infrastructure ownership.

- pages, components, layout, and responsiveness
- productization of the existing frontend direction into a believable product experience
- journey refinement, interaction flow, states, recovery paths, and fixtures
- copy, hierarchy, affordances, trust, and visual polish
- product language and how complexity is abstracted for users

## 4. Product-First Principle

Frontend is not a skin layer in this repository.
For product-led systems, user experience is part of the product logic.

- Group B defines intended product behavior, not just visuals
- Group A treats that behavior as an implementation target
- When Group B says `after this user action, the product should feel like this`, Group A is expected to build the system behavior needed to make it true

## 5. Product-First Design Principle

Users experience the product before they evaluate the implementation substrate.

- make the end-to-end product shape visible early, even with mocks
- preserve that shape when introducing real services and data systems
- replace internals before rewriting a validated user flow

## 6. Track Guardrails

Each side should protect its own quality bar.

### Group A guardrails

- do not get pulled into incidental padding, animation, or visual-tuning work unless the task is explicitly `A+B`
- do not let short-term UI pressure erode interface design, domain clarity, data flow, or system stability
- do not hide real capability constraints that will invalidate product behavior later

### Group A delivery bias

For `A-track`, optimize for the smallest enabling system that can support the intended product flow reliably.

- prefer minimal enabling infrastructure over speculative architectural breadth
- prefer compatibility, migration safety, and operational clarity over abstract system purity
- do not expand scope just to make the architecture feel more complete than the current product requires
- when interface or data changes are needed, favor adapter, migration, or compatibility layers before broad rewrites

### Group B guardrails

- do not let incomplete backend or platform work limit product exploration too early
- do not reduce the current design direction into a thinner or more generic experience just because the system is incomplete
- do not treat mock-first work as disposable throwaway work
- build on the existing frontend direction unless a clear usability or coherence problem requires a change

### Group B productization bias

For `B-track`, optimize for product completeness over novelty.

- refine and extend the current frontend direction before proposing a replacement
- prefer filling missing seams, clarifying hierarchy, smoothing flows, and improving trust over introducing a new visual direction
- treat the existing frontend as the base material to be completed into a real product, not as a disposable sketch
- only pursue broader redesign when the current direction cannot support a coherent, usable product experience

### A+B integration bias

For `A+B`, optimize for contract-preserving integration.

- connect real capability into the existing product flow before proposing flow redesign
- prefer adapters, mapping layers, and state translation over structural UI rewrites
- treat the validated product experience as the integration target unless real behavior makes it inaccurate or deceptive
- when integration forces a product change, make that change explicit rather than silently collapsing the intended UX

## 7. Operating Rules

All agents must follow these defaults:

1. Prefer parallel progress over waiting for another track.
2. Group B may ship mock-first flows before services or APIs are ready.
3. Group A should provide provisional interfaces as early as possible, even before final implementation exists.
4. Frontend work should not block on finalized backend or integration delivery if response shapes, fixture payloads, or adapter mocks can unblock it.
5. Backend and integration work should not wait for final visual polish.
6. Replace mocks through adapters, not through broad UI rewrites.
7. Keep reversible seams between mock mode and real mode.
8. Treat platform-specific constraints as implementation details unless they materially change the product promise.
9. For `B-track`, prefer completing and strengthening the existing frontend direction over pursuing novelty or broad redesign.

## 8. Source Of Truth

The source of truth is intentionally split.

### Group B is primary for

- page structure
- user journey
- component state model
- action progression UX
- the degree of completeness required for the product to feel real and usable
- user-facing wording around sensitive or multi-step operations
- what the user sees, clicks, waits on, and recovers from

### Group A is primary for

- service and system behavior
- backend correctness
- event semantics
- read-model rules
- permission and auth rules
- data consistency
- environment and infrastructure constraints

When the two sides conflict:

1. preserve the validated user flow if possible
2. adapt the implementation layer first
3. only redesign the flow when real system behavior makes the existing UX incorrect or deceptive

## 9. Required Handoff Contract Between A And B

Group B must not hand over only screenshots.
Group A must not hand over only implementation endpoints.
Both sides need explicit integration contracts.

### Group B should provide

- flow definitions, screen-level data needs, and the states required for product completeness
- mock payloads, example outcomes, and latency or retry assumptions
- expected labels and action timing around confirmations or external prompts

### Group A should provide

- interface shapes, method semantics, and event timing assumptions
- environments, endpoints, resource mappings, and read-model freshness guarantees
- auth rules, failure modes the UI must surface, and integration status for mocked flows

If a piece is not ready, provide a provisional version rather than blocking the other track.

## 10. Rules For Domain Interfaces And Integrations

When interface-heavy or integration-heavy work exists, Group A should assume those boundaries are product infrastructure, not isolated artifacts.

- Interface names, method shapes, and emitted events should be chosen with frontend readability in mind.
- Schema or interface changes are breaking changes unless explicitly coordinated.
- Event design must support the product's read experience, not only write execution.
- Service outputs should be made easy to consume through typed wrappers or adapters.
- Do not leak raw platform complexity into the UI if an adapter can normalize it.
- If an integration constraint changes a user promise, call it out explicitly to Group B before integration.

## 11. Rules For Indexing And Read Models

Many products need a read layer beyond direct service calls.

- If the product depends on historical data, aggregation, feeds, ranking, activity streams, or derived state, assume a read-model pipeline, index, or cache is part of A-track.
- Group B may prototype against static or local fixture data that resembles the future read model.
- Group A should publish response shapes early so B-track components can stabilize before real read-model implementation is complete.
- UI should know whether data is direct, indexed, cached, computed, or estimated when that distinction affects trust or freshness.

## 12. Rules For Async Actions And Sensitive UX

Async and sensitive interaction UX is not an afterthought.
It is part of the product contract.

Group B should always represent these states where relevant:

- user not authenticated
- unsupported environment
- prerequisites or permissions insufficient
- approval required
- confirmation requested
- action submitted
- action pending completion
- action confirmed or completed
- user rejected
- failed or rolled back

Group A should provide enough semantic detail so the UI can distinguish them.
Do not collapse all failures into a generic error if the user action differs.

## 13. Mock-First Policy

Mock-first is the default for B-track when it accelerates product clarity.

- Use fake accounts, fake balances, fake records, fake activity, and simulated backend outcomes where needed.
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
- backend, integration, and data behavior matches the intended product flow
- mocks are removed or clearly isolated behind replaceable seams
- failure modes and deployment implications are explicit

### B-track done means

- the existing frontend direction has been refined into something that feels like a real product rather than a partial prototype
- the user flow is clear, usable, and materially complete for the current slice
- key states and recovery paths needed for product credibility are represented
- the frontend can accept real integration without major structural change

### A+B integration done means

- real system capability is connected to the intended flow
- the real end-to-end flow has been exercised
- real latency, failure, recovery, and state transitions remain coherent
- no avoidable UX regression or hidden mock-only assumption remains in the integrated path

## 15. Preferred Delivery Order

Unless the user explicitly asks otherwise, use this sequence during repository bootstrap and first-pass product shaping:

1. create the working repo skeleton
2. make the product shape visible end-to-end with mocks
3. define stable interfaces between UI, backend, integrations, and read models
4. implement real backend, integration, and data capability
5. connect real capability into the existing flows
6. polish frontend UX and production quality in parallel

This section defines the default startup sequence for a new or still-forming project.
Once the initial product shape exists, per-slice iteration order is governed by `## 20. Default Iteration Order`.

## 16. Decision Heuristics

Use these when tradeoffs are unclear:

- If the choice is between blocking and a reversible mock, choose the reversible mock.
- If the choice is between interface purity and preserving a good user flow, prefer preserving the user flow unless it would be misleading.
- If the choice is between exposing raw platform behavior and normalizing it through an adapter, prefer normalization.
- If the choice is between frontend rewrite and backend adapter, prefer the adapter unless the UI is fundamentally wrong.
- If the choice is between visual polish and action clarity, land action clarity first.

## 17. Output Expectations For AI Agents

When an AI agent works in this repository, it should classify the task as `A-track`, `B-track`, or `A+B`, keep interface and data contracts explicit, avoid unrelated rewrites, preserve mock-to-real seams, and preserve validated product experience unless a real constraint forces change.

If context is incomplete, do not freeze by default. Make the smallest reasonable assumption that preserves forward motion and document it.

## 18. Project-Level Extensions

This file is the permanent default. Projects may add more specific documents for layout, ownership, coding standards, test commands, deployment, supported environments, versioning, security review, or roadmap detail.

Those rules may extend this file, but should not casually override the A/B parallel workflow unless the project explicitly chooses a different operating model.

## 19. Product Scope Read Requirement

If `docs/PRODUCT_SCOPE.md` exists, the agent should read it before planning or implementing broad product goals.

Treat `docs/PRODUCT_SCOPE.md` as the primary source of truth for:

- product thesis
- target user
- MVP boundary
- core user flows
- major feature scope
- explicit non-goals

`AGENTS.md` defines how the repository should be developed.
`docs/PRODUCT_SCOPE.md` defines what product is being built.

For a minimal repository workflow, default to these two files first:

1. `AGENTS.md`
2. `docs/PRODUCT_SCOPE.md`

If repository code or older documents conflict with `docs/PRODUCT_SCOPE.md`, preserve awareness of implementation reality, but use `docs/PRODUCT_SCOPE.md` as the default product-direction reference unless a newer explicit user instruction overrides it.

## 20. Goal Expansion Protocol

When the user gives a broad goal, the agent should not stop at planning.

1. infer the product thesis, target user, core loop, and MVP boundary
2. identify which important flows are `not visible`, `mocked`, `partially real`, or `productionizing`
3. choose the highest-value incomplete vertical slice
4. split it into `A-track`, `B-track`, and `A+B`
5. implement and verify the slice
6. continue until the MVP gate is met or the user stops the work

If ambiguity remains, make the smallest reasonable assumption that preserves forward motion and document it.
For broad goals, analysis is not the final output; after the first sufficient repository pass, begin the next slice immediately.

## 21. Default Iteration Order

Do not rigidly force `A-track -> B-track -> A+B` on every slice.

This section takes priority over `## 15. Preferred Delivery Order` after bootstrap work is complete and the repository has entered normal slice-by-slice iteration.

Use the order that best preserves product-shape-driven delivery:

- if the flow is not yet visible, do `B-track` first
- if the flow is visible but mocked, do `A-track` next and then `A+B`
- if the flow is already real but rough, do `A+B` hardening and `B-track` polish in parallel
- if infrastructure is missing but blocks multiple flows, do the minimum `A-track` substrate needed to unblock product progress

The purpose is not track ritual.
The purpose is to land the next highest-value usable slice.

## 22. Minimal Discovery Before Action

Repository understanding should be sufficient, not exhaustive.
Before the first implementation pass, read only enough to identify the product, primary user, main user journey, what is real vs mocked, and the next highest-leverage slice.

Unless the user explicitly asked for analysis only, start implementation after that first pass.

## 23. Priority Rules For Autonomous Work

When multiple tasks are possible, prefer this order:

1. the primary end-to-end user flow
2. trust-critical and multi-step interaction states
3. adapters and interfaces that unblock mock-to-real replacement
4. read models, data pipelines, and backend endpoints required by already-visible screens
5. production hardening for already-real flows
6. visual polish after correctness, trust, and completion are in place

Prefer the smallest shippable vertical slice over broad but shallow progress.
Prefer deeper completion of in-scope core flows over adding breadth outside `docs/PRODUCT_SCOPE.md`.

## 24. Repository Verification Contract

Each project should expose or document the canonical commands for:

- install
- dev
- lint
- typecheck
- unit test
- integration test
- e2e or smoke test
- production build

If one or more commands do not exist yet, the agent should infer the closest available checks from the repository and create the missing validation path when practical.

A slice is not complete until the relevant validation commands for that slice have been run.

After meaningful `B-track` or `A+B` UI changes, run the application and visually verify the affected flow when practical.

When validation commands are unclear, the agent should discover them from the repository and record them in project documentation rather than repeatedly guessing.

## 25. Default Test-Fix Loop

After every meaningful implementation step, the agent should:

1. run the narrowest relevant validation first
2. inspect the failure precisely if it fails
3. apply the smallest fix that restores forward progress
4. rerun the same validation
5. run broader validation before declaring the slice done

When the change materially affects user-facing UI, include a visual verification pass of the affected flow before declaring the slice done.

Do not stop at the first failed test or build error unless blocked by missing credentials, external outages, or destructive-risk operations.

Default loop: `implement -> test -> fix -> retest -> widen validation`

## 26. Bugfix Protocol

When a bug is discovered through tests, runtime behavior, logs, or user reports, the agent should:

1. reproduce the bug
2. identify the smallest failing surface
3. add or update a regression test when practical
4. fix the root cause with the smallest reasonable change
5. rerun the failing test
6. rerun adjacent validation to check for regressions
7. document any remaining risk or follow-up work

Do not apply broad speculative rewrites when a localized fix is sufficient.

## 27. Staged Commit Policy

Do not accumulate many unrelated changes before committing.

The default unit of progress is one verified vertical slice or one verified bugfix.

After a slice passes its relevant validation, the agent should create a small, logical commit before starting the next slice, unless the user explicitly asked for no commits.

Prefer:

- one user-visible flow increment per commit
- one infrastructure enabler per commit
- one bugfix with its regression coverage per commit

Avoid mixing unrelated refactors, feature work, and cleanup in the same commit.

If a slice naturally separates into `B-track`, `A-track`, and `A+B`, prefer separate commits when the boundaries are clean enough to keep history readable.

## 28. Commit Gates

A commit should normally require:

- the current slice to be runnable or meaningfully integrated
- relevant lint, type, build, and test checks for that slice to pass
- no known avoidable broken state in touched areas
- mock and real boundaries to remain explicit
- a commit message that describes the logical change clearly

Do not create large catch-all commits after multiple slices if smaller verified commits were possible.

## 29. Commit And Push Safety

By default, the agent may commit verified slices locally.

Do not push to remote automatically unless the user explicitly asked for push or the project explicitly enables auto-push for this repository.

Committing in stages is preferred. Pushing is a separate release decision.

## 30. Release Gates

A vertical slice is not done unless:

- the intended user flow can be completed end-to-end
- required interaction and completion states are represented
- the UI interface contract matches the real or planned data shape
- remaining mocks are isolated behind adapters, providers, or explicit feature flags
- build, lint, and relevant tests pass
- environment, config, and deployment implications are explicit

The project reaches `MVP release-ready` when:

- the primary user journey works end-to-end on a supported environment
- critical failure, rejection, pending, and recovery states are honest and usable
- user-critical paths are backed by real integrations, or remaining mocks are explicitly non-production
- deploy steps and required environment variables are documented
- no major structural rewrite is needed before real users can use the product

## 31. Ask vs Assume

Do not ask the user for routine prioritization during autonomous execution.

Make the smallest reasonable assumption and proceed.

Ask only when blocked by:

- missing secrets, API keys, or external credentials
- a decision that materially changes the product promise
- irreversible migrations or destructive operations
- legal, financial, or security-sensitive release decisions
- direct conflicts between repository sources of truth

## 32. Persistent Execution Artifacts

To support long-running autonomous iteration, keep these artifacts updated when they exist, or create them if missing:

- `docs/PRODUCT_SCOPE.md`: product thesis, target user, MVP boundary, and core flows
- `docs/INTEGRATION_STATUS.md`: optional mocked vs real status for important flows
- `docs/NEXT_SLICES.md`: optional ordered vertical slices to implement

`docs/PRODUCT_SCOPE.md` is the only required product-context artifact in the minimal workflow.
Other execution-memory files are optional and should be used only when they increase clarity.

Keep these files brief, current, and actionable.

## 33. Autonomous Execution Loop

For broad project goals, repeat: choose the next highest-value slice, implement it using the `A-track` / `B-track` / `A+B` model, validate it, fix failures, commit the verified change, and move to the next slice.

## 34. Output Behavior For Broad Goals

When working from a broad goal, report the inferred product and MVP, the current slice, completed `A-track` / `B-track` / `A+B` work, verification results, and the next slice.

Do not stop after one slice if the goal still stands and there is clear next work.
