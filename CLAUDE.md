# CLAUDE.md

本文件指导 Claude Code 在本仓库工作。

## 项目概述

GameTrainerBox：单机游戏运行时属性修改器（Electron 桌面应用）。当前适配 Survival Log（Unity IL2CPP）。
早期 Python 原型已删除（2026-09-04），其方案与实测规格归档在 `docs/2026-09-04-生存日志运行时修改器-方案与使用.md`。

### 文档体系（活文档约定）

- **活文档不带时间前缀**，随迭代持续更新（docs/ 下）：
  `修改器功能说明.md`（功能与使用）、`容器扩容Mod说明.md`（Mod 功能与使用）、
  `辅助工具使用说明.md`（修改器与 Mod 开发的辅助工具使用）、`踩坑记录.md`（坑与规则来源）
- 归档快照才带日期前缀（如 Python 原型归档），内容定格不再修改
- **功能/行为/配置变更时必须同步更新对应活文档**（并按踩坑记录的闭环更新 CLAUDE.md 硬性规则）

## 常用命令

- `pnpm dev` — 开发模式（主进程改动需重启，渲染进程热重载）
- `pnpm typecheck` — 提交前必跑（tsc + vue-tsc 双侧）
- `pnpm lint` / `pnpm exec eslint . --fix` — 检查 / 自动修复
- `pnpm build` — 构建验证；`pnpm build:win` — 发布打包，同时生成免安装版（`dist\win-unpacked\GameTrainerBox.exe`）和安装包（`dist\GameTrainerBox Setup <版本>.exe`）

## 架构约定

- **三进程结构**：`src/main`（Node 侧，引擎与游戏逻辑都在这）、`src/preload`（contextBridge 白名单）、
  `src/renderer`（纯 Vue，不接触 Node）
- **IPC 类型安全**：新增 IPC 必须先在 `src/shared/index.ts` 定义常量与类型，preload 实现 `GameTrainerBoxApi`，
  渲染进程只通过 `window.api` 调用；禁止在渲染进程直接 require 任何 Node 模块
- **引擎与游戏解耦**：`src/main/engine/` 是通用内存引擎（进程/内存/扫描），不得 import 任何具体游戏知识；
  游戏相关参数（RVA、偏移、键映射、属性名）全部放 `src/main/games/<game>/profile.ts` 数据文件
- **koffi 只在主进程用**：FFI 调用是同步阻塞的，扫描等重操作注意别卡 UI 转发（必要时 async 包装）

## 硬性规则（2026-09-05 实测踩坑，违反必返工）

**排查工作流（持续迭代的闭环，五步缺一不可）**：遇到"不工作 / 数据不对 / 闪退"——
1. 先读 `docs/踩坑记录.md` 对症查找，能解决就不重蹈覆辙；
2. 文档没覆盖的新问题：解决后**必须回写新坑**到该文档（症状/根因/解法/规则四段式）；
3. 与已有条目同根因/同场景的**合并进原条目**，被更新方案取代的过时条目**直接删除**——
   踩坑文档是活文档不是流水账，过时的坑比没有坑更危险；
4. 从新坑/新规则**提炼一行祈使句**回写进本节"硬性规则"对应分组，让下个会话不用读细节就被约束住；
5. 规则与细节两边同步维护，保持一致；回写时顺带巡检全文，更新"最后更新"日期。

**框架选型**
- 禁止对本游戏（IL2CPP）建议/安装 BepInEx 稳定版——稳定版只有 Mono 构建；IL2CPP 只用
  `builds.bepinex.dev` 的 BE 构建，Unity 6 必须 be.753 之后（含 PR #1284）
- 禁止使用 Harmony/HarmonyX patch 游戏（Unity 6000.2.0a1 上 native detour 必闪退、无任何日志）；
  hook 类需求一律走"注入 MonoBehaviour 主线程轮询 + interop 直改数据"

**配置与文件**
- 游戏行为数据禁止写入 BepInEx 托管的 cfg（插件应用时会触发回写，外部值被拆行/清空）；
  行为数据一律独立文件 + mtime 轮询（参照 `*.overrides.txt`）
- 游戏运行时插件 DLL 被锁；部署用"直接重试拷贝直到成功"循环，不用进程检测做前置条件

