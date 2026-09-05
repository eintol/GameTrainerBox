// main / preload / renderer 三端共享的 IPC 常量与类型

export const IPC = {
  appInfo: 'app:info',
  /** 游戏卡片列表(含进程运行状态) */
  gameList: 'game:list',
  gameScan: 'game:scan',
  gameGetAttrs: 'game:getAttrs',
  gameSetAttr: 'game:setAttr',
  gameSetMax: 'game:setMax',
  gameSetLock: 'game:setLock',
  /** 读取容器扩容 Mod 配置(直写插件 BepInEx 配置文件, 不依赖进程附加) */
  modGetConfig: 'mod:getConfig',
  /** 修改容器扩容 Mod 配置(部分字段更新) */
  modSetConfig: 'mod:setConfig',
  /** 读取容器清单(插件在游戏内导出, 进局内后完整) */
  modListContainers: 'mod:listContainers',
  /** 主进程 -> 渲染进程 日志推送(事件, 非 invoke) */
  gameLog: 'game:log'
} as const

export interface AppInfo {
  version: string
  electron: string
  node: string
  chrome: string
}

/** 游戏卡片(首页列表项) */
export interface GameMeta {
  id: string
  /** 显示名 */
  name: string
  /** 目标进程名 */
  processName: string
  /** 进程当前是否在运行 */
  running: boolean
}

/** 属性行(UI 展示口径: 显示值) */
export interface AttrRow {
  key: number
  name: string
  curDisplay: number
  maxDisplay: number | null
}

export interface ScanResultDto {
  ok: boolean
  message: string
  attrs: AttrRow[]
}

export interface LogEntry {
  time: string
  message: string
}

/** 每容器的绝对格子目标(只扩不缩) */
export interface ContainerOverride {
  /** Config_Bag.ID */
  id: number
  cols: number
  rows: number
}

/** 容器扩容 Mod 配置状态(与游戏侧 BepInEx cfg 同源) */
export interface ModConfigState {
  /** 配置文件是否存在(false = 未安装 Mod 或游戏还没启动过一次) */
  available: boolean
  /** 是否启用扩容 */
  enableResize: boolean
  /** 每容器独立目标; 未列出的容器保持原始大小 */
  overrides: ContainerOverride[]
}

/** 容器扩容 Mod 配置的部分更新载荷 */
export interface ModConfigPatch {
  enableResize?: boolean
  overrides?: ContainerOverride[]
}

/** 容器清单项(插件从游戏 Config_Bag 导出) */
export interface ContainerInfo {
  id: number
  /** 原始名称(本地化键, 如 Bag_Name_1) */
  name: string
  /** 本地化名称(中文; 缺失时与 name 相同) */
  localName: string
  /** 当前格子列数(已含扩容) */
  cols: number
  /** 当前格子行数(已含扩容) */
  rows: number
  /** 原始列数(本次游戏启动首次记录) */
  origCols: number
  /** 原始行数 */
  origRows: number
  /** 局内存在活实例(ReduxUI BagCache 中有 owner 引用) */
  inUse: boolean
}

// preload 暴露给渲染进程的 API 形状(contextBridge 白名单)
export interface GameTrainerBoxApi {
  getAppInfo(): Promise<AppInfo>
  /** 首页游戏卡片列表(含运行状态) */
  listGames(): Promise<GameMeta[]>
  /** 附加指定游戏进程并扫描主角属性字典 */
  scanGame(gameId: string): Promise<ScanResultDto>
  /** 刷新属性当前值(渲染层轮询) */
  getAttrs(): Promise<AttrRow[]>
  /** 按显示值写入当前值 */
  setAttr(key: number, value: number): Promise<boolean>
  /** 一键上限拉满(游戏硬封顶) */
  setMax(key: number): Promise<boolean>
  /** 开关锁定(enabled=true 时以 target 显示值为目标高频写回) */
  setLock(key: number, enabled: boolean, target: number): Promise<boolean>
  /** 读取容器扩容 Mod 配置(不依赖进程附加) */
  getModConfig(gameId: string): Promise<ModConfigState>
  /** 修改容器扩容 Mod 配置(部分字段更新), 返回更新后的完整状态 */
  setModConfig(gameId: string, patch: ModConfigPatch): Promise<ModConfigState>
  /** 读取容器清单(插件生成, 未生成时返回空数组) */
  listContainers(gameId: string): Promise<ContainerInfo[]>
  /** 订阅主进程日志, 返回取消订阅函数 */
  onLog(cb: (entry: LogEntry) => void): () => void
}
