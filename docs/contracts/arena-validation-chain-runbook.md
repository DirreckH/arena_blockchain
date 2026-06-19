# Arena validation-chain runbook

## Recommended operator entrypoint

For the current proposition-scoped operating path, prefer this command before
manually hopping across monitoring routes and runbooks:

```powershell
pnpm run validation:ops:brief -- --proposition-id <id> --env-file <path-to-release-env> [--base-url <url>] [--auth-token <token>]
```

The command refreshes and writes one coherent operator bundle under
`validation-rehearsal/<id>/`, including:

- backend release readiness
- validation-chain monitoring
- proposition evidence bundle
- public settled-result proof
- public integrity proof
- one unified `operator-briefing.json`

It exits `0` only when release readiness, runtime hardening, proposition
rehearsal, and public beta proof are all green for the target proposition.

本 runbook 只覆盖 Phase 3B-1 的验证层接链运行演练与观测基线。

当前范围固定为非滚动、单题、二选一、简单下注、一次性结算。不覆盖 rolling proposition、多题问卷、AMM、订单簿、赔率、手续费、前端钱包改造、复杂 replay/rollback 或完整 reorg rollback。

## 1. 本地演练前置条件

必须先准备以下依赖：

- PostgreSQL: `DATABASE_URL` 指向的实例可达，并已执行 validation-chain migration。
- Redis: `REDIS_URL` 可达，queue processor 可连接。
- Hardhat/local chain: `RPC_URL` 可达，`CHAIN_ID` 与 provider 返回一致。
- Validation contract: `ARENA_VALIDATION_CONTRACT_ADDRESS` 已部署，链上 `getCode != 0x`。
- Signer: `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY`、`ARENA_VALIDATION_ORACLE_PRIVATE_KEY`、`ARENA_VALIDATION_PAUSER_PRIVATE_KEY` 已配置，对应地址有 gas 且有链上角色。
- Sync config: `ARENA_VALIDATION_SYNC_CONFIRMATIONS`、`ARENA_VALIDATION_SYNC_BATCH_SIZE`、`ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS` 已配置。

推荐演练前执行：

```powershell
pnpm run validation:preflight -- --env-file <path-to-release-env>
pnpm run validation:db:deploy -- --env-file <path-to-release-env>
pnpm run validation:db:status -- --env-file <path-to-release-env>
```

For non-local staging/testnet checks, prefer the wrapper above over manually
running three separate commands. It now drives:

- `pnpm run validation:env:check -- --env-file <path-to-release-env>`
- `pnpm run validation:deps:check -- --env-file <path-to-release-env>`
- `pnpm run validation:chain:check -- --env-file <path-to-release-env>`

If the same pass also needs to deploy or repoint the validation contract, use:

- `pnpm run validation:preflight -- --env-file <path-to-release-env> --deploy-validation --network validation`

That deploy-aware preflight now executes:

- `pnpm run validation:env:check -- --env-file <path-to-release-env>`
- `pnpm run validation:deps:check -- --env-file <path-to-release-env>`
- `pnpm run validation:deploy -- --env-file <path-to-release-env> --network validation`
- `pnpm run validation:chain:check -- --env-file <path-to-release-env>`

Non-local deploy evidence should now be kept under
`validation-rehearsal/deployments/` by network name instead of overwriting the
root local `deployment.validation.json`.

Schema 校验 SQL：

```powershell
Get-Content docs/contracts/sql/validation-schema-check.sql | node scripts/run-with-root-env.cjs apps/api pnpm exec prisma db execute --schema prisma/schema.prisma --stdin
```

注意：

- `ARENA_CONTRACT_ADDRESS` 是 legacy 地址，不得复用为 validation 地址。
- 如果 Hardhat local chain 重启，之前部署的 validation contract 会丢失，需要重新部署并回填 env。
- 本地 bet 的 `userId` 必须与链上 `placeBet` 的 EOA 地址小写形式一致，否则 `BetPlaced` projector 会找不到本地 bet。

