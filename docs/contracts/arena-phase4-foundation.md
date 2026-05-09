# Arena 合约一期阶段四：validation-chain 基础设施落地

## 本阶段目标

阶段四只落地 validation-chain 的基础层，不扩 Solidity 协议范围，也不提前实现完整命令发送或事件投影闭环。

本阶段完成内容：

- Prisma schema 扩展
- validation-chain 基础 types
- validation-chain 模块骨架
- `ValidationChainIdService`
- `ValidationChainContractService` 的只读能力
- `validation_chain_event` / `validation_chain_cursor` repository
- validation-chain env/config 扩展
- 最小单测

本阶段明确不做：

- operator 发 `create/open/freeze/cancel`
- oracle 发 `resolve`
- pauser 发 `pause/unpause`
- 完整 event ingestion worker
- 完整 projection service
- retry orchestration
- shadow bet
- 复杂 reorg rollback

## 本阶段新增 / 修改文件

### Prisma / migration

- `apps/api/prisma/schema.prisma`
  - 为 `market` 增加 validation-chain 投影字段
  - 为 `bet` 增加 claim/refund 链上同步字段
  - 新增 `ValidationChainEvent`
  - 新增 `ValidationChainCursor`
  - 新增 validation-chain 专用 enum
- `apps/api/prisma/migrations/20260423233000_validation_chain_foundation/migration.sql`
  - 输出阶段四 migration

### validation-chain 子域

- `apps/api/src/arena/validation-chain/validation-chain.types.ts`
  - validation-chain 常量、类型、contract error 定义
- `apps/api/src/arena/validation-chain/validation-chain.module.ts`
  - validation-chain 模块骨架
- `apps/api/src/arena/validation-chain/validation-chain-id.service.ts`
  - 生成 `chainPropositionId` / `chainMarketId`
- `apps/api/src/arena/validation-chain/validation-chain-contract.service.ts`
  - validation 合约 artifact 读取
  - provider 初始化
  - readonly contract client
  - `getLogs`
  - `parseLog`
  - 基础 read helpers

### repository

- `apps/api/src/arena/repositories/validation-chain-event.repository.ts`
  - event 账本写入与幂等查询
- `apps/api/src/arena/repositories/validation-chain-cursor.repository.ts`
  - cursor 读取、upsert、checkpoint 更新

### module / config / tests

- `apps/api/src/arena/arena.module.ts`
  - 接入 `ValidationChainModule`
- `apps/api/src/config/env.schema.ts`
  - 增加 validation-chain 配置校验
- `apps/api/src/config/app-config.service.ts`
  - 增加 validation-chain getter
- `apps/api/package.json`
  - 新增 `test:validation-chain`
- `apps/api/test/arena/harness.ts`
  - 兼容 `Market / Bet` 新字段
- `apps/api/test/arena/validation-chain-id.service.test.ts`
  - IdService 单测
- `apps/api/test/arena/validation-chain-repositories.test.ts`
  - repository 单测
- `apps/api/test/arena/validation-chain-contract.service.test.ts`
  - config / contract service 单测
- `.env.example`
  - 增加 validation-chain 必要配置示例

## 本阶段完成结果

### 1. 数据层已落地

- `Market` 已具备 validation-chain 投影字段
- `Bet` 已具备 claim/refund 同步字段
- `validation_chain_event` 已能承接：
  - 幂等
  - 重放
  - 恢复
  - 审计
- `validation_chain_cursor` 已能承接：
  - stream 定位
  - processed checkpoint
  - finalized block
  - sync status

### 2. ID 生成规则已代码化

`ValidationChainIdService` 已严格按定稿规则实现：

- `buildChainPropositionId(propositionId)`
- `buildChainMarketId(marketId)`

显式依赖：

- `ARENA_VALIDATION_ENVIRONMENT`
- `CHAIN_ID`

### 3. 只读接链能力已建立

`ValidationChainContractService` 已建立：

- validation artifact 读取
- validation contract address 独立读取
- provider 初始化
- readonly contract client
- `getLogs`
- `parseLog`
- `getMarket`
- `getUserPosition`
- `claimableAmount`

并且没有复用 legacy `ARENA_CONTRACT_ADDRESS` 作为 validation 地址。

### 4. repository 基线已建立

event repository 已支持：

- `insertIfAbsent`
- `saveEvent`
- `existsByChainTxLog`
- `findByCursorRange`

cursor repository 已支持：

- `getCursor`
- `upsertCursor`
- `updateProcessedCheckpoint`
- `updateFinalizedBlock`

## 阶段五后置项

以下能力明确后置到阶段五：

- operator / oracle / pauser 真正发链上交易
- event ingestion worker
- projector
- 事件驱动的 `chainStatus` 最终投影
- retry / backoff / queue orchestration

后置原因：

- 阶段四的目标是先把 schema、ID、readonly contract、event/cursor repository 打稳
- 阶段五才需要在这些稳定基线上补命令发送与事件消费闭环
- 这样可以避免“边写链路边改底层模型”的返工

## 本阶段验证

已完成验证：

- `pnpm --filter @arena/api typecheck`
- `pnpm --filter @arena/api test:validation-chain`

说明：

- 现有 `test:arena` 中的 `http-error-mapping.test.ts` 在当前环境下仍会遇到 `listen ENOBUFS`
- 这不是本阶段新增 validation-chain 代码导致的问题
- 因此阶段四以 targeted validation-chain 测试作为本阶段验收基线
