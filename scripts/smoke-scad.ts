// SCAD 引擎冒烟: 附加 -> 单例定位 -> 读值 (对真实游戏进程验证 TS 引擎)
// 运行: pnpm dlx esbuild scripts/smoke-scad.ts --bundle --platform=node --external:koffi --outfile=scripts/.smoke-scad.cjs && node scripts/.smoke-scad.cjs
// 加 --write 额外做一次写入回环验证(废料 +1 再还原, 净变化为零)
// 需在游戏内(资源在基地/远征均可; 生命/护盾/移速需远征局内)
import { GameProcess } from '../src/main/engine/process'
import { scanSingletonFields } from '../src/main/engine/singleton'
import { scadProfile } from '../src/main/games/scad'

async function main(): Promise<void> {
  const doWrite = process.argv.includes('--write')
  const proc = GameProcess.attach(scadProfile.processName)
  console.log('[+] 已附加 pid =', proc.pid)

  const t0 = Date.now()
  const { handles, info } = scanSingletonFields(proc, scadProfile, {
    log: (m) => console.log('  [log]', m)
  })
  console.log('[+] 扫描耗时', Date.now() - t0, 'ms |', info)

  for (const def of scadProfile.fields) {
    const h = handles.get(def.key)
    const d = h?.read()
    console.log(`  ${def.name.padEnd(4)} 当前=${d ? d.cur : '(单例未生成)'}  上限=${d?.max ?? '—'}`)
  }

  if (doWrite) {
    const h = handles.get(1) // 废料
    const before = h?.read()
    if (!h || before === null || before === undefined) {
      console.error('[!] 写入回环: 废料句柄不可用')
      process.exit(1)
    }
    const v = Math.round(before.cur)
    console.log(`[+] 写入回环: 废料 ${v} -> ${v + 1} -> ${v}`)
    if (!h.write(v + 1)) {
      console.error('[!] 写入失败')
      process.exit(1)
    }
    const up = h.read()
    console.log(`  +1 后读回 = ${up ? Math.round(up.cur) : '?'}`)
    if (!up || Math.round(up.cur) !== v + 1) {
      console.error('[!] 回环失败: +1 未生效(可能被游戏即时覆盖)')
      process.exit(1)
    }
    if (!h.write(v)) {
      console.error('[!] 还原写入失败')
      process.exit(1)
    }
    const back = h.read()
    console.log(`  还原后读回 = ${back ? Math.round(back.cur) : '?'}`)
    if (!back || Math.round(back.cur) !== v) {
      console.error('[!] 回环失败: 还原未生效')
      process.exit(1)
    }
    console.log('[+] 写入回环通过(净变化为零)')
  }

  proc.close()
  console.log('[+] 冒烟完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

