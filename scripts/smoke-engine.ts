// 引擎完整链路冒烟: 附加 -> 扫描 -> 读值 (对真实游戏进程验证 TS 引擎)
// 运行: pnpm dlx esbuild scripts/smoke-engine.ts --bundle --platform=node --external:koffi --outfile=scripts/.smoke-engine.cjs && node scripts/.smoke-engine.cjs
// 需在游戏局内(主界面时 Attr 类未初始化)
import { GameProcess } from '../src/main/engine/process'
import { scanPlayerAttrs } from '../src/main/engine/scanner'
import { survivalLogProfile } from '../src/main/games/survival-log'

async function main(): Promise<void> {
  const proc = GameProcess.attach(survivalLogProfile.processName)
  console.log('[+] 已附加 pid =', proc.pid)

  const t0 = Date.now()
  const { handles, info } = await scanPlayerAttrs(proc, survivalLogProfile, {
    cachePath: 'scripts/.attr_cache_test.json',
    log: (m) => console.log('  [log]', m)
  })
  console.log('[+] 扫描耗时', Date.now() - t0, 'ms |', info)

  for (const def of survivalLogProfile.mainKeys) {
    const h = handles.get(def.key)
    const cap = handles.get(def.key + survivalLogProfile.capKeyOffset)
    const d = h?.read()
    const c = cap?.read()
    console.log(
      `  ${def.name.padEnd(4)} 当前=${d ? d.base / survivalLogProfile.valueScale : '?'}  上限=${c ? c.base + c.strengthening : '?'}`
    )
  }

  proc.close()
  console.log('[+] 冒烟完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
