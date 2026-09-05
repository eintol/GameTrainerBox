// 主角属性字典定位器: 对应 Python 原型 scanner.py
// 快路径: 缓存锚点(attr_cache.json)直接重走 entries 数组(毫秒级), 映射每次从活动内存重新推导
// 慢路径: 一遍全堆 entry 签名扫描(hashCode==key 且 pad 恒 0) -> 遍历 -> klass 抽样校验
import * as fs from 'fs'
import * as path from 'path'
import type { GameProcess } from './process'
import type { GameProfile } from '../games/types'

const ENTRY_SIZE = 24
const WALK_LIMIT = 4096
const WINDOW = 16384
const MIN_DICT_SIZE = 10 // 1.0.15704 实测主角字典 22 项(旧版 30+); isPlayerDict 已要求全部主键+上限键, 阈值只作兜底

// IL2CPP Dictionary Entry 布局: [hashCode(4)][next(4)][key(4)][pad(4)][value指针(8)]
// int 枚举键的 hashCode == key 本身; pad 从未被写入恒为 0
export interface AttrValues {
  base: number
  strengthening: number
  condition: number
  max: number
  min: number
  single: number
}

export class AttrHandle {
  constructor(
    readonly proc: GameProcess,
    readonly profile: GameProfile,
    readonly addr: number
  ) {}

  read(): AttrValues | null {
    const o = this.profile.attrOffsets
    const b = this.proc.readBytes(this.addr + o.base, 0x18)
    if (!b) return null
    return {
      base: b.readInt32LE(0),
      strengthening: b.readInt32LE(4),
      condition: b.readInt32LE(8),
      max: b.readInt32LE(0xc),
      min: b.readInt32LE(0x10),
      single: b.readUInt8(0x14)
    }
  }

  /** 写当前值(BaseValue) */
  setBase(v: number): boolean {
    return this.proc.writeI32(this.addr + this.profile.attrOffsets.base, Math.round(v))
  }

  /** 写硬封顶字段(Max) */
  setMaxField(v: number): boolean {
    return this.proc.writeI32(this.addr + this.profile.attrOffsets.max, Math.round(v))
  }
}

/** 读 Attr 类的 Il2CppClass 指针; 未初始化(主界面)或版本变更返回 null */
export function getAttrKlass(proc: GameProcess, profile: GameProfile): number | null {
  const base = proc.moduleBase(profile.moduleName)
  if (!base) return null
  const k = proc.readU64(base + profile.attrTypeInfoRva)
  if (!k || k < 0x10000 || k > 0x7fffffffffff) return null
  if (k % 8 !== 0) return null // IL2CPP 未初始化类在此处存的是非对齐魔数
  return k
}

function validEntry(
  e: { hash: number; key: number; val: number } | null,
  nameValues: Set<number>
): boolean {
  return (
    e !== null &&
    nameValues.has(e.key) &&
    e.hash === e.key &&
    e.val > 0x10000 &&
    e.val < 0x7fffffffffff &&
    e.val % 8 === 0
  )
}

/** 从 entries 数组中某个 value 字段位置出发, 双向遍历整个数组; 返回 key -> attrAddr */
export function walkDictEntries(
  proc: GameProcess,
  profile: GameProfile,
  valueFieldAddr: number
): Map<number, number> {
  const nameValues = new Set(profile.attrNameValues)
  const start = valueFieldAddr - 16 // entry 起点
  const winBase = start - WINDOW
  const win = proc.readBytes(winBase, WINDOW * 2)

  const entryAt = (a: number): { hash: number; key: number; val: number } | null => {
    if (win && a >= winBase && a + ENTRY_SIZE <= winBase + win.length) {
      const off = a - winBase
      return {
        hash: win.readInt32LE(off),
        key: win.readInt32LE(off + 8),
        val: Number(win.readBigUInt64LE(off + 16))
      }
    }
    const b = proc.readBytes(a, ENTRY_SIZE)
    return b
      ? {
          hash: b.readInt32LE(0),
          key: b.readInt32LE(8),
          val: Number(b.readBigUInt64LE(16))
        }
      : null
  }

  const out = new Map<number, number>()
  let a = start
  for (let i = 0; i < WALK_LIMIT; i++) {
    const e = entryAt(a)
    if (!validEntry(e, nameValues)) break
    if (!out.has(e!.key)) out.set(e!.key, e!.val)
    a -= ENTRY_SIZE
  }
  a = start + ENTRY_SIZE
  for (let i = 0; i < WALK_LIMIT; i++) {
    const e = entryAt(a)
    if (!validEntry(e, nameValues)) break
    if (!out.has(e!.key)) out.set(e!.key, e!.val)
    a += ENTRY_SIZE
  }
  return out
}

