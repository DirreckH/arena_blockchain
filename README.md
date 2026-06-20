# Arena

[English](./README_EN.md) | 简体中文

[![Status](https://img.shields.io/badge/status-crowd_consensus_prediction_market_mvp-0A66C2?style=flat-square)](./README.md)

Arena 是一个人群共识预测市场。

它交易的不是单纯的外部事实，而是一个被明确定义的人群最终会如何判断、选择或认可某个命题。换句话说，Arena 把“人群共识”变成可创建、可参与、可验证、可结算的市场标的。

传统预测市场擅长回答“某个外部事件会不会发生”，例如价格、比赛、选举、新闻结果。Arena 关注的是另一类更高频、更贴近日常注意力和商业决策的问题：目标人群会站在哪边，真实用户会选哪个方向，社区会不会认可某个提案，观众会不会形成某种集体判断。

这类市场很重要，因为很多高参与度、高传播性的判断本来就发生在人群里。

“梅西 vs C 罗谁是 GOAT？”、“演唱会抢票难度是不是比舞台本身更有话题？”、“AI 搜索会不会改变重度网民的信息习惯？”这些命题不是边缘娱乐内容。它们代表一种真实、巨大的参与需求：人们喜欢表达立场、比较判断、参与争论，也愿意围绕群体最终会怎么想下注、验证和围观。

Arena 的机会在于：把这些原本散落在评论区、投票、问卷、社群争论和品牌调研里的共识结果，变成一个有市场激励、有公开进度、有验证流程、有结算记录的产品。

## TL;DR

- `一句话`: Arena 是交易人群共识结果的 Web3 预测市场。
- `核心差异`: Polymarket 一类市场主要预测外部事实，Arena 预测“目标人群最终会如何判断”。
- `重要市场`: 体育、文化、加密、科技、DAO、公共政策、金融等领域都有大量强话题、强娱乐、强参与的共识命题。
- `用户为什么参与`: 人们天然愿意对立场、偏好、身份认同和群体判断下注、评论、验证和分享。
- `当前 MVP`: 非滚动、单题、二选一的人群共识市场。
- `现场演示`: `pnpm install` -> `pnpm web:dev` -> 打开 `http://localhost:5173` -> 输入 `demo`。

## 为什么这是一个市场

很多有价值的问题没有天然价格源，却有明确的人群结果。

品牌想知道核心用户是否接受新概念，AI 团队想知道真实评审更信任哪个模型输出，DAO 想知道提案或 Grant 是否能通过社区验证，内容平台想知道某个创作者、榜单或治理动作是否会被目标群体认可。

更进一步，大量“娱乐性强”的话题同样有市场价值。

强话题命题有几个特点：

- `低理解成本`: 用户一眼知道自己为什么想参与，例如“梅西 vs C 罗 GOAT”。
- `高表达欲`: 参与者不只是猜结果，也在表达身份、偏好和判断。
- `强传播性`: 话题天然适合被讨论、转发、评论和二次创作。
- `高频供给`: 体育、流行文化、加密叙事、科技产品、DAO 治理每天都在产生新争议。
- `可扩展到商业需求`: 同一套机制可以服务品牌测试、社区治理、AI 评测、内容验证和产品调研。

这意味着 Arena 不只是在做一个“预测新闻结果”的市场，而是在打开一类更宽的市场供给：人群共识结果。

## 产品机制

Arena 的最小闭环是：

`创建命题市场 -> 参与者下注或验证 -> 目标人群回答 -> 形成有效样本 -> 揭示共识结果 -> 完成结算`

开开奖前，市场只公开进度，不公开方向。

用户可以在不知道实时回答倾向的情况下建立仓位。系统在达到样本和时间条件后生成官方结果，并围绕该结果完成结算、收益领取或退款。

这让两个角色同时成立：

- `市场参与者`: 对未来人群共识做判断，承担风险，并在结果揭示后获得收益或退款。
- `命题发起方`: 获得一个带激励、带进度、带验证和带结算记录的结果市场，而不是一次静态问卷或普通投票。

## 为什么现在

Arena 抓住的是三个变化的交汇点。

- `注意力市场正在话题化`: 用户越来越习惯围绕体育、文化、科技、加密和公共事件表达立场，强话题命题天然具备参与入口。
- `AI 和社区决策需要更多人类反馈`: 模型输出、内容质量、品牌偏好和治理判断越来越依赖目标人群反馈，但现有反馈常停留在封闭标注、问卷或投票里。
- `链上结算降低信任成本`: 资金托管、结果结算和领取记录适合放到透明结算层，而不需要把完整采样过程强行上链。

Arena 先从二选一、非滚动、一次性开奖的人群共识命题切入。这个形态足够小，可以在黑客松和 MVP 阶段完整演示；也足够大，可以扩展到 AI 评测、消费调研、DAO 治理、内容验证和开放式任务市场。

## 适合 Arena 的命题

Arena 特别适合那些“结果来自人群判断，而不是外部价格源”的问题。

| 场景 | 可以形成的市场 |
| --- | --- |
| 体育话题 | 球迷是否会普遍认为，梅西比 C 罗更配得上现代足球 GOAT 的标签？ |
| 流行文化 | 观众是否会普遍认为，演唱会抢票难度比舞台本身更能制造社交话题？ |
| 加密叙事 | 加密用户是否会普遍认为，Meme 币叙事比 AI 币叙事更能拉动新一轮散户情绪？ |
| 科技产品 | 重度网民是否会普遍认为，AI 搜索比传统搜索更适合“先问后查”的信息习惯？ |
| DAO 治理 | 有效样本是否会支持某个 DAO Grant 项目进入下一轮？ |
| 品牌测试 | 核心用户是否更愿意购买方案 A 而不是方案 B？ |
| AI 模型评测 | 目标评审者最终会选择 A 模型输出还是 B 模型输出？ |
| 内容治理 | 目标社区是否认为某内容应该被推荐、降权或下架？ |

这张表里的前几类尤其适合 demo 和早期增长：它们有强话题性、娱乐性和参与感，能证明 Arena 的市场不是冷冰冰的问卷包装，而是一个用户愿意主动进入、表达和互动的预测市场。

## 为什么对投资人与评委重要

Arena 的核心判断不是“再做一个预测市场 UI”，而是提出一种新的市场供给来源：人群共识。

- `新的标的`: 把调研、评审、偏好测试、社区验证和娱乐话题变成可交易结果。
- `更大的内容供给`: 市场不必等待外部新闻，可以由品牌、DAO、AI 团队、平台和社区主动创建。
- `更低的参与门槛`: 强话题命题让普通用户愿意参与，不需要先理解复杂金融事件。
- `更清晰的信任模型`: 开奖前隔离方向信息，开奖后围绕有效样本结果结算。
- `更强的扩展路径`: 从娱乐话题和共识命题切入，逐步扩展到需求方后台、调研网络、AI 评测和 DAO 治理。

对黑客松评委来说，Arena 已经不是纯概念。当前仓库可以演示首页 feed、话题市场、下注体验、demo 会话、命题创建、回答任务、结果页、watchlist、账户状态和最小结算链路。

对投资人来说，Arena 的关键不是单个话题能否爆，而是这套机制能否持续生成新市场。强话题命题是进入市场的前门，品牌调研、AI 评测和社区治理是后续商业化方向。

## 当前 MVP

当前版本刻意收窄，目标是把一条人群共识预测市场跑通，而不是一次性做完整交易所。

已纳入当前 MVP：

- 非滚动型命题。
- 单题短问卷 / 单题结果市场。
- 二选一 outcome。
- 简单下注和一次性结算。
- 平台派单、回答提交、基础质检、有效样本计数和统一开奖。
- 开奖前只展示进度，不展示方向。
- demo 会话和真实接口之间保留可替换的数据路径。

当前明确不做：

- 复杂长问卷。
- 开放题深度分析。
- 滚动型命题与周期结算。
- 复杂 AMM。
- 复杂订单簿。
- 多资产下注。
- 开奖前暴露任何方向性中间态。

## 已经可以演示什么

当前仓库已经具备面向评委和投资人的产品形态：

- 首页和市场 feed。
- 热门、突发、最新和分类目录。
- 更强话题性、娱乐性的 demo 命题。
- 市场详情页和二选一参与体验。
- 首页大卡的用户评论弹幕演示。
- challenge / draft 创建路径。
- 回答任务读取与提交路径。
- 结果页、watchlist、activity 和账户壳层。
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

```text
http://localhost:5173
```

建议第一轮直接输入 `demo` 登录，走一遍首页、market detail、drafts、challenge submission、adjudication、results 和 watchlist。

## 开发者附录

下面是为了复现和继续开发保留的技术信息。对于黑客松展示，通常先跑“快速体验”即可。

### 本地联调

如果要让本地后端、validation runtime 和前端一起工作，优先使用仓库脚本：

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
│  └─ validation/
│     └─ Arena.sol
├─ docs/
│  └─ PRODUCT_SCOPE.md
├─ scripts/
├─ test/
├─ docker-compose.yml
└─ README.md
```

## 当前状态

Arena 当前已经过了“只有想法或页面草图”的阶段，但还没有声称自己已经是完整生产系统。

现在可以明确说已经具备：

- 可浏览、可演示、可替换 mock / real 数据路径的人群共识预测市场产品壳。
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

当前仓库暂未声明顶层开源许可证。若准备公开发布，建议先补齐 `LICENSE` 文件，再把许可证信息固定到 README 和 badge。
