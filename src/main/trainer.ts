// 业务层: 组合内存引擎与游戏 profile, 提供 IPC 面向的状态机
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { GameProcess } from './engine/process'
import { AttrHandle, scanPlayerAttrs } from './engine/scanner'
import type { GameProfile } from './games/types'
import { survivalLogProfile } from './games/survival-log'
import type { ContainerInfo, ContainerOverride, GameMeta, ModConfigPatch, ModConfigState } from '../shared'

export type LogFn = (msg: string) => void

export interface AttrRow {
  key: number
  name: string
  /** 当前显示值(base / valueScale) */
  curDisplay: number
  /** 上限显示值(主属性 = 上限键 base+强化; 附加键 = 自身硬封顶字段 Max) */
  maxDisplay: number | null
  /** 是否有独立上限键(附加键如移速没有) */
  hasCap: boolean
}

const LOCK_INTERVAL_MS = 300

/** 解析 BepInEx cfg(TOML 子集): 返回扁平 Key -> Value(忽略注释与段, 本插件只有 General 段) */
function parseBepInxCfg(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('[')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    let val = line.slice(eq + 1).trim()
    const hash = val.indexOf('#')
    if (hash >= 0) val = val.slice(0, hash).trim()
    out[line.slice(0, eq).trim()] = val
  }
  return out
}

/** 原位替换 `Key = ...` 行的值; Key 不存在时追加到 [General] 段末尾 */
function upsertCfgKey(text: string, key: string, value: string): string {
  const re = new RegExp(`^(\\s*${key}\\s*=\\s*)(.*)$`, 'm')
  if (re.test(text)) return text.replace(re, `$1${value}`)
  const section = text.match(/^[ \t]*\[General\][ \t]*$/m)
  if (!section || section.index === undefined) return `${text}\n${key} = ${value}\n`
  const insertAt = section.index + section[0].length
  return `${text.slice(0, insertAt)}\n${key} = ${value}${text.slice(insertAt)}`
}

/** 解析 "1:20:16,1001:12:8" -> [{id:1,cols:20,rows:16}, ...]; 非法段忽略 */
function parseOverrides(s: string): ContainerOverride[] {
  const out: ContainerOverride[] = []
  for (const seg of s.split(',')) {
    const parts = seg.trim().split(':')
    if (parts.length !== 3) continue
    const id = Number.parseInt(parts[0], 10)
    const cols = Number.parseInt(parts[1], 10)
    const rows = Number.parseInt(parts[2], 10)
    if (Number.isInteger(id) && id > 0 && Number.isInteger(cols) && cols >= 2 && Number.isInteger(rows) && rows >= 2)
      out.push({ id, cols, rows })
  }
  return out
}

/** 序列化为插件可解析的 "id:列:行" 逗号串 */
function serializeOverrides(list: ContainerOverride[]): string {
  return list
    .filter((o) => Number.isInteger(o.id) && o.id > 0 && Number.isInteger(o.cols) && Number.isInteger(o.rows))
    .map((o) => `${o.id}:${o.cols}:${o.rows}`)
    .join(',')
}

export class TrainerService {
  private proc: GameProcess | null = null
  private handles: Map<number, AttrHandle> = new Map()
  /** 已注册的游戏 profile(加游戏 = register 一个 profile) */
  private profiles = new Map<string, GameProfile>()
  /** 当前选中的游戏 id(scan 时设置) */
  private currentId: string | null = null
  /** 锁定表: key -> 目标显示值 */
  private locks = new Map<number, number>()
  private lockTimer: NodeJS.Timeout | null = null
  private log: LogFn

  constructor(log: LogFn) {
    this.log = log
    this.register(survivalLogProfile)
  }

  private register(p: GameProfile): void {
    this.profiles.set(p.id, p)
  }

  private get profile(): GameProfile {
    if (!this.currentId) throw new Error('尚未选择游戏')
    return this.profiles.get(this.currentId)!
  }

  private get cachePath(): string {
    return path.join(app.getPath('userData'), 'attr_cache.json')
  }

  get attached(): boolean {
    return this.proc !== null && this.proc.alive
  }

