# Arena 合约一期阶段三：后端接链基线设计

## A. 阶段三方案总览

阶段三的目标不是继续扩合约，而是把已经存在的链上 `validation market` 稳定接入 Arena 后端，使后端能够：

- 稳定计算链上 `bytes32` 标识
- 稳定发送 `operator / oracle / pauser` 指令
- 稳定消费链上事件
- 稳定把链上状态投影回现有 `Proposition / Market / Bet` 语义
- 在服务重启、重复消费、同块多事件、基础 reorg 场景下保持可恢复

本阶段坚持以下边界：

- 裁决层继续留在链下
- 验证层链上结果是结算真源
- 后端不再手工指定 winner
- 不引入外部 indexer 平台作为前置依赖
- 不清 legacy PK，不扩协议范围

推荐的最小后端接链基线由四层组成：

1. **ID 映射层**
   把链下 `propositionId / marketId` 映射成稳定的链上 `bytes32`
2. **命令发送层**
   由受控后端 signer 调用 `create/open/freeze/cancel/resolve/pause`
3. **事件摄取层**
   通过 RPC `getLogs` 增量消费 `MarketCreated / BetPlaced / MarketResolved / Claimed` 等事件
4. **投影更新层**
   把链上事件幂等投影到现有 `Market / Bet` 及新增的链上同步表

## B. 数据与事件设计

### B.1 链下 ID -> 链上 bytes32 映射规则

#### 固定推荐方案

一期统一采用**带命名空间的 UTF-8 明文串再 `keccak256`** 的方式。

##### Proposition

```text
chainPropositionId =
keccak256(
  utf8(
    "arena:validation:proposition:v1:{environment}:{chainId}:{propositionId}"
  )
)
```

##### Market

```text
chainMarketId =
keccak256(
  utf8(
    "arena:validation:market:v1:{environment}:{chainId}:{marketId}"
  )
)
```

#### 方案说明

- 不直接 hash UUID 原文。
  必须加 namespace，否则 legacy / future extension / other entity 类型会打架。
- 必须显式包含 `environment`。
  建议取值固定为 `local | dev | staging | prod`。
- 必须显式包含 `chainId`。
  这样同一环境多链部署也不会冲突。
- 必须显式包含 `v1`。
  以后若 rolling / 多 market / 多协议版本引入新的编码，不会污染一期 ID。

#### 为什么这是最稳的方案

1. **环境隔离**
   `prod` 和 `staging` 同一个 proposition 文本 ID 不会映射到同一个链上 `bytes32`
2. **多链隔离**
   不同 `chainId` 明确区分
3. **未来扩展隔离**
   proposition 和 market 使用不同 namespace
4. **避免 legacy 污染**
   不复用 `chainPkId` / `pkId` 语义

#### 如何从链上 bytes32 回查链下实体

`bytes32` 本身不可逆，不做“反向解码”。

推荐做法是：

- 在数据库中持久化：
  - `chainPropositionId`
  - `chainMarketId`
- 对这两个字段建唯一索引或普通索引
- 事件消费时直接按链上 `bytes32` 回查本地 row

也就是说，**回查依赖数据库投影，不依赖 hash 反解**。

#### 对未来 rolling / 多 market 的兼容性

当前阶段不会马上打架，因为：

- proposition 和 market 已隔离
- market 本身用 `marketId` 而不是 `propositionId` 做映射

后续如果出现同一 proposition 下多 validation market，直接新增新的链下 `marketId` 即可，不需要修改一期 hash 规则。

### B.2 后端数据库投影模型

推荐策略：

- **不推翻现有 `Proposition / Market / Bet`**
- 在现有 `Market / Bet` 上补充链上投影字段
- 另增两张最小辅助表：
  - `ValidationChainEvent`
  - `ValidationChainCursor`

#### B.2.1 Proposition / Market 侧字段建议

推荐把主投影落在 `Market` 上，而不是 `Proposition` 上。

原因：

- 验证层链上对象是 market
- proposition 的正式结果仍然来源于裁决层
- market 才是链上结算与 claim/refund 的直接对象

