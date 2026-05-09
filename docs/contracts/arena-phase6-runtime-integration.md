# Arena 合约一期阶段六：validation-chain runtime 接入

## 前置依赖

阶段六默认建立在阶段四 migration 已经在真实数据库环境执行完成的前提上。

必须先执行：

- `apps/api/prisma/migrations/20260423233000_validation_chain_foundation/migration.sql`

这一步不是代码能替代的。若 migration 未执行，下面这些能力都不能视为真实完成：

- `market` / `bet` 的 validation-chain 字段回写
- `validation_chain_event` / `validation_chain_cursor` 事件账本与游标
- runtime ingest / projection / monitoring 的真实联调

## 本阶段落地结果

### 1. 真实 runtime 接入点

validation-chain 没有另起平行主链路，而是接入现有 proposition / freeze / reveal runtime：

- `apps/api/src/arena/services/proposition-engine.service.ts`
  - `publishLiveProposition()`
  - 本地 proposition 进入 `live` 且本地 market 创建/激活完成后，排入 validation `create_market` + `open_market`
- `apps/api/src/arena/services/freeze-reveal-orchestrator.service.ts`
  - `freezeForReveal()`
  - 本地 freeze 完成后排入 validation `freeze_market`
  - `computeAndRecordOfficialResult()`
  - 链下 official result 记录完成后排入 validation `resolve_market`
  - `finalizeRevealPreparation()`
  - 在同一条 runtime 闭环里一次性排入 `freeze_market` + `resolve_market`

这里遵守的原则不变：

- 发交易成功不等于状态成功
- `Market.chainStatus` 不做乐观更新
- 最终状态只认链上事件投影

### 2. command retry orchestration 最小闭环

新增单一 command job：

- `validation-chain.command`

仍复用现有：

- `scheduler` queue
- 单 worker
- 串行处理
- `SAFE_RETRY_JOB_POLICY`

当前自动命令范围：

- `create_market`
- `open_market`
- `freeze_market`
- `resolve_market`

运行策略：

- runtime 触发点只负责排队，不直接串行连发后续命令
- `open_market` 默认延迟 `5000ms`
- `resolve_market` 默认延迟 `5000ms`
- queue 自动重试：`3` 次，指数退避，基础延迟 `1000ms`

分类规则：

- `retryable`
  - RPC / provider 网络错误
  - nonce / replacement / underpriced
  - 依赖前序链上状态尚未到位，例如 `market_not_created`
- `noop`
  - 已经 create / open / resolve / cancel，重复 job 可安全跳过
- `terminal`
  - 本地 proposition / market 缺失
  - official result 缺失或 payload 非法
  - 本地状态根本不满足命令前提

### 3. 最小告警与审计

本阶段没有引入新监控平台，而是基于：

- `internal_audit_event`
- 结构化日志
- internal monitoring endpoint

新增告警/审计动作包括：

- `validation_chain.command.enqueued`
- `validation_chain.command.retry_queued`
- `validation_chain.command.skipped`
- `validation_chain.alert.command_terminal`
- `validation_chain.alert.command_retry_exhausted`
- `validation_chain.alert.projector_entity_missing`
- `validation_chain.alert.cursor_stalled`
- `validation_chain.alert.sync_worker_unhealthy`
- `validation_chain.pause.submitted`
- `validation_chain.unpause.submitted`

新增最小监控视图：

- `GET /arena/internal/monitoring/validation-chain`

该视图返回：

- cursor 当前状态
- 是否 stalled
- 最近 command / sync / projector 告警
- resolved / cancelled 后长时间未 claim/refund 的市场观测项

### 4. pauser 最小后台入口

新增人工入口：

- `POST /arena/internal/validation-chain/pause`
- `POST /arena/internal/validation-chain/unpause`

约束：

- 仅 `admin` / `system`
- 必须携带审计身份
- 必须写 internal audit
- 不扩展成完整后台页面

### 5. staging / testnet 联调前置

已有环境变量继续沿用：

- `RPC_URL`
- `CHAIN_ID`
- `ARENA_VALIDATION_ENVIRONMENT`
- `ARENA_VALIDATION_CONTRACT_ADDRESS`
- `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY`
- `ARENA_VALIDATION_ORACLE_PRIVATE_KEY`
- `ARENA_VALIDATION_PAUSER_PRIVATE_KEY`
- `ARENA_VALIDATION_SYNC_CONFIRMATIONS`
- `ARENA_VALIDATION_SYNC_BATCH_SIZE`
- `ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS`

新增最小 deploy 辅助脚本：

- `scripts/deploy-validation-market.cjs`

脚本支持：

- 部署 `ArenaValidationMarket`
- 指定 admin
- 可选授予 operator / oracle / pauser 角色
- 输出 `deployment.validation.json`

脚本使用的额外环境变量：

- `ARENA_VALIDATION_ADMIN_ADDRESS`
- `ARENA_VALIDATION_OPERATOR_ADDRESS`
- `ARENA_VALIDATION_ORACLE_ADDRESS`
- `ARENA_VALIDATION_PAUSER_ADDRESS`

## 推荐联调顺序

1. 执行阶段四 migration。
2. 编译合约并部署 validation contract。
3. 把 validation contract address、RPC、chainId、3 个 signer key 配到 staging / testnet。
4. 确认 operator / oracle / pauser 地址已经拿到链上角色。
5. 准备一条 `marketEnabled=true` 的 staging proposition。
6. 调用现有 publish runtime，检查：
   - queue 中出现 `create_market` / `open_market`
   - 链上出现 `MarketCreated` / `MarketOpened`
   - DB 投影回写 `Market.chainStatus`
7. 准备有效样本，触发 freeze readiness。
8. 调用现有 freeze / reveal runtime，检查：
   - queue 中出现 `freeze_market` / `resolve_market`
   - 链上出现 `MarketFrozen` / `MarketResolved`
   - DB 投影回写 `chainResolvedAt / chainResultKind / chainWinningOption`
9. 让测试钱包完成 `claim` 或 `refund`。
10. 检查：
   - 链上 `Claimed` / `Refunded`
   - DB `Bet.claimed / claimTxHash / refundTxHash / grossPayout / refundAmount`
   - `/arena/internal/monitoring/validation-chain` 没有新增 stalled / exhausted 告警

## 仍然后置的内容

本阶段仍然明确不做：

- 并发 ingestion
- shadow bet
- 复杂 reorg rollback
- 前端钱包大改
- legacy PK 清理
- 完整运维平台化

## 当前缺口与注意事项

- 真实完成依赖阶段四 migration 已执行；仅有代码合入不代表可联调
- 现有 legacy `scripts/deploy.cjs` 仍然是旧 Arena 合约，不应再作为 validation deploy 基线
- staging proposition / bet 仍需现有 Arena runtime 自己准备，本阶段没有新增专用 seed job
