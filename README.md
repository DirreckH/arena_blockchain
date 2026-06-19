# Arena

[English](./README_EN.md) | 简体中文

[![Status](https://img.shields.io/badge/status-consensus_prediction_market_mvp-0A66C2?style=flat-square)](./README.md)

Arena 是一个人群共识预测市场：把“某个真实群体最终会如何判断”变成可交易、可验证、可结算的市场。

传统预测市场擅长交易外部事件，比如价格、比赛、选举和新闻结果。Arena 关注另一类更高频、更贴近商业和社区决策的问题：目标人群会支持哪个选项，真实用户会选择哪个方向，一个提案、内容、产品或贡献最终能否通过群体验证。

这类结果过去通常停留在问卷、投票、调研报告或内部评审里。它们有信号价值，却缺少市场激励、公开进度、结算记录和可组合的金融表达。Arena 的核心想法是：当人群共识本身可以被定义、采样、隐藏、揭示和结算，它就可以成为一种新的预测市场标的。

当前最小闭环是：

`创建问题市场 -> 参与者下注/验证 -> 目标人群回答 -> 形成有效样本 -> 揭示共识结果 -> 完成结算`

开奖前，市场只公开进度，不公开方向。用户可以在不知道实时回答倾向的情况下建立仓位；系统在达到样本和时间条件后生成官方结果，并围绕结果完成结算、收益领取或退款。

## TL;DR

- `一句话`: Arena 是交易人群共识结果的 Web3 预测市场。
- `核心标的`: 不是单纯押新闻事件，而是押“某个被定义的人群最终会如何选择或判断”。
- `核心体验`: 创建市场、隐藏采样、进度公开、结果揭示、资金结算。
- `当前 MVP`: 非滚动、单题、二选一的人群共识市场。
- `现场演示`: `pnpm install` -> `pnpm web:dev` -> 打开 `http://localhost:5173` -> 输入 `demo`。
- `当前状态`: 已经有可浏览产品壳、真实后端路径、demo fallback 和最小链上结算能力。

## 为什么这个市场值得做

世界上很多重要决策并没有天然的价格源，却有明确的人群结果。

品牌想知道一组目标用户会不会接受新概念；AI 团队想知道真实评审者更信任哪个模型输出；DAO 想知道提案、Grant 或贡献是否能通过社区验证；内容平台想知道某个创作者、策展结果或治理动作是否会被目标群体认可。

这些问题现在通常有三种不完美解法：

- `问卷`: 能收集回答，但参与者没有市场风险，结果也难以被外部结算。
- `投票`: 能表达偏好，但容易变成身份或动员竞赛，缺少隐藏采样和结果市场。
- `传统预测市场`: 能交易事件，但对“主观人群结果”缺少稳定的开奖来源。

Arena 把这三件事合到一条产品链路里：先定义一个可开奖的人群问题，再围绕结果开放市场，最后用有效样本形成官方结果并完成结算。

这不是把问卷页面加上钱包登录，而是把“人群共识”变成一种可以被交易和验证的资产。

## 为什么现在

三个变化让人群共识市场变得更有机会：

- `AI 让主观评测变多`: 模型输出、内容质量、偏好判断和安全边界越来越依赖人类反馈，但这些反馈通常还停留在封闭标注和内部打分里。
- `链上结算降低信任成本`: 资金托管、结果结算和领取记录适合被放到透明的结算层，而不需要把整个采样过程强行上链。
- `社区和品牌需要更快的决策市场`: DAO、创作者社区、消费品牌和内容平台都需要比传统调研更快、比普通投票更有激励的判断机制。

Arena 的切入点是一个窄而清晰的市场类型：二选一、非滚动、一次性开奖的人群共识问题。它足够小，可以在黑客松和 MVP 阶段被完整演示；也足够大，可以扩展到 AI 评测、消费调研、DAO 治理、内容验证和开放式任务市场。

## 产品如何工作

Arena 的用户故事很直接。

1. 市场发起方提出一个可开奖问题。
2. 系统定义目标人群、样本要求、时间窗口和二选一结果。
3. 市场参与者在开奖前下注或验证。
4. 目标人群提交回答，平台做基础质检并累计有效样本。
5. 前台持续展示进度，但不展示哪一边领先。
6. 满足开奖条件后，系统揭示官方结果。
7. 市场按结果结算，用户领取收益或退款。

这条链路让两个角色同时成立：

- `市场参与者`: 在结果揭示前表达判断，承担风险，并在结算后获得收益或退款。
- `市场发起方`: 获得一个带进度、激励和结算记录的结果市场，而不只是一次静态投票或问卷。

## 场景示例

Arena 可以把很多“原本不能很好交易”的问题变成预测市场。

| 场景 | 可以形成的市场 |
| --- | --- |
| AI 模型评测 | 目标评审者最终会选择 A 模型还是 B 模型？ |
| 消费品牌测试 | 核心用户更愿意购买方案 A 还是方案 B？ |
| DAO Grant | 有效样本是否会支持这个项目进入下一轮？ |
| 内容平台治理 | 目标社区是否认为该内容应被推荐或下架？ |
| 产品路线选择 | Beta 用户会不会认可某个新功能方向？ |
| 贡献验证 | 某个开源贡献是否会通过目标维护者群体认可？ |

这些问题的共同点是：结果不是外部价格源，而是一个被明确定义的人群共识。Arena 的目标就是让这类结果有市场、有进度、有结算。

## 为什么对评委和投资人有意思

Arena 的黑客松价值不是“又做了一个预测市场 UI”，而是提出了一个新的市场供给来源：人群共识结果。

- `新标的`: 把调研、评审、偏好测试、社区验证变成可交易结果。
- `新供给`: 市场不必等待外部新闻，可以由品牌、DAO、AI 团队和平台主动创建。
- `新信任模型`: 开奖前隔离方向信息，开奖后围绕官方结果结算。
- `新扩展路径`: 从二选一 MVP 逐步扩展到滚动问题、多题调研、AI 评测市场和需求方后台。
- `可演示`: 当前仓库已经不是白皮书，能跑出产品壳、demo session、市场详情、结果页、账户状态和本地结算链路。

这让 Arena 更像一个可以持续产生新市场的基础产品，而不是单次竞猜页面。

## 当前 MVP

当前版本刻意收窄，目标是把一条人群共识预测市场跑通，而不是一次性做完整交易所。

已纳入当前 MVP：

- 非滚动型命题。
- 单题短问卷 / 单题结果市场。
- 二选一 outcome。
- 简单下注和一次性结算。
- 平台派单、回答提交、基础质检、有效样本计数和统一开奖。
- 开奖前只展示进度，不展示方向。
- demo 会话和真实接口之间保留可替换接缝。

当前明确不做：

- 复杂长问卷。
- 开放题深度分析。
- 滚动型命题与周期结算。
- 复杂 AMM。
- 复杂订单簿。
- 多资产下注。
- 开奖前暴露任何方向性中间态。

## 已经可以看到什么

当前仓库已经具备可以向评委演示的产品形状：

- 首页和市场 feed。
- 市场排行榜与详情页。
- challenge / draft 创建路径。
- 回答任务读取与提交路径。
- 结果页、watchlist、activity、账户壳层。
- 输入 `demo` 即可进入完整 seeded session。
- API 请求失败时可以回退到演示数据，保证产品体验可见。
- 本地后端和 validation-chain 可以跑通最小结算路径。

## 快速体验

只看产品壳，不需要先准备数据库、Redis 或本地链：

```powershell
pnpm install
pnpm web:dev
```

打开：

- `http://localhost:5173`

建议第一轮直接输入 `demo` 登录，走一遍首页、market detail、drafts、challenge submission、adjudication、results、watchlist。

## 开发者附录

下面是为了复现和继续开发保留的技术信息。对于黑客松展示，通常先跑“快速体验”即可。

### 本地联调

如果你要让本地后端、validation runtime 和前端一起工作，优先使用仓库脚本：

```powershell
pnpm install
pnpm run backend:prepare:local
```

再开一个终端启动前端：

```powershell
$env:VITE_API_BASE_URL="http://localhost:4000"
$env:VITE_CHAIN_ID="1337"
pnpm web:dev
```

`backend:prepare:local` 会复用 `validation:prepare:local`，准备本地 validation runtime，在需要时启动后端，等待 `/health/live` 与 `/health/ready`，并运行后端 release check。

### 技术结构

```text
apps/web      -> 市场展示、demo session、wallet UX
apps/api      -> proposition、回答、结果、validation services
packages      -> 前后端共享 domain 和 DTO
contracts     -> validation market 合约
scripts       -> 本地启动、部署、检查脚本
```

主要技术栈：

- Frontend: `React 18`, `Vite 6`, `TypeScript`, `React Router 7`, `Tailwind CSS`
- Backend: `NestJS 11`, `Prisma`, `BullMQ`, `Redis`, `ethers`
- Contracts: `Solidity 0.8.20`, `Hardhat`, `OpenZeppelin`
- Database: `PostgreSQL`

### 常用命令

| 类别 | 命令 |
| --- | --- |
| 前端开发 | `pnpm web:dev` |
| 前端构建 | `pnpm web:build` |
| 前端检查 | `pnpm web:check` |
| API 开发 | `pnpm api:dev` |
| API 构建 | `pnpm api:build` |
| API 类型检查 | `pnpm api:typecheck` |
| 依赖启动 | `pnpm deps:up` |
| 本地后端准备 | `pnpm backend:prepare:local` |
| 本地 validation 准备 | `pnpm validation:prepare:local` |
| Validation 测试 | `pnpm validation:test` |
| CI 对齐检查 | `pnpm ci:check` |

### 验证基线

这是 README 叙事调整，不需要运行代码测试。需要代码基线时，推荐顺序如下：

```powershell
pnpm run check
pnpm run shared:test
pnpm run api:typecheck
pnpm run api:build
```

Validation-chain 基线：

```powershell
pnpm run validation:env:check
pnpm run validation:deps:check
pnpm run validation:chain:check
pnpm run validation:test
```

### 仓库结构

```text
Arena/
├─ apps/
│  ├─ web/
│  └─ api/
├─ packages/
│  └─ shared/
├─ contracts/
│  ├─ validation/
│  └─ Arena.sol
├─ docs/
│  ├─ PRODUCT_SCOPE.md
│  └─ contracts/
├─ scripts/
├─ test/
├─ docker-compose.yml
└─ README.md
```

## 当前状态

Arena 当前已经过了“只有想法或页面草图”的阶段，但还没有声称自己已经是完整生产系统。

现在可以明确说已经具备：

- 可浏览、可演示、可替换 mock / real 接缝的人群共识预测市场产品壳。
- 可运行的应用服务和本地数据依赖。
- proposition / result production / validation 的应用层路径。
- validation market 合约、部署脚本、同步、投影、监控和 runbook。

同样也要明确它没有声称：

- survey / hybrid / rolling 已完成。
- 复杂 AMM、订单簿、多资产市场已完成。
- 前端已经为所有未来交易模型准备好 UI。
- 旧 legacy Arena 合约仍是当前产品协议核心。
- production-grade rollback / observability / operator platform 已齐全。

## 延伸阅读

- [docs/PRODUCT_SCOPE.md](./docs/PRODUCT_SCOPE.md)
- [AGENTS.md](./AGENTS.md)
- [docs/contracts/arena-phase1-spec.md](./docs/contracts/arena-phase1-spec.md)
- [docs/contracts/arena-phase3-backend-integration.md](./docs/contracts/arena-phase3-backend-integration.md)
- [docs/contracts/arena-validation-chain-runbook.md](./docs/contracts/arena-validation-chain-runbook.md)

## License

当前仓库暂未声明顶层开源许可证。若准备公开发布，建议先补齐 `LICENSE` 文件，再把许可证信息固定到 README 与 badge。