## 2. 最小 happy path 演练顺序

1. 创建一条 `marketEnabled=true` 的非滚动 binary proposition。
2. 通过现有 runtime 发布 proposition。
   - 触发点：`publishLiveProposition()`
   - 预期 queue：`create_market`、`open_market`
   - 预期链上事件：`MarketCreated`、`MarketOpened`
3. 准备最小有效样本。
   - 派单、回答、review、effective sample counter 仍在链下。
   - 至少满足 `minEffectiveSample`。
4. 准备 bet。
   - 先创建本地 bet。
   - 再用同一 EOA 调用 validation contract `placeBet(chainMarketId, option)`。
   - 预期链上事件：`BetPlaced`
5. 触发 freeze readiness。
   - 触发点：`freezeForReveal()`
   - 预期 queue：`freeze_market`
   - 预期链上事件：`MarketFrozen`
6. 生成 official result。
   - 触发点：`computeAndRecordOfficialResult()`
   - 预期 queue：`resolve_market`
   - 正常结果 payload：`resultKind=resolved`，`winningOption=0|1`
   - 预期链上事件：`MarketResolved`
7. 执行 ingest/project。
   - queue worker 可自动处理 `validation-chain.sync`。
   - 本地演练也可直接调用 `ValidationChainSyncWorker.syncOnce()`。
8. 检查 DB projection。
   - `market.chainStatus = resolved`
   - `market.chainResultKind = resolved`
   - `market.chainWinningOption` 与 official result 一致
   - `market.resolutionTxHash` 已写入
   - winning bet `settlementOutcome = won`

## 3. Repeated sync 验证

重复执行 `syncOnce()` 时预期：

- `processedEvents = 0`
- cursor 不倒退
- `syncStatus` 回到 `idle`
- `validation_chain_event` 不新增重复 row
- Market projection 不重复污染
- Bet projection 不重复结算
- 不新增 `validation_chain.project.failed`
- 不新增 `validation_chain.sync.failed`

可用 SQL 检查重复事件：

```sql
select chain_id, transaction_hash, log_index, count(*)::int as count
from validation_chain_event
group by chain_id, transaction_hash, log_index
having count(*) > 1;
```

## 4. 观测入口

内部监控接口：

```text
GET /arena/internal/monitoring/validation-chain
```

该接口返回：

- `streamKey`
- cursor: `lastProcessedBlock`、`lastProcessedTxHash`、`lastProcessedLogIndex`、`lastFinalizedBlock`、`syncStatus`
- event ledger: total event count、duplicate rows、recent events
- projection: latest market projection、latest bet projection
- failures: projector failure count、sync failure count、recent failures
- recent alerts
- stale payout observation

如果不启动 API，可直接查询 DB。

Cursor：

```sql
select stream_key,
       chain_id,
       contract_address,
       last_processed_block,
       last_processed_tx_hash,
       last_processed_log_index,
       last_finalized_block,
       sync_status,
       updated_at
from validation_chain_cursor;
```

Recent events：

```sql
select event_name,
       block_number,
       transaction_hash,
       transaction_index,
       log_index,
       market_chain_id,
       proposition_chain_id,
       processed_at
from validation_chain_event
order by block_number desc, transaction_index desc, log_index desc
limit 20;
```

Latest market projection：

```sql
select id,
       proposition_id,
       chain_market_id,
       chain_status,
       chain_result_kind,
       chain_winning_option,
       resolution_tx_hash,
       cancel_tx_hash,
       chain_synced_at
from market
where chain_status is not null
order by chain_synced_at desc nulls last
limit 10;
```

Latest bet projection：

```sql
select id,
       market_id,
       proposition_id,
       user_id,
       status,
       settlement_outcome,
       gross_payout,
       refund_amount,
       chain_synced_at
from bet
where chain_synced_at is not null
order by chain_synced_at desc nulls last
limit 10;
```

Failures：

