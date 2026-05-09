# Arena validation-chain 联调 blocker 清理执行说明

## 目标

本文件只解决当前已经暴露出来的联调 blocker，不扩 validation-chain 协议范围，不新增业务功能。

当前收敛目标是把 Arena validation-chain 从：

- 代码层已通过
- 环境层 No-Go

推进到：

- 仓库内可修 blocker 已清掉
- 剩余 blocker 都有明确执行命令、配置模板、验证标准

## 这次已在仓库内清掉的 blocker

### 1. validation-chain env 体系补齐

已补：

- `.env.example`
  - 补充 validation runtime 必填配置说明
  - 补充 deploy / verify helper 地址变量
- `apps/api/src/config/env.schema.ts`
  - 明确禁止 `ARENA_VALIDATION_CONTRACT_ADDRESS` 复用 legacy `ARENA_CONTRACT_ADDRESS`
  - 明确 validation signer 私钥格式必须是 `0x` 前缀的 32-byte hex
- `scripts/check-validation-env.cjs`
  - 一次性检查 validation env 是否完整
  - 导出 operator / oracle / pauser 地址
  - 校验显式地址和私钥导出地址是否一致

### 2. API production 启动入口修复

已补：

- `apps/api/package.json`
  - `main` 改为 `dist/apps/api/src/main.js`
  - `start:prod` 改为 `node dist/apps/api/src/main.js`

当前 build 后的真实入口就是：

- `apps/api/dist/apps/api/src/main.js`

### 3. 联调前 preflight 脚本补齐

已补：

- `scripts/check-validation-env.cjs`
  - 环境变量完整性 / fail-fast 检查
- `scripts/check-validation-runtime-deps.cjs`
  - PostgreSQL / Redis / RPC 可达性检查
- `scripts/check-validation-contract.cjs`
  - chainId
  - validation contract code presence
  - runtime bytecode 与本地 artifact 指纹一致性
  - operator / oracle / pauser 地址导出
  - signer 原生币余额检查
  - on-chain role 检查

### 4. 部署和验证入口补齐

已补：

- `scripts/deploy-validation-market.cjs`
  - 自动读取 `.env`
  - 校验 admin 地址
  - 部署后输出 `ARENA_VALIDATION_CONTRACT_ADDRESS=...`

### 5. 根命令入口补齐

已补到根 `package.json`：

- `pnpm run validation:env:check`
- `pnpm run validation:deps:check`
- `pnpm run validation:chain:check`
- `pnpm run validation:preflight`
- `pnpm run validation:deploy -- --network <network>`
- `pnpm run validation:db:status`
- `pnpm run validation:db:deploy`
- `pnpm run validation:test`

## validation env 说明

### 运行期必填

这些缺任意一个，都不能进入 staging / testnet 联调：

- `DATABASE_URL`
- `REDIS_URL`
- `RPC_URL`
- `CHAIN_ID`
- `ARENA_CONTRACT_ADDRESS`
- `ARENA_VALIDATION_ENVIRONMENT`
- `ARENA_VALIDATION_CONTRACT_ADDRESS`
- `ARENA_VALIDATION_SYNC_CONFIRMATIONS`
- `ARENA_VALIDATION_SYNC_BATCH_SIZE`
- `ARENA_VALIDATION_SYNC_POLL_INTERVAL_MS`
- `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY`
- `ARENA_VALIDATION_ORACLE_PRIVATE_KEY`
- `ARENA_VALIDATION_PAUSER_PRIVATE_KEY`

### 部署 / 校验辅助项

这些不是 API runtime 必填，但 deploy / role verification 时建议提供：

- `ARENA_VALIDATION_ADMIN_ADDRESS`
- `ARENA_VALIDATION_OPERATOR_ADDRESS`
- `ARENA_VALIDATION_ORACLE_ADDRESS`
- `ARENA_VALIDATION_PAUSER_ADDRESS`

### fail-fast 约束

当前仓库已明确：

- validation 地址不得复用 legacy `ARENA_CONTRACT_ADDRESS`
- validation signer 私钥必须是 `0x` 前缀 32-byte hex
- 缺失 validation 核心 env 时，`validation:env:check` 必须直接失败

## 执行顺序

### 1. 补 env

先复制 `.env.example` 中的 validation 段到目标环境：

```powershell
pnpm run validation:env:check
```

通过标准：

- 没有 `FAIL`
- 能输出 operator / oracle / pauser 派生地址
- legacy 地址与 validation 地址不同

### 2. 检查基础依赖

```powershell
pnpm run validation:deps:check
```

如果 API 已启动，再加：

```powershell
pnpm run validation:deps:check -- --check-api
```

通过标准：

- postgres reachable
- redis reachable
- rpc reachable 且 chain id 与 `CHAIN_ID` 一致

### 3. 执行 migration

真实环境必须先执行阶段四 migration。代码不能替代真实 DB 迁移。

```powershell
pnpm run validation:db:deploy
pnpm run validation:db:status
```

然后执行 SQL 验证：

- `docs/contracts/sql/validation-schema-check.sql`

通过标准：

- `market` validation-chain 字段齐全
- `bet` validation-chain 字段齐全
- `validation_chain_event` 存在
- `validation_chain_cursor` 存在
- 事件唯一键和顺序索引存在

### 4. 部署 validation contract

如果 testnet / staging 链上 아직没有 validation contract：

```powershell
pnpm exec hardhat compile
pnpm run validation:deploy -- --network <network>
```

部署前必须满足：

- deploy signer 有 gas
- RPC_URL 指向目标链
- CHAIN_ID 与目标链一致
- `ARENA_VALIDATION_ADMIN_ADDRESS` 已明确

部署后动作：

1. 记下输出的 `ARENA_VALIDATION_CONTRACT_ADDRESS`
2. 回填到目标环境
3. 再执行链上校验