##### `Market` 一期必须补的字段

| 字段 | 是否必须 | 说明 |
| --- | --- | --- |
| `chainMarketId` | 必须 | `bytes32` hex string，唯一 |
| `chainPropositionId` | 必须 | `bytes32` hex string，索引 |
| `chainStatus` | 必须 | `pre_live / live / frozen / resolved / cancelled` |
| `chainOpenedAt` | 必须 | 投影 `MarketOpened` |
| `chainFrozenAt` | 必须 | 投影 `MarketFrozen` |
| `chainResolvedAt` | 必须 | 投影 `MarketResolved` |
| `chainCancelledAt` | 必须 | 投影 `MarketCancelled` |
| `chainResultKind` | 必须 | `resolved / void / null` |
| `chainWinningOption` | 必须 | `0 / 1 / null` |
| `chainVoidReason` | 必须 | `insufficient_sample / tie / null` |
| `resolutionTxHash` | 必须 | resolve 交易哈希 |
| `cancelTxHash` | 必须 | cancel 交易哈希 |
| `chainSyncedAt` | 必须 | 最近一次成功投影时间 |

##### `Market` 可后置的字段

| 字段 | 是否后置 | 说明 |
| --- | --- | --- |
| `createTxHash` | 可后置 | `MarketCreated` 的交易哈希 |
| `openTxHash` | 可后置 | `MarketOpened` 的交易哈希 |
| `freezeTxHash` | 可后置 | `MarketFrozen` 的交易哈希 |
| `chainContractAddress` | 可后置 | 若只有单合约单链，可先放 cursor 侧 |

##### `Proposition` 侧建议

`Proposition` 不建议继续使用 `chainPkId` 承接新协议。

一期建议：

- **不扩展 `Proposition.chainPkId`**
- 若必须在 proposition 侧有链上映射，新增：
  - `chainValidationPropositionId`

但这个字段不是本阶段阻塞项，因为 `Market` 已与 `Proposition` 一对一。

#### B.2.2 Bet / Position 侧字段建议

##### 一期必须补的字段

| 字段 | 是否必须 | 说明 |
| --- | --- | --- |
| `claimed` | 必须 | 链上提现完成 bit，claim / refund 共用 |
| `claimedAt` | 必须 | `Claimed` 事件时间 |
| `claimTxHash` | 必须 | `Claimed` tx hash |
| `refundedAt` | 必须 | `Refunded` 事件时间 |
| `refundTxHash` | 必须 | `Refunded` tx hash |
| `chainSyncedAt` | 必须 | 最近一次 position 投影时间 |

##### 直接复用现有字段，不新增同义字段

| 用户给出的字段 | 推荐处理 |
| --- | --- |
| `payout_amount` | 不新增，复用现有 `grossPayout` |
| `refund_amount` | 已存在，继续复用现有 `refundAmount` |

##### 不需要新增的字段

| 字段 | 结论 | 原因 |
| --- | --- | --- |
| `chain_position_key` | 不需要 | 一期自然键就是 `(marketId, userId)`，与当前 `@@unique([marketId, userId])` 一致 |

#### B.2.3 事件游标与事件账本

##### 新增表：`ValidationChainCursor`

一期必须字段：

| 字段 | 说明 |
| --- | --- |
| `streamKey` | 固定如 `validation_market_main` |
| `chainId` | 当前链 |
| `contractAddress` | validation market 地址 |
| `lastProcessedBlock` | 最后处理到的块高 |
| `lastProcessedTxHash` | 最后处理到的 tx |
| `lastProcessedLogIndex` | 最后处理到的 log index |
| `lastFinalizedBlock` | 本轮可视为安全确认的块高 |
| `syncStatus` | `idle / syncing / error / paused` |
| `updatedAt` | 游标更新时间 |

##### 新增表：`ValidationChainEvent`

一期必须字段：