```sql
select action,
       entity_type,
       entity_id,
       reason,
       metadata_json,
       created_at
from internal_audit_event
where action in (
  'validation_chain.project.failed',
  'validation_chain.sync.failed',
  'validation_chain.alert.projector_entity_missing',
  'validation_chain.alert.command_terminal',
  'validation_chain.alert.command_retry_exhausted'
)
order by created_at desc
limit 20;
```

## 5. 失败排查

### sync failed

先看：

- `internal_audit_event.action = validation_chain.sync.failed`
- `validation_chain_cursor.sync_status`
- API / worker 日志

判断：

- 如果 cursor `syncStatus=error` 且 `lastProcessedBlock` 没有推进，说明事件尚未被安全确认处理。
- 如果 repeated `syncOnce()` 后 `syncStatus=idle` 且没有新增 failure，说明当前 worker 已恢复。

### projector failed

先看：

- `internal_audit_event.action = validation_chain.project.failed`
- `metadata_json.eventName`
- `metadata_json.transactionHash`
- `metadata_json.logIndex`

常见原因：

- 本地 `market.chainMarketId` / `chainPropositionId` 未准备好。
- `BetPlaced` 事件中的 EOA 与本地 `bet.userId` 不一致。
- 本地 bet 的 option 或 stake 与链上 payload 不一致。

当前策略：

- projector 失败会阻止该 log 的 cursor checkpoint 推进。
- 不做 shadow bet。
- 不做复杂 replay/rollback 工具。

### cursor stalled

判断：

- `cursor.updated_at` 距当前时间超过 `max(ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS * 4, 60000)`。
- `GET /arena/internal/monitoring/validation-chain` 中 `isCursorStalled=true`。

处理：

- 检查 Redis、worker、RPC。
- 检查 recent `validation_chain.sync.failed`。
- 依赖恢复后再次执行 sync job 或 `syncOnce()`。

### duplicate event

检查：

```sql
select chain_id, transaction_hash, log_index, count(*)::int as count
from validation_chain_event
group by chain_id, transaction_hash, log_index
having count(*) > 1;
```

预期：

- 返回空结果。
- 重复 ingest 应被幂等跳过，不应导致 PostgreSQL transaction abort。

### queue job failed

先看：

- BullMQ scheduler queue failed jobs
- `internal_audit_event.action in ('validation_chain.alert.command_terminal', 'validation_chain.alert.command_retry_exhausted')`
- API worker 日志

判断：

- retryable RPC / nonce / dependency errors 可等待 retry。
- terminal payload / local state errors 需要人工介入。
- noop duplicate command 不应阻塞运行。

### unsafe pre-live drift policy

当本地 proposition / market 已经跨过 `frozen`、`revealing` 或 `settled` 边界，但链上 market 仍停留在 `pre_live` 时，不要再尝试把该链上 market 重新 `open`。

这类状态意味着：

- 本地 adjudication 或 settlement 语义已经前进
- 链上 market 还没有真正进入 live / frozen / resolved 生命周期
- 自动 reopen 会破坏 “freeze 之后不再重新开放方向性写入” 的 MVP 信任边界

Operator 处理原则：

1. 先确认 drift 来源：
   - `GET /arena/internal/monitoring/validation-lifecycle-drift`
   - `GET /arena/internal/monitoring/validation-chain`
   - `GET /arena/internal/monitoring/runtime-contract`
2. 不要对该 proposition 做 reopen 型恢复。
   - `POST /arena/internal/validation-chain/propositions/:propositionId/recover-command` 在这类状态下应只作为诊断入口，不应被绕过后强行 reopen
3. 优先判断是否需要取消链上 market。
   - 若链上 market 只是 `pre_live` 且尚未承载真实 live 市场语义，优先走 `POST /arena/internal/validation-chain/propositions/:propositionId/cancel-market`
4. 取消或确认链上最终状态后，再执行本地修复动作：
   - `POST /arena/internal/validation-chain/sync`
   - `POST /arena/internal/validation-chain/markets/:marketId/replay-projection`