```powershell
pnpm run validation:chain:check
```

通过标准：

- `getCode != 0x`
- provider chain id 与 `CHAIN_ID` 一致
- on-chain runtime bytecode 与本地 `ArenaValidationMarket` artifact 一致
- operator / oracle / pauser 地址都能导出
- 三个地址都有原生币余额
- 三个地址都拥有正确 role

### 5. 启动 API

先构建：

```powershell
pnpm --filter @arena/api build
```

现在正确的 production 启动命令是：

```powershell
pnpm --filter @arena/api start:prod
```

如果只是验证入口路径，也可以直接运行：

```powershell
node apps/api/dist/apps/api/src/main.js
```

通过标准：

- 不再出现 `Cannot find module ... dist/main.js`
- 进入真实 runtime 初始化阶段
- 若 DB / Redis 未就绪，应表现为依赖连接失败，而不是产物路径错误

### 6. 运行 validation-chain targeted tests

```powershell
pnpm run validation:test
```

通过标准：

- `20/20 passing`

### 7. 联调样本准备

优先路径：

1. 用现有 proposition authoring 流创建 2 条 proposition
2. 通过 internal proposition 控制面推进

需要的两条 proposition：

- happy path proposition
  - `marketEnabled = true`
  - `rollingMode = non_rolling`
  - `structure = binary`
  - `minEffectiveSample = 1`
- cancel path proposition
  - `marketEnabled = true`
  - 其他同上

如果 staging 当前没有 proposition authoring 入口，可使用 staging-only SQL fallback：

- `docs/contracts/sql/validation-proposition-seed.template.sql`

推进路径：

1. 审批 proposition
   - `POST /arena/internal/propositions/:propositionId/approve`
2. 让 proposition 进入 live
   - 走现有 publish runtime
   - 这一步应触发 `publishLiveProposition() -> create/open`
3. happy path 若要走到 resolve
   - 需要至少 1 条有效样本
   - 满足 freeze readiness 后走 `freezeForReveal()`
   - official result 产出后走 `computeAndRecordOfficialResult()`
4. cancel/refund path
   - create/open 后直接通过 operator cancel

### 8. 最小 bet 样本准备

claim / refund 投影要成立，Bet 的 `userId` 必须能映射到链上事件里的 EVM 地址。

最小约束：

- 至少准备 1 个 winning-side 地址
- 至少准备 1 个 losing-side 地址
- `bet.user_id` 必须直接等于链上下注钱包地址

优先路径：

1. 通过现有 `POST /arena/validation/markets/:marketId/bets` 建立本地 bet
2. 使用同一个 EOA 地址直接向 validation contract 调用链上 `placeBet`

如果当前没有前端钱包联调，可只先验证：

- create/open/freeze/resolve -> ingest -> projection

claim / refund 留到 signer 和钱包侧 ready 后再补跑。

## DB / worker / projector 验收查询

事件和游标：

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

```sql
select event_name,
       block_number,
       transaction_hash,
       log_index,
       market_chain_id,
       proposition_chain_id,
       processed_at
from validation_chain_event
order by block_number desc, transaction_index desc, log_index desc
limit 20;
```

Market 投影：

```sql
select id,
       proposition_id,
       chain_market_id,
       chain_proposition_id,
       chain_status,
       chain_opened_at,
       chain_frozen_at,
       chain_resolved_at,
       chain_cancelled_at,
       chain_result_kind,
       chain_winning_option,
       chain_void_reason,
       resolution_tx_hash,
       cancel_tx_hash,
       chain_synced_at
from market
where proposition_id in ('<HAPPY_PROPOSITION_ID>', '<CANCEL_PROPOSITION_ID>');
```

Bet 投影：

```sql
select id,
       market_id,
       proposition_id,
       user_id,
       claimed,
       claimed_at,
       claim_tx_hash,
       refunded_at,
       refund_tx_hash,
       gross_payout,
       refund_amount,
       chain_synced_at
from bet
where proposition_id in ('<HAPPY_PROPOSITION_ID>', '<CANCEL_PROPOSITION_ID>')
order by created_at asc;
```

监控入口：

```text
GET /arena/internal/monitoring/validation-chain
```

## blocker 通过标准

### Blocker A: validation env 缺失

通过标准：

- `pnpm run validation:env:check` 全绿

### Blocker B: PostgreSQL 不可达

通过标准：

- `pnpm run validation:deps:check` 中 postgres reachable
- `pnpm run validation:db:deploy` 成功
- `pnpm run validation:db:status` 成功
- SQL 校验通过

### Blocker C: Redis 不可达

通过标准：

- `pnpm run validation:deps:check` 中 redis reachable
- API 启动后 queue / worker 不再报 `ECONNREFUSED`

### Blocker D: validation contract 未部署

通过标准：

- `pnpm run validation:chain:check` 中 code present
- bytecode match
- 角色和余额通过

### Blocker E: API 正式启动入口错误

通过标准：

- `pnpm --filter @arena/api start:prod` 不再报 `Cannot find module ... dist/main.js`

### Blocker F: 至少一套真实依赖环境未起

通过标准：

- postgres reachable
- redis reachable
- rpc reachable
- api 能启动

## 重新做 Go / No-Go 判断的标准

满足下面全部条件后，才允许从 No-Go 进入 Go with caveats 或 Go：

1. `validation:env:check` 通过
2. `validation:deps:check` 通过
3. migration 已真实执行并校验
4. validation contract 已部署
5. `validation:chain:check` 通过
6. `@arena/api start:prod` 可启动到真实 runtime
7. 能观察到至少一条 create/open 事件被 ingest 并推进 cursor

只要上面任意一项未通过，结论仍然是 `No-Go`。