| 字段 | 说明 |
| --- | --- |
| `id` | 内部主键 |
| `chainId` | 当前链 |
| `contractAddress` | 合约地址 |
| `blockNumber` | 块高 |
| `blockHash` | 块哈希 |
| `transactionHash` | 交易哈希 |
| `transactionIndex` | 交易序号 |
| `logIndex` | 日志序号 |
| `eventName` | 事件名 |
| `marketChainId` | `chainMarketId` |
| `propositionChainId` | `chainPropositionId` |
| `payloadJson` | 原始解析后 payload |
| `processedAt` | 被成功处理时间 |

唯一键建议：

```text
unique(chainId, transactionHash, logIndex)
```

这张表的作用不是替代 projection，而是：

- 幂等
- 重放
- 故障恢复
- 审计追踪

### B.3 事件消费设计

#### B.3.1 事件范围

一期消费以下事件：

- `MarketCreated`
- `MarketOpened`
- `BetPlaced`
- `MarketFrozen`
- `MarketResolved`
- `MarketCancelled`
- `Claimed`
- `Refunded`
- `Paused`
- `Unpaused`

#### B.3.2 最小消费流程

1. 定时或队列 worker 获取链头
2. 计算 `safeToBlock = head - confirmations`
3. 从 `cursor.lastProcessedBlock + 1` 拉取到 `safeToBlock`
4. 按 `(blockNumber, transactionIndex, logIndex)` 排序
5. 对每条 log：
   - 解析 ABI
   - 尝试插入 `ValidationChainEvent`
   - 若唯一键冲突，直接跳过
   - 在同一数据库事务中执行 projector
   - 更新 cursor 到当前 log

#### B.3.3 每个事件更新哪些字段

##### `MarketCreated`

- `Market.chainMarketId`
- `Market.chainPropositionId`
- `Market.chainStatus = pre_live`
- `Market.chainSyncedAt`

##### `MarketOpened`

- `Market.chainStatus = live`
- `Market.chainOpenedAt`
- `Market.chainSyncedAt`

##### `BetPlaced`

- 查找 `(marketId, userId)` 对应本地 `Bet`
- 若已存在但链上金额不一致，标记 sync error 并记录审计
- 若不存在，视为异常外部下注，需要告警并可选择创建 shadow bet
- 正常路径下更新：
  - `stakeAmount`
  - `placedAt`
  - `chainSyncedAt`

##### `MarketFrozen`

- `Market.chainStatus = frozen`
- `Market.chainFrozenAt`
- `Market.chainSyncedAt`

##### `MarketResolved`

- `Market.chainStatus = resolved`
- `Market.chainResolvedAt`
- `Market.chainResultKind`
- `Market.chainWinningOption`
- `Market.chainVoidReason`
- `Market.resolutionTxHash`
- `Market.chainSyncedAt`

同时，基于已有 `BetPlaced` 投影和 resolved payload，**本地确定性计算**所有 bet 的：

- `status = settled`
- `settledAt = chainResolvedAt`
- `settlementOutcome`
- `grossPayout`
- `pnl`
- `refundAmount`

说明：

- 链上不会逐个发出 position outcome 事件
- 但由于 BetPlaced 事件和 resolve payload 足够，后端可以确定性投影每个 bet 的预期结果

##### `MarketCancelled`

- `Market.chainStatus = cancelled`
- `Market.chainCancelledAt`
- `Market.cancelTxHash`
- `Market.chainSyncedAt`

同时把该 market 下所有 bet 更新为“可退款但未提现”投影：

- `status = settled`
- `settledAt = chainCancelledAt`
- `settlementOutcome = refund`
- `grossPayout = stakeAmount`
- `pnl = 0`
- `refundAmount = stakeAmount`

注意：

- 这里是 projection 层的“预期可退款状态”，不是表示用户已经拿到钱

##### `Claimed`

- 定位 `(marketId, userId)` 对应 bet
- `claimed = true`
- `claimedAt = block timestamp`
- `claimTxHash = tx hash`
- `chainSyncedAt`

##### `Refunded`

- 定位 `(marketId, userId)` 对应 bet
- `claimed = true`
- `refundedAt = block timestamp`
- `refundTxHash = tx hash`
- `chainSyncedAt`

