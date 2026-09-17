// 一次性诊断: 写入验证 —— 改主角属性 10004(PowerStorage_Ratio) 是否真的改变 PowerManager.TotalCapacity
// 背景: dump.cs + 反汇编实测, 总储电上限 = Σ(电力家具容量) × (1 + 属性10004值/1000)
// 定位链: Attr klass(profile 已知 RVA) → 探测 Il2CppClass.name 偏移 → 类名字符串反搜定位
//         BattleLogicWorld(BaseSingleton 静态单例) klass → 对象头反搜实例 → +0x188 PowerManager
//         → +0x40 TotalCapacity / +0x3C CurrentStoredPower
// 运行: pnpm dlx esbuild scripts/diag-power-write.ts --bundle --platform=node --external:koffi --outfile=scripts/.diag-power-write.cjs && node scripts/.diag-power-write.cjs
// 需在游戏局内。写入为瞬时(改后恢复原值), 但属性进存档 —— 窗口期内若游戏自动存档会留下改动痕迹
import { GameProcess } from '../src/main/engine/process'
import { getAttrKlass, scanPlayerAttrs } from '../src/main/engine/scanner'
import { survivalLogProfile } from '../src/main/games/survival-log'

const KEY_POWER_STORAGE_RATIO = 10004
// BattleLogicWorld 持有的 PowerManager 字段偏移(dump.cs: 280401)
const OFF_WORLD_TO_POWER_MANAGER = 0x188
// PowerManager 字段偏移(dump.cs: PowerManager @ TypeDefIndex 5135)
const OFF_CUR_POWER_VALUE = 0x34 // int   CurPowerValue
const OFF_MAX_POWER_VALUE = 0x38 // int   MaxPowerValue
const OFF_CURRENT_STORED = 0x3c // float CurrentStoredPower
const OFF_TOTAL_CAPACITY = 0x40 // float TotalCapacity
const OFF_TOTAL_GENERATION = 0x44 // float TotalGeneration

// 探针写入值: 不超过该属性内建 max=2000(实测), 避免触发越界校验
const PROBE_BASE = 1000

interface PtrRecord {
  at: number
  to: number
}