5. 若取消链上 market 会与本地 settled 结果产生业务冲突，升级为人工 incident review，不要继续自动补命令。

这条策略的核心不是“尽量补齐链状态”，而是优先守住 freeze 之后不重新开放的产品边界。

## 6. 当前明确后置能力

当前不支持：

- complex replay/rollback
- full reorg rollback
- multi-worker ingestion
- multi-contract stream orchestration
- shadow bet
- staging monitoring dashboard
- production alerting platform
- front-end wallet flow
- rolling / survey / hybrid proposition

## 7. Phase 3B-2 连续演练

本章节只用于 staging-like / testnet 前的连续运行演练，不新增业务能力，不绕过 queue processor，不直接改真实数据库状态。

### 7.1 连续演练目标

连续演练需要证明：

- 至少 3 条独立 validation market happy path 可以连续完成。
- 每条路径都经过 `publish -> queue create/open -> placeBet -> freeze -> queue resolve -> syncOnce -> projection`。
- queue processor 可以连续处理 `create_market`、`open_market`、`freeze_market`、`resolve_market`。
- sync worker 多轮执行后 cursor 只前进、不倒退。
- repeated sync 返回 `processedEvents = 0`。
- `validation_chain_event` 不产生重复 row。
- Market / Bet projection 不重复污染。
- worker restart-like 后可以从已有 cursor 继续。

### 7.2 环境要求

local / staging-like 演练至少需要：

- PostgreSQL 可达，并已执行 validation-chain migration。
- Redis 可达，scheduler queue processor 可运行。
- Hardhat/local chain 或 staging RPC 可达。
- `ARENA_VALIDATION_CONTRACT_ADDRESS` 指向已部署 validation contract，且 `getCode != 0x`。
- operator / oracle / pauser signer 已配置，且地址有 gas 和链上角色。
- `ARENA_VALIDATION_SYNC_CONFIRMATIONS`、`ARENA_VALIDATION_SYNC_BATCH_SIZE`、`ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS` 已配置。

public testnet 只有在以下条件全部满足时才算 ready：

- testnet RPC 可达，`CHAIN_ID` 与 provider 返回一致。
- signer 私钥可导出地址。
- operator / oracle / pauser 地址有 testnet 原生币余额。
- validation contract 已部署在同一 chainId。
- validation contract artifact / ABI 与链上 code fingerprint 检查通过。
- 三个 signer 地址具备对应链上 role。

缺任一项时，不要强行跑 public testnet；先完成 local/staging-like 连续演练，并把缺口列为 testnet blocker。

### 7.3 自动化演练入口

当前最小自动化演练通过 targeted validation-chain 测试承载：

```powershell
pnpm --filter @arena/api test:validation-chain
```

其中 `apps/api/test/arena/validation-chain-runtime.test.ts` 的测试：

```text
runs three staging-like happy paths through queued commands and restart-like sync
```

覆盖：

- 3 个独立 proposition / market 样本。
- 12 个 queued command job。
- 每个样本 5 个主路径事件：`MarketCreated`、`MarketOpened`、`BetPlaced`、`MarketFrozen`、`MarketResolved`。
- 第一条样本完成后重建 worker，再继续第二、第三条样本。
- 最后 repeated sync 返回 `processedEvents = 0`。

该测试使用现有 `ValidationChainCommandRuntimeService` 入队，并通过 `SchedulerQueueProcessor.process()` 执行 command / sync job；不直接绕过 queue processor。

### 7.4 手动连续演练顺序

真实 local / staging-like 环境手动演练时，按以下顺序执行 3 次：

