# Arena

[English](./README_EN.md) | 简体中文

[![Status](https://img.shields.io/badge/status-active_mvp_baseline-0A66C2?style=flat-square)](./README.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Hardhat](https://img.shields.io/badge/Hardhat-2-FFF100?style=flat-square&logo=ethereum&logoColor=black)](https://hardhat.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)

Arena 是一个把“人群裁决”与“围绕结果的验证市场”放进同一条产品链路里的 Web3 / AI 双层系统。

如果用更协议化的语言来定义，Arena 可以概括为:

`Arena = 短期人群判断预言机 + 长期领域信誉图谱`

它面向 DAO 与链上社区的主观决策场景: 短期提供可调用的群体决策信号，长期沉淀用户在不同领域的判断信誉。

它不是普通预测市场，也不是把问卷、交易和钱包登录简单拼接在一起的 demo，更不是 Snapshot 的简单替代品。Arena 的裁决层负责生成可验证结果，验证层围绕结果进行下注、结算与退款；开奖前公开的是进度，不是方向。

当前仓库已经同时具备三类基线:

- `Product shape`: 中文优先的前端产品壳，已经把 discovery、market detail、drafts、challenge submission、adjudication、watchlist、results 等入口做成可浏览、可测试的连续体验。
- `Application runtime`: NestJS API、Prisma、Redis、状态机与 Arena shared domain，支撑 proposition、market、bet、reward、reputation、watchlist、internal ops 等主链路。
- `Validation chain`: 基于 Hardhat / Solidity 的 validation market 合约与 runtime 接链流程，用来承接非滚动、单题、二选一市场的最小可信结算闭环。

## 🧭 协议定位

从产品定位上看，Arena 不是单纯预测市场，而是一个面向主观决策场景的人群判断预言机协议。

可以把它抽象成两层:

`Arena = Consensus Oracle + Domain Reputation Graph`

中文就是:

`Arena = 人群判断预言机 + 领域信誉图谱`

其中两层分别解决不同问题:

- `Consensus Oracle`
  - 解决“这个问题当前群体如何判断”。
  - 面向 Grant 资助、提案筛选、贡献验收、白名单准入、内容治理等 DAO 与链上社区场景。
  - 短期输出可被治理合约、资助协议、任务平台或内容协议读取的群体决策信号。

```json
{
  "proposal_id": "grant-2026-042",
  "epoch": 12,
  "support_rate": 76.4,
  "verified_participants": 1832,
  "confidence": 0.82,
  "result": "support"
}
```

- `Domain Reputation Graph`
  - 解决“哪些人的判断更值得参考”。
  - Arena 会持续记录用户在 AI 模型评测、DeFi 风险识别、DAO 治理、开源贡献评审、内容策展等不同领域的判断行为。
  - 长期沉淀的不是一次性投票偏好，而是基于长期行为形成的领域化判断信誉。

这两层构成 Arena 的核心飞轮:

`短期共识结果 -> 进入信誉记录 -> 影响后续任务权重 -> 提升后续结果质量 -> 持续沉淀领域信誉`

因此 Arena 与普通 DAO 投票的差异，不只是“谁支持、谁反对”，而是进一步回答:

- 谁支持这个结论。
- 这些人过去是否可信。
- 他们在哪个领域更可信。
- 这个结果能否被外部协议直接调用。

从这个角度看，Arena 不是简单替代投票工具，而是可以叠加在 Snapshot、DAO、Grant 平台、任务平台和内容协议之上的判断信号层。

当前仓库里的 `Adjudication layer + Validation layer`，就是在实现这一定义下的最小可运行协议路径:

- `Adjudication layer` 负责生产短期判断结果与过程约束。
- `Validation layer` 负责围绕结果进行资金验证、结算与退款。
- `Reputation` 相关 domain / runtime 承接长期领域信誉的沉淀与后续加权能力。

## 🚀 TL;DR

- 这是什么
  - 一个面向 DAO 与链上社区的 Web3 / AI 双层系统: 短期输出人群判断预言机信号，长期沉淀领域信誉，并通过 validation market 承接结果验证与结算。
- 现在能跑什么
  - 前端产品壳、API / shared domain 基线、validation-chain 合约与最小接链 runtime。
- 最快怎么体验
  - `pnpm install`
  - `pnpm web:dev`
  - 打开 `http://localhost:5173`
  - 登录框输入 `demo`
- 完整联调先看哪里
  - 先看下面的“快速开始”，再按“详细启动”跑 API 和 validation-chain。

## ⚡ 快速开始

### 30 秒体验产品壳

如果你只是想先看 Arena 当前的产品形状，不需要先准备数据库、Redis 或链上 runtime:

```powershell
pnpm install
pnpm web:dev
```

然后打开:

- `http://localhost:5173`

建议第一轮直接输入 `demo` 登录，先把首页、market detail、drafts、challenge submission、adjudication、results、watchlist 这一整条产品壳走一遍。

### 最小本地联调

如果你要让前端接上本地 API，最短路径是:

```powershell
pnpm install
pnpm run validation:bootstrap:local
pnpm deps:up
pnpm exec hardhat compile
pnpm exec hardhat node
pnpm api:prisma:migrate
pnpm api:dev
```

再开一个终端启动前端:

```powershell
$env:VITE_API_BASE_URL="http://localhost:4000"
$env:VITE_CHAIN_ID="1337"
pnpm web:dev
```

validation-chain 的完整部署、角色授权和 preflight 检查放在后面的“详细启动”里。
这个本地 bootstrap 脚本会直接生成一份面向 Hardhat 本地链的开发 `.env`，包含
Postgres / Redis / RPC 默认连接和本地 validation signer 配置，避免第一次联调还要手填初始环境。

## 🌱 项目出发点

Arena 想解决的不是“如何做一个更花哨的竞猜页”，而是下面这组更难的系统问题:

- 如果结果来自真实 respondent 回答，如何在开奖前避免方向泄露。
- 如果用户既是回答者，也是围绕结果下注的验证者，如何保持信息边界。
- 如果产品先要被看见、被测试，如何允许前端先用 mock 把产品形状做出来，再逐步替换成真实后端与链上能力。
- 如果链上只适合承接资金托管和结算，如何不把整个裁决生产过程错误地“强上链”。

因此 Arena 采用的是一个双层模型:

- `Adjudication layer`
  - 负责 proposition、派单、回答、review、effective sample、freeze / reveal、official result。
- `Validation layer`
  - 负责 market、position、native-asset stake、official-result-driven settlement、claim / refund。

这两个层不是彼此独立的两个产品，而是同一条用户叙事上的不同职责面。

## 🔄 平台最小闭环

当前仓库的 MVP 主链路可以概括为:

`候选命题 -> proposition 发布 -> validation market create/open -> respondent 裁决 -> public progress 公开 -> freeze / reveal -> official result 生成 -> chain settlement -> user claim / refund`

系统边界是刻意分开的:

- 裁决层不向验证层公开方向性中间态。
- 验证层不向裁决层回灌盘口方向、赔率倾向或下注分布。
- 开奖前只公开时间进度、有效样本进度和公共状态。
- 链上不重算谁赢，而是消费链下 official result 并执行固定结算规则。

当前代码里的 lifecycle 还要补一句说明:

- proposition 进入 publish / live 路径后，runtime 会先排入 validation `create_market` 与 `open_market`。
- 等 respondent 样本和 freeze / reveal 条件满足后，runtime 才继续排入 `freeze_market` 与 `resolve_market`。

## ✨ 核心设计

### 1. 双层产品结构

Arena 不是单层 prediction market。它把“人群共识生产”和“围绕结果的验证资金层”拆开处理:

- `Proposition`
  - 被创建、排期、发布、冻结、揭示、结算。
- `Market`
  - 与 proposition 一对一绑定，在满足条件时进入 live / frozen / settled / cancelled。
- `Bet / Position`
  - 一用户一市场一仓位，围绕单题 binary 结果记录 stake 与最终 outcome。

### 2. 公共进度与方向隔离

仓库里已经有明确的 public progress / validation surface / adjudication surface 分层。

这意味着:

- 前台可以展示“还差多少有效样本”“离 reveal 还有多久”。
- 前台不能在 reveal 前展示“当前哪一边领先”。
- 后端和 shared domain 里的状态机、view model、surface mapper 都围绕这条边界设计。

### 3. Mock-first 到 real capability 的可替换接缝

Arena 默认允许前端先把产品形状做出来，再用适配层替换成真实能力。

当前前端已经有:

- public/discovery 的 seeded demo read model
- validation market 的 public mock adapter
- authenticated demo session
- 真 API 请求失败时的 demo fallback

这不是“假数据堆页面”，而是一个刻意保留的产品契约层，方便 B-track 先稳定交互，再由 A-track 逐步替换为真实链路。

### 4. Validation-chain 只承接最小可信结算

当前 validation-chain 范围是刻意收缩的:

- `consensus`
- `binary`
- `non_rolling`
- `final`

也就是:

- 单题
- 二选一
- 非滚动
- 一次性最终结算

当前明确不把 survey、hybrid、rolling、AMM、订单簿、多资产下注写成“已实现能力”。

## ✨ 当前已落地能力

下面这些是仓库当前已经有代码、测试或运行边界支撑的能力，不是纯 roadmap。

### 前端产品壳

- `/zh` 首页已经接上 discovery + validation market feed。
- `/zh/markets`、`/zh/event/:marketId` 已有 market ranking 与 detail 体验。
- `/zh/challenges`、`/zh/drafts` 已有真实后端 draft / submit 接口接入。
- `/zh/adjudication` 已有 respondent task 读取与提交路径。
- `/zh/results`、`/zh/watchlist`、`/zh/activity` 已有账户壳层与真实/演示数据切换逻辑。
- demo 会话支持直接输入 `demo` 进入完整 seeded session。

### Shared domain 与应用层

- `packages/shared` 已定义 arena enums、DTO、surface contracts、policy、reward、reputation、tags、adjudication、validation settlement 相关语义。
- `apps/api` 已有 proposition、market、bet、reward ledger、response review、watchlist、account export、reputation、tags 等服务层。
- Prisma migration 已覆盖 arena core schema、state-machine refinement、reward ledger、quality / reputation、internal ops、validation-chain foundation。
- API 已有 swagger 文档、request tracing、RBAC、health endpoints、Redis queue 与 internal monitoring 入口。

### Validation-chain

- `contracts/validation/ArenaValidationMarket.sol` 已承载 validation market 协议。
- `scripts/deploy-validation-market.cjs` 已支持部署并授予 admin / operator / oracle / pauser 角色。
- API runtime 已接入 `create_market`、`open_market`、`freeze_market`、`resolve_market` command queue。
- sync / projector / monitoring / cursor / event ledger 已有实现与测试。
- cancel / refund / pauser 最小路径已有 runbook 和测试覆盖。

## 🏗️ 技术架构

```text
apps/web
  -> discovery / public progress / validation detail / challenge submission / respondent shell
  -> @arena/shared

apps/api
  -> proposition runtime
  -> adjudication services
  -> validation services
  -> Prisma / Redis / JWT / internal ops
  -> @arena/shared

contracts/validation
  -> ArenaValidationMarket

runtime flow
  -> proposition publish
  -> validation command queue
  -> chain events
  -> sync worker
  -> DB projection
  -> frontend surfaces
```

- Frontend: `React 18`, `Vite 6`, `TypeScript`, `React Router 7`, `Tailwind CSS`
- Backend: `NestJS 11`, `Prisma`, `BullMQ`, `Redis`, `ethers`
- Contracts: `Solidity 0.8.20`, `Hardhat`, `OpenZeppelin`
- Shared domain: `@arena/shared`
- Database: `PostgreSQL`

## 🔀 运行模式

Arena 当前更准确的描述不是“单一 mock 模式”或“单一 live 模式”，而是分层运行:

- `anonymous browse`
  - 前端优先请求 public API；失败时回退 seeded demo feed。
- `demo session`
  - 输入 `demo` 可进入完整演示会话，绕过真实钱包签名，保留完整产品壳体验。
- `wallet-authenticated session`
  - 真实钱包登录后，前端访问真实 account / draft / adjudication / validation write API。
- `validation-chain runtime`
  - proposition runtime 通过 queue 驱动链上 create / open / freeze / resolve，再由 sync worker 回写投影。

这意味着 Arena 同时服务两类开发目标:

- 最快看到产品形状
- 完整联调 proposition -> backend -> chain -> projection

## ⚙️ 环境要求

- `Node.js 18+`
- `pnpm`
- `Docker Desktop` 与 `docker compose`
- 本地 `Hardhat` RPC

完整联调还需要:

- `PostgreSQL`
- `Redis`
- 已配置 `.env`
- 已部署 validation contract

## 🔐 环境配置

1. 复制环境变量模板:

   ```powershell
   Copy-Item .env.example .env
   ```

2. 按需调整本地配置。

### 根 `.env.example` 里的关键变量

| 变量 | 说明 | 默认值 / 备注 |
| --- | --- | --- |
| `PORT` | API 端口 | `4000` |
| `DATABASE_URL` | Prisma / Postgres 连接串 | 本地 docker compose 默认值 |
| `REDIS_URL` | Redis 连接串 | `redis://127.0.0.1:6379/0` |
| `JWT_SECRET` | JWT 密钥 | 必须替换成真实随机值 |
| `RPC_URL` | Hardhat / EVM RPC | `http://127.0.0.1:8545` |
| `CHAIN_ID` | 运行链 ID | `1337` |
| `ARENA_CONTRACT_ADDRESS` | legacy Arena 合约地址 | 不应复用为 validation 地址 |
| `ARENA_VALIDATION_CONTRACT_ADDRESS` | validation market 合约地址 | 完整联调必填 |
| `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY` | operator signer 私钥 | validation runtime 使用 |
| `ARENA_VALIDATION_ORACLE_PRIVATE_KEY` | oracle signer 私钥 | validation runtime 使用 |
| `ARENA_VALIDATION_PAUSER_PRIVATE_KEY` | pauser signer 私钥 | validation runtime 使用 |
| `OPERATOR_WALLET_ADDRESSES` | operator 钱包列表 | RBAC 用，逗号分隔 |
| `ADMIN_WALLET_ADDRESSES` | admin 钱包列表 | RBAC 用，逗号分隔 |
| `SYSTEM_WALLET_ADDRESSES` | system 钱包列表 | RBAC 用，逗号分隔 |

### 前端联调额外建议

前端默认 API 地址写在 [`apps/web/src/features/api/arena-api.ts`](./apps/web/src/features/api/arena-api.ts) 里，默认值是 `http://localhost:3000`。如果你本地 API 跑在默认的 `4000` 端口，建议在启动前端时显式设置:

```powershell
$env:VITE_API_BASE_URL="http://localhost:4000"
$env:VITE_CHAIN_ID="1337"
pnpm web:dev
```

否则前端会把 API 请求打到 `3000`，再因为失败回退到 demo feed。

## 🛠️ 详细启动

### 路径 A: 最快看前端产品形状

如果你只想最快把 Arena 前台跑起来，先看产品壳，不需要先准备数据库和链上 runtime:

```powershell
pnpm install
pnpm web:dev
```

然后打开:

- `http://localhost:5173`

你可以:

- 浏览首页、排行榜、详情页、分类页
- 在登录框输入 `demo` 进入完整 seeded demo session
- 体验 drafts、challenge submission、adjudication、results、watchlist 的产品壳

这条路径适合 B-track / 体验评审 / 页面联调。

### 路径 B: API + 前端联调

如果你要跑真实 API，再让前端接到本地后端:

1. 安装依赖

   ```powershell
   pnpm install
   Copy-Item .env.example .env
   ```

2. 启动 Postgres 与 Redis

   ```powershell
   pnpm deps:up
   ```

3. 先编译 root Hardhat artifacts

   ```powershell
   pnpm exec hardhat compile
   ```

   这一步不要省略。API readiness 依赖 root Hardhat artifact；仓库里的 `artifacts/` 也没有纳入版本控制。

4. 启动本地 Hardhat RPC

   ```powershell
   pnpm exec hardhat node
   ```

5. 执行 Prisma migration

   ```powershell
   pnpm api:prisma:migrate
   ```

6. 启动 API

   ```powershell
   pnpm api:dev
   ```

7. 新开一个终端启动前端，并指向 API `4000`

   ```powershell
   $env:VITE_API_BASE_URL="http://localhost:4000"
   $env:VITE_CHAIN_ID="1337"
   pnpm web:dev
   ```

8. 检查健康状态

   - `GET http://localhost:4000/health/live`
   - `GET http://localhost:4000/health/ready`
   - `GET http://localhost:4000/docs`

### 路径 C: Validation-chain 完整本地联调

如果你的目标是 proposition / queue / chain / sync / projection 这一整条 A-track runtime:

1. 先完成路径 B。
2. 配好 validation signer 与 admin 策略

   本地最省事的方式有两种:

   - 方式 A
     - 复用同一个有 gas 的 Hardhat 账户作为 `admin + operator + oracle + pauser`。
     - 把同一个私钥同时填到:
       - `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY`
       - `ARENA_VALIDATION_ORACLE_PRIVATE_KEY`
       - `ARENA_VALIDATION_PAUSER_PRIVATE_KEY`
     - 把 `ARENA_VALIDATION_ADMIN_ADDRESS` 设成这个私钥对应地址。
     - 这样部署时构造函数会直接把三个 role 授给 admin，不需要额外 grant。
   - 方式 B
     - 使用三个不同 signer。
     - 除了私钥，还要在部署前设置:
       - `ARENA_VALIDATION_OPERATOR_ADDRESS`
       - `ARENA_VALIDATION_ORACLE_ADDRESS`
       - `ARENA_VALIDATION_PAUSER_ADDRESS`
     - 部署脚本会按这些地址额外授予角色。

   如果这一步没配好，后面的 `validation:chain:check` 会因为 signer 没有链上 role 或地址不匹配而失败。

3. 编译合约

   ```powershell
   pnpm exec hardhat compile
   ```

4. 部署 validation contract

   ```powershell
   pnpm run validation:deploy --network localhost
   ```

5. 把输出的 `ARENA_VALIDATION_CONTRACT_ADDRESS` 回填到 `.env`

   同时确认本地 `.env` 里保留了你刚才选定的 signer 配置:

   - `ARENA_VALIDATION_OPERATOR_PRIVATE_KEY`
   - `ARENA_VALIDATION_ORACLE_PRIVATE_KEY`
   - `ARENA_VALIDATION_PAUSER_PRIVATE_KEY`
   - `ARENA_VALIDATION_ADMIN_ADDRESS`

   如果你用的是三地址模式，也保留:

   - `ARENA_VALIDATION_OPERATOR_ADDRESS`
   - `ARENA_VALIDATION_ORACLE_ADDRESS`
   - `ARENA_VALIDATION_PAUSER_ADDRESS`

6. 执行 validation preflight

   ```powershell
   pnpm run validation:env:check
   pnpm run validation:deps:check
   pnpm run validation:chain:check
   pnpm run validation:db:deploy
   pnpm run validation:db:status
   ```

7. 启动 API，走 proposition -> create/open/freeze/resolve -> sync 的真实运行链路。

这条路径适合 A-track / validation-chain 接链 / runtime 验证。

## 🧪 常用命令

| 类别 | 命令 | 说明 |
| --- | --- | --- |
| 前端开发 | `pnpm web:dev` | 启动 Vite |
| 前端构建 | `pnpm web:build` | 构建 web |
| 前端检查 | `pnpm web:check` | TypeScript noEmit 检查 |
| 共享包测试 | `pnpm shared:test` | 运行 `@arena/shared` 测试 |
| API 开发 | `pnpm api:dev` | 启动 NestJS |
| API 构建 | `pnpm api:build` | 构建 API |
| API 类型检查 | `pnpm api:typecheck` | Prisma generate + tsc |
| 依赖启动 | `pnpm deps:up` | 启动 Postgres / Redis |
| 依赖关闭 | `pnpm deps:down` | 停止 Postgres / Redis |
| Prisma migrate | `pnpm api:prisma:migrate` | 本地迁移 |
| Validation preflight | `pnpm validation:preflight` | env / deps / chain 总检查 |
| Validation deploy | `pnpm validation:deploy --network localhost` | 部署 validation 合约 |
| Validation test | `pnpm validation:test` | validation-chain 测试 |
| CI 对齐检查 | `pnpm ci:check` | web + shared + api 基线检查 |

## ✅ 验证与回归

推荐的本地检查顺序如下。

### 前端 / workspace 基线

```powershell
pnpm run check
pnpm run shared:test
pnpm run api:typecheck
pnpm run api:build
```

### Validation-chain 基线

```powershell
pnpm run validation:env:check
pnpm run validation:deps:check
pnpm run validation:chain:check
pnpm run validation:test
```

### Health / docs

- `GET /health/live`
- `GET /health/ready`
- `GET /docs`

## 🗂️ 仓库结构

```text
Arena/
├─ apps/
│  ├─ web/                    # React + Vite 中文优先产品壳
│  └─ api/                    # NestJS API, Prisma, queues, validation runtime
├─ packages/
│  └─ shared/                 # Arena domain enums, DTO, surfaces, engines
├─ contracts/
│  ├─ validation/             # ArenaValidationMarket 合约
│  └─ Arena.sol               # legacy Arena / PK 合约路径
├─ docs/
│  ├─ PRODUCT_SCOPE.md
│  └─ contracts/              # phase spec, runbook, runtime integration docs
├─ scripts/                   # deploy / env check / validation helpers
├─ test/                      # root Hardhat / contract tests
├─ docker-compose.yml         # Postgres + Redis
└─ README.md
```

按职责可以这样理解:

- `apps/web`
  - 产品表现层、mock/real adapter、demo session、wallet UX。
- `apps/api`
  - proposition runtime、respondent / validation services、RBAC、monitoring、queue、sync。
- `packages/shared`
  - 前后端共享语义，是当前 Arena 产品契约最稳定的落点。
- `contracts/validation`
  - 当前 validation-chain 协议主线。
- `docs/contracts`
  - 当前 validation-chain 阶段文档、runbook 和 runtime 集成说明。

## 📌 当前状态

Arena 当前已经过了“只有想法或页面草图”的阶段，但还没有假装自己已经是完整生产系统。

现在可以明确说已经具备:

- 可浏览、可演示、可替换 mock/real 接缝的产品壳
- 可运行的 NestJS + Prisma + Redis + shared domain 基线
- proposition / adjudication / validation 的应用层 runtime
- validation market 合约、部署脚本、sync、projection、monitoring、runbook

同样也要明确它没有声称:

- survey / hybrid / rolling 已完成
- 前端已经为所有未来交易模型准备好 UI
- 旧 legacy Arena 合约仍是当前产品协议核心
- production-grade rollback / observability / operator platform 已齐全

## 📚 延伸阅读

如果你想继续深入，建议按这个顺序读。

### 项目理解

- [docs/PRODUCT_SCOPE.md](./docs/PRODUCT_SCOPE.md)
- [AGENTS.md](./AGENTS.md)

### Validation-chain 规格与集成

- [docs/contracts/arena-phase1-spec.md](./docs/contracts/arena-phase1-spec.md)
- [docs/contracts/arena-phase3-backend-integration.md](./docs/contracts/arena-phase3-backend-integration.md)
- [docs/contracts/arena-phase4-foundation.md](./docs/contracts/arena-phase4-foundation.md)
- [docs/contracts/arena-phase5-runtime-closure.md](./docs/contracts/arena-phase5-runtime-closure.md)
- [docs/contracts/arena-phase6-runtime-integration.md](./docs/contracts/arena-phase6-runtime-integration.md)

### Runbook / 排障

- [docs/contracts/arena-validation-chain-runbook.md](./docs/contracts/arena-validation-chain-runbook.md)
- [docs/contracts/arena-validation-blocker-clearance.md](./docs/contracts/arena-validation-blocker-clearance.md)

## 📄 License

当前仓库暂未声明顶层开源许可证。若准备公开发布，建议先补齐 `LICENSE` 文件，再把许可证信息固定到 README 与 badge。