function isIdentByte(c: number): boolean {
  return (
    (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f
  )
}

function validPtr(p: number | null): p is number {
  return p !== null && p > 0x10000 && p < 0x7fffffffffff && p % 8 === 0
}

/** 全内存搜 `name\0` 字符串; strict=true 时要求前字节非标识符(排除更长名称的中间段) */
function findClassStrings(
  proc: GameProcess,
  names: string[],
  strict = true
): Map<string, number[]> {
  const pats = names.map((n) => ({ name: n, pat: Buffer.from(`${n}\0`, 'utf-8') }))
  const out = new Map<string, number[]>(names.map((n) => [n, []]))
  for (const { base, data } of proc.iterBlocks(proc.regions(false))) {
    for (const { name, pat } of pats) {
      let i = data.indexOf(pat)
      while (i !== -1) {
        const prev = i > 0 ? data[i - 1] : 0
        if (!strict || !isIdentByte(prev)) out.get(name)!.push(base + i)
        i = data.indexOf(pat, i + 1)
      }
    }
  }
  return out
}

/** 把地址当 C 字符串读; 非全可打印 ASCII 时返回 null */
function tryReadAscii(proc: GameProcess, addr: number, max = 64): string | null {
  const b = proc.readBytes(addr, max)
  if (!b) return null
  const z = b.indexOf(0)
  if (z <= 0) return null
  for (let i = 0; i < z; i++) {
    const c = b[i]
    if (c < 0x20 || c > 0x7e) return null
  }
  return b.toString('ascii', 0, z)
}

/** 私有 RW 区一遍扫描: 找指向任一目标地址的 8 字节指针 */
function findPointersTo(proc: GameProcess, targets: number[]): PtrRecord[] {
  const pats = targets.map((t) => {
    const p = Buffer.alloc(8)
    p.writeBigUInt64LE(BigInt(t))
    return { to: t, pat: p }
  })
  const out: PtrRecord[] = []
  for (const { base, data } of proc.iterBlocks(proc.regions(true))) {
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

function readCStr(proc: GameProcess, addr: number | null, max = 96): string {
  // 字符串指针指向 metadata 字符串堆, 不保证 8 字节对齐, 只做范围检查
  if (addr === null || addr <= 0x10000 || addr >= 0x7fffffffffff) return '(无效指针)'
  const b = proc.readBytes(addr, max)
  if (!b) return '(读取失败)'
  const z = b.indexOf(0)
  return b.toString('utf-8', 0, z === -1 ? max : z)
}

function readF32(proc: GameProcess, addr: number): number | null {
  const b = proc.readBytes(addr, 4)
  return b ? b.readFloatLE(0) : null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main(): Promise<void> {
  const proc = GameProcess.attach(survivalLogProfile.processName)
  const base = proc.moduleBase(survivalLogProfile.moduleName)
  if (!base) throw new Error('模块基址获取失败')
  console.log('[+] pid =', proc.pid, ' moduleBase = 0x' + base.toString(16))

  // ---- 1) 用已知 Attr klass 探测 Il2CppClass.name 偏移(不硬编码布局假设) ----
  const attrKlass = getAttrKlass(proc, survivalLogProfile)
  if (!attrKlass) throw new Error('Attr klass 未初始化 —— 请在游戏局内运行')
  console.log('[+] Attr klass = 0x' + attrKlass.toString(16))

  const strings = findClassStrings(proc, ['Attr', 'BattleLogicWorld', 'PowerManager'], false)
  const attrStrAddrs = strings.get('Attr')!
  console.log(
    `[*] 类名字符串命中: Attr=${attrStrAddrs.length} BattleLogicWorld=${strings.get('BattleLogicWorld')!.length} PowerManager=${strings.get('PowerManager')!.length}`
  )
  if (attrStrAddrs.length === 0) throw new Error('未找到 "Attr" 字符串')

  // Il2CppClass 布局探测: 打印各 8 字节槽位及其指向的字符串, 用于确定 name/namespaze 偏移
  // 注意: 字符串指针指向 metadata 字符串堆, 天然不保证 8 字节对齐 —— 只做范围检查
  const plausible = (a: number | null): a is number =>
    a !== null && a > 0x10000 && a < 0x7fffffffffff
  console.log('[*] Il2CppClass 布局探测(前 0x100 字节):')
  for (let off = 0; off < 0x100; off += 8) {
    const p = proc.readU64(attrKlass + off)
    let note = ''
    if (plausible(p)) {
      const s = tryReadAscii(proc, p)
      if (s !== null) note = ` -> "${s}"${attrStrAddrs.includes(p) ? '  <== "Attr" 字符串' : ''}`
      else {
        const raw = proc.readBytes(p, 24)
        note = raw
          ? ` -> raw[${raw.toString('hex').match(/../g)!.join(' ')}]  ascii="${raw.toString('latin1').replace(/[^\x20-\x7e]/g, '.')}"`
          : ' -> (读取失败/未提交)'
      }
    }
    console.log(`    +0x${off.toString(16).padStart(2, '0')}: 0x${(p ?? 0).toString(16).padStart(12, '0')}${note}`)
  }

  let nameOffset = -1
  for (let off = 0; off < 0x1000; off += 8) {
    const p = proc.readU64(attrKlass + off)
    if (plausible(p) && attrStrAddrs.includes(p)) {
      nameOffset = off
      break
    }
  }
  if (nameOffset < 0) throw new Error('未能在 Il2CppClass 中探测到 name 偏移')
  console.log(
    `[+] Il2CppClass.name 偏移 = 0x${nameOffset.toString(16)} ` +
      `(Attr.name="${readCStr(proc, proc.readU64(attrKlass + nameOffset))}", ` +
      `namespaze="${readCStr(proc, proc.readU64(attrKlass + nameOffset + 8))}")`
  )

  // ---- 2) 定位 BattleLogicWorld / PowerManager 的 Il2CppClass ----
  // 反搜目标只用后两个类名: "Attr" 的命中过多(1271 个, 含大量子串误命中), 做指针反搜太慢
  const allStrAddrs = [...strings.get('BattleLogicWorld')!, ...strings.get('PowerManager')!]
  const strPtrs = findPointersTo(proc, allStrAddrs)
  const klassFromString = (name: string): number[] => {
    const addrs = new Set(strings.get(name)!)
    const out = new Set<number>()
    for (const r of strPtrs) {
      if (!addrs.has(r.to)) continue
      const k = r.at - nameOffset
      if (validPtr(k) && readCStr(proc, proc.readU64(k + nameOffset)) === name) out.add(k)
    }
    return [...out]
  }
  const worldKlasses = klassFromString('BattleLogicWorld')
  const pmKlasses = klassFromString('PowerManager')
  console.log(
    `[+] BattleLogicWorld klass 候选: ${worldKlasses.map((k) => '0x' + k.toString(16)).join(', ') || '(无)'}`
  )
  console.log(
    `[+] PowerManager klass 候选: ${pmKlasses.map((k) => '0x' + k.toString(16)).join(', ') || '(无)'}`
  )
  if (worldKlasses.length === 0 || pmKlasses.length === 0) throw new Error('类定位失败')

  // ---- 3) 对象头反搜 BattleLogicWorld 实例 -> +0x188 PowerManager ----
  const readPower = (pm: number): Record<string, number | null> => ({
    curPowerValue: proc.readI32(pm + OFF_CUR_POWER_VALUE),
    maxPowerValue: proc.readI32(pm + OFF_MAX_POWER_VALUE),
    currentStored: readF32(proc, pm + OFF_CURRENT_STORED),
    totalCapacity: readF32(proc, pm + OFF_TOTAL_CAPACITY),
    totalGeneration: readF32(proc, pm + OFF_TOTAL_GENERATION)
  })

  let powerManager: number | null = null
  for (const r of findPointersTo(proc, worldKlasses)) {
    const pm = proc.readU64(r.at + OFF_WORLD_TO_POWER_MANAGER)
    if (!validPtr(pm)) continue
    const klass = proc.readU64(pm)
    if (!pmKlasses.includes(klass)) continue
    console.log(
      `[+] 命中: BattleLogicWorld 实例 0x${r.at.toString(16)} -> PowerManager 0x${pm.toString(16)}` +
        `(klass 校验通过, 对象字段: ${JSON.stringify(readPower(pm))})`
    )
    if (!powerManager) powerManager = pm
  }
  if (!powerManager) throw new Error('未定位到 PowerManager 实例(可能不在局内或其字段为 null)')
  const pm = powerManager

  // ---- 4) 属性写入回环: 基准 -> 探针值 -> 恢复 ----
  const { handles } = await scanPlayerAttrs(proc, survivalLogProfile, {
    cachePath: 'scripts/.attr_cache_test.json',
    log: (m) => console.log('  [log]', m)
  })
  const attr = handles.get(KEY_POWER_STORAGE_RATIO)
  if (!attr) throw new Error('属性 10004 不在字典中')
  const orig = attr.read()
  if (!orig) throw new Error('属性 10004 读取失败')

  const fmt = (p: Record<string, number | null>): string =>
    `总容量=${p.totalCapacity} 当前储能=${p.currentStored} 发电=${p.totalGeneration} ` +
    `Cur=${p.curPowerValue} Max=${p.maxPowerValue}`

  console.log('\n=== 写入验证 ===')
  const p0 = readPower(pm)
  console.log(`[基准] 属性10004 base=${orig.base} 强化=${orig.strengthening} max=${orig.max} | ${fmt(p0)}`)

  attr.setBase(PROBE_BASE)
  console.log(`[*] 已写 base=${PROBE_BASE} (总倍率 1+(1000+${orig.strengthening})/1000)`)
  const p1 = readPower(pm)
  console.log(`[立即] ${fmt(p1)}`)
  for (const wait of [1000, 3000, 6000]) {
    await sleep(wait)
    const pn = readPower(pm)
    console.log(`[+${wait}ms] ${fmt(pn)}`)
  }

  attr.setBase(orig.base)
  console.log(`[*] 已恢复 base=${orig.base}`)
  await sleep(2000)
  const p2 = readPower(pm)
  console.log(`[恢复后] ${fmt(p2)}`)
  const back = attr.read()
  console.log(`[属性回读] base=${back?.base} (原始 ${orig.base})`)

  proc.close()
  console.log('\n[+] 诊断完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
