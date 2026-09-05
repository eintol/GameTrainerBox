// 一次性诊断: 打印每个候选 98 项字典的五维主属性值
import { GameProcess } from '../src/main/engine/process'
import { AttrHandle, findEntryRefs, isPlayerDict, walkDictEntries } from '../src/main/engine/scanner'
import { survivalLogProfile } from '../src/main/games/survival-log'

const proc = GameProcess.attach(survivalLogProfile.processName)
const seen = new Map<string, Map<number, number>>()
const signKeys = [
  ...survivalLogProfile.mainKeys.map((k) => k.key + survivalLogProfile.capKeyOffset),
  81012
]
for (const key of [...new Set(signKeys)]) {
  for (const ref of findEntryRefs(proc, survivalLogProfile, key)) {
    const d = walkDictEntries(proc, survivalLogProfile, ref + 16)
    if (isPlayerDict(d, survivalLogProfile) && d.size >= 60) {
      const sig = [...d.entries()].sort((a, b) => a[0] - b[0]).toString()
      if (!seen.has(sig)) seen.set(sig, d)
    }
  }
}
console.log('[+] 候选字典数:', seen.size)
let n = 0
for (const [sig, d] of seen) {
  n++
  const anchor = [...d.values()][0]
  const vals = survivalLogProfile.mainKeys
    .map((def) => {
      const h = new AttrHandle(proc, survivalLogProfile, d.get(def.key)!)
      const r = h.read()
      const c = new AttrHandle(proc, survivalLogProfile, d.get(def.key + survivalLogProfile.capKeyOffset)!)
      const cr = c.read()
      return `${def.name}=${r ? (r.base / survivalLogProfile.valueScale).toFixed(3) : '?'}(上限${cr ? cr.base + cr.strengthening : '?'})`
    })
    .join(' ')
  console.log(`#${n} size=${d.size} firstValue=0x${anchor.toString(16)}\n    ${vals}`)
}
proc.close()