##### `Paused` / `Unpaused`

建议不直接写 `Market/Bet`，而是写：

- `ValidationChainCursor.syncStatus`
- `InternalAuditEvent`
- 或单独 `ValidationChainRuntimeState`

一期最小做法：

- 写入 `InternalAuditEvent`
- 在 `ValidationChainCursor.syncStatus` 反映 `paused / syncing`

#### B.3.4 幂等键建议

唯一推荐：

```text
eventDedupKey = "{chainId}:{transactionHash}:{logIndex}"
```

原因：

- 同一 tx 内 logIndex 唯一
- 适合唯一索引
- 不需要自定义 hash

#### B.3.5 checkpoint 存储与恢复

推荐：

- 每处理并成功投影一条事件，就在同一事务里更新 `ValidationChainCursor`
- cursor 粒度记录到 `block + txHash + logIndex`

服务重启后：

1. 读取 cursor
2. 从 `lastProcessedBlock` 所在块重新开始
3. 依赖 `ValidationChainEvent` 唯一键去重

这样即使在“事件已落表但 cursor 尚未刷到下一条”的崩溃点，也能安全重放。

#### B.3.6 同块多事件处理

必须按：

```text
blockNumber ASC
transactionIndex ASC
logIndex ASC
```

依次应用。

同一块里可能出现：

- `MarketCreated`
- `MarketOpened`
- `BetPlaced`
- `MarketFrozen`
- `MarketResolved`

如果顺序不严格，projection 会出现非法状态跳转。

#### B.3.7 最小 reorg 容忍策略

一期推荐采用**确认数延迟**，不做复杂回滚引擎。

固定策略：

- `development / local`: `confirmations = 1`
- `production`: `confirmations = 12`

只消费到：

```text
safeToBlock = latestBlock - confirmations
```

这样已经足够覆盖“一期最小可恢复接链基线”。

后续若需要更强 reorg 能力，再在 `ValidationChainEvent` 上增加 `removed / invalidatedAt` 流程。

## C. 后端接链实施建议

### C.1 service / worker / module 设计

推荐在现有 `apps/api/src/arena` 下新增一个子域：

```text
apps/api/src/arena/validation-chain/
```

最小模块拆分如下：

#### 1. `ValidationChainIdService`

职责：

- 计算 `chainPropositionId`
- 计算 `chainMarketId`
- 固化 namespace / env / chainId / version 规则

#### 2. `ValidationChainContractService`

职责：

- 读取 validation contract artifact
- 创建只读 provider
- 创建 operator / oracle / pauser signer contract client
- 提供 `getLogs`、`parseLog`、`sendTx` 等统一入口

注意：

- 不复用旧 `BlockchainService.getArenaContract()` 作为新协议入口
- 可以扩展 `BlockchainService`，但必须新增 validation 专用方法和配置键

#### 3. `ValidationChainOperatorCommandService`

职责：

- `createMarket`
- `openMarket`
- `freezeMarket`
- `cancelMarket`

要求：

- 每次发链上交易前先做本地幂等检查
- 发送前后写 `InternalAuditEvent`
- 失败要写回 command failure metadata

#### 4. `ValidationChainOracleService`

职责：

- 从 proposition / market 读取正式结果
- 构造 `ResultPayload`
- 调用链上 `resolveMarket`

要求：

- 仅消费已经在链下正式确认的 official result
- 重复 resolve 要先用本地 `chainStatus` 和链上 `getMarket` 双检查

#### 5. `ValidationChainPauserService`

职责：

- `pause`
- `unpause`

要求：

- 仅通过管理面触发
- 必写审计日志

#### 6. `ValidationChainEventIngestionService`

职责：

- 分块拉取 logs
- ABI 解析
- 写入 `ValidationChainEvent`
- 调用 projector
- 刷新 `ValidationChainCursor`

#### 7. `ValidationChainProjectionService`

职责：

- 把每类事件映射到 `Market / Bet / Cursor`
- 做幂等更新
- 做 deterministic payout/refund 计算

#### 8. `ValidationChainSyncWorker`

职责：