**内存 / 引擎**
- 禁止对 Il2CppClass/托管对象的内存布局做偏移假设（Unity 6.2 alpha 上 name@0x10 等假设已实测失败）；
  类定位一律走 `scripts/locate-attr-class.ts` 流程（堆搜字符串 → klass 投票 → 模块反搜 → 自动验证）
- script.json 的 ScriptMetadata.Address 实测与运行时槽位差 8~24 字节，RVA 以 locate 脚本输出为准
- 属性扫描存在 模板/镜像/邻居/主角 多个同形字典（22 项 GameKey 假字典、98 项真字典并存）；
  禁止"取第一个最大"的朴素选择，必须走 scanner.ts 已实装的
  模板过滤 → 动态采样 → 上限总分排序链；缓存版本化（v2），候选歧义时不缓存
- IL2CPP 的类名/命名空间字符串在 metadata 堆（私有 RW 内存），不在 GameAssembly 模块内

**工具链**
- 改动 `engine/` 或 `scripts/` 后跑任何诊断，必须重建 esbuild bundle——陈旧 bundle 会"验证"旧结论
- 给脚本包 async main 不得用字符串首尾拼接（import 会被裹进函数体报语法错）；esbuild 报错别静默吞
- shell 链式命令里 `grep -c` 无匹配时退出码 1 会静默断掉 `&&` 链（打印 0 但后续没执行）；
  typecheck/build 等关键步骤单独执行、单独确认输出

**产品交互**
- 程序内部数据（容器 ID、属性键名等）不得直接暴露给用户输入/阅读；一律表格化 + 游戏本地化名称，
  并提供"正在使用"过滤
- 内容会增长的页面用页面级滚动，日志/终端区固定高度内滚（弹性布局会把尾部区域挤没）
- 容器/属性写入遵守"只扩不缩"：缩小必须校验拦截或提示重启还原（读档越界会触发游戏反作弊 + Sentry）

## 版本红线

- **TypeScript 锁 5.x**：vue-tsc 3.3 不兼容 TS 7，升级前先验证 vue-tsc 支持
- **Lucide 包名是 `@lucide/vue`**（lucide-vue-next 已弃用）
- **pnpm 11 构建脚本白名单**在 `pnpm-workspace.yaml` 的 `allowBuilds`，不在 package.json
- **Electron 二进制**缺失时：`node node_modules/electron/install.js`（镜像已配 .npmrc）
- **Tailwind v4**：无 tailwind.config.js；style.css 按层引入且跳过 preflight（与 Element Plus 共存）

## 游戏文件位置（加功能时需要读取）

路径因机器而异，统一用占位符：`<Steam库>` = Steam 库根目录，`<游戏安装目录>` = `<Steam库>\steamapps\common\Survival Log`，`<工具目录>` = 本机辅助工具根目录（Il2CppDumper、BepInEx 插件源码等）。

