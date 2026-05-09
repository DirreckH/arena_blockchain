# Arena 合约一期阶段五：validation-chain 最小运行闭环

## 先决条件

阶段五代码依赖阶段四的数据层已经真实落地。

在任何真实环境启用本阶段代码前，必须先执行阶段四 migration：

- `apps/api/prisma/migrations/20260423233000_validation_chain_foundation/migration.sql`

说明：

- 阶段五代码不会替代真实数据库迁移
- 如果 migration 未执行，`market` / `bet` 的新字段，以及
  `validation_chain_event` / `validation_chain_cursor` 两张表都不存在
- 在这种情况下，阶段五不能视为真正完成

## 本阶段完成内容

### 1. 命令发送与状态确认已分离

已新增：

- `ValidationChainOperatorCommandService`
- `ValidationChainOracleService`

实现原则：

- 发送前做本地幂等检查
- 发送前补齐 `chainMarketId / chainPropositionId`
- 发送后只记录 attempt / tx hash / retryable / lastAttemptedAt
- 不乐观更新 `Market.chainStatus`
- 真正状态变化只由链上事件投影写回

### 2. 单 worker ingestion 已建立

已新增：

- `ValidationChainSyncWorker`

实现边界：

- 单 contract
- 单 streamKey
- 串行处理
- `safeToBlock = latestBlock - confirmations`
- 处理顺序固定为：
  - `blockNumber ASC`
  - `transactionIndex ASC`
  - `logIndex ASC`

### 3. 单 projector 已建立

已新增：

- `ValidationChainProjectionService`

当前只投影一期主路径：

- `MarketCreated`
- `MarketOpened`
- `BetPlaced`
- `MarketFrozen`
- `MarketResolved`
- `MarketCancelled`
- `Claimed`
- `Refunded`

本阶段仍然不做：

- shadow bet
- 未知本地实体的复杂补偿
- 复杂 reorg rollback

发生“链上事件存在但本地实体不存在”时：

- 记录审计
- 中止当前事件投影
- 由 queue retry 或人工修复继续处理

### 4. queue / retry / audit 最小闭环已接入

已接入：

- `queue.constants.ts`
- `queue.service.ts`
- `scheduler.processor.ts`
- `scheduler.service.ts`
- `internal-audit.service.ts`

当前策略：

- validation-chain sync 通过 scheduler queue 周期性入队
- scheduler queue 仍使用现有 `SAFE_RETRY_JOB_POLICY`
- sync 异常进入现有重试机制
- operator / oracle / projector / worker 关键错误都写审计

## 本阶段新增 / 修改文件

### validation-chain 子域

- `apps/api/src/arena/validation-chain/validation-chain-contract.service.ts`
  - 扩展到 read + write client
  - 提供 operator / oracle signer 交易发送
  - 提供 `getMarketOrNull` / `getLatestBlockNumber` / `getBlock`
- `apps/api/src/arena/validation-chain/validation-chain-operator-command.service.ts`
  - `createMarket`
  - `openMarket`
  - `freezeMarket`
  - `cancelMarket`
- `apps/api/src/arena/validation-chain/validation-chain-oracle.service.ts`
  - `resolveMarket`
- `apps/api/src/arena/validation-chain/validation-chain-projection.service.ts`
  - 一期主路径事件投影
- `apps/api/src/arena/validation-chain/validation-chain-sync.worker.ts`
  - 单 worker ingestion
- `apps/api/src/arena/validation-chain/validation-chain.module.ts`
  - 注册阶段五 provider
- `apps/api/src/arena/validation-chain/validation-chain.types.ts`
  - 扩展 command / event / chain enum / sync snapshot 类型

### repository / queue / config

- `apps/api/src/arena/repositories/market.repository.ts`
  - 新增 `findByChainMarketId`
  - 新增 `findByChainPropositionId`
- `apps/api/src/arena/repositories/validation-chain-cursor.repository.ts`
  - 允许空 tx/log checkpoint 推进
- `apps/api/src/queue/queue.constants.ts`
  - 新增 `VALIDATION_CHAIN_SYNC_JOB`
- `apps/api/src/queue/queue.service.ts`
  - 新增 `enqueueValidationChainSync`
- `apps/api/src/queue/processors/scheduler.processor.ts`
  - 接入 sync job 执行
- `apps/api/src/queue/scheduler.service.ts`
  - 增加 validation-chain polling 调度
- `apps/api/src/queue/queue.module.ts`
  - 引入 `ValidationChainModule`
- `apps/api/src/config/env.schema.ts`
  - 新增 validation signer / poll interval 配置
- `apps/api/src/config/app-config.service.ts`
  - 新增 validation signer / poll interval getter
- `.env.example`
  - 新增 validation signer / poll interval 示例

### 测试

- `apps/api/test/arena/validation-chain-runtime.test.ts`
  - operator/oracle service 测试
  - ingestion / projector 测试
  - happy path 闭环测试
  - cancel / refund 路径测试

## 当前闭环能走到哪一步

当前最小闭环已经成立：

1. 后端 operator service 发送 `create/open/freeze/cancel`
2. 后端 oracle service 发送 `resolve`
3. 链上事件被单 worker 拉取
4. 事件进入 `validation_chain_event`
5. projector 把结果回写 `Market / Bet`
6. cursor 推进 checkpoint
7. 审计记录 attempt / failure / sync error

## 自动触发与人工触发边界

推荐边界保持不变：

- `createMarket`：自动触发
- `openMarket`：自动触发
- `freezeMarket`：自动触发
- `resolveMarket`：自动触发
- `cancelMarket`：必须管理面人工审批触发

原因：

- `cancelMarket` 是异常退款路径，不应自动化
- 其余四个动作本质上是裁决层或运行态状态的链上映射

## retryable 与 terminal 的最小分类

### retryable

- RPC / provider 网络错误
- timeout
- 连接中断
- nonce / replacement / underpriced 一类链路波动

### terminal

- 本地 proposition / market / bet 不存在
- 本地官方结果不完整
- on-chain state 不匹配
- payload 自相矛盾
- create/open/freeze/resolve/cancel 的重复调用

本阶段实现中：

- command service 会把 `retryable` 写入审计 metadata
- sync worker 会把 `retryable` 写入 stream 级错误审计
- queue 仍沿用现有统一重试策略，不单独引入新基础设施

## 阶段六后置项

仍明确后置到阶段六：

- 真正的自动触发接入现有 proposition / freeze / reveal 运行时
- 更细的 command retry orchestration
- pauser admin path
- 更细的异常分类与告警
- 多环境部署说明
- 真实链节点与 staging 环境联调
- complex reorg rollback
- shadow bet

## 本阶段验证结果

已通过：

- `pnpm --filter @arena/api typecheck`
- `pnpm --filter @arena/api build`
- `pnpm --filter @arena/api test:validation-chain`

说明：

- 当前 targeted validation-chain 验证已证明阶段五最小闭环成立
- 现有 `test:arena` 中的 `http-error-mapping.test.ts` 环境问题仍与阶段五无关
