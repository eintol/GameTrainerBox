# GameTrainerBox 技术栈与脚手架（Electron 重构版修改器）

日期: 2026-09-04
状态: 脚手架搭建完成并验证（typecheck / build / lint / dev 全部通过，窗口正常启动）

## 一、背景

Survival Log 修改器（Python + tkinter，位于游戏安装目录下的 `SaveEditor\`）
功能已验证可用。决定重构为独立桌面应用，项目名 **GameTrainerBox**（游戏修改器盒子，未来可接入多个游戏）。

用户选定技术栈（最新稳定版）：**Electron + Vue 3 + Tailwind + Lucide + Vite + TypeScript + Element Plus**。

## 二、技术栈清单（实际安装版本，2026-09-04）

| 包 | 版本 | 说明 |
|---|---|---|
| electron | 44.1.1 | 运行时 |
| electron-vite | 5.0.0 | main/preload/renderer 三目标构建 + dev 热重载 |
| vite | 8.2.2 | 构建核心 |
| vue | 3.5.42 | 渲染层框架 |
| element-plus | 2.14.5 | 组件库（全量引入 + 中文语言包 + 暗色主题） |
| @lucide/vue | 1.40.0 | 图标（注意：lucide-vue-next 已弃用，官方迁到 @lucide/vue） |
| koffi | 3.2.0 | 主进程 FFI 调 Windows API（内存引擎核心） |
| tailwindcss / @tailwindcss/vite | 4.3.3 | v4 CSS-first 配置 |
| typescript | **5.9.3** | ⚠️ 初始装到 7.0.2，vue-tsc 3.3 不兼容 TS7（`typescript/lib/tsc` 入口被移除），降级到 5.x |
| vue-tsc | 3.3.11 | 渲染层类型检查 |
| eslint + typescript-eslint + eslint-plugin-vue | 10.9 / 8.69 / 10.10 | flat config |
| prettier | 3.9.6 | 格式化 |
| electron-builder | 26.15.3 | exe 打包（NSIS） |

## 三、项目结构

```
GameTrainerBox/
├── electron.vite.config.ts        # main/preload/renderer 三段配置 + @renderer/@shared 别名
├── electron-builder.yml           # NSIS 打包配置, asarUnpack **/*.node (koffi 原生模块)
├── pnpm-workspace.yaml            # pnpm 11 构建脚本白名单 (allowBuilds)
├── eslint.config.mjs              # ESLint 10 flat config
├── tsconfig.{json,node,web}.json  # node 侧(主+preload) / web 侧(渲染) 分离
└── src/
    ├── main/index.ts              # 主进程: 窗口 + IPC(appInfo)
    ├── preload/index.ts           # contextBridge 白名单 API (sandbox+contextIsolation 开启)
    ├── shared/index.ts            # 三端共享 IPC 常量与类型(GameTrainerBoxApi)
    └── renderer/
        ├── index.html
        └── src/{main.ts, App.vue, style.css, env.d.ts}
```

## 四、搭建过程中踩到的坑（后续维护注意）

1. **TypeScript 7 与 vue-tsc 不兼容**：TS 7（Go 原生版）移除了 `typescript/lib/tsc` 导出，
   vue-tsc 3.3.11 直接崩溃。**保持 typescript@5.x**，等 vue-tsc 官方支持 TS7 再升。
2. **lucide-vue-next 已弃用**：1.0.0 是弃用占位，官方新包是 `@lucide/vue`。
3. **pnpm 11 构建脚本白名单**：`package.json` 的 `pnpm.onlyBuiltDependencies` 字段已不生效，
   白名单写在 `pnpm-workspace.yaml` 的 `allowBuilds`（逐包布尔）。pnpm 会自动改写该文件。
4. **Electron 44 二进制下载**：包内已无 scripts 字段，`pnpm rebuild electron` 不会触发下载；
   需要 `node node_modules/electron/install.js` 手动执行（走 .npmrc 的 electron_mirror=npmmirror）。
5. **Tailwind v4 + Element Plus**：style.css 按层引入且**跳过 preflight**，避免 Tailwind 重置
   样式与 EP 冲突（v4 用 `@import 'tailwindcss/theme.css'` + `utilities.css` 的部分引入写法）。

## 五、IPC 约定

- `src/shared/index.ts` 定义 `IPC` 常量与 `GameTrainerBoxApi` 接口，三端共享，类型安全
- preload 实现 `GameTrainerBoxApi` 并 `contextBridge.exposeInMainWorld('api', api)`
- 渲染进程通过 `window.api.xxx()` 调用，env.d.ts 声明全局 Window 类型
- 引擎接入时按此模式扩展：`attach/scan/getAttrs/setAttr/max500/lock` 等方法

## 六、迁移进度（2026-09-04 更新）

Python 逻辑已全部迁移完成并实测验证：

- `src/main/engine/winapi.ts` — koffi 绑定（句柄用 intptr 规避 BigInt；结构体全用原始 Buffer+偏移，
  规避 koffi struct 对齐不确定性；PROCESSENTRY32W 的 dwSize=568/名字@44 坑位已固化）
- `src/main/engine/process.ts` — GameProcess 类（对应 memproc.py）
- `src/main/engine/scanner.ts` — 扫描器（对应 scanner.py：签名扫描/entries 遍历/klass 抽样/锚点缓存）
- `src/main/games/survival-log.ts` — Survival Log profile（RVA/偏移/键映射/99 个 AttrName 值数据化）
- `src/main/trainer.ts` — 业务层（扫描/改值/上限拉满/锁定循环 300ms/日志事件）
- IPC 三端接线（shared 契约 → preload 白名单 → renderer UI：扫描按钮/属性表/锁定开关/日志面板）
- 冒烟脚本 `scripts/smoke-engine.ts`（esbuild 打包后 node 运行）+ `scripts/smoke-koffi.cjs`

**实测**（对真实游戏进程）：慢路径 3.4 秒 98 项、缓存路径 6ms，数值与 Python 版一致。
迁移中修复的 bug：地址上限常量少写一个 F（0x7fffffffff → 0x7fffffffffff，40 位误杀 41 位堆地址），
三处同错（MAX_ADDR / klass 校验 / entry 指针校验）已全部修正。

**待办**：`pnpm build:win` 打包 exe（electron-builder 首次构建会下载 winCodeSign/nsis 工具）、
应用图标、CSP 元数据（发布前）、Element Plus 按需引入优化（当前全量 2.4MB bundle）。

## 七、验证记录

- `pnpm typecheck` 通过（node 侧 tsc 5.9.3 + web 侧 vue-tsc 3.3.11）
- `pnpm build` 通过（main + preload + renderer）
- `pnpm lint` 0 错误 0 警告
- `pnpm dev` Electron 44 窗口正常启动（主/GPU/渲染三进程）
