# Arena 合约一期规格设计

## 0. 文档定位

本文档定义 Arena “合约一期”的最小可用链上协议边界。

目标不是把 Arena 整体上链，而是在**不改动现有裁决层链下生产机制**的前提下，为“非滚动、单题、二选一”的验证层提供：

- 可托管的下注资金
- 可验证的官方结果写入
- 可确定的结果驱动结算
- 可自助的 claim / refund

本文档刻意收缩范围，不覆盖命题、派单、回答、质检、有效样本计数、信誉分、标签、奖励账本、滚动题、问卷、AMM、订单簿。

## 1. 当前仓库理解摘要

### 1.1 当前 MVP 已完成到什么程度

当前仓库已经形成一条完整的 Arena 应用层主链路：

1. `Proposition` 被创建、排期、发布 live。
2. `marketEnabled=true` 时，会自动创建并激活一对一 `Market`。
3. Respondent 在裁决层完成派单、作答、质检。
4. 有效样本计数器驱动 freeze readiness。
5. freeze / reveal orchestration 生成正式结果。
6. `ValidationSettlementService` 使用 proposition 的正式结果驱动 market 结算。
7. 结果面、奖励账本、信誉分、标签、内部运营面已经有第一阶段能力。

### 1.2 当前应用层已经存在的关键能力

- 裁决层：
  proposition 生命周期、派单、回答、review、effective sample、freeze / reveal、official result。
- 验证层：
  market 一对一绑定 proposition，单用户单仓位下注，settlementOutcome / grossPayout / refundAmount 等结果字段。
- 信息隔离：
  public progress 只暴露进度，不暴露方向；validation / adjudication surface 已有明确隔离。
- 运营控制：
  internal proposition ops、emergency freeze、respondent reputation、tags、reward ledger 都已进入后端模型。

### 1.3 为什么现在应该先做“验证层结算协议化”

因为当前系统里最需要可信最小化的部分，不是命题生产，而是：

- 下注资金托管
- 官方结果驱动结算
- 用户 claim / refund

这部分输入输出已经相对稳定：

- 输入端是 proposition 的正式结果
- 中间态是单市场、单仓位、二选一
- 输出端是 win / lose / refund

也就是说，验证层的结算闭环已经足够稳定，适合先协议化。

### 1.4 为什么裁决层仍然留在链下

因为裁决层当前包含大量不适合一期上链的能力：

- 派单与候选筛选
- 回答内容本身
- 质检与 review
- 有效样本计数
- freeze 条件判断
- 信誉分与标签副作用
- 内部运营控制与异常处置

这些逻辑既重状态、又高成本、又带有产品策略与人为判断，不适合当前阶段直接上链。

## 2. 合约一期目标定义

### 2.1 合约一期要解决的问题

合约一期只解决验证层最小可信结算问题：

- 市场存在性与唯一性
- 用户下注资金托管
- 市场冻结后禁止继续下注
- 由官方结果写链触发结算
- 用户基于确定结果自助 claim
- 取消市场后的自助 refund
- 用事件日志支撑后端与索引同步

### 2.2 合约一期不解决的问题

- 不解决 proposition 生产与调度
- 不解决 respondent 任务分发
- 不解决回答提交、review、sample counting
- 不解决 reputation / tags / reward ledger
- 不解决滚动题、多题问卷、hybrid
- 不解决盘口定价、AMM、订单簿
- 不解决回答数据与质检数据上链
- 不解决裁决过程可验证性

### 2.3 为什么当前阶段不能把 Arena “全面上链”

因为当前 Arena 的主复杂度不在转账，而在裁决生产过程：

- 质检与有效样本属于复杂业务规则，不适合直接固化为一期合约
- 回答与 review 上链会显著增加 gas、数据暴露和迭代成本
- “开奖前不共享方向”的产品原则，在公开链上无法通过简单下注合约彻底保证
- 当前仓库的应用层模型已经稳定，但链上模型还没有统一规格，直接写合约会把旧 PK 模型误带进来

## 3. 链上 / 链下边界定义

### 3.1 边界表