/** 一遍全堆扫描: 找 entries 数组中 hash==key==key 的 entry(签名 = key+4字节零) */
export function findEntryRefs(proc: GameProcess, profile: GameProfile, key: number): number[] {
  const pat = Buffer.alloc(8)
  pat.writeInt32LE(key, 0)
  // 高 4 字节保持 0(pad)
  const refs: number[] = []
  for (const { base, data } of proc.iterBlocks()) {
    let i = data.indexOf(pat)
    while (i !== -1) {
      if (i >= 8 && data.readInt32LE(i - 8) === key) {
        refs.push(base + i - 8)
      }
      // 跨块边界(i<8)时 hash 在上一块, 跳过; 由后续签名键兜底
      i = data.indexOf(pat, i + 1)
    }
  }
  return refs
}

/** 主角字典判定: 同时含全部主键与上限键 */
export function isPlayerDict(d: Map<number, number>, profile: GameProfile): boolean {
  for (const { key } of profile.mainKeys) if (!d.has(key)) return false
  for (const { key } of profile.mainKeys) if (!d.has(key + profile.capKeyOffset)) return false
  return true
}

/** 抽样校验字典的 value 指针确实指向 klass 类的活对象(防陈旧/复用内存) */
export function validateDict(
  proc: GameProcess,
  klass: number,
  d: Map<number, number>,
  sample = 8
): boolean {
  const items = [...d.values()]
  if (items.length === 0) return false
  const step = Math.max(1, Math.floor(items.length / sample))
  for (let i = 0; i < items.length; i += step) {
    if (proc.readU64(items[i]) !== klass) return false
  }
  return true
}

interface CacheData {
  /** 缓存格式版本; 结构/鉴别逻辑变更时 +1 使旧缓存失效 */
  v: 2
  klass: number
  anchors: number[]
}

function loadCache(cachePath: string): CacheData | null {
  try {
    const d = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CacheData
    return d.v === 2 ? d : null
  } catch {
    return null
  }
}

function saveCache(cachePath: string, data: CacheData): void {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    fs.writeFileSync(cachePath, JSON.stringify(data))
  } catch {
    // 缓存写失败不影响主流程
  }
}

export interface ScanResult {
  handles: Map<number, AttrHandle>
  info: string
}