1. 创建非滚动、单题、二选一、`marketEnabled=true` 的 proposition。
2. 通过现有 runtime 发布 proposition，触发 `publishLiveProposition()`。
3. 确认 scheduler queue 产生 `create_market` 和 `open_market`。
4. 等待或手动处理 queue processor，确认链上 `MarketCreated` / `MarketOpened`。
5. 创建本地 bet，并用同一 EOA 调用 validation contract `placeBet`。
6. 通过现有 freeze/reveal runtime 达成 freeze readiness，触发 `freezeForReveal()`。
7. 确认 scheduler queue 处理 `freeze_market`，链上出现 `MarketFrozen`。
8. 通过 `computeAndRecordOfficialResult()` 生成 normal official result。
9. 确认 scheduler queue 处理 `resolve_market`，链上出现 `MarketResolved`。
10. 执行或等待 `validation-chain.sync`，确认 ingest / projection 完成。

每条样本至少记录：

- proposition id
- market id
- `chainPropositionId`
- `chainMarketId`
- create / open / bet / freeze / resolve tx hash
- event block
- final Market projection
- final Bet projection
- sync 后 cursor

### 7.5 Repeated sync 通过标准

连续演练结束后，重复执行一次 sync：

```powershell
pnpm --filter @arena/api test:validation-chain
```

或在运行环境中再次触发 `validation-chain.sync` job。

预期：

- `processedEvents = 0`
- cursor `syncStatus = idle`
- cursor `lastProcessedBlock` 不倒退
- `duplicateRows = []`
- Market projection 不变化或保持等价状态
- Bet projection 不重复结算
- 本轮不新增 `validation_chain.project.failed`
- 本轮不新增 `validation_chain.sync.failed`

### 7.6 Monitoring 检查

连续演练前后调用：

```text
GET /arena/internal/monitoring/validation-chain
```

至少检查：

- cursor: `streamKey`、`lastProcessedBlock`、`lastProcessedTxHash`、`lastProcessedLogIndex`、`lastFinalizedBlock`、`syncStatus`
- event ledger: `totalEventCount`、`duplicateRows`、`recentEvents`
- projection: `latestMarket`、`latestBet`
- failure: `projectorFailuresCount`、`syncFailuresCount`、`recentFailures`

历史 failure 不清理。判断本轮演练是否新增 failure 时，需要先记录演练前 count，再与演练后 count 对比。只要新增 projector / sync failure 为 0，且 cursor 最终回到 `idle`，历史修复前 failure 不阻塞本轮演练。

### 7.7 当前未覆盖能力

Phase 3B-2 自动化连续演练优先覆盖 happy path。以下能力不在本阶段扩展：

- public testnet 强制交易执行
- complex replay/rollback
- full reorg rollback
- multi-worker ingestion
- multi-contract stream orchestration
- staging monitoring dashboard
- production alerting platform
- rolling / survey / hybrid proposition

cancel / refund / pauser 当前已有基础能力和测试覆盖，但本阶段不扩展协议；如需连续演练，应作为后续独立小阶段处理。

## 8. Phase 3B-3 cancel / refund / pauser 最小路径演练

本章节只验证当前已有 cancel / refund / pauser 能力，不新增协议能力，不修改合约接口，不新增运营后台。

### 8.1 本阶段目标

Phase 3B-3 需要证明：

- cancel / refund 最小路径可以被 sync worker ingest，并正确投影到 Market / Bet。
- refund projection 可幂等重复 sync，不重复入账。
- pause / unpause 后端入口会写入 audit，且需要明确 actor。
- cancel / refund / pauser 不破坏普通 happy path。
- monitoring / audit 可以定位 cancel / refund / pauser 相关状态或失败。

### 8.2 当前能力边界

当前已有：

- 合约：`cancelMarket`、`refund`、`pause`、`unpause` 方法，以及 `MarketCancelled`、`Refunded`、OpenZeppelin `Paused` / `Unpaused` 事件。
- operator service：`ValidationChainOperatorCommandService.cancelMarket()`。
- pauser service：`ValidationChainPauserService.pauseValidationChain()` / `unpauseValidationChain()`。
- sync worker：支持 ingest `MarketCancelled`、`Refunded`、`Paused`、`Unpaused`。
- projector：支持投影 `MarketCancelled` 和 `Refunded`。
- audit：pause / unpause 会写 `validation_chain.pause.submitted` / `validation_chain.unpause.submitted`。

