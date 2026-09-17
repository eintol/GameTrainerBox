// 一次性诊断: 确认储电上限倍率 AttrName.PowerStorage_Ratio(10004) 是否在主角属性字典里
// 背景: PowerManager.ApplyPowerStorageRatio 反汇编实测读该属性(10004)做乘数,
//       总储电上限 = Σ(电力家具容量) × (1 + 属性值); 改属性即可调储电上限且随存档持久化
// 运行: pnpm dlx esbuild scripts/diag-power-storage.ts --bundle --platform=node --external:koffi --outfile=scripts/.diag-power-storage.cjs && node scripts/.diag-power-storage.cjs
// 需在游戏局内(主界面时 Attr 类未初始化)
import { GameProcess } from '../src/main/engine/process'
import { scanPlayerAttrs } from '../src/main/engine/scanner'
import { survivalLogProfile } from '../src/main/games/survival-log'

// 10000 段全部键(全局倍率组, dump.cs AttrName 枚举)
const RATIO_KEYS: Array<{ key: number; name: string }> = [
  { key: 10001, name: 'MoveSpeed_Ratio' },
  { key: 10002, name: 'FurnitureInteractSpeed_Ratio' },
  { key: 10003, name: 'ExposureValue_Ratio' },
  { key: 10004, name: 'PowerStorage_Ratio(储电上限倍率)' },
  { key: 10005, name: 'SettlementBuyDiscount_Ratio' },
  { key: 10006, name: 'VehicleTravelTimeReduce_Ratio' },
  { key: 10007, name: 'LoanMaxBonus' }
]

async function main(): Promise<void> {
  const proc = GameProcess.attach(survivalLogProfile.processName)
  console.log('[+] 已附加 pid =', proc.pid)
  const { handles, info } = await scanPlayerAttrs(proc, survivalLogProfile, {
    cachePath: 'scripts/.attr_cache_test.json',
    log: (m) => console.log('  [log]', m)
  })
  console.log('[+] 扫描完成 |', info, '| 字典项数 =', handles.size)

  // 1) 10000 段逐键查询
  console.log('\n=== 10000 段(全局倍率)键存在性 ===')
  for (const { key, name } of RATIO_KEYS) {
    const h = handles.get(key)
    if (!h) {
      console.log(`  ${name}(${key}): 不在字典中`)
      continue
    }
    const r = h.read()
    if (!r) {
      console.log(`  ${name}(${key}): 读取失败`)
      continue
    }
    console.log(
      `  ${name}(${key}): base=${r.base} strengthening=${r.strengthening} condition=${r.condition} max=${r.max} min=${r.min} single=${r.single}`
    )
    console.log(
      `    -> /1000 口径: base=${r.base / 1000}, base+强化=${(r.base + r.strengthening) / 1000}, max=${r.max / 1000}, min=${r.min / 1000}`
    )
  }

  // 2) 字典全部键(排序), 与 AttrName 全集(99 值)对照看缺哪些
  const keys = [...handles.keys()].sort((a, b) => a - b)
  console.log('\n=== 字典全部键 ===')
  console.log('  数量:', keys.length)
  console.log('  ' + keys.join(', '))
  const all = new Set(survivalLogProfile.attrNameValues)
  const missing = survivalLogProfile.attrNameValues.filter((k) => !handles.has(k))
  console.log('  AttrName 全集(99)中字典缺失的键:', missing.length ? missing.join(', ') : '(无, 全集齐备)')
  console.log('  字典中不在 AttrName 全集的键:', keys.filter((k) => !all.has(k)).join(', ') || '(无)')

  proc.close()
  console.log('\n[+] 诊断完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
