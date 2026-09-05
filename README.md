# GameTrainerBox

**单机游戏运行时修改器盒子** — A desktop trainer box for single-player games: a generic runtime memory engine plus per-game adapter profiles, built with Electron + Vue 3.

当前适配：**生存日志（Survival Log）**（Unity IL2CPP，实测 v1.0.15690 / 1.0.15704）。

<!-- TODO: 补运行界面截图/GIF（属性面板 + 容器扩容卡片），存放于 docs/screenshots/ -->

## 功能

- 附加运行中的游戏进程，全堆签名扫描定位主角属性字典（约 4 秒，重扫走缓存 0.2 秒）
- 五维属性（生命/饱食度/士气/体力/健康）+ 人物移速 实时查看、修改、锁定（0.3s 写回）
- 一键「上限→500」拉满属性上限（自动处理游戏硬封顶字段）
- 修改随游戏存档持久化（改后游戏内正常存档一次即可）
- **容器扩容**：背包与所有家具容器/仓库的格子数按容器独立设置（配套 BepInEx 插件，修改器界面一键调整，游戏运行中 3 秒内热生效；从游戏数据源头修改，存档安全）

## 技术栈

Electron 44 · Vue 3.5 · Element Plus · Tailwind CSS v4 · @lucide/vue · Vite 8 · TypeScript 5.9 · koffi（FFI 调 Windows API）

## 快速开始

环境要求：Windows 10/11（内存引擎依赖 Win32 API）、Node.js 20+、pnpm 11。

```bash
git clone https://github.com/eintol/GameTrainerBox.git
cd GameTrainerBox
pnpm install        # Electron 二进制走 npmmirror 镜像（见 .npmrc）
pnpm dev            # 开发模式（主进程改动需重启，渲染进程热重载）
```

常用脚本：

```bash
pnpm typecheck      # 类型检查（node 侧 tsc + web 侧 vue-tsc）
pnpm lint           # ESLint
pnpm build          # 构建三端产物
pnpm build:win      # 打包 NSIS 安装包（out/ + electron-builder）
```

> TypeScript 锁定 5.x（vue-tsc 3.3 尚不兼容 TS 7）；Electron 二进制缺失时执行
> `node node_modules/electron/install.js`。

## 工作原理

1. 主进程通过 koffi 调用 kernel32（进程/模块/区域枚举、内存读写）
2. 游戏进入存档局内后，对进程堆做 IL2CPP Dictionary 签名扫描，多级鉴别链定位主角属性字典（过滤模板/镜像/邻居等同形假字典）
3. **引擎与游戏知识完全分离**：`src/main/engine/` 是通用内存引擎，不含任何具体游戏逻辑；每个游戏在 `src/main/games/` 有一个 profile（TypeInfo RVA、字段偏移、属性键映射等纯数据）
4. 渲染进程是纯 Vue（sandbox + contextIsolation 开启），只通过 contextBridge 白名单 API 调用主进程

架构细节与适配红线见 [CLAUDE.md](CLAUDE.md)。

## 添加新游戏

核心设计：**加一个游戏 = 在 `src/main/games/` 加一个 profile 数据文件**，引擎代码零改动。完整流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发者文档

- [修改器功能说明](docs/修改器功能说明.md) — 功能与使用
- [容器扩容 Mod 说明](docs/容器扩容Mod说明.md) — Mod 功能、安装、配置
- [辅助工具使用说明](docs/辅助工具使用说明.md) — Il2CppDumper / BepInEx / 诊断脚本等工具链
- [踩坑记录](docs/踩坑记录.md) — 实测坑与防御规则

## 免责声明 / Disclaimer

- **仅限单机游戏**：禁止用于任何联机、多人或带反作弊系统的游戏，否则可能导致封号等后果
- **风险自负**：修改进程内存可能导致存档损坏、游戏崩溃或异常行为，使用前务必备份存档
- **仅供学习研究**：本项目用于学习 Windows 内存机制与 Electron 桌面开发，请支持正版游戏，勿用于商业用途
- 本项目与任何游戏开发商无关；文中出现的游戏名称与商标归其各自所有者所有

> For English readers: this tool is for **single-player games only** — never use it with online/multiplayer/anti-cheat games. Modifying game memory may corrupt saves or crash the game; back up your saves. Use at your own risk, for learning and research purposes only.

## 许可证

[MIT](LICENSE)