当前没有：

- automatic queue command payload for `cancel_market`。
- production pauser runbook。
- pauser dashboard。
- complex replay/rollback。
- full reorg rollback。

因此本阶段自动化测试中，`create/open` 与 `sync` 走 scheduler queue processor；`cancel` 复用已有 operator command service，不把 cancel 扩展进 automatic queue command 协议。

### 8.3 cancel / refund 演练步骤

最小路径：

1. 创建非滚动、单题、二选一、`marketEnabled=true` 的 proposition / market。
2. 通过 `ValidationChainCommandRuntimeService.enqueueCreateOpenCommands()` 入队。
3. 通过 `SchedulerQueueProcessor.process()` 处理 `create_market` / `open_market`。
4. 创建本地 bet，并触发链上 `BetPlaced`。
5. 通过 `ValidationChainOperatorCommandService.cancelMarket()` 触发 cancel。
6. 触发链上 refund，产生 `Refunded`。
7. 通过 `SchedulerQueueProcessor.process()` 处理 `validation-chain.sync`。
8. 检查 projection：
   - Market `chainStatus = cancelled`
   - Market `cancelTxHash` 已写入
   - Bet `settlementOutcome = refund`
   - Bet `refundAmount = stakeAmount`
   - Bet `refundTxHash` 已写入
9. repeated sync，预期 `processedEvents = 0`。

自动化覆盖：

```text
apps/api/test/arena/validation-chain-runtime.test.ts
completes the cancel -> refund projection path
```

### 8.4 pauser pause / unpause 演练步骤

最小路径：

1. 使用内部入口或 service 调用 `pauseValidationChain({ actorUserId, reason })`。
2. 检查 audit：
   - `action = validation_chain.pause.submitted`
   - `actorUserId` 存在
   - metadata 内有 tx hash
3. 调用 `unpauseValidationChain({ actorUserId, reason })`。
4. 检查 audit：
   - `action = validation_chain.unpause.submitted`
   - `actorUserId` 存在
   - metadata 内有 tx hash

自动化覆盖：

```text
apps/api/test/arena/validation-chain-phase6.test.ts
records manual pause and unpause with audit identity
```

当前 pauser 是最小内部入口，不是完整生产运维系统。真实环境使用前仍需要明确审批流、值班响应和恢复标准。

### 8.5 repeated sync 预期

cancel / refund path repeated sync 必须满足：

- `processedEvents = 0`
- cursor 不倒退
- `duplicateRows = []`
- Market 不重复污染
- Bet 不重复 refund
- 本轮不新增 `validation_chain.project.failed`
- 本轮不新增 `validation_chain.sync.failed`

### 8.6 monitoring / audit 检查

调用：

```text
GET /arena/internal/monitoring/validation-chain
```

检查：

- event ledger recent events 是否能看到 `MarketCancelled` / `Refunded`。
- projection latest Market 是否能看到 `chainStatus=cancelled`。
- projection latest Bet 是否能看到 `settlementOutcome=refund` / `refundAmount`。
- failures count 是否本轮无新增。

audit 检查：

```sql
select action,
       entity_type,
       entity_id,
       actor_user_id,
       reason,
       metadata_json,
       created_at
from internal_audit_event
where action in (
  'validation_chain.cancel_market.submitted',
  'validation_chain.pause.submitted',
  'validation_chain.unpause.submitted',
  'validation_chain.project.failed',
  'validation_chain.sync.failed'
)
order by created_at desc
limit 20;
```

历史 `validation_chain.sync.failed` 不清理。判断本轮是否通过时，先记录演练前 failure count，再比较演练后新增 count。

### 8.7 当前明确后置能力

Phase 3B-3 不覆盖：

- automatic cancel queue command 扩展
- complex replay/rollback
- full reorg rollback
- production pauser runbook
- public testnet 实测
- staging / production dashboard
- production alerting
- rolling / survey / hybrid proposition
