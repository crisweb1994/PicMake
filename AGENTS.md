# AGENTS.md

本仓库（PicMake）对 AI agent 的协作约定。改代码前先读完本文；与本文冲突的行为以本文为准。

## 0. 权威源（动工前必读）

| 文档 | 作用 |
|---|---|
| [docs/prd.md](./docs/prd.md) | **需求唯一基准**（FR-1~10、状态机、验收标准、视觉规范） |
| [docs/demos/prototype.html](./docs/demos/prototype.html) | **交互对照唯一基准**（V2 结果舞台版，含打开状态机与全场景） |
| [docs/gpt-image-2.5-api.md](./docs/gpt-image-2.5-api.md) | API 参考（参数枚举、流式事件、定价、降级策略） |
| [docs/tech-stack.md](./docs/tech-stack.md) | 技术栈定稿 + 实测坑记录 |

## 1. 常用命令

```bash
pnpm dev            # 开发服务器（5173）
pnpm build          # tsc -b && vite build
pnpm lint           # oxlint（本项目不用 ESLint）
pnpm test           # vitest run（只测 src/**/*.test.ts 纯函数）
npx prettier --write .
```

## 2. 技术栈事实（不要凭记忆假设）

- **纯前端 SPA**：Vite 8 + React 19 + TypeScript 6。无后端、无路由（MVP 单页 + 弹层）、无 i18n
- **TS 开启 `erasableSyntaxOnly`**：禁止构造器参数属性、禁止 enum 声明
- **Tailwind CSS v4**：走 `@tailwindcss/vite` 插件，**没有 tailwind.config**；CSS 入口 `src/index.css`（`@import 'tailwindcss'` + `@import '@heroui/styles'`）；设计令牌 `--pm-*` 定义在 `:root`，勿在组件里写死色值
- **HeroUI v3**（`@heroui/react`）：
  - `Button` **没有 color prop**，用 `variant`（primary/secondary/tertiary/ghost/outline/danger/danger-soft）+ `size`（sm/md/lg）+ `fullWidth/isIconOnly/isDisabled`
  - `Chip` 用 `color`（accent/default/success/warning/danger）+ `variant`（primary/secondary/soft）
  - 无需 Provider；react-aria 系 peers 已显式安装，升级时勿移除
- **状态**：Zustand（`src/store/`），设置持久化 localStorage（key `PicMake-settings`）
- **存储**：Dexie（`src/db/schema.ts`），IndexedDB 库名 `PicMake`，表 `images`（Blob）/ `history`（元信息）
- **网络**：一律走 `src/api/client.ts`（原生 fetch 封装：`/v1` 归一化、错误归一化、流式 + 自动降级）。**不用** openai SDK / axios
- **流式解析**：eventsource-parser **v4**，API 是 `createParser({ onEvent })` 配置对象（不是回调参数）；`EventSource` 不支持 POST 不可用
- **包管理**：pnpm；`.npmrc` `save-prefix=~`（锁 minor）

## 3. 架构分层（铁律，违反即返工）

1. **业务组件是受控展示组件**：数据与回调全部由调用方通过 props 传入。组件内**禁止** import zustand store、调用 `src/api/*`、读写 Dexie / localStorage、直接 fetch。
2. **接线层**：页面组件与页面级 hook 消费 zustand store 与 Dexie `liveQuery`，投影成业务组件 props。生成流程（含流式回调、降级、入库）在页面级编排，不塞进展示组件。
3. **接口只暴露调用方需要控制的**：props 描述「要什么数据、何时发生什么」。不把 store 快照、领域对象整包传给只关心局部状态的组件——容器先投影；渲染对象本身的组件例外（如结果检查器可收整条 history 记录）。回调传最小标识（id），不传整对象。
4. **组件内部规则不进 props**：联动、可用性校验在组件内处理后再上报结果，容器不感知规则。

## 4. 设计准则（写组件前后逐条自检）

1. **职责单一**：一句话能说清用途；拆分要降低理解成本，不把每个 div 变成组件。
2. **状态唯一来源**：受控值只在 props 存一份，禁止镜像到内部 state；派生值直接计算；仅计算昂贵或确需稳定引用时用 `useMemo`；内部 state 仅限纯 UI 语义（行内草稿、弹层开合）。
3. **数据流单向**：输入决定展示，事件表达变化。禁止修改传入的 props 数据；禁止在渲染过程中发请求或改外部状态。
4. **副作用有边界**：离开组件的变化一律回调上报，由接线层落 store / 写库 / 发请求；toast 等全局反馈由接线层发。组件内定时器、观察器只在具体状态区间挂载、离开即清理，并在组件注释中列明。
5. **优先组合**：小组件组合出复杂界面，不给大组件持续加配置；等稳定共性出现再抽象，视觉相似≠业务语义相同。
6. **交互完整、可访问**：覆盖加载、空数据、错误、禁用、长文本；语义化 HTML、键盘可达、focus-visible 可见；尊重 `prefers-reduced-motion`。
7. **样式可控**：视觉规范见 PRD §5.3（`--pm-*` 令牌、发丝线、单强调色 `#FF9A62`——accent 只用于选中环/主按钮/焦点/CTA）；样式不外溢、不依赖全局选择器。
8. **测试用户可感知的行为**：vitest 只测纯函数（尺寸校验、URL 归一化等）；验证「输入 X 是否得到 Y」「非法输入是否拦截」，内部重构不应导致测试批量失效。

## 5. 数据与隐私边界（不可破坏）

- 持久化**只有两处**：IndexedDB（`PicMake` 库）+ localStorage（`PicMake-settings`）。新增任何其他持久化需先改 PRD
- API Key 只在请求头 `Authorization` 中发往用户配置的地址；**禁止任何第三方上报、埋点、遥测**
- 所有请求经 `src/api/client.ts`；组件与页面不得自行拼 URL 发请求
- 错误文案用 `src/lib/types.ts` 的 `ERROR_HINTS`，勿自创口径

## 6. 禁止引入

axios、openai SDK、ESLint（用 oxlint）、TanStack Query、Redux、react-router（MVP 阶段）、任何后端/服务端依赖。新增依赖前先对照 [docs/tech-stack.md](./docs/tech-stack.md) 的依赖清单原则（刻意压到最少）。
