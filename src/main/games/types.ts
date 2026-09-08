// 游戏适配器 profile 类型定义
// 引擎代码通用, 版本相关参数全部数据化在 profile 里; 加新游戏 = 新增一个 profile 文件
// 两种 profile 形态(按 kind 判别):
//   attr-dict        — 属性字典式(Survival Log): 堆扫描定位 Attr 字典, AttrHandle 读写
//   singleton-fields — 静态单例式(SCAD): 类名定位 Il2CppClass -> static_fields -> 单例实例 -> 字段读写

export interface GameProfileBase {
  id: string
  /** 显示名 */
  name: string
  /** 目标进程名 */
  processName: string
  /** 模块名(IL2CPP 游戏为 GameAssembly.dll) */
  moduleName: string
  /** 扫描成功后 UI 表格下方的提示文案(替代旧版硬编码提示) */
  uiHints?: string[]
  /** 容器扩容 Mod 的 BepInEx 配置文件路径(可选, 未接 Mod 的游戏不填) */
  modConfigPath?: string
  /** 容器扩容 Mod 的 overrides 文件路径(独立于 BepInEx cfg, 避免其回写打架) */
  modOverridesPath?: string
  /** 容器扩容 Mod 导出的容器清单 JSON 路径(游戏运行时由插件生成) */
  modContainersPath?: string
}

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

/** 属性字典式 profile(Survival Log) */
export interface AttrDictProfile extends GameProfileBase {
  kind: 'attr-dict'
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
}

/** 单例字段定义: 从某个静态单例实例的固定偏移读写的数值字段 */
export interface SingletonFieldDef {
  key: number
  name: string
  /** 所属单例 id(对应 singletons[].id) */
  singleton: string
  /** 实例内偏移(dump.cs 字段注释值, 含对象头 0x10) */
  offset: number
  type: 'int32' | 'float32'
  /** 上限字段(同一单例实例内的偏移+类型), 用于上限列与「拉满」 */
  cap?: { offset: number; type: 'int32' | 'float32' }
  /** 写入时同步写同值的其他偏移(如 speed 与 speedCache) */
  also?: number[]
}

/** 静态单例定义: 类的 static_fields 里指向活实例的静态字段 */
export interface SingletonDef {
  id: string
  /** IL2CPP 类名(运行时经 metadata 堆类名字符串定位 klass, 无需版本相关 RVA) */
  className: string
  /** 单例引用在 static_fields 内的偏移(默认 0, 即类声明的第一个静态字段) */
  staticFieldOffset?: number
  /**
   * 单例为空时是否允许跳过(默认 false = 必须定位成功)。
   * 用于分场景游戏: 如 SCAD 的悬浮艇只在远征局内存在, 基地/主界面时 player 为 null
   */
  optional?: boolean
}

/** 静态单例式 profile(SCAD) */
export interface SingletonProfile extends GameProfileBase {
  kind: 'singleton-fields'
  singletons: SingletonDef[]
  /** Il2CppClass 内 static_fields 指针的偏移; 不填则自动探测(0x90..0x120 步进 8) */
  staticFieldsOffset?: number
  fields: SingletonFieldDef[]
}

export type GameProfile = AttrDictProfile | SingletonProfile

/** 类型守卫: 是否属性字典式 profile */
export function isAttrDictProfile(p: GameProfile): p is AttrDictProfile {
  return p.kind === 'attr-dict'
}