| 事项 | 所在层 | 说明 |
| --- | --- | --- |
| proposition 创建 | 链下 | 由后端 proposition engine / ops 负责 |
| 派单 | 链下 | respondent 分发与资格控制不上链 |
| 回答 | 链下 | 回答内容与确认项不上链 |
| 质检 | 链下 | review 状态、质量分、flags 不上链 |
| 有效样本计数 | 链下 | valid + partial_valid 统计继续留在后端 |
| 冻结条件判断 | 链下 | min duration / max duration / sample threshold 判断留在 freeze orchestrator |
| 正式结果生成 | 链下 | aggregate + official result 继续由裁决层产出 |
| market 创建 | 链上 | 创建验证层市场并建立 proposition 映射 |
| 下注资产托管 | 链上 | 用户资金进入合约托管 |
| 冻结状态 | 链上 | freeze 后禁止继续 placeBet |
| 官方结果落链 | 链上 | 由 `resolveMarket` 写入正式结果 |
| 结算 | 链上 | 结果写入后，claimable 逻辑固定 |
| claim | 链上 | 正常结果由用户自助领取 |
| refund | 链上 | 取消市场由用户自助退款 |

### 3.2 “验证层消费裁决层结果”的具体含义

含义不是“链上重新计算谁赢了”，而是：

1. 裁决层链下生成正式结果。
2. 结果以最小 payload 的形式由 `ORACLE_ROLE` 写入链上。
3. 验证层合约只检查：
   - market 是否存在
   - market 是否已冻结
   - 结果 payload 是否自洽
4. 一旦结果写入，合约按固定数学规则开放 claim。

因此：

- 裁决层负责“产出结果”
- 验证层负责“消费结果并执行资金分配”

## 4. 合约一期最小状态机

### 4.1 结论

一期建议采用以下**公开状态**：

- `PreLive`
- `Live`
- `Frozen`
- `Resolved`
- `Cancelled`

不建议保留 `Settled` 作为一期公开状态。

### 4.2 为什么不保留 `Settled`

`Settled` 在当前链上 pull-claim 方案里会造成重复语义：

- `Resolved` 已经表示“官方结果已写入，结算规则已固定，用户可以 claim”
- 用户是否都领完，不应影响市场状态
- 如果等待所有人都领完再进入 `Settled`，需要链上遍历或额外 claim window，这超出一期范围

所以：

- `Resolved` = 结果已正式落链，结算可执行
- `Settled` = 重复状态，本期删除

### 4.3 内部哨兵状态

Solidity 存储层建议保留一个**内部哨兵值** `Unset=0`，仅用于区分“市场不存在”和“PreLive”。

对外公开状态机仍然只有上述 5 个状态。

### 4.4 每个状态的定义

| 状态 | 定义 |
| --- | --- |
| `PreLive` | 市场已创建，但尚未开放下注 |
| `Live` | 市场开放下注 |
| `Frozen` | 市场已冻结，禁止继续下注，等待官方结果或取消 |
| `Resolved` | 官方结果已写入，claim 规则固定；若 resultKind=void，则 `claim` 走全额返还 |
| `Cancelled` | 市场未消费正式结果而被运营取消，用户走 `refund` |

### 4.5 每个状态允许执行的动作

| 状态 | 允许动作 | 必须禁止 |
| --- | --- | --- |
| `PreLive` | `openMarket`、`cancelMarket` | `placeBet`、`resolveMarket`、`claim`、`refund` |
| `Live` | `placeBet`、`freezeMarket`、`cancelMarket` | `resolveMarket`、`claim`、`refund` |
| `Frozen` | `resolveMarket`、`cancelMarket` | `placeBet`、`openMarket` |
| `Resolved` | `claim`、`claimableAmount` | `placeBet`、`freezeMarket`、`resolveMarket`、`cancelMarket`、`refund` |
| `Cancelled` | `refund`、`claimableAmount` | `placeBet`、`freezeMarket`、`resolveMarket`、`cancelMarket`、`claim` |

### 4.6 状态流转表

| 当前状态 | 动作 | 下一状态 |
| --- | --- | --- |
| `Unset` | `createMarket` | `PreLive` |
| `PreLive` | `openMarket` | `Live` |
| `PreLive` | `cancelMarket` | `Cancelled` |
| `Live` | `freezeMarket` | `Frozen` |
| `Live` | `cancelMarket` | `Cancelled` |
| `Frozen` | `resolveMarket` | `Resolved` |
| `Frozen` | `cancelMarket` | `Cancelled` |

