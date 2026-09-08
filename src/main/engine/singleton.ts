// IL2CPP 静态单例字段定位器(SCAD 等静态单例型游戏)
// 链路: 类名字符串 -> 指针反搜得 Il2CppClass -> static_fields -> 单例实例(对象头 klass ==
//       自身 klass 强验证) -> 实例字段读写
// 无版本相关 RVA: 类名与字段偏移来自 dump.cs, 游戏更新后只需重新 dump 核对偏移
// 坑位(实测 Unity 6000.3 / metadata v39):
//   - 类名字符串在内存映射的 global-metadata.dat 区域(MEM_MAPPED), 不在私有 RW 堆 ——
//     扫描必须覆盖全部已提交内存, 只扫私有 RW 会漏掉真 klass(见踩坑记录)
//   - Il2CppClass 布局变为 Il2CppClass_1 + static_fields@0xB8 + rgctx + _2(经典布局 0xA8),
//     偏移以 profile.staticFieldsOffset 显式给出, 探测兜底
import type { GameProcess } from './process'
import { MEM_PRIVATE } from './winapi'
import type { SingletonFieldDef, SingletonProfile } from '../games/types'

/** static_fields 偏移探测范围(Il2CppClass 0x90..0x120 步进 8; Unity 6.3 实测 0xB8) */
const SF_PROBE_MIN = 0x90
const SF_PROBE_MAX = 0x120

/** 单例字段句柄: 按原始值读写(display = 内存值, 无换算) */
export class SingletonFieldHandle {
  constructor(
    readonly proc: GameProcess,
    readonly def: SingletonFieldDef,
    readonly instance: number
  ) {}

  /** 读当前值; cap 定义存在时一并读上限字段 */
  read(): { cur: number; max: number | null } | null {
    const cur = this.readAt(this.def.offset, this.def.type)
    if (cur === null) return null
    const max = this.def.cap ? this.readAt(this.def.cap.offset, this.def.cap.type) : null
    return { cur, max }
  }

  /** 写当前值(int32 四舍五入, float32 原值); also 列表同步写同值(如 speed+speedCache) */
  write(value: number): boolean {
    const v = this.def.type === 'int32' ? Math.round(value) : value
    if (!this.writeAt(this.def.offset, this.def.type, v)) return false
    for (const off of this.def.also ?? []) {
      if (!this.writeAt(off, this.def.type, v)) return false
    }
    return true
  }

  private readAt(offset: number, type: 'int32' | 'float32'): number | null {
    const b = this.proc.readBytes(this.instance + offset, 4)
    if (!b) return null
    return type === 'int32' ? b.readInt32LE(0) : b.readFloatLE(0)
  }

  private writeAt(offset: number, type: 'int32' | 'float32', v: number): boolean {
    const buf = Buffer.alloc(4)
    if (type === 'int32') buf.writeInt32LE(v, 0)
    else buf.writeFloatLE(v, 0)
    return this.proc.writeBytes(this.instance + offset, buf)
  }
}

export interface SingletonScanResult {
  handles: Map<number, SingletonFieldHandle>
  info: string
}

function validPtr(p: number | null): p is number {
  return p !== null && p > 0x10000 && p < 0x7fffffffffff && p % 8 === 0
}

