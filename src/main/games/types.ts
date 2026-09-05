// 游戏适配器 profile 类型定义
// 引擎代码通用, 版本相关参数全部数据化在 profile 里; 加新游戏 = 新增一个 profile 文件

export interface AttrKeyDef {
  key: number
  name: string
}

export interface AttrOffsets {
  /** BaseValue 当前值(int) */
  base: number
  /** StrengtheningValue 强化值(int) */
  strengthening: number
  /** ConditionValue(int) */
  condition: number
  /** Max 硬封顶(int) */
  max: number
  /** Min(int) */
  min: number
  /** isSingle(bool) */
  single: number
}

export interface GameProfile {
  id: string
  /** 显示名 */
  name: string
  /** 目标进程名 */
  processName: string
  /** 模块名(读 TypeInfo 指针用) */
  moduleName: string
  /** Attr 类 TypeInfo 的 RVA(版本相关, 游戏大更新后重新 dump 更新) */
  attrTypeInfoRva: number
  /** Attr 对象字段偏移(IL2CPP 对象头 16 字节之后) */
  attrOffsets: AttrOffsets
  /** 显示值换算: 游戏显示 = BaseValue / valueScale */
  valueScale: number
  /** 主属性键与 UI 名称(按实测 UI 映射) */
  mainKeys: AttrKeyDef[]
  /** 上限键 = 主键 + capKeyOffset */
  capKeyOffset: number
  /**
   * 附加键(可选): 同一属性字典内的额外可调属性(如移速 401), 与 mainKeys 一样走
   * valueScale 换算; 区别是没有独立上限键(键+offset 不存在), 硬封顶就是 Attr.Max 字段,
   * 不参与 isPlayerDict 鉴别(加了会导致主角字典判定失败)
   */
  extraKeys?: AttrKeyDef[]
  /** 「上限拉满」按钮的目标值(游戏硬封顶) */
  maxCapValue: number
  /** AttrName 枚举全部合法值(用于 entry 校验, 来自 dump.cs) */
  attrNameValues: number[]
  /** 容器扩容 Mod 的 BepInEx 配置文件路径(可选, 未接 Mod 的游戏不填) */
  modConfigPath?: string
  /** 容器扩容 Mod 的 overrides 文件路径(独立于 BepInEx cfg, 避免其回写打架) */
  modOverridesPath?: string
  /** 容器扩容 Mod 导出的容器清单 JSON 路径(游戏运行时由插件生成) */
  modContainersPath?: string
}
