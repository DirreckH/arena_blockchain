# Response Review Claim / Release Capability

CAPABILITY

Arena 需要把“待审核响应”从现在的“任何操作员都可以直接最终审核”升级为“操作员先占用、再释放或最终审核”的真实能力。上线后，内部审核人员对 `pending_review` 响应的处理将拥有明确归属、冲突语义、超时回收和可审计状态，而不是在没有工作所有权的情况下直接把待审核项推进到 `valid | partial_valid | invalid | fraud_suspected`。

CONSTRAINTS

- `pending_review` 仍然表示“尚未最终定性”的审核状态，不能把 claim / release 混进最终审核状态枚举里。
- claim / release 语义必须独立于最终审核结果语义：
  - claim 不得触发奖励结算
  - claim 不得改变计数器有效样本
  - claim 不得改变 proposition / market / settlement 状态
- 最终审核仍然只能产生现有最终状态：
  - `valid`
  - `partial_valid`
  - `invalid`
  - `fraud_suspected`
- claim 必须是单拥有者语义：
  - 同一条 `pending_review` 在同一时刻只能被一个操作员持有
  - 第二个操作员不能静默覆盖第一个操作员的持有状态
- release 只能释放仍处于待审核态的 claim，不能“释放”已经最终审核的记录。
- stale claim 需要有明确 expiry / takeover 语义，但不能隐式丢失审计痕迹。
- 当前已有正式运行入口是：
  - `POST /arena/internal/responses/:responseId/review`
  - 该入口后续要么要求 active claim，要么要执行一条明确且可审计的自动 claim -> finalize 路径；不能继续保持“无所有权直接最终审核”的隐式行为。
- 需要与现有内部错误映射风格保持一致：
  - not found -> `404`
  - ownership / stale / invalid state collision -> `409`
  - payload validation -> `400`

IMPLEMENTATION CONTRACT

- Actors
  - `Operator`
  - `Admin`
  - `System`

- Surfaces
  - existing:
    - `POST /arena/internal/responses/:responseId/review`
  - new internal response-ownership surfaces:
    - `POST /arena/internal/responses/:responseId/claim`
    - `POST /arena/internal/responses/:responseId/release`
  - read-model exposure:
    - pending review ownership should become visible through an internal operator-facing read surface
    - minimum acceptable first step is response-level claim visibility on the same internal response workflow

- Required state model
  - review finalization state remains on `ResponseReview.status`
  - claim ownership is separate metadata on the review record:
    - `claimedByUserId`
    - `claimedAt`
    - optional release / expiry audit timestamps or derived release reason
  - effective runtime states:
    - `pending_review + unclaimed`
    - `pending_review + claimed`
    - `pending_review + released`
    - `pending_review + expired`
    - finalized review states

- Transitions
  - `pending_review + unclaimed` -> `claimed`
  - `pending_review + claimed by same operator` -> idempotent claim refresh or explicit no-op
  - `pending_review + claimed by operator A` -> claim by operator B = conflict unless stale-takeover rules are satisfied
  - `pending_review + claimed` -> `released`
  - `pending_review + claimed` -> finalized state
  - `pending_review + unclaimed` -> finalized state is not allowed unless the API explicitly performs an audited auto-claim
  - finalized states reject claim / release

- API behavior expectations
  - claim response returns:
    - `responseId`
    - `status`
    - current claim owner
    - current claim timestamp
  - release response returns:
    - `responseId`
    - `status`
    - release result
    - claim cleared state
  - final review response should still return the finalized review contract, with ownership semantics reflected in persisted metadata and audit trail

- Data implications
  - `ResponseReview` needs durable claim ownership fields instead of inferring ownership from `reviewedByUserId`
  - repository methods need explicit claim / release helpers in addition to current create / update helpers
  - in-memory harness fake repository must support the same fields and conflict behavior

- Security / policy constraints
  - only internal privileged roles can claim or release
  - releasing another operator's active claim without stale-takeover semantics should fail with conflict
  - finalization should preserve `reviewedByUserId` as the actual final reviewer, not the original claimer unless they are the same operator

- Observability and audit
  - claim, release, expiry, and takeover must be audit-visible
  - conflict paths should return stable machine-readable error codes
  - later operator dashboards must be able to answer:
    - who currently owns this pending review
    - when it was claimed
    - whether the claim is stale

NON-GOALS

- This slice does not redesign the public or requester-facing web routes.
- This slice does not change reward math, reputation math, or settlement logic.
- This slice does not introduce a full operator workboard UI in the same change.
- This slice does not broaden proposition draft review-queue semantics; it targets pending response review ownership.

IMPLEMENTED DECISIONS

- `POST /arena/internal/responses/:responseId/review` now performs an audited auto-claim when a pending review is still unclaimed, and returns `409` when another operator still holds a fresh active claim.
- Stale takeover is time-based in the current implementation:
  - claim TTL is `15 minutes`
  - takeover remains audit-visible
- Claim/release workflow state is currently persisted through:
  - `SystemKeyValueRepository`
  - `InternalAuditService`
  rather than by widening the Prisma `ResponseReview` schema in this slice.
- The first internal ownership read surface is response-scoped:
  - `GET /arena/internal/responses/:responseId/review-state`

VERIFICATION

- Targeted service coverage exists in:
  - `apps/api/test/arena/arena.test.ts`
  - claim / release / reclaim without finalization side effects
  - stale ownership visibility and takeover
  - final review ownership enforcement and workflow finalization
- Targeted HTTP mapping coverage exists in:
  - `apps/api/test/arena/http-error-mapping.test.ts`
  - review-state visibility
  - claim / release success paths
  - claim conflict
  - review-finalization conflict
- Current verification command:
  - `pnpm --filter @arena/api test:arena`
  - passes on the current 2026-06-02 worktree
