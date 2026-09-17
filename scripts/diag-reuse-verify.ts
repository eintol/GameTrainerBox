// 复用校验链验证(Survival Log): 扫描一次拿到锚点与句柄, 再按 trainer.verifyDict 的逻辑原地
// 重走锚点, 确认"字典还在原处、每个属性的实例地址未变"(复用判定应通过), 并验证伪锚点会被拒
// 运行: pnpm dlx esbuild scripts/diag-reuse-verify.ts --bundle --platform=node --external:koffi --outfile=scripts/.diag-reuse-verify.cjs && node scripts/.diag-reuse-verify.cjs
// 需在游戏局内(主界面时 Attr 类未初始化)
import { GameProcess } from '../src/main/engine/process'
import {
  findEntryRefs,
  getAttrKlass,
  isPlayerDict,
  scanPlayerAttrs,
  walkDictEntries
} from '../src/main/engine/scanner'
import { survivalLogProfile } from '../src/main/games/survival-log'

async function main(): Promise<void> {
  const proc = GameProcess.attach(survivalLogProfile.processName)
  console.log('[+] 已附加 pid =', proc.pid)

  const t0 = Date.now()
  const { handles, info, anchor } = await scanPlayerAttrs(proc, survivalLogProfile, {
    cachePath: 'scripts/.attr_cache_test.json',
    log: (m) => console.log('  [log]', m)
  })
  console.log(`[+] 扫描耗时 ${Date.now() - t0} ms | ${info} | 锚点=0x${anchor.toString(16)}`)

  const klass = getAttrKlass(proc, survivalLogProfile)
  console.log('[+] Attr 类 =', klass === null ? 'null' : `0x${klass.toString(16)}`)

  // 与 trainer.verifyDict 同逻辑: 锚点重走 + 逐项比对实例地址
  const sameAsHandles = (d: Map<number, number>): boolean => {
    if (!isPlayerDict(d, survivalLogProfile) || d.size !== handles.size) return false
    for (const [key, addr] of d) if (handles.get(key)?.addr !== addr) return false
    return true
  }

  const t1 = Date.now()
  const d = walkDictEntries(proc, survivalLogProfile, anchor + 16)
  const ok = sameAsHandles(d)
  console.log(
    `[+] 锚点重走耗时 ${Date.now() - t1} ms | 项数 ${d.size}/${handles.size} | 地址一致=${ok}` +
      ` → 复用判定 ${ok ? '通过' : '拒绝'}(应通过)`
  )

  // 负向 1: 堆里同形的邻居/模板字典(同为 98 项同键集)必须被判为不可复用
  // (回首页再进入时若句柄指向别的实体, 复用会把邻居数据当主角数据展示)
  const refs = findEntryRefs(proc, survivalLogProfile, survivalLogProfile.mainKeys[0].key)
  const other = refs.find((r) => r !== anchor)
  if (other === undefined) {
    console.log('[!] 未找到其它同形字典候选, 跳过邻居字典测试')
  } else {
    const dOther = walkDictEntries(proc, survivalLogProfile, other + 16)
    console.log(
      `[+] 邻居字典(0x${other.toString(16)})项数 ${dOther.size} → 复用判定 ${sameAsHandles(dOther) ? '通过' : '拒绝'}(应拒绝)`
    )
  }

  // 负向 2: 指向无关内存的陈旧锚点必须被拒
  const far = walkDictEntries(proc, survivalLogProfile, anchor + 0x100000)
  console.log(`[+] 无关地址锚点项数 ${far.size} → 复用判定 ${sameAsHandles(far) ? '通过' : '拒绝'}(应拒绝)`)

  // 复用时读值仍须正常(句柄可用性)
  const sample = survivalLogProfile.mainKeys.slice(0, 3).map((def) => {
    const r = handles.get(def.key)?.read()
    return `${def.name}=${r ? r.base / survivalLogProfile.valueScale : '?'}`
  })
  console.log('[+] 复用句柄读值:', sample.join(', '))

  proc.close()
  console.log('[+] 完成')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
