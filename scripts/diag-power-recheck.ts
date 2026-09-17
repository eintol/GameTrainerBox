// 一次性复查: 属性 10004 已恢复 base=0 后, PowerManager.TotalCapacity 是否回退到 30000
// 地址来自 diag-power-write 本次运行(同一进程内稳定), 用对象头 klass 校验地址是否仍有效
// 运行: pnpm dlx esbuild scripts/diag-power-recheck.ts --bundle --platform=node --external:koffi --outfile=scripts/.diag-power-recheck.cjs && node scripts/.diag-power-recheck.cjs
import { GameProcess } from '../src/main/engine/process'
import { survivalLogProfile } from '../src/main/games/survival-log'

const PM = 0x1b984533580
const PM_KLASSES = new Set([0x1b5c24a4c30, 0x1b600502d10, 0x1b6ea32f1d0])
const OFF_CURRENT_STORED = 0x3c
const OFF_TOTAL_CAPACITY = 0x40
const OFF_TOTAL_GENERATION = 0x44

function main(): void {
  const proc = GameProcess.attach(survivalLogProfile.processName)
  const klass = proc.readU64(PM)
  if (klass === null || !PM_KLASSES.has(klass)) {
    console.log(
      `[!] 地址 0x${PM.toString(16)} 已失效(对象头 klass=0x${(klass ?? 0).toString(16)}), 需重新定位`
    )
    proc.close()
    process.exit(1)
  }
  const f32 = (a: number): number | null => {
    const b = proc.readBytes(a, 4)
    return b ? b.readFloatLE(0) : null
  }
  console.log(`[+] PowerManager 0x${PM.toString(16)} (klass 校验通过)`)
  console.log(`    TotalCapacity   = ${f32(PM + OFF_TOTAL_CAPACITY)}`)
  console.log(`    CurrentStored   = ${f32(PM + OFF_CURRENT_STORED)}`)
  console.log(`    TotalGeneration = ${f32(PM + OFF_TOTAL_GENERATION)}`)
  proc.close()
}

main()