### 4.7 灰状态与歧义检查

- 不保留 `Settling`：链上不做遍历式批量结算，不需要中间态。
- 不保留 `Settled`：`Resolved` 已经承担“结果固定，可提取”的语义。
- 不让 `Cancelled` 承担官方 void：官方 void 仍属于“消费裁决结果”，应进入 `Resolved`，只是 claim 金额等于 stake。
- `Cancelled` 只用于**非正式结果驱动**的异常退款路径。

## 5. 核心链上数据结构建议

### 5.1 总体约束

一期建议：

- 只支持**原生资产**下注和结算
- 不支持 ERC20 多资产
- 不支持平台费
- 一用户一市场一仓位
- market / proposition 使用 `bytes32` 作为链上标识

推荐映射规则：

- `propositionIdHash = keccak256(bytes(Proposition.id))`
- `marketIdHash = keccak256(bytes(Market.id))`

### 5.2 Market

| 字段 | 类型 | 含义 | 一期是否必须 |
| --- | --- | --- | --- |
| `propositionId` | `bytes32` | 对应链下 proposition 唯一键哈希 | 必须 |
| `state` | `uint8 / enum` | 市场状态 | 必须 |
| `minStake` | `uint256` | 最低下注额，映射 proposition.minBetAmount | 必须 |
| `poolOption0` | `uint256` | 0 侧累计资金，用于结算公式 | 必须 |
| `poolOption1` | `uint256` | 1 侧累计资金，用于结算公式 | 必须 |
| `openedAt` | `uint64` | open 时间 | 必须 |
| `frozenAt` | `uint64` | freeze 时间 | 必须 |
| `resolvedAt` | `uint64` | resolve 时间 | 必须 |
| `cancelledAt` | `uint64` | cancel 时间 | 必须 |
| `resultKind` | `uint8 / enum` | `Resolved` 或 `Void` | 必须 |
| `winningOption` | `uint8` | 胜方选项，仅 normal result 生效 | 必须 |
| `voidReason` | `uint8 / enum` | 官方 void 原因 | 必须 |
| `cancelReasonCode` | `bytes32` | 非官方取消原因码 | 必须 |

说明：

- `poolOption0 / poolOption1` 属于**内部结算字段**，建议不通过高层 view 主动暴露，但链上公开性本身无法完全隐藏。
- `resolvedAt` 和 `cancelledAt` 不能复用一个字段，否则会让 terminal path 语义模糊。

### 5.3 Position / Bet

链上不建议单独维护自增 `betId`。

一期建议直接以 `(marketId, user)` 作为仓位主键。

| 字段 | 类型 | 含义 | 一期是否必须 |
| --- | --- | --- | --- |
| `selectedOption` | `uint8` | 用户下注方向，0 或 1 | 必须 |
| `stakeAmount` | `uint256` | 用户托管本金 | 必须 |
| `claimed` | `bool` | 是否已 claim / refund，防重复提取 | 必须 |

说明：

- 因为一期明确是一用户一市场一仓位，所以不需要 `betId`。
- `claimed` 是链上必须字段，但当前后端 `Bet` 模型没有对应字段，这个差异必须由后续索引同步或投影层解决。

### 5.4 Result / Oracle Payload

| 字段 | 类型 | 含义 | 一期是否必须 |
| --- | --- | --- | --- |
| `marketId` | `bytes32` | 被结算的 market | 必须 |
| `propositionId` | `bytes32` | 与 market 绑定的 proposition | 必须 |
| `resultKind` | `uint8 / enum` | `Resolved` 或 `Void` | 必须 |
| `winningOption` | `uint8` | 正常结果下的胜方 | 条件必须 |
| `voidReason` | `uint8 / enum` | official void 原因 | 条件必须 |

规则：

- `resultKind=Resolved` 时，`winningOption` 必须是 0 或 1，`voidReason=None`
- `resultKind=Void` 时，`winningOption=None`，`voidReason` 必须有值

### 5.5 本期不该加的字段

以下字段看起来以后可能有用，但本期不应加入：

- 标题、描述、选项文案
- category、sample rules、reward rules
- public progress JSON
- last public result JSON
- tags / reputation / reward ledger 关联
- metadata URI
- orderbook / odds / AMM 参数
- 多市场、多资产、maker/taker 等扩展字段
- bet version、partial close、cashout、add-to-position

