// 一次性诊断: 读取移速相关键(401 MoveSpeed / 10001 MoveSpeed_Ratio)的完整字段
// 目的: 确认移速的数值口径(base 换算)与 Max/Min 封顶行为, 为 extraKeys 接 UI 提供依据
// 运行: pnpm dlx esbuild scripts/diag-movespeed.ts --bundle --platform=node --external:koffi --outfile=scripts/.diag-movespeed.cjs && node scripts/.diag-movespeed.cjs
// 需在游戏局内(主界面时 Attr 类未初始化)
import { GameProcess } from '../src/main/engine/process'
import { scanPlayerAttrs } from '../src/main/engine/scanner'
import { survivalLogProfile } from '../src/main/games/survival-log'

const KEYS: Array<{ key: number; name: string }> = [
  { key: 401, name: 'MoveSpeed' },
  { key: 10001, name: 'MoveSpeed_Ratio' },
  { key: 402, name: 'Efficiency' },
  { key: 5, name: 'Vitality(参照)' }
]

async function main(): Promise<void> {
  const proc = GameProcess.attach(survivalLogProfile.processName)
  console.log('[+] 已附加 pid =', proc.pid)
  const { handles, info } = await scanPlayerAttrs(proc, survivalLogProfile, {
    cachePath: 'scripts/.attr_cache_test.json',
    log: (m) => console.log('  [log]', m)
  })
  console.log('[+] 扫描完成 |', info, '| 字典项数 =', handles.size)

  for (const { key, name } of KEYS) {
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
      `    -> /1000 显示口径: base=${r.base / 1000}, base+强化=${(r.base + r.strengthening) / 1000}, max=${r.max / 1000}, min=${r.min / 1000}`
    )
  }

  // 写入回读验证: 键 401 base 写 3500 再恢复原值(瞬时, 不留痕迹)
  const ms = handles.get(401)
  const orig = ms?.read()
  if (ms && orig) {
    console.log('[+] 写入回读验证: base 3500 ...')
    ms.setBase(3500)
    const after = ms.read()
    console.log(`  写后回读 base=${after?.base} (${after?.base === 3500 ? 'OK' : '失败!'})`)
    ms.setBase(orig.base)
    const restored = ms.read()
    console.log(`  已恢复 base=${restored?.base} (${restored?.base === orig.base ? 'OK' : '失败!'})`)
  }

  proc.close()
  console.log('[+] 诊断完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
