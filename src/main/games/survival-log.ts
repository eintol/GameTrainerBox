// Survival Log(生存日志) 适配器 profile
// 版本 1.0.15690 (Unity IL2CPP, metadata v31)
// 规格来源: Il2CppDumper dump.cs + Python 原型实测验证
//   (归档文档: docs/2026-09-04-生存日志运行时修改器-方案与使用.md)
import type { GameProfile } from './types'

// AttrName 枚举全部合法值(99 个, 提取自 dump.cs, 用于 Dictionary entry 校验)
const ATTR_NAME_VALUES = [
  0, 1, 2, 3, 4, 5, 101, 102, 103, 104, 105, 201, 202, 203, 204, 205, 301, 302, 303, 304, 305,
  401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 10001, 10002, 10003, 10004,
  10005, 10006, 10007, 20001, 20002, 20003, 20004, 20005, 30001, 30002, 30003, 30004, 30005,
  40001, 40002, 40003, 40004, 40005, 50001, 50002, 50003, 50004, 50005, 60001, 60002, 60003,
  60004, 60005, 60006, 60007, 60008, 60009, 60010, 60011, 70001, 70002, 70003, 70004, 70005,
  70006, 70007, 70008, 70009, 70010, 70011, 80001, 80002, 80003, 80004, 81001, 81002, 81003,
  81004, 81005, 81006, 81007, 81008, 81009, 81010, 81011, 81012
]

// 游戏安装根目录(Steam 库路径每台机器不同): 优先读环境变量 GTB_SURVIVAL_LOG_ROOT
// (指向游戏安装目录, 如 C:\Program Files (x86)\Steam\steamapps\common\Survival Log);
// 未设置时用占位符, Mod 配置文件不可用时 trainer 侧自动把容器扩容功能降级为不可用
const GAME_ROOT = process.env.GTB_SURVIVAL_LOG_ROOT || '<游戏安装目录>'

export const survivalLogProfile: GameProfile = {
  id: 'survival-log',
  name: '生存日志 (Survival Log)',
  processName: 'SurvivalLog.exe',
  moduleName: 'GameAssembly.dll',
  // GameCore.HotUpdate.Battle.Logic.Attr_TypeInfo (游戏更新后用 scripts/locate-attr-class.ts 重新定位;
  // script.json 的 ScriptMetadata.Address 在 1.0.15704 上与运行时槽位差 8~24 字节, 勿再使用)
  // 2026-09-05 定位 (游戏 1.0.15704): 0x538bf00 (旧 1.0.15690 为 0x538bef0)
  attrTypeInfoRva: 0x538bf00,
  attrOffsets: {
    base: 0x10,
    strengthening: 0x14,
    condition: 0x18,
    max: 0x1c,
    min: 0x20,
    single: 0x24
  },
  valueScale: 1000,
  // 实测 UI 映射: 游戏"生命"条 = 键 5 (Vitality); 键 4 (Health) 界面无对应条(隐藏健康值)
  mainKeys: [
    { key: 5, name: '生命' },
    { key: 1, name: '饱食度' },
    { key: 2, name: '士气' },
    { key: 3, name: '体力' },
    { key: 4, name: '健康*' }
  ],
  capKeyOffset: 100,
  maxCapValue: 500,
  attrNameValues: ATTR_NAME_VALUES,
  // 容器扩容 Mod(BepInEx 插件, 源码与构建部署见 docs/辅助工具使用说明.md)的配置文件
  modConfigPath:
    `${GAME_ROOT}\\BepInEx\\config\\com.gametrainerbox.survivallog.containerexpand.cfg`,
  // overrides 独立文件(id:列:行 逗号分隔; 不放 BepInEx cfg 里 —— 它会回写文件与外部写入打架)
  modOverridesPath:
    `${GAME_ROOT}\\BepInEx\\config\\com.gametrainerbox.survivallog.containerexpand.overrides.txt`,
  // 插件生成的容器清单(id/名称/本地化名/当前格子), 进局内后完整
  modContainersPath:
    `${GAME_ROOT}\\BepInEx\\config\\com.gametrainerbox.survivallog.containerexpand.containers.json`
}