- **游戏安装目录**: `<游戏安装目录>\`
  - `GameAssembly.dll` — IL2CPP 本体（重新 dump 的输入 1）
  - `SurvivalLog_Data\il2cpp_data\Metadata\global-metadata.dat` — 元数据（dump 输入 2，类名/字段名都在这）
  - `SurvivalLog_Data\StreamingAssets\WebUI\` — 游戏自带 Vue 前端源码（找 UI 字段名/文案/数据结构的捷径，优先 grep 这里）
- **dump 产物**: `<工具目录>\Il2CppDumper\`
  - `dump.cs` — 全部类的字段与偏移（加功能先 grep 这里）
  - `script.json` — TypeInfo 地址（⚠️ 1.0.15704 实测其 Address 与运行时槽位有偏差，RVA 以
    `scripts/locate-attr-class.ts` 输出为准，此文件仅作参考）
- **存档目录**: `%USERPROFILE%\AppData\LocalLow\LLS\SLGame\Saves\`（MemoryPack 二进制未加密，带 .bak）
- **运行日志**: `%USERPROFILE%\AppData\LocalLow\LLS\SLGame\Player.log`（游戏内部日志，含存档快照记录）
- **Mod 配置路径**: profile 的 `modConfigPath` 等由游戏安装根目录拼接，解析优先级 环境变量
  `GTB_SURVIVAL_LOG_ROOT` > `local.env`（gitignore，模板见 `local.env.example`，机制见
  `src/main/local-env.ts`）> 占位符 `<游戏安装目录>`；都不可用时容器扩容功能自动降级为不可用
  （见 `src/main/games/survival-log.ts`）。**新增机器相关配置一律走 local.env**——setx 对已打开的
  终端不生效，纯环境变量配置在 dev 下必然踩坑（见踩坑记录 D5）

重新 dump（游戏大版本更新后）:

```powershell
cd <工具目录>\Il2CppDumper
.\Il2CppDumper.exe "<游戏安装目录>\GameAssembly.dll" "<游戏安装目录>\SurvivalLog_Data\il2cpp_data\Metadata\global-metadata.dat" .
```

加功能工作流: grep dump.cs 找类/字段/偏移 → 需要界面佐证时 grep WebUI → 更新 `games/<game>/profile.ts` → `scripts/smoke-engine.ts` 冒烟验证（改过 engine/scripts 后先重建 bundle）→ 接 UI。

## 游戏适配（Survival Log）

- 版本相关参数只有 `ATTR_TYPEINFO_RVA`（profile 内）。游戏大更新后：重新 dump（命令见「游戏文件位置」）
  → 更新 profile 的 attrNameValues（提取自新 dump.cs）→ 跑 `scripts/locate-attr-class.ts` 重定位 RVA
  （script.json Address 不可信，见硬性规则）→ 冒烟验证
- `scanner.ts` 的 `MIN_DICT_SIZE=10`（1.0.15704 实测主角字典 98 项；堆里存在 22 项的 GameKey
  同签名假字典，真伪靠 `validateDict` 的 klass 校验区分，正确 klass 下假字典自然被过滤）
- 关键规格（已实测验证，勿改动）：IL2CPP Dictionary entry 24 字节布局
  `[hash][next][key][pad][ptr]`、int 枚举键 hash==key、pad 恒 0、Attr 字段偏移
  BaseValue 0x10 / Strengthening 0x14 / Max 0x1C、显示值 = BaseValue/1000、上限 = base+强化
- 游戏 UI「生命」= 键 5 (Vitality)；键 4 (Health) 是隐藏属性；101-105 为对应上限键
- 移速 = 键 401 (AttrName.MoveSpeed)，无上限键 501 —— profile 走 `extraKeys`
  （不得塞进 mainKeys，否则 isPlayerDict 会要求不存在的键 501 导致鉴别全挂）；
  1.0.15704 实测正常 base=3000（显示 3.0）、硬封顶 Attr.Max=10000（显示 10.0）、Min=-500；
  写入值超 Max 时 trainer 自动抬高 Max 字段；复验脚本 `scripts/diag-movespeed.ts`
- 主界面时 Attr 类未初始化（TypeInfo 处是非对齐魔数），必须进存档局内才能扫描

## 容器扩容 Mod（BepInEx 插件）

- **功能与使用见 `docs/容器扩容Mod说明.md`；GameTrainerBox 修改器侧功能见 `docs/修改器功能说明.md`**
- **辅助工具（Il2CppDumper/BepInEx/插件构建/诊断脚本）的使用说明见 `docs/辅助工具使用说明.md`（动实现之前先读它）**
- **历史踩坑全集见 `docs/踩坑记录.md`**（Harmony 必闪退、
  BepInEx 回写打架、多字典误选等，新会话先读坑再动手）

- 源码 `<工具目录>\SLMods\ContainerExpand\`（C# net6.0，插件源码未随本仓库发布；`dotnet build -c Release` 后拷
  `bin\Release\net6.0\SLContainerExpand.dll` 到游戏 `BepInEx\plugins\`，游戏运行中 DLL 被锁定需先关游戏）
- 原理一句话：格子数 = `Config_Bag.Size` 配置驱动，插件轮询改写配置、WebUI 自动重排
  （数据流/协议细节见「辅助工具使用说明」§4/§5/§6）
- 协议要点：GameTrainerBox 写 `profile.modOverridesPath`（每容器 `id:列:行`）+ cfg 开关；插件 3 秒 mtime 热应用
- 安全：只扩不缩（缩小需重启游戏还原），详见硬性规则与踩坑记录

## 代码风格

- 注释中文，标识符英文；ESLint + Prettier 已配置（`pnpm exec eslint . --fix` 自动修格式）
- 提交信息：`<type>(scope): <中文摘要>`，type 用 feat/fix/refactor/docs/test/chore