### 5.6 与当前后端 proposition / market / bet 的映射方式

映射建议：

- 后端 `Proposition.id` 对应链上 `propositionIdHash`
- 后端 `Market.id` 对应链上 `marketIdHash`
- 后端 `Bet` 继续以 `(marketId, userId)` 作为唯一自然键；当前 schema 已有 `@@unique([marketId, userId])`
- 后端 `userId` 当前实际是钱包地址字符串，可与链上 `address` 一一对应

需要特别指出的差异：

1. 当前后端 `Bet` 只有结算结果，没有 `claimed` 状态
2. 当前后端 `Market` 有 `cancelled` 枚举，但没有完整 cancel 运行路径，也没有 `cancelledAt`
3. 当前 `chainPkId` 命名仍然绑定旧 PK 合约，不适合作为新市场协议的正式桥接字段名

## 6. 合约接口草案

### 6.1 接口签名建议

```solidity
function createMarket(bytes32 marketId, bytes32 propositionId, uint256 minStake) external;
function openMarket(bytes32 marketId) external;
function freezeMarket(bytes32 marketId) external;
function cancelMarket(bytes32 marketId, bytes32 reasonCode) external;

function placeBet(bytes32 marketId, uint8 selectedOption) external payable;

function resolveMarket(ResultPayload calldata payload) external;

function claim(bytes32 marketId) external;
function refund(bytes32 marketId) external;

function getMarket(bytes32 marketId) external view returns (MarketView memory);
function getUserPosition(bytes32 marketId, address user) external view returns (PositionView memory);
function claimableAmount(bytes32 marketId, address user) external view returns (uint256);
```

### 6.2 接口职责表

| 接口 | 用途 | 入参 | 调用权限 | 可调用状态 | 失败条件 | 一期保留 |
| --- | --- | --- | --- | --- | --- | --- |
| `createMarket` | 建立 proposition 对应的验证市场 | `marketId`, `propositionId`, `minStake` | `OPERATOR_ROLE` | `Unset` | 市场已存在、ID 为零、`minStake=0`、paused | 保留 |
| `openMarket` | 将市场从 `PreLive` 打开到 `Live` | `marketId` | `OPERATOR_ROLE` | `PreLive` | 市场不存在、非法状态、paused | 保留 |
| `freezeMarket` | 冻结市场，停止下注 | `marketId` | `OPERATOR_ROLE` | `Live` | 市场不存在、非法状态、paused | 保留 |
| `cancelMarket` | 走异常取消路径，允许 refund | `marketId`, `reasonCode` | `OPERATOR_ROLE` | `PreLive / Live / Frozen` | 终态市场、官方结果已写入、paused | 保留 |
| `placeBet` | 用户原生资产下注并托管 | `marketId`, `selectedOption`，`msg.value` | 普通用户 | `Live` | 市场不存在、非法状态、方向非法、金额低于 `minStake`、重复仓位、paused | 保留 |
| `resolveMarket` | 写入正式结果并固定 claim 规则 | `ResultPayload` | `ORACLE_ROLE` | `Frozen` | 市场不存在、状态非法、结果 payload 不自洽、market/proposition 不匹配、重复 resolve、paused | 保留 |
| `claim` | 用户按正式结果领取应得金额 | `marketId` | 普通用户 | `Resolved` | 无仓位、已领取、无可领取金额、paused | 保留 |
| `refund` | 用户在取消市场场景下退回本金 | `marketId` | 普通用户 | `Cancelled` | 无仓位、已退款、状态非法、paused | 保留 |
| `getMarket` | 查询市场只读快照 | `marketId` | 任意 | 任意 | 市场不存在 | 保留 |
| `getUserPosition` | 查询用户仓位 | `marketId`, `user` | 任意 | 任意 | 市场不存在 | 保留 |
| `claimableAmount` | 查询当前可提金额 | `marketId`, `user` | 任意 | 任意 | 市场不存在 | 保留 |

### 6.3 `claimableAmount` 的规则

- `Resolved + resultKind=Resolved`
  - 胜方：`stake * totalPool / winningPool`
  - 负方：`0`
- `Resolved + resultKind=Void`
  - 全员：`stake`
