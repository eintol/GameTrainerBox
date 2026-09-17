// 一次性实机验证: 模拟修改器"改为"输入走的折算路径(base = 显示值×1000 - 强化),
// 确认写入后 PowerManager.TotalCapacity 符合 Σ(设备容量) × (1 + 有效值/1000)
// 用本会话已定位的 PowerManager 地址(同一进程内稳定, 对象头 klass 校验防失效)
// 运行: pnpm dlx esbuild scripts/diag-power-apply.ts --bundle --platform=node --external:koffi --outfile=scripts/.diag-power-apply.cjs && node scripts/.diag-power-apply.cjs
import { GameProcess } from '../src/main/engine/process'
import { scanPlayerAttrs } from '../src/main/engine/scanner'
import { survivalLogProfile } from '../src/main/games/survival-log'

const PM = 0x1b984533580
const PM_KLASSES = new Set([0x1b5c24a4c30, 0x1b600502d10, 0x1b6ea32f1d0])
const OFF_CURRENT_STORED = 0x3c
const OFF_TOTAL_CAPACITY = 0x40
const KEY = 10004
/** 模拟用户在"改为"里填的显示值(游戏内建封顶 2.0) */
const DISPLAY_VALUE = 2.0

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main(): Promise<void> {
  const proc = GameProcess.attach(survivalLogProfile.processName)
  const f32 = (a: number): number | null => {
    const b = proc.readBytes(a, 4)
    return b ? b.readFloatLE(0) : null
  }
  if (!PM_KLASSES.has(proc.readU64(PM) ?? 0)) {
    throw new Error(`PowerManager 地址 0x${PM.toString(16)} 已失效(进程可能重启), 需重跑 diag-power-write`)
  }

  const { handles } = await scanPlayerAttrs(proc, survivalLogProfile, {
    cachePath: 'scripts/.attr_cache_test.json',
    log: (m) => console.log('  [log]', m)
  })
  const h = handles.get(KEY)
  if (!h) throw new Error(`属性 ${KEY} 不在字典中`)
  const orig = h.read()
  if (!orig) throw new Error('属性读取失败')

  // 与 trainer.displayToBase 同构的折算
  const targetBase = Math.round(DISPLAY_VALUE * survivalLogProfile.valueScale) - orig.strengthening
  console.log(
    `[基准] base=${orig.base} 强化=${orig.strengthening} max=${orig.max} | ` +
      `总容量=${f32(PM + OFF_TOTAL_CAPACITY)} 当前储能=${f32(PM + OFF_CURRENT_STORED)}`
  )
  console.log(
    `[*] 模拟"改为 ${DISPLAY_VALUE}" -> 写 base = ${DISPLAY_VALUE}×1000 - ${orig.strengthening} = ${targetBase}`
  )

  h.setBase(targetBase)
  const after = h.read()
  console.log(
    `[写入后回读] base=${after?.base} 强化=${after?.strengthening} ` +
      `-> 有效值 ${((after!.base + after!.strengthening) / 1000).toFixed(3)} (期望 ${DISPLAY_VALUE})`
  )
  for (const wait of [1500, 3000]) {
    await sleep(wait)
    console.log(`[+${wait}ms] 总容量=${f32(PM + OFF_TOTAL_CAPACITY)}`)
  }

  h.setBase(orig.base)
  console.log(`[*] 已恢复 base=${orig.base} (回读 ${h.read()?.base})`)
  await sleep(3000)
  console.log(`[恢复后] 总容量=${f32(PM + OFF_TOTAL_CAPACITY)}`)

  proc.close()
  console.log('\n[+] 验证完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
