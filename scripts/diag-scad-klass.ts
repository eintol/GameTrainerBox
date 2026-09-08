// SCAD klass 结构诊断: 定位类名字符串与指针引用, dump Il2CppClass 结构内存,
// 广义探测 static_fields 链(klass+任意偏移 -> 块 -> 块+0 -> 实例 -> 对象头==klass)
// 运行: pnpm dlx esbuild scripts/diag-scad-klass.ts --bundle --platform=node --external:koffi --outfile=scripts/.diag-scad.cjs && node scripts/.diag-scad.cjs
import { GameProcess } from '../src/main/engine/process'

const BLOCK = 4 * 1024 * 1024

function hex(p: number): string {
  return '0x' + p.toString(16)
}

function dumpQwords(proc: GameProcess, addr: number, from: number, to: number, label: string): void {
  const size = to - from
  const b = proc.readBytes(addr + from, size)
  if (!b) {
    console.log(`  [${label}] 读取失败 @ ${hex(addr + from)}`)
    return
  }
  console.log(`  [${label}] ${hex(addr)} +${hex(from)}..${hex(to)}`)
  for (let i = 0; i + 8 <= size; i += 8) {
    const v = Number(b.readBigUInt64LE(i))
    console.log(`    +${hex(from + i)}: ${hex(v)}`)
  }
}

async function main(): Promise<void> {
  const proc = GameProcess.attach('SCAD.exe')
  console.log('[+] 已附加 pid =', proc.pid)

  const className = 'InventoryController'
  // 1) 找精确字符串(扫全部已提交内存, 含模块镜像区 —— Unity 6.3 类名副本可能在模块内)
  const pat = Buffer.from(className + '\0', 'utf-8')
  const strAddrs: number[] = []
  for (const { base, data } of proc.iterBlocks(proc.regions(false))) {
    let i = data.indexOf(pat)
    while (i !== -1) {
      const prev = i > 0 ? data[i - 1] : 0
      const isIdent =
        (prev >= 0x30 && prev <= 0x39) || (prev >= 0x41 && prev <= 0x5a) || (prev >= 0x61 && prev <= 0x7a) || prev === 0x5f
      if (!isIdent) strAddrs.push(base + i)
      i = data.indexOf(pat, i + 1)
    }
  }
  console.log(`[+] "${className}" 字符串地址:`, strAddrs.map(hex).join(', ') || '(无)')

  // 2) 指针反搜
  for (const s of strAddrs) {
    const ppat = Buffer.alloc(8)
    ppat.writeBigUInt64LE(BigInt(s))
    const ptrLocs: number[] = []
    for (const { base, data } of proc.iterBlocks(proc.regions(false))) {
      let i = data.indexOf(ppat)
      while (i !== -1) {
        ptrLocs.push(base + i)
        i = data.indexOf(ppat, i + 1)
      }
    }
    console.log(`[+] 指向 ${hex(s)} 的指针所在地址:`, ptrLocs.map(hex).join(', ') || '(无)')
    for (const p of ptrLocs) {
      // 结构上下文: 前 0x40 后 0x20
      dumpQwords(proc, p, -0x40, 0x20, `指针上下文 @${hex(p)}`)
      // 若按经典布局 klass = p-0x10(name@0x10), 广义探测 static_fields 链
      const klass = p - 0x10
      const hdr = proc.readU64(klass + 0x10)
      if (hdr !== s) continue
      console.log(`  [候选 klass] ${hex(klass)}`)
      dumpQwords(proc, klass, 0, 0x140, 'klass 结构')
      // 广义链探测: klass 内任意有效指针 q -> *(q+0) = m -> *m == klass
      const size = 0x140
      const b = proc.readBytes(klass, size)
      if (!b) continue
      let found = 0
      for (let off = 0; off + 8 <= size; off += 8) {
        const q = Number(b.readBigUInt64LE(off))
        if (!(q > 0x10000 && q < 0x7fffffffffff && q % 8 === 0)) continue
        const m = proc.readU64(q)
        if (!(m !== null && m > 0x10000 && m < 0x7fffffffffff && m % 8 === 0)) continue
        const hdr2 = proc.readU64(m)
        if (hdr2 === klass) {
          console.log(`  [★链命中] klass+${hex(off)} -> 块 ${hex(q)} -> 块+0 ${hex(m)} -> 头 ${hex(hdr2)} == klass`)
          found++
        }
      }
      if (found === 0) console.log('  [!] 广义链探测无命中(单例可能为空=主界面, 或布局不同)')
    }
  }
  proc.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