- `Cancelled`
  - 全员：`stake`

当前一期不处理 rounding dust 提取，claim 采用整数下取整。

## 7. 权限模型与安全模型

### 7.1 最小角色体系

建议使用：

- `DEFAULT_ADMIN_ROLE`
- `OPERATOR_ROLE`
- `ORACLE_ROLE`
- `PAUSER_ROLE`

### 7.2 角色职责

| 角色 | 职责 |
| --- | --- |
| `DEFAULT_ADMIN_ROLE` | 授权 / 回收角色，合约级治理 |
| `OPERATOR_ROLE` | `createMarket`、`openMarket`、`freezeMarket`、`cancelMarket` |
| `ORACLE_ROLE` | `resolveMarket`，把正式结果写链 |
| `PAUSER_ROLE` | `pause` / `unpause` |
| 普通用户 | `placeBet`、`claim`、`refund`、查询 |

### 7.3 谁负责什么

- 谁负责创建市场：`OPERATOR_ROLE`
- 谁负责冻结市场：`OPERATOR_ROLE`
- 谁负责提交正式结果：`ORACLE_ROLE`
- 谁可以暂停：`PAUSER_ROLE`
- 普通用户拥有的权利：下注、claim、refund、查询

### 7.4 安全点清单

一期至少必须覆盖：

- `ReentrancyGuard`
- Checks-Effects-Interactions
- `claimed` 防重复 claim / refund
- 终态市场防重复 resolve / cancel
- 非法状态调用防护
- 一用户一市场一仓位防护
- `selectedOption` 只能是 0/1
- 原生资产金额必须与规则匹配
- `msg.value >= minStake`
- `resolveMarket` 必须校验 market / proposition 绑定关系
- `cancel` 与 `resolve` 路径隔离
- `Resolved` / `Cancelled` 后继续下注防护
- pause 期间阻断所有状态变更与资金流出入
- `receive()` / `fallback()` 应拒绝无意义直接转账

### 7.5 权限实施建议

- `DEFAULT_ADMIN_ROLE` 不建议挂在单热钱包，应挂多签
- `ORACLE_ROLE` 可以先由后端受控 signer 持有
- 一期允许 `OPERATOR_ROLE` 与 `ORACLE_ROLE` 属于同一运营体系，但合约层应保持角色分离

## 8. 事件设计

| 事件 | 是否必要 | 建议参数 | 为什么需要 |
| --- | --- | --- | --- |
| `MarketCreated` | 必要 | `marketId`, `propositionId`, `minStake`, `operator` | 建立 proposition 与 chain market 的索引关系 |
| `MarketOpened` | 必要 | `marketId`, `openedAt`, `operator` | 标记开始接受下注 |
| `BetPlaced` | 必要 | `marketId`, `propositionId`, `user`, `selectedOption`, `amount` | 资金托管与仓位建立的主日志 |
| `MarketFrozen` | 必要 | `marketId`, `frozenAt`, `operator` | 停止下注的关键生命周期点 |
| `MarketResolved` | 必要 | `marketId`, `propositionId`, `resultKind`, `winningOption`, `voidReason`, `resolvedAt`, `oracle` | 正式结果落链与 claim 规则固定 |
| `MarketCancelled` | 必要 | `marketId`, `propositionId`, `reasonCode`, `cancelledAt`, `operator` | 异常退款路径的审计入口 |
| `Claimed` | 必要 | `marketId`, `propositionId`, `user`, `amount` | 用户领取记录，供后端同步 claimed 状态 |
| `Refunded` | 必要 | `marketId`, `propositionId`, `user`, `amount` | 取消市场退款记录 |
| `Paused` | 必要 | `account` | 运维审计 |
| `Unpaused` | 必要 | `account` | 运维审计 |

说明：

- 角色授权日志由 `AccessControl` 自带 `RoleGranted` / `RoleRevoked`，无需重复自定义。
- 一期不建议在事件里主动广播 `poolOption0 / poolOption1`，避免进一步放大方向暴露。

## 9. 推荐的目录结构

当前仓库根目录已经有 Hardhat 结构：

- `contracts/`
- `scripts/`
- `test/`

因此一期建议**沿用现有 root Hardhat 结构**，不要另起一套工具链。

推荐最小结构：