- 通过 queue / scheduler 周期性触发 ingestion
- 防止多个 worker 并发处理同一流

### C.2 operator / oracle / pauser 调用链路

#### Operator

##### `createMarket`

- 触发方式：**自动触发**
- 触发点：`publishLiveProposition()` 成功且 `marketEnabled=true`
- 执行顺序：
  1. 本地 market 已存在
  2. 计算 `chainMarketId / chainPropositionId`
  3. 若 `chainStatus` 为空，则 enqueue `createMarket`
  4. 等待 `MarketCreated` 事件完成最终投影

##### `openMarket`

- 触发方式：**自动触发**
- 触发点：`createMarket` 成功后，或 live publication workflow 中串行触发
- 执行前检查：
  - `chainStatus != live`
  - 不存在已成功 `open` 的 tx hash

##### `freezeMarket`

- 触发方式：**自动触发**
- 触发点：链下 freeze readiness 达成并且 proposition 已成功转为 `frozen`
- 执行前检查：
  - 本地 market 已 `live`
  - `chainStatus == live`

##### `cancelMarket`

- 触发方式：**必须人工审批后触发**
- 触发来源：运营控制面 / internal ops
- 不自动触发
- 必须写审计：
  - actor
  - reason
  - note
  - tx hash

#### Oracle

##### `resolveMarket`

- 触发方式：**自动触发**
- 触发点：链下裁决层生成正式结果后
- 推荐放在：
  - `FreezeRevealOrchestratorService.finalizeRevealPreparation()` 后
  - 或正式结果记录完成后的独立队列任务

执行前检查：

- proposition 已有 `resultKind`
- `winningOption / voidReason` 自洽
- market `chainStatus == frozen`
- 未存在成功的 `resolutionTxHash`

失败处理：

- 不改写 proposition 的链下正式结果
- 只把“链上 resolve 未完成”标成 command failure / retryable
- 由队列自动重试或运维重试

#### Pauser

##### `pause / unpause`

- 触发方式：**只能人工审批后触发**
- 不自动触发
- 必须写审计日志
- 成功后由 `Paused / Unpaused` 事件确认最终状态

### C.3 自动触发 vs 人工审批

| 动作 | 自动/人工 | 说明 |
| --- | --- | --- |
| `createMarket` | 自动 | live publication 的链上镜像动作 |
| `openMarket` | 自动 | 与 live publication 同步 |
| `freezeMarket` | 自动 | freeze readiness 达成后的链上映射 |
| `resolveMarket` | 自动 | official result 生成后的 oracle 动作 |
| `cancelMarket` | 人工审批 | 异常退款路径，不应自动化 |
| `pause/unpause` | 人工审批 | 合约级运维动作 |

### C.4 如何避免重复 create / open / freeze / resolve

统一策略：

1. **发送前本地检查**
   - 看 `chainStatus`
   - 看已存 command tx hash
2. **发送后等待事件确认**
   - 不以“发送成功”当最终成功
3. **事件投影最终定态**
   - 只有事件投影才更新 `chainStatus`

例如：

- `createMarket` 前要求 `chainMarketId` 已计算但 `chainStatus is null`
- `openMarket` 前要求 `chainStatus == pre_live`
- `freezeMarket` 前要求 `chainStatus == live`
- `resolveMarket` 前要求 `chainStatus == frozen`

### C.5 失败后的数据库回写原则

不要在失败时把 `chainStatus` 乐观改成下一状态。

失败时只回写：

- command attempt log
- lastAttemptedAt
- lastErrorCode / lastErrorMessage
- retryable flag

真正状态变更只由事件投影完成。

## C.6 文件级落地建议

### 建议新增文件