function isIdentByte(c: number): boolean {
  return (
    (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f
  )
}

/**
 * 一遍全内存扫描: 找全部精确 `name\0` 类名字符串(前一字节非标识符字符, 避免命中更长名字的
 * 中间段); 返回 类名 -> 字符串起始地址列表
 */
function findExactStrings(
  proc: GameProcess,
  classNames: string[]
): Map<string, number[]> {
  const pats = classNames.map((n) => ({ name: n, pat: Buffer.from(`${n}\0`, 'utf-8') }))
  const out = new Map<string, number[]>(classNames.map((n) => [n, []]))
  for (const { base, data } of proc.iterBlocks(proc.regions(false))) {
    for (const { name, pat } of pats) {
      let i = data.indexOf(pat)
      while (i !== -1) {
        const prev = i > 0 ? data[i - 1] : 0
        if (!isIdentByte(prev)) out.get(name)!.push(base + i)
        i = data.indexOf(pat, i + 1)
      }
    }
  }
  return out
}

/** 一遍扫描: 找指向任一目标地址的 8 字节指针, 返回 [指针所在地址, 目标地址] */
function findPointersToAny(
  proc: GameProcess,
  targets: number[]
): Array<{ at: number; to: number }> {
  const pats = targets.map((t) => {
    const p = Buffer.alloc(8)
    p.writeBigUInt64LE(BigInt(t))
    return { to: t, pat: p }
  })
  const out: Array<{ at: number; to: number }> = []
  // 只扫私有内存: klass 结构是运行时 malloc 的(MEM_PRIVATE), 模块镜像/映射元数据里
  // 不会有 name 指针; 排除它们可显著缩短这遍最贵的扫描
  const regions = proc.regions(false).filter((r) => r.type === MEM_PRIVATE)
  for (const { base, data } of proc.iterBlocks(regions)) {
    for (const { to, pat } of pats) {
      let i = data.indexOf(pat)
      while (i !== -1) {
        out.push({ at: base + i, to })
        i = data.indexOf(pat, i + 1)
      }
    }
  }
  return out
}

/** 定位类的 Il2CppClass 候选: Il2CppClass.name(偏移 0x10) 指向类名字符串 */
export function locateKlassCandidates(
  proc: GameProcess,
  className: string,
  stringAddrs: number[],
  ptrRecords: Array<{ at: number; to: number }>
): number[] {
  const out: number[] = []
  for (const s of stringAddrs) {
    for (const r of ptrRecords) {
      if (r.to !== s) continue
      const klass = r.at - 0x10
      if (!validPtr(klass)) continue
      if (!out.includes(klass)) out.push(klass)
    }
  }
  return out
}

/**
 * 解析单例实例: 对每个 klass 候选, 先试已知 static_fields 偏移(同版本所有类布局一致),
 * 再全范围探测; 验证链: klass+偏移 处是有效指针(static_fields) -> static_fields+单例偏移
 * 处是有效指针(实例) -> 实例对象头 klass == 该类 klass
 */
function resolveSingleton(
  proc: GameProcess,
  klassCandidates: number[],
  staticFieldOffset: number,
  knownSfOffset?: number
): { klass: number; sfOffset: number; instance: number } | null {
  const trySf = (
    klass: number,
    sfOffset: number
  ): { sfOffset: number; instance: number } | null => {
    const sf = proc.readU64(klass + sfOffset)
    if (!validPtr(sf)) return null
    const inst = proc.readU64(sf + staticFieldOffset)
    if (!validPtr(inst)) return null
    if (proc.readU64(inst) !== klass) return null // 对象头 klass 强验证
    return { sfOffset, instance: inst }
  }
  if (knownSfOffset !== undefined) {
    for (const klass of klassCandidates) {
      const r = trySf(klass, knownSfOffset)
      if (r) return { klass, ...r }
    }
  }
  for (const klass of klassCandidates) {
    for (let off = SF_PROBE_MIN; off <= SF_PROBE_MAX; off += 8) {
      const r = trySf(klass, off)
      if (r) return { klass, ...r }
    }
  }
  return null
}

/** 定位全部单例实例并构建字段句柄; 单例为空(主界面未进局)时抛错 */
export function scanSingletonFields(
  proc: GameProcess,
  profile: SingletonProfile,
  opts: { log?: (msg: string) => void } = {}
): SingletonScanResult {
  const { log } = opts
  // 两遍全内存扫描(全部类名的字符串一遍 + 全部指针一遍), 避免逐类重复扫
  log?.(`全内存扫描类名字符串(${profile.singletons.length} 个类, 约数秒)...`)
  const strings = findExactStrings(
    proc,
    profile.singletons.map((s) => s.className)
  )
  for (const s of profile.singletons) {
    if ((strings.get(s.className) ?? []).length === 0) {
      throw new Error(
        `未在内存中找到类名 ${s.className}; 请确认已进入存档局内, 若游戏刚更新需重新 dump 核对类名`
      )
    }
  }
  const allStringAddrs = [...strings.values()].flat()
  log?.('反搜类名字符串指针(Il2CppClass.name)...')
  const ptrRecords = findPointersToAny(proc, allStringAddrs)

  const instances = new Map<string, number>()
  const skipped = new Set<string>()
  let sfOffset: number | undefined = profile.staticFieldsOffset
  for (const s of profile.singletons) {
    const klasses = locateKlassCandidates(proc, s.className, strings.get(s.className)!, ptrRecords)
    if (klasses.length === 0) {
      throw new Error(
        `类名 ${s.className} 已找到但未定位到 Il2CppClass; 若游戏刚更新需重新 dump 核对`
      )
    }
    const r = resolveSingleton(proc, klasses, s.staticFieldOffset ?? 0, sfOffset)
    if (!r) {
      if (s.optional) {
        // 分场景游戏: 单例为空(如悬浮艇未生成)时跳过, 其字段本轮不可用
        skipped.add(s.id)
        log?.(`类 ${s.className}: 单例为空(可能不在对应场景), 跳过其字段`)
        continue
      }
      throw new Error(
        `类 ${s.className} 已定位但单例解析失败: 请进入存档局内后再扫描(主界面单例可能为空); 若已在局内则游戏版本可能已更新, 需重新 dump 核对`
      )
    }
    // 同一 Unity 版本内 Il2CppClass 布局一致, 首个类探测出的偏移供后续类复用
    sfOffset = r.sfOffset
    instances.set(s.id, r.instance)
    log?.(
      `类 ${s.className}: klass=0x${r.klass.toString(16)} static_fields+0x${r.sfOffset.toString(16)} 实例=0x${r.instance.toString(16)}`
    )
  }
  const handles = new Map<number, SingletonFieldHandle>()
  for (const def of profile.fields) {
    const inst = instances.get(def.singleton)
    if (inst === undefined) continue // 所属单例被跳过(可选单例为空), 该字段本轮不可用
    handles.set(def.key, new SingletonFieldHandle(proc, def, inst))
  }
  const skippedNote = skipped.size > 0 ? `, 跳过 ${skipped.size} 个未生成单例的字段` : ''
  return {
    handles,
    info: `${profile.singletons.length} 个单例, ${handles.size}/${profile.fields.length} 个字段${skippedNote}`
  }
}
