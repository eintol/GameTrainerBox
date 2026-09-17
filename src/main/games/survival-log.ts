// Survival Log(生存日志) 适配器 profile
// 版本 1.0.16756 (Unity IL2CPP, metadata v31; 2026-09-17 适配, 旧版 1.0.15690/1.0.15704/1.0.16363)
// 规格来源: Il2CppDumper dump.cs + Python 原型实测验证
//   (归档文档: docs/2026-09-04-生存日志运行时修改器-方案与使用.md)
import type { AttrDictProfile } from './types'
import { localEnv } from '../local-env'

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

// 游戏安装根目录(Steam 库路径每台机器不同), 按优先级解析:
//   1. 环境变量 GTB_SURVIVAL_LOG_ROOT
//   2. local.env(gitignore, 不入库): 便携版 exe 同目录 或 项目根
// 两处都没有时用占位符, Mod 配置文件不可用时 trainer 侧自动把容器扩容功能降级为不可用
const GAME_ROOT = process.env.GTB_SURVIVAL_LOG_ROOT || localEnv('GTB_SURVIVAL_LOG_ROOT') || '<游戏安装目录>'

export const survivalLogProfile: AttrDictProfile = {
  id: 'survival-log',
  name: '生存日志 (Survival Log)',
  kind: 'attr-dict',
  processName: 'SurvivalLog.exe',
  moduleName: 'GameAssembly.dll',
  // GameCore.HotUpdate.Battle.Logic.Attr_TypeInfo (游戏更新后用 scripts/locate-attr-class.ts 重新定位;
  // script.json 的 ScriptMetadata.Address 在 1.0.15704 上与运行时槽位差 8~24 字节, 勿再使用)
  // 2026-09-17 定位 (1.0.16756, buildid 25366138): 0x53b6340 (旧 1.0.16363 为 0x53b2190; 本次更新 Attr 字段偏移
  // 与 AttrName 99 枚举值均无变化, 仅 TypeInfo 槽位漂移 —— 与前几次小更新同一模式)
  attrTypeInfoRva: 0x53b6340,
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
    { key: 1, name: '饱腹' },
    { key: 2, name: '心态' },
    { key: 3, name: '精力' },
    { key: 5, name: '生命' },
    { key: 4, name: '健康*' }
  ],
  capKeyOffset: 100,
  maxCapValue: 500,
  // 移速(AttrName.MoveSpeed=401, 无上限键 501): 1.0.15704 实测 正常 base=3000(显示 3.0),
  // 硬封顶 Attr.Max=10000(显示 10.0), Min=-500; 显示值 = base/1000, 写入超 Max 时 trainer 自动抬 Max
  extraKeys: [
    { key: 401, name: '移速' },
    // 储电容量倍率(AttrName.PowerStorage_Ratio=10004): PowerManager 的
    // TotalCapacity = Σ(储电设备容量) × (1 + 该属性值/1000) —— 反汇编实测读的就是它,
    // 即游戏内电力面板「储电设备」显示的总上限。1.0.16756 实测 base=0 / 强化=500(天赋提供)
    // / Max=2000(显示 2.0 为游戏内建封顶) / Min=-500; 强化由游戏侧给, 故按总值显示与折算写入
    { key: 10004, name: '储电容量倍率', includesStrengthening: true }
  ],
  attrNameValues: ATTR_NAME_VALUES,
  // 容器扩容 Mod(BepInEx 插件, 源码与构建部署见 docs/辅助工具使用说明.md)的配置文件
  modConfigPath:
    `${GAME_ROOT}\\BepInEx\\config\\com.gametrainerbox.survivallog.containerexpand.cfg`,
  // overrides 独立文件(id:列:行 逗号分隔; 不放 BepInEx cfg 里 —— 它会回写文件与外部写入打架)
  modOverridesPath:
    `${GAME_ROOT}\\BepInEx\\config\\com.gametrainerbox.survivallog.containerexpand.overrides.txt`,
  // 插件生成的容器清单(id/名称/本地化名/当前格子), 进局内后完整
  modContainersPath:
    `${GAME_ROOT}\\BepInEx\\config\\com.gametrainerbox.survivallog.containerexpand.containers.json`,
  // 扫描成功后 UI 表格下方的提示(原 TrainerView 硬编码文案迁移至此)
  uiHints: [
    '填写"改为"后点该行"应用"即写入; 勾选锁定后每 0.3 秒自动写回',
    '"健康*"为内部隐藏值, 一般不用改; 移速正常值为 3.0, 超过上限 10 时会自动抬高游戏硬封顶',
    '"储电容量倍率"是加成比例(填 1 = 储电设备总上限翻倍, 填 0 = 无加成), 值含天赋强化, 游戏在下次电力结算时重算生效'
  ]
}