```text
apps/api/src/arena/validation-chain/validation-chain-id.service.ts
apps/api/src/arena/validation-chain/validation-chain-contract.service.ts
apps/api/src/arena/validation-chain/validation-chain-operator-command.service.ts
apps/api/src/arena/validation-chain/validation-chain-oracle.service.ts
apps/api/src/arena/validation-chain/validation-chain-pauser.service.ts
apps/api/src/arena/validation-chain/validation-chain-event-ingestion.service.ts
apps/api/src/arena/validation-chain/validation-chain-projection.service.ts
apps/api/src/arena/validation-chain/validation-chain-sync.worker.ts
apps/api/src/arena/validation-chain/validation-chain.types.ts
apps/api/src/arena/repositories/validation-chain-event.repository.ts
apps/api/src/arena/repositories/validation-chain-cursor.repository.ts
apps/api/src/arena/dto/internal-cancel-market.dto.ts
apps/api/src/arena/dto/internal-pause-validation.dto.ts
```

### 建议扩展的现有文件

```text
apps/api/prisma/schema.prisma
apps/api/src/config/env.schema.ts
apps/api/src/config/app-config.service.ts
apps/api/src/blockchain/blockchain.service.ts
apps/api/src/blockchain/blockchain.module.ts
apps/api/src/arena/arena.module.ts
apps/api/src/arena/services/proposition-engine.service.ts
apps/api/src/arena/services/freeze-reveal-orchestrator.service.ts
apps/api/src/arena/services/internal-audit.service.ts
apps/api/src/queue/queue.constants.ts
apps/api/src/queue/queue.module.ts
apps/api/src/queue/queue.service.ts
```

### Prisma / schema 建议

#### 修改现有表

- `market`
  - 补 `chainMarketId`
  - 补 `chainPropositionId`
  - 补 `chainStatus`
  - 补 `chainOpenedAt`
  - 补 `chainFrozenAt`
  - 补 `chainResolvedAt`
  - 补 `chainCancelledAt`
  - 补 `chainResultKind`
  - 补 `chainWinningOption`
  - 补 `chainVoidReason`
  - 补 `resolutionTxHash`
  - 补 `cancelTxHash`
  - 补 `chainSyncedAt`

- `bet`
  - 补 `claimed`
  - 补 `claimedAt`
  - 补 `claimTxHash`
  - 补 `refundedAt`
  - 补 `refundTxHash`
  - 补 `chainSyncedAt`

#### 新增表

- `validation_chain_event`
- `validation_chain_cursor`

### 配置项建议

新增：

- `ARENA_VALIDATION_CONTRACT_ADDRESS`
- `ARENA_VALIDATION_SYNC_CONFIRMATIONS`
- `ARENA_VALIDATION_SYNC_BATCH_SIZE`

保留：

- `ARENA_CONTRACT_ADDRESS`

但把它明确标成 legacy PK 地址，不再作为 validation contract 地址复用。

### legacy 保持不动的内容

- `contracts/Arena.sol`
- `test/Arena.test.cjs`
- 旧 PK hooks / types / mock
- `Proposition.chainPkId` 本阶段不清理，只停止继续复用

## D. 阶段三验收标准

阶段三完成后，应满足以下可检查标准：

1. `propositionId / marketId -> bytes32` 映射规则已定稿，并写入代码或文档
2. `Market / Bet` 的链上投影字段已定稿
3. `ValidationChainEvent` 与 `ValidationChainCursor` 模型已定稿
4. 事件消费顺序、幂等键、checkpoint、重启恢复方案已明确
5. `MarketCreated / Opened / Frozen / Resolved / Cancelled / Claimed / Refunded` 的 projector 行为已明确
6. operator / oracle / pauser 的后端调用链路已明确
7. 自动触发与人工审批的边界已明确
8. 失败重试和审计日志写入原则已明确
9. 现有 `Queue / BlockchainService / ArenaModule / Prisma` 的改造点已列清
10. 可以直接进入阶段四的真实接码实施

## 明确结论

如果按照本文档执行，阶段三完成后，**Arena 已经具备进入真实后端接码阶段的条件**。

进入阶段四前仍存在但不阻塞的非核心项：

- create/open/freeze tx hash 是否单独持久化
- 更细的 sync error taxonomy
- 是否增加 shadow bet 处理“链上直接下注但后端未创建 bet”的异常路径
- 生产级 confirmation 策略与报警阈值

这些都不阻塞阶段四的真实接码。
