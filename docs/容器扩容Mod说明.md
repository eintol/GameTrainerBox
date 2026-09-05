# 容器扩容 Mod 说明（SLContainerExpand，活文档）

> 生存日志的容器格子扩容 Mod：BepInEx 插件，让**背包与所有容器的格子数**可按容器独立设置，
> 游戏内热生效。**Mod 行为/配置/版本变更时必须同步更新本文与"最后更新"日期**。
> 深度实现与工具用法见「辅助工具使用说明」；历史坑见「踩坑记录」。
> 最后更新：2026-09-05（v0.8）

## 功能

- 背包 / 家具容器（储物箱、冰箱、抽屉…）/ 仓库 / 无人机包——**全部容器**的格子数按容器独立设置
- 目标为**绝对格子数**（如 `20x16`），游戏运行中约 3 秒内热生效，无需重启
- 容器清单自动导出（游戏本地化中文名 + 原始/当前格子 + 是否正在使用），供修改器表格展示
- 存档安全：只扩不缩，从配置源头修改使摆放/读档校验/UI 全链路一致

## 组成

| 组件 | 位置 | 说明 |
|---|---|---|
| BepInEx 6 BE (be.788) IL2CPP win-x64 | 游戏根目录（`winhttp.dll` + `dotnet\` + `BepInEx\`） | 注入框架；Unity 6 必须 BE 构建 |
| SLContainerExpand 插件 | `BepInEx\plugins\SLContainerExpand.dll` | 本体（C# 插件源码未随本仓库发布，构建部署见「辅助工具使用说明」） |
| interop 程序集 | `BepInEx\interop\` | BepInEx 首启自动生成（勿手改；游戏大更新后删掉重新生成） |

卸载：删除游戏根目录的 `winhttp.dll`、`doorstop_config.ini`、`.doorstop_version`、`dotnet\`、`BepInEx\` 即完全还原。

## 工作机制

- 插件注入 MonoBehaviour，在**主线程每 3 秒**：①监视配置文件变化 ②遍历游戏的
  `ConfigManager._Config_Bag_Dict`，把 `Overrides` 里列出的容器 `Config_Bag.Size`（`[列,行]`）
  改写为目标值。游戏 UI 按 `gridCols*gridRows` 动态渲染，改配置即改 UI，**不需要动任何 UI 文件**
- **零原生钩子设计**：本游戏（Unity 6000.2.0a1）上 Harmony patch 必闪退（见踩坑记录 A2），
  因此全部采用 interop 直改数据，不存在注入跳板
- **容器清单导出**：发现的容器写入 `containers.json`（id / 本地化中文名 / 当前与原始格子 /
  `inUse` 是否正在使用——来自游戏 ReduxUI 数据层的活实例映射）

## 配置文件（游戏 `BepInEx\config\`）

| 文件 | 内容 | 说明 |
|---|---|---|
| `...containerexpand.cfg` | `EnableResize = true/false` | 总开关（BepInEx 托管） |
| `...containerexpand.overrides.txt` | `id:列:行` 逗号分隔，如 `7:20:16,1001:12:8` | 每容器绝对目标；未列出的容器保持原始大小 |
| `...containerexpand.containers.json` | 容器清单 | 插件生成，只读 |

⚠️ Overrides 不要写进 BepInEx cfg——插件应用配置会触发 BepInEx 回写 cfg，外部值会被清空（v0.7 踩坑）。

**修改配置后 3 秒内热生效**（热生效判定：目标 ≥ 该容器原始格子；否则跳过并记日志）。

## 与 GameTrainerBox 修改器的配合

GameTrainerBox 的容器扩容卡片 = 本 Mod 的图形前端：添加容器 → 填目标格子 → "应用"即写
`overrides.txt`（+ 开关写 cfg），插件自动热应用。工作区记忆存修改器本机，重开不丢。

## 兼容性

- 已验证：游戏 1.0.15704（Unity 6000.2.0a1, IL2CPP metadata v31）+ BepInEx 6.0.0-be.788
- **游戏大版本更新后**：①重新 dump（Il2CppDumper）②删 `BepInEx\interop`、`unity-libs` 重启游戏重新生成
  ③跑 `GameTrainerBox/scripts/locate-attr-class.ts` 重定位属性 RVA（与 Mod 无关但同批做）
  ④进局验证容器清单与热生效
- BepInEx 升级：换包后同样删 interop/unity-libs 重新生成

## 版本历史

| 版本 | 变更 |
|---|---|
| v0.3 | 弃用 Harmony，改为轮询直改配置（闪退根因定位） |
| v0.4 | 配置文件热监视；每容器倍数/增量参数（已被 v0.6 取代） |
| v0.6 | 改为 Overrides 每容器绝对目标；容器清单 JSON 导出 |
| v0.7 | 容器"正在使用"检测（ReduxUI BagCache） |
| v0.8 | Overrides 迁独立文件（绕开 BepInEx 回写冲突） |

## 安全与反作弊

- 游戏自带容器篡改检测：读档时校验物品位置（越界 → `LoadRepair` 修复 +
  `BagSizeIllegal` 打标 + Sentry 上报）。本 Mod 从**配置源头**修改，摆放/校验/UI 全链路一致，不触碰物品位置
- **只扩不缩**是硬约束：缩小会让已放入新区域的物品读档越界。插件层面直接跳过缩小目标；
  确要缩小：清空该容器配置 → 重启游戏 → 再设新值

## 已知限制

- 容器清单在**进局内后**才完整（部分配置游戏懒加载）
- 同名多行是游戏自身的扩容等级链（如普通背包 8x8/8x9/8x10），修改器以尺寸后缀区分
- 缩小/移除条目不立即收缩已扩大的格子（安全设计），重启游戏还原
- 游戏暂停（失焦）期间采样判活无区分度，修改器会退化为按上限总分识别主角（已实测可靠）