/** 定位主角属性字典; cachePath 传 null 则跳过缓存。多候选时用动态采样鉴别活字典(约 3 秒) */
export async function scanPlayerAttrs(
  proc: GameProcess,
  profile: GameProfile,
  opts: { cachePath?: string; log?: (msg: string) => void } = {}
): Promise<ScanResult> {
  const { cachePath, log } = opts
  const klass = getAttrKlass(proc, profile)
  if (!klass) {
    throw new Error(
      'Attr 类尚未初始化: 请在游戏里进入存档(局内)后再扫描; 若已在局内则游戏版本可能已更新, 需重新 dump 更新 profile'
    )
  }

  // ---- 快路径: 缓存锚点 ----
  if (cachePath) {
    const cached = loadCache(cachePath)
    if (cached && cached.klass === klass) {
      for (const anchor of cached.anchors) {
        // 锚点是 entry 起始地址, 遍历入口要转成 value 字段位置(+16)
        const d = walkDictEntries(proc, profile, anchor + 16)
        if (isPlayerDict(d, profile) && d.size >= MIN_DICT_SIZE && validateDict(proc, klass, d)) {
          log?.(`缓存命中: 锚点 0x${anchor.toString(16)}, ${d.size} 项 (跳过全堆扫描)`)
          return { handles: toHandles(d, proc, profile), info: `缓存命中, ${d.size} 项` }
        }
      }
    }
  }

  // ---- 慢路径: 一遍 entry 签名全堆扫描 ----
  log?.('开始全堆签名扫描(首次约数秒)...')
  const seen = new Map<string, { anchor: number; d: Map<number, number> }>()
  const signKeys = [...profile.mainKeys].map((k) => k.key + profile.capKeyOffset).concat([5, 1])
  for (const key of signKeys) {
    for (const ref of findEntryRefs(proc, profile, key)) {
      const d = walkDictEntries(proc, profile, ref + 16)
      if (isPlayerDict(d, profile) && d.size >= MIN_DICT_SIZE && validateDict(proc, klass, d)) {
        const sig = [...d.entries()].sort((a, b) => a[0] - b[0]).toString()
        if (!seen.has(sig)) seen.set(sig, { anchor: ref, d })
      }
    }
    if (seen.size > 0) break
  }
  if (seen.size === 0) {
    throw new Error('未能定位主角属性字典(签名扫描+遍历均失败); 请确认已进入存档(局内)')
  }

  // ---- 候选鉴别: 堆里可能同时存在 模板/镜像/活字典(klass 相同、键集相同) ----
  let pool = [...seen.values()]
  let hasLiveSignal = pool.length === 1
  if (pool.length > 1) {
    // 模板特征: 排序后前几个 entry 的 base 恰好等于键值(初始化占位)
    const isTemplate = (d: Map<number, number>): boolean => {
      const entries = [...d.entries()].sort((a, b) => a[0] - b[0]).slice(0, 5)
      return entries.every(([key, addr]) => {
        const r = new AttrHandle(proc, profile, addr).read()
        return r !== null && r.base === key
      })
    }
    const filtered = pool.filter((c) => !isTemplate(c.d))
    if (filtered.length > 0) {
      log?.(`候选字典 ${pool.length} 个, 模板过滤后剩 ${filtered.length} 个`)
      pool = filtered
    }
    // 动态采样: 活实体(主角/邻居)的属性随游玩连续变化, 模板/快照静止
    let liveIdx: number[] | null = null
    if (pool.length > 1) {
      const snap = (d: Map<number, number>): string =>
        [...d.values()]
          .slice(0, 8)
          .map((a) => {
            const r = new AttrHandle(proc, profile, a).read()
            return r ? `${r.base},${r.strengthening}` : '-'
          })
          .join('|')
      const before = pool.map((c) => snap(c.d))
      log?.('多候选并存, 动态采样鉴别活实体(3 秒)...')
      await new Promise((r) => setTimeout(r, 3000))
      const after = pool.map((c) => snap(c.d))
      const idx = pool.map((_, i) => i).filter((i) => after[i] !== before[i])
      if (idx.length > 0 && idx.length < pool.length) {
        liveIdx = idx
        log?.(`动态采样识别出 ${idx.length} 个活实体`)
      } else if (idx.length === 0) {
        log?.('采样期间所有候选均无变化(游戏可能暂停)')
      } else {
        liveIdx = null
        log?.('所有候选均在变化, 采样无区分度')
      }
    }
    // 排序: 活实体优先; 同为活实体时按"上限总分"取最大 —— 主角的上限被养成/修改器
    // 拉升, 而邻居等实体保持默认低上限(实测主角 2009 分 vs 邻居 490 分)
    const capTotal = (d: Map<number, number>): number => {
      let s = 0
      for (const def of profile.mainKeys) {
        const addr = d.get(def.key + profile.capKeyOffset)
        if (addr === undefined) continue
        const r = new AttrHandle(proc, profile, addr).read()
        if (r) s += r.base + r.strengthening
      }
      return s
    }
    pool = pool
      .map((c, i) => ({ c, cap: capTotal(c.d), live: liveIdx?.includes(i) === true }))
      .sort((a, b) => Number(b.live) - Number(a.live) || b.cap - a.cap)
      .map((x) => x.c)
    log?.(`候选排序(上限总分): ${pool.map((c) => String(capTotal(c.d))).join(', ')}(首选 ${capTotal(pool[0].d)})`)
    hasLiveSignal = liveIdx !== null && liveIdx.length > 0
  }

  const best = pool[0]
  if (cachePath && hasLiveSignal) saveCache(cachePath, { v: 2, klass, anchors: [best.anchor] })
  const note = hasLiveSignal ? '' : ', 多候选无区分度未缓存(建议游玩中重扫)'
  log?.(`定位成功: 锚点 0x${best.anchor.toString(16)}, ${best.d.size} 项 (全堆签名扫描)${note}`)
  return {
    handles: toHandles(best.d, proc, profile),
    info: `锚点 0x${best.anchor.toString(16)}, ${best.d.size} 项${note}`
  }
}

function toHandles(
  d: Map<number, number>,
  proc: GameProcess,
  profile: GameProfile
): Map<number, AttrHandle> {
  const out = new Map<number, AttrHandle>()
  for (const [key, addr] of d) out.set(key, new AttrHandle(proc, profile, addr))
  return out
}
