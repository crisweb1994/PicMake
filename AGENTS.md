# AGENTS.md

本仓库（PicMake）对 AI agent 的协作约定。修改前读完本文，并按任务阅读相关文档与现有实现。

## 0. 权威源与阅读范围

| 文档                                                     | 作用                                                        | 何时阅读                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| [docs/prd.md](./docs/prd.md)                             | **需求唯一基准**（FR-1~10、状态机、验收标准、视觉规范）     | 修改用户可感知的行为、状态、样式或数据边界                 |
| [docs/demos/prototype.html](./docs/demos/prototype.html) | **交互对照唯一基准**（V2 结果舞台版，含打开状态机与全场景） | 修改界面与交互                                             |
| [docs/gpt-image-2.5-api.md](./docs/gpt-image-2.5-api.md) | API 参考（参数枚举、流式事件、定价、兼容性）                | 修改请求、响应解析与错误处理；产品传输策略以 PRD FR-4 为准 |
| [docs/tech-stack.md](./docs/tech-stack.md)               | 技术栈定稿 + 实测坑记录                                     | 修改架构、依赖、框架配置或库的使用方式                     |

文档描述预期行为，代码用于确认当前行为。发现两者冲突时明确指出，不把现有实现自动当成正确需求。`docs/` 是不随公开仓库发布的内部文档；缺失时说明验证范围，不编造其内容。

## 1. 常用命令

```bash
pnpm dev            # 开发服务器（5173）
pnpm build          # tsc -b && vite build
pnpm lint           # oxlint（本项目不用 ESLint）
pnpm test           # vitest run（只测 src/**/*.test.ts 纯函数）
pnpm exec prettier --write <本次修改的文件>
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
- **网络**：一律走 `src/api/client.ts`（原生 fetch 封装：`/v1` 归一化、错误归一化、单次流式请求——无自动降级/重试，见 PRD FR-4）。**不用** openai SDK / axios
- **流式解析**：eventsource-parser **v4**，API 是 `createParser({ onEvent })` 配置对象（不是回调参数）；`EventSource` 不支持 POST 不可用
- **包管理**：pnpm；`.npmrc` `save-prefix=~`（锁 minor）

## 3. 架构与状态边界

1. **业务组件是受控展示组件**：数据与回调全部由调用方通过 props 传入。组件内**禁止** import zustand store、调用 `src/api/*`、读写 Dexie / localStorage、直接 fetch。
2. **接线层**：页面组件与页面级 hook 消费 zustand store 与 Dexie `liveQuery`，投影成业务组件 props。生成流程（含流式回调、入库）在页面级编排；落 store、写库、调用 API 与 toast 等全局反馈由接线层负责，不塞进展示组件。
3. **接口只暴露调用方需要控制的**：props 描述「要什么数据、何时发生什么」。不把 store 快照、领域对象整包传给只关心局部状态的组件——容器先投影；渲染对象本身的组件例外（如结果检查器可收整条 history 记录）。回调传最小标识（id），不传整对象。
4. **区分交互规则与业务规则**：弹层开合、焦点、行内草稿和展示联动留在组件内，不通过 props 让容器管理内部细节。尺寸是否合法、是否允许提交等业务规则保持唯一实现，优先放在 `src/lib/` 纯函数中，供组件与编排层复用；组件可显示校验结果，提交入口仍须拦截非法输入。
5. **状态唯一来源、数据流单向**：共享状态由明确的拥有者维护，局部 UI 状态留在组件。受控值禁止镜像到内部 state；派生值直接计算，仅计算昂贵或确需稳定引用时用 `useMemo`。禁止修改 props 数据，禁止在渲染过程中发请求或改外部状态。
6. **副作用有生命周期**：组件内定时器、观察器只在具体状态区间挂载，离开即清理，并在组件注释中列明。修改异步流程时，检查重复触发、取消、过期结果及请求成功但保存失败等路径，行为以 PRD 为准。

## 4. 变更与界面准则

1. **改动聚焦**：沿用现有模式，改动范围与任务一致；不顺手重构无关模块，不为尚未出现的需求增加配置、扩展点或依赖。
2. **职责单一、优先组合**：一句话能说清组件用途；拆分应降低理解成本或消除重复规则，不把每个 div 变成组件。等稳定共性出现再抽象，视觉相似不代表业务语义相同。
3. **交互完整、可访问**：覆盖加载、空数据、错误、禁用、长文本；语义化 HTML、键盘可达、focus-visible 可见；尊重 `prefers-reduced-motion`。
4. **样式可控**：视觉规范见 PRD §5.3（`--pm-*` 令牌、发丝线、单强调色 `#FF9A62`——accent 只用于选中环/主按钮/焦点/CTA）；样式不外溢、不依赖全局选择器。

## 5. 数据与隐私边界（不可破坏）

- 持久化**只有两处**：IndexedDB（`PicMake` 库）+ localStorage（`PicMake-settings`）。新增任何其他持久化需先改 PRD
- API Key 只在请求头 `Authorization` 中发往用户配置的地址；**禁止任何第三方上报、埋点、遥测**
- 错误文案用 `src/lib/types.ts` 的 `ERROR_HINTS`，勿自创口径

## 6. 禁止引入

axios、openai SDK、ESLint（用 oxlint）、TanStack Query、Redux、react-router（MVP 阶段）、任何后端/服务端依赖。新增依赖前先对照 [docs/tech-stack.md](./docs/tech-stack.md) 的依赖清单原则（刻意压到最少）。

## 7. 验证与交付

- **代码改动**：执行 `pnpm lint` 和 `pnpm build`；格式使用 Prettier，仅处理本次修改的文件。
- **纯函数行为改动**：执行 `pnpm test`，必要时补充边界用例。vitest 只测 `src/**/*.test.ts` 纯函数，验证输入输出与非法输入拦截；不为内部重构编写绑定实现细节的测试。
- **UI 改动**：在浏览器验证受影响的交互与状态，包括键盘操作、错误与禁用状态；构建通过不能替代交互验证。
- **仅文档改动**：检查内容、引用路径与格式，无需运行应用构建和测试。
- **提交前**：检查最终 diff，执行 `git diff --check`，只提交本次任务的文件，保留用户已有改动。
- **交付时**：说明改了什么、实际执行的检查及结果、尚未验证的部分。检查失败须说明原因；区分 Mock 验证与真实 API 验证。
