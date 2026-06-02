# Requester Budget Ledger Capability

CAPABILITY

Arena 现在还没有把请求方在 proposition 上的预算从“配置字段”升级成“可核对的真实账本能力”。当前 `/zh/submissions`、请求方 proposition detail、settled report 里只能看到 `rewardBudget` 和 `baseResponseReward` 这类配置值，但请求方还看不到预算到底已经保留了多少、已经消耗了多少、还剩多少、是否被人工调整过。这个能力上线后，请求方应该能在现有产品壳内看到同一套预算真相，而不是继续把奖励配置误读成完整预算状态。

CONSTRAINTS

- 不能把现有 respondent `reward ledger` 直接当成 requester budget ledger。
  - respondent ledger 记录的是回答奖励的待结算 / 已结算 / 冲正语义
  - requester budget ledger 记录的是 proposition 预算的配置、占用、消耗、调整、回补语义
- 不能继续让不同 requester surface 各自推断预算状态：
  - `GET /arena/propositions/mine/:propositionId`
  - `GET /arena/propositions/mine/:propositionId/report`
  - `GET /arena/propositions/mine/overview`
  必须共享同一个预算真相来源。
- 在真实 budget contract 出来之前，UI 不能重新把 `Reward configuration` 叫回 `Requester budget`。
- 预算账本必须是 requester 可读、可解释的：
  - opening budget
  - reserved
  - spent
  - remaining
  - adjustment delta
  - why it changed
- 这个 slice 优先解决“预算真相可见”，不是支付系统、充值系统或外部清结算系统。
- 预算状态不能泄露任何与未开奖方向有关的信息；它只能解释资金状态，不解释结果方向。

IMPLEMENTATION CONTRACT

- Actors
  - `Requester`
  - `System`
  - `Operator/Admin` for explicit adjustments or repair flows if needed

- Surfaces
  - existing requester surfaces that should consume budget truth:
    - `GET /arena/propositions/mine/:propositionId`
    - `GET /arena/propositions/mine/:propositionId/report`
    - `GET /arena/propositions/mine/overview`
  - recommended new read surface for history:
    - `GET /arena/propositions/mine/:propositionId/budget-ledger`
  - existing `/zh/submissions` flow should render the same budget summary and history semantics instead of only raw configuration fields

- Required state model
  - proposition still keeps author-configured fields:
    - `rewardBudget`
    - `baseResponseReward`
  - new requester-visible budget projection should expose:
    - `configuredBudget`
    - `reservedAmount`
    - `spentAmount`
    - `remainingAmount`
    - `adjustedAmount`
    - `status`
    - `lastUpdatedAt`
  - recommended minimum ledger row model:
    - `entryId`
    - `propositionId`
    - `entryType` such as `configured | reserved | spent | adjusted | released`
    - `amount`
    - `balanceAfter`
    - `reasonCode`
    - `createdAt`
    - optional `actorType` and `actorId`

- Transitions
  - proposition creation or submission establishes the opening configured budget record
  - budget-affecting runtime events append ledger rows instead of overwriting prior state
  - requester-facing summary is always derived from the latest ledger state, not inferred ad hoc from proposition fields
  - adjustments preserve auditability; they do not silently mutate opening rows

- API / data implications
  - shared requester view models need a first-class budget object instead of raw configuration-only wording
  - requester detail and settled report should embed budget summary
  - requester overview may expose aggregated totals later, but proposition-scoped truth is the first required closure
  - backend needs one durable projection source for requester budget rows; do not scatter the computation across controller formatters

- Security / policy constraints
  - requester can only see budget ledgers for owned propositions
  - operator adjustments, if supported in this slice, must remain audit-visible
  - no secret, wallet, or unresolved directional signal should leak through budget copy or history

- Observability and audit
  - budget-history rows need stable reason codes so UI copy and operator debugging are consistent
  - if a summary and history disagree, that is a bug; they must be backed by the same projection
  - tests should prove that requester surfaces do not regress back to configuration-as-ledger wording once the new contract exists

NON-GOALS

- This slice does not build recharge, invoicing, or external billing.
- This slice does not redesign `/zh/submissions` into a new information architecture.
- This slice does not replace respondent reward-ledger behavior.
- This slice does not broaden settlement math or response-review reward rules.

OPEN QUESTIONS

- What exact runtime event should move budget from `configured` into `reserved`:
  - draft creation
  - submission
  - approval
  - publish / live
- Should requester budget ledger be strictly proposition-scoped in the first cut, or should `mine/overview` also expose requester-level totals immediately?
- Which events should create `spent` rows in MVP:
  - finalized respondent rewards only
  - manual operator adjustments
  - refunds / reversals after corrected review
- When a proposition is voided, canceled, or archived without full reward spend, should the remaining amount become an explicit `released` row?

HANDOFF

- Recommended next implementation lane: direct `A-track -> A+B` execution.
- Start with a read-first, contract-preserving vertical slice:
  - define durable requester budget summary + ledger row view models
  - add one proposition-scoped ledger read surface
  - wire existing requester detail / report / submissions surfaces to that shared truth
  - only then upgrade UI wording from `Reward configuration` where the ledger really exists
- After that lands, follow with:
  - targeted web verification on `/zh/submissions`
  - optional requester-overview aggregation if the proposition-scoped contract is stable

IMPLEMENTED DECISIONS

- The first requester budget closure is proposition-scoped and read-first.
- The backend now exposes:
  - `GET /arena/propositions/mine/:propositionId/budget-ledger`
- Requester proposition detail, settled report, and overview now embed budget summary fields.
- The current budget projection is intentionally derived from the existing respondent reward-ledger substrate:
  - current pending reward rows contribute `reservedAmount`
  - current finalized reward rows contribute `spentAmount`
  - current voided / partial outcomes contribute `releasedAmount`
  - reversed historical rows contribute `adjustedAmount`
- `/zh/submissions` now upgrades the previous `Reward configuration` copy into budget-summary and budget-ledger surfaces where the real contract exists.

VERIFICATION

- `pnpm --filter @arena/api typecheck`
- `pnpm --filter @arena/api test:arena`
- `pnpm --filter @arena/web test -- SubmissionsPage.test.tsx`
- `pnpm --filter @arena/web check`
- All four pass on the current 2026-06-02 worktree.