  /** 首页游戏卡片列表(含进程运行状态) */
  listGames(): GameMeta[] {
    return [...this.profiles.values()].map((p) => ({
      id: p.id,
      name: p.name,
      processName: p.processName,
      running: GameProcess.findPids(p.processName).length > 0
    }))
  }

  /** 附加指定游戏进程并扫描主角属性字典(多候选鉴别含 3 秒动态采样) */
  async scan(gameId: string): Promise<{ info: string }> {
    const p = this.profiles.get(gameId)
    if (!p) throw new Error(`未知游戏: ${gameId}`)
    this.currentId = gameId
    this.detach()
    this.proc = GameProcess.attach(p.processName)
    this.log(`已附加 ${p.processName} (pid=${this.proc.pid})`)
    const { handles, info } = await scanPlayerAttrs(this.proc, p, {
      cachePath: this.cachePath,
      log: this.log
    })
    this.handles = handles
    return { info }
  }

  /** 读取主属性行(供 UI 展示); extraKeys(如移速)的上限列显示自身硬封顶字段 Max */
  getAttrs(): AttrRow[] {
    if (!this.attached) return []
    const rows: AttrRow[] = []
    for (const def of this.profile.mainKeys) {
      const h = this.handles.get(def.key)
      const capH = this.handles.get(def.key + this.profile.capKeyOffset)
      if (!h) continue
      const d = h.read()
      if (!d) continue
      const cap = capH?.read() ?? null
      rows.push({
        key: def.key,
        name: def.name,
        curDisplay: d.base / this.profile.valueScale,
        maxDisplay: cap ? cap.base + cap.strengthening : null,
        hasCap: true
      })
    }
    for (const def of this.profile.extraKeys ?? []) {
      const h = this.handles.get(def.key)
      if (!h) continue
      const d = h.read()
      if (!d) continue
      rows.push({
        key: def.key,
        name: def.name,
        curDisplay: d.base / this.profile.valueScale,
        maxDisplay: d.max / this.profile.valueScale,
        hasCap: false
      })
    }
    return rows
  }

  /** 按显示值写入当前值; 目标超过属性自身硬封顶(Max)时一并抬高(否则游戏消费侧会被封顶) */
  setAttr(key: number, displayValue: number): boolean {
    const h = this.handles.get(key)
    if (!h) {
      this.log(`[!] 写入失败: 键 ${key} 不在已扫描字典中`)
      return false
    }
    const base = Math.round(displayValue * this.profile.valueScale)
    const d = h.read()
    if (d && base > d.max && !h.setMaxField(base)) {
      this.log('[!] 硬封顶字段写入失败')
      return false
    }
    if (!h.setBase(base)) {
      this.log('[!] 内存写入失败')
      return false
    }
    this.log(`${this.keyName(key)} 已写入 ${displayValue} (界面数值在下个回合/属性变动时刷新)`)
    return true
  }

  /** 一键上限拉满到游戏硬封顶(profile.maxCapValue) */
  setMax500(key: number): boolean {
    const capH = this.handles.get(key + this.profile.capKeyOffset)
    if (!capH) {
      this.log(`[!] 上限键 ${key + this.profile.capKeyOffset} 不在已扫描字典中`)
      return false
    }
    const d = capH.read()
    if (!d) return false
    const target = this.profile.maxCapValue
    const base = target - d.strengthening
    if (!capH.setBase(base)) {
      this.log('[!] 内存写入失败')
      return false
    }
    // 硬封顶字段(Max)保持不低于目标值
    if (d.max < target) capH.setMaxField(target)
    this.log(`${this.keyName(key)}上限已设为 ${target} (base=${base} + 强化${d.strengthening})`)
    return true
  }

  /** 开关锁定; enabled=true 时以 target 为目标高频写回 */
  setLock(key: number, enabled: boolean, target: number): boolean {
    if (enabled) {
      if (!this.handles.has(key)) return false
      this.locks.set(key, target)
      this.log(`${this.keyName(key)} 已锁定为 ${target}`)
    } else {
      this.locks.delete(key)
      this.log(`${this.keyName(key)} 已解除锁定`)
    }
    this.ensureLockLoop()
    return true
  }

