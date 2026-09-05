// 版本无关的 Attr_TypeInfo 槽位定位器 v3(游戏更新后 attrTypeInfoRva 失效时用)
// 原理: klass 无关签名扫描收集所有候选字典 -> 用"完整键集+稀有高位键"过滤出真 Attr 字典 ->
//       从 value 对象头投票得出真实 klass -> 模块内反搜 klass 指针 -> 候选 RVA 用完整扫描验证
// 运行: 必须在游戏局内。成功后把 RVA 更新进 profile.attrTypeInfoRva
import { GameProcess } from '../src/main/engine/process'
import { findEntryRefs, isPlayerDict, scanPlayerAttrs, walkDictEntries } from '../src/main/engine/scanner'
import { survivalLogProfile } from '../src/main/games/survival-log'

const BLOCK = 4 * 1024 * 1024

async function main(): Promise<void> {
const proc = GameProcess.attach(survivalLogProfile.processName)
const base = proc.moduleBase('GameAssembly.dll')
const MOD_SIZE = 0x6200000
console.log('[+] pid =', proc.pid, ' base = 0x' + base.toString(16))

// 1) 收集全部候选字典(签名键: 全部上限键 + 主键 + 稀有高位键)
const rareKeys = [81001, 81006, 81012, 60011, 70011]
const signKeys = [
  ...new Set([
    ...survivalLogProfile.mainKeys.map((k) => k.key + survivalLogProfile.capKeyOffset),
    ...survivalLogProfile.mainKeys.map((k) => k.key),
    ...rareKeys
  ])
]
const seen = new Map<string, Map<number, number>>()
for (const key of signKeys) {
  for (const ref of findEntryRefs(proc, survivalLogProfile, key)) {
    const d = walkDictEntries(proc, survivalLogProfile, ref + 16)
    if (isPlayerDict(d, survivalLogProfile) && d.size >= 60 && d.has(81012)) {
      const sig = [...d.entries()].sort((a, b) => a[0] - b[0]).toString()
      seen.set(sig, d)
    }
  }
}
console.log('[+] 真 Attr 字典候选(完整键集+81012):', seen.size)
if (seen.size === 0) process.exit(1)

// 2) klass 投票(全部 value 对象头)
const votes = new Map<number, number>()
for (const d of seen.values())
  for (const v of d.values()) {
    const k = proc.readU64(v)
    if (k && k > 0x10000 && k < 0x7fffffffffff && k % 8 === 0) votes.set(k, (votes.get(k) ?? 0) + 1)
  }
const sorted = [...votes.entries()].sort((a, b) => b[1] - a[1])
console.log('[+] klass 投票:', sorted.slice(0, 3).map(([k, n]) => '0x' + k.toString(16) + ' x' + n).join(', '))
const realKlass = sorted[0]?.[0]
if (!realKlass) process.exit(1)

// 3) 模块内反搜 klass 指针 -> 候选槽位 RVA
const pat = Buffer.alloc(8)
pat.writeBigUInt64LE(BigInt(realKlass))
const rvas: number[] = []
let carry = Buffer.alloc(0)
for (const r of proc.regions(false)) {
  if (r.base < base || r.base >= base + MOD_SIZE) continue
  for (let off = 0; off < r.size; off += BLOCK) {
    const n = Math.min(BLOCK, r.size - off)
    const buf = proc.readBytes(r.base + off, n)
    if (!buf) continue
    const hay = Buffer.concat([carry, buf])
    let idx = hay.indexOf(pat)
    while (idx !== -1) {
      rvas.push(r.base + off - carry.length + idx - base)
      idx = hay.indexOf(pat, idx + 1)
    }
    carry = buf.subarray(Math.max(0, buf.length - 7))
  }
}
const uniq = [...new Set(rvas)].sort((a, b) => a - b)
console.log(
  '[+] klass=0x' + realKlass.toString(16) + ' 槽位候选:',
  uniq.map((r) => '0x' + r.toString(16)).join(', ') || '(无)'
)
if (uniq.length === 0) process.exit(1)

// 4) 逐个用完整扫描验证
for (const rva of uniq) {
  const prof = { ...survivalLogProfile, attrTypeInfoRva: rva }
  try {
    const { handles, info } = await scanPlayerAttrs(proc, prof, {
      cachePath: 'scripts/.attr_locate_cache.json',
      log: () => {}
    })
    const rows = survivalLogProfile.mainKeys.map((def) => {
      const d = handles.get(def.key)?.read()
      const c = handles.get(def.key + survivalLogProfile.capKeyOffset)?.read()
      return `${def.name}=${d ? d.base / survivalLogProfile.valueScale : '?'}(上限${c ? c.base + c.strengthening : '?'})`
    })
    console.log(`[✓] RVA 0x${rva.toString(16)} 验证通过 (${info})`)
    console.log('    ' + rows.join('  '))
    console.log('[✓] 请把 profile.attrTypeInfoRva 更新为 0x' + rva.toString(16))
    proc.close()
    process.exit(0)
  } catch (e) {
    console.log(`[x] RVA 0x${rva.toString(16)} 不成立: ${e instanceof Error ? e.message.slice(0, 50) : e}`)
  }
}
console.log('[!] 所有候选都不成立')
proc.close()
process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
