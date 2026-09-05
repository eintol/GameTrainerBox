// 等待进入存档后自动执行完整扫描验证(轮询 Attr_TypeInfo 槽位)
import { GameProcess } from '../src/main/engine/process'
import { getAttrKlass, scanPlayerAttrs } from '../src/main/engine/scanner'
import { survivalLogProfile } from '../src/main/games/survival-log'

async function main(): Promise<void> {
  const proc = GameProcess.attach(survivalLogProfile.processName)
  console.log('[+] pid =', proc.pid, '- 等待进入存档(每 5 秒轮询 Attr_TypeInfo 槽位)...')
  for (let i = 0; i < 120; i++) {
    const k = getAttrKlass(proc, survivalLogProfile)
    if (k) {
      console.log('[+] 检测到 Attr_TypeInfo 有效: 0x' + k.toString(16) + ', 开始完整扫描')
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
          `  ${def.name.padEnd(4)} 当前=${d ? d.base / survivalLogProfile.valueScale : '?'} 上限=${c ? c.base + c.strengthening : '?'}`
        )
      }
      proc.close()
      process.exit(0)
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  console.log('[!] 10 分钟内未检测到进入存档')
  proc.close()
  process.exit(1)
}
main()