  private ensureLockLoop(): void {
    if (this.locks.size === 0) {
      if (this.lockTimer) {
        clearInterval(this.lockTimer)
        this.lockTimer = null
      }
      return
    }
    if (this.lockTimer) return
    this.lockTimer = setInterval(() => {
      if (!this.attached) return
      try {
        for (const [key, target] of this.locks) {
          const h = this.handles.get(key)
          if (h) h.setBase(target * this.profile.valueScale)
        }
      } catch {
        // 进程退出等瞬时错误, 下个周期重试
      }
    }, LOCK_INTERVAL_MS)
  }

  detach(): void {
    this.locks.clear()
    this.ensureLockLoop()
    this.handles.clear()
    if (this.proc) {
      this.proc.close()
      this.proc = null
    }
  }

  /** 读取容器扩容 Mod 配置(EnableResize 在 BepInEx cfg; Overrides 在独立文件, 不依赖进程附加) */
  getModConfig(gameId: string): ModConfigState {
    const p = this.profiles.get(gameId)
    const defaults: ModConfigState = {
      available: false,
      enableResize: false,
      overrides: []
    }
    if (!p?.modConfigPath) return defaults
    const kv = fs.existsSync(p.modConfigPath)
      ? parseBepInxCfg(fs.readFileSync(p.modConfigPath, 'utf-8'))
      : {}
    let overrides: ContainerOverride[] = []
    if (p.modOverridesPath && fs.existsSync(p.modOverridesPath)) {
      try {
        overrides = parseOverrides(fs.readFileSync(p.modOverridesPath, 'utf-8').trim())
      } catch {
        overrides = []
      }
    }
    return {
      available: fs.existsSync(p.modConfigPath),
      enableResize: (kv.EnableResize ?? 'false').trim().toLowerCase() === 'true',
      overrides
    }
  }

  /** 修改容器扩容 Mod 配置: EnableResize 原位改写 cfg; Overrides 写独立文件 */
  setModConfig(gameId: string, patch: ModConfigPatch): ModConfigState {
    const p = this.profiles.get(gameId)
    if (!p?.modConfigPath) throw new Error(`游戏 ${gameId} 未配置容器扩容 Mod`)
    if (!fs.existsSync(p.modConfigPath)) {
      throw new Error('未找到 Mod 配置文件, 请先启动一次游戏让插件生成配置')
    }
    if (patch.enableResize !== undefined) {
      let text = fs.readFileSync(p.modConfigPath, 'utf-8')
      text = upsertCfgKey(text, 'EnableResize', patch.enableResize ? 'true' : 'false')
      fs.writeFileSync(p.modConfigPath, text, 'utf-8')
    }
    if (patch.overrides !== undefined && p.modOverridesPath) {
      fs.writeFileSync(p.modOverridesPath, serializeOverrides(patch.overrides), 'utf-8')
    }
    this.log('容器扩容配置已写入 (游戏运行中约 3 秒内热生效)')
    return this.getModConfig(gameId)
  }

  /** 读取插件导出的容器清单(游戏运行时生成, 进局内后完整) */
  listContainers(gameId: string): ContainerInfo[] {
    const p = this.profiles.get(gameId)
    if (!p?.modContainersPath || !fs.existsSync(p.modContainersPath)) return []
    try {
      const data = JSON.parse(fs.readFileSync(p.modContainersPath, 'utf-8')) as {
        containers?: Array<{
          id: number
          name?: string
          local?: string
          cols?: number
          rows?: number
          origCols?: number
          origRows?: number
          inUse?: boolean
        }>
      }
      return (data.containers ?? [])
        .filter((c) => Number.isFinite(c.id))
        .map((c) => ({
          id: c.id,
          name: c.name ?? '',
          localName: c.local || c.name || '',
          cols: c.cols ?? c.origCols ?? 0,
          rows: c.rows ?? c.origRows ?? 0,
          origCols: c.origCols ?? c.cols ?? 0,
          origRows: c.origRows ?? c.rows ?? 0,
          inUse: c.inUse === true
        }))
        .sort((a, b) => a.id - b.id)
    } catch {
      return []
    }
  }

  private keyName(key: number): string {
    const all = [...this.profile.mainKeys, ...(this.profile.extraKeys ?? [])]
    return all.find((k) => k.key === key)?.name ?? `键${key}`
  }
}
