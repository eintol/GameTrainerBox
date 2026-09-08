// SCAD Hovercraft klass 诊断: 找 "Hovercraft\0" 字符串 -> klass 候选 -> static_fields 块内容
// 运行: pnpm dlx esbuild scripts/diag-scad-hovercraft.ts --bundle --platform=node --external:koffi --outfile=scripts/.diag-hc.cjs && node scripts/.diag-hc.cjs
import { GameProcess } from '../src/main/engine/process'

function hex(p: number): string {
  return '0x' + p.toString(16)
}

function isIdentByte(c: number): boolean {
  return (
    (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f
  )
}

async function main(): Promise<void> {
  const proc = GameProcess.attach('SCAD.exe')
  console.log('[+] 已附加 pid =', proc.pid)

  // 1) 精确字符串 "Hovercraft\0"
  const pat = Buffer.from('Hovercraft\0', 'utf-8')
  const strAddrs: number[] = []
  for (const { base, data } of proc.iterBlocks(proc.regions(false))) {
    let i = data.indexOf(pat)
    while (i !== -1) {
      const prev = i > 0 ? data[i - 1] : 0
      if (!isIdentByte(prev)) strAddrs.push(base + i)
      i = data.indexOf(pat, i + 1)
    }
  }
  console.log('[+] "Hovercraft" 字符串:', strAddrs.map(hex).join(', '))

  // 2) 指针反搜 -> klass 候选
  const pats = strAddrs.map((s) => {
    const p = Buffer.alloc(8)
    p.writeBigUInt64LE(BigInt(s))
    return { to: s, pat: p }
  })
  const klasses = new Set<number>()
  for (const { base, data } of proc.iterBlocks(proc.regions(false))) {
    for (const { to, pat: pp } of pats) {
      let i = data.indexOf(pp)
      while (i !== -1) {
        const klass = base + i - 0x10
        // 验证 name 字段确实指向该字符串
        if (proc.readU64(klass + 0x10) === to) klasses.add(klass)
        i = data.indexOf(pp, i + 1)
      }
    }
  }
  console.log('[+] klass 候选:', [...klasses].map(hex).join(', ') || '(无)')

  // 3) 逐候选: static_fields@0xB8 -> player(块+0) -> 对象头
  for (const klass of klasses) {
    const sf = proc.readU64(klass + 0xb8)
    console.log(`\n[候选 klass ${hex(klass)}] static_fields=${sf ? hex(sf) : '?'}`)
    if (!sf || sf <= 0x10000) continue
    const blk = proc.readBytes(sf, 0x10)
    if (!blk) continue
    const player = Number(blk.readBigUInt64LE(0))
    const flag = blk.readUInt8(8)
    console.log(`  块+0x0 (player) = ${hex(player)}  块+0x8 (playerGameObjectDeleted) = ${flag}`)
    if (player > 0x10000 && player < 0x7fffffffffff && player % 8 === 0) {
      const hdr = proc.readU64(player)
      console.log(`  player 对象头 = ${hdr ? hex(hdr) : '?'}${hdr === klass ? ' ★==klass' : ''}`)
      const ib = proc.readBytes(player, 0x98)
      if (ib) {
        console.log(`  实例+0x28 maxHealth=${ib.readFloatLE(0x28)}  +0x2C currentHealth=${ib.readFloatLE(0x2c)}  +0x30 entityType=${ib.readInt32LE(0x30)}`)
        console.log(`  实例+0x90 maxShield=${ib.readFloatLE(0x90)}  +0x94 currentShield=${ib.readFloatLE(0x94)}`)
      }
    } else {
      console.log('  player 为空或无效(可能不在远征局内)')
    }
  }
  proc.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