```text
contracts/
  legacy/
    Arena.sol
  validation/
    ArenaValidationMarket.sol

scripts/
  deploy-validation.cjs

test/
  legacy/
    Arena.legacy.test.cjs
  validation/
    ArenaValidationMarket.test.cjs

docs/
  contracts/
    arena-phase1-spec.md
    arena-phase1-integration.md
```

注意：

- 本阶段只做建议，不要求立即迁移旧文件。
- 旧 `contracts/Arena.sol`、`test/Arena.test.cjs`、前端 `PK` hooks / types 当前都属于 legacy 语义，应避免继续作为新协议基线。

## 10. 阶段一验收标准

阶段一完成应满足以下可检查标准：

1. 链上 / 链下边界无歧义
2. 官方结果驱动结算的闭环已定义清楚
3. 市场状态机已收敛，且无 `Settling / Settled / Resolved` 重复语义
4. `create -> open -> placeBet -> freeze -> resolve -> claim` 路径闭环
5. `create/live/frozen -> cancel -> refund` 路径闭环
6. 数据模型最小且能映射到当前 `Proposition / Market / Bet`
7. claim 防重与 refund 防重机制已定义
8. 权限模型明确，角色边界可执行
9. 关键事件足够支持后端接链与索引同步
10. 已明确指出现有仓库中的 legacy 命名与结构冲突点
11. 可以直接进入 Solidity 接口与测试用例设计阶段

## 11. 风险与后续建议

### 11.1 如果跳过规格设计直接写合约，最容易出现的问题

- 把旧 `PK` 合约模型误当成 Arena 新协议基线
- 继续保留“手动指定 winner”的旧结算接口，违背“验证层由裁决层正式结果驱动”
- 同时保留 `Resolved / Settled / Settling`，出现重复或死状态
- 把官方 void 和运营 cancel 混成一个路径，导致链下链上映射失真
- 没有 `claimed` 状态，claim / refund 无法防重
- 继续沿用 `chainPkId` 之类旧桥接命名，后续同步层会混乱
- 忽视公开链下注天然暴露方向的问题，误以为“前端不展示”就等于“协议不泄露”

### 11.2 本仓库目前存在的协议层冲突点

1. 旧 `contracts/Arena.sol` 与 `test/Arena.test.cjs` 仍是 `PK` 手动结算语义，不是当前 Arena proposition / market / official result 语义。
2. 前端仍残留 `PK` 相关 hooks、types、mock 数据，但 `src/App.tsx` 已切换到新的 Arena surfaces，说明仓库正处在语义迁移期。
3. `Proposition.chainPkId` 的桥接命名仍然绑定旧 `pkId` 模型，建议后续改为更中性的 chain market reference，但本阶段不强改。
4. 当前后端 `MarketStatus` 有 `cancelled`，但缺完整 cancel 服务路径与 `cancelledAt` 字段；如果要接一期合约，后端 projection 需要补齐。
5. 当前后端 `Bet` 没有 `claimed` 维度，必须通过链上事件或同步投影补齐。

### 11.3 下一阶段推荐顺序

1. 先锁定本文档，不再扩 scope
2. 先写 Solidity 接口、enum、struct、event skeleton
3. 先写状态机与权限测试，再写资金流测试
4. 再实现最小主合约
5. 再做后端链上同步与 claim/refund 投影设计
6. 最后再清理 legacy `PK` 相关代码与命名

## 12. 明确结论

按照本文档的收敛结果，**阶段一已经达到可以进入 Solidity 实现阶段的条件**。

依据是：

- 链上 / 链下边界已经闭合
- 最小状态机已经收敛
- 接口集合已经闭环
- 权限模型已经明确
- 安全约束已经列出
- 与现有后端模型的映射方式已经定义
- 现有仓库中的 legacy 冲突点已经识别

进入实现前只需要团队确认三项一期定稿决策：

1. 一期公开状态机删除 `Settled`，采用 `PreLive -> Live -> Frozen -> Resolved / Cancelled`
2. 官方 void 通过 `resolveMarket(resultKind=Void)` 进入 `Resolved`，运营取消才进入 `Cancelled`
3. 一期只做原生资产、零平台费、单仓位、pull-claim

如果以上三项确认，这份规格已经足以进入 Solidity 编写与测试设计阶段。
