// SCAD klass 聚焦探测: 对指定 klass 地址按新布局(Il2CppClass_1 + static_fields@0xB8)验证单例链
// 用法: node .diag-scad-probe.cjs <klassAddrHex> [className]
// 链: klass+SF_OFF -> static_fields -> +0 单例 -> 对象头 klass == klass
import { GameProcess } from '../src/main/engine/process'

function hex(p: number): string {
  return '0x' + p.toString(16)
}

async function main(): Promise<void> {
  const klassArg = process.argv[2]
  if (!klassArg) {
    console.error('用法: node .diag-scad-probe.cjs <klassAddrHex>')
    process.exit(1)
  }
  const klass = Number.parseInt(klassArg.replace(/^0x/i, ''), 16)
  const proc = GameProcess.attach('SCAD.exe')
  console.log('[+] 已附加 pid =', proc.pid, '| klass =', hex(klass))

  // dump 结构
  const b = proc.readBytes(klass, 0x140)
  if (!b) {
    console.error('[!] klass 内存不可读')
    process.exit(1)
  }
  for (let i = 0; i + 8 <= 0x140; i += 8) {
    const v = Number(b.readBigUInt64LE(i))
    console.log(`  +${hex(i)}: ${hex(v)}`)
  }

  // name/namespace 字符串内容
  for (const off of [0x8, 0x10, 0x18]) {
    const p = Number(b.readBigUInt64LE(off))
    if (p > 0x10000 && p < 0x7fffffffffff) {
      const s = proc.readBytes(p, 64)
      if (s) {
        const str = s.toString('utf-8').split('\0')[0]
        console.log(`  [字符串 +${hex(off)}] ${hex(p)} = "${str.slice(0, 48)}"`)
      }
    }
  }

  // 单例链探测: 0xA8(经典) 与 0xB8(Unity 6.3 新布局) + 全范围兜底
  const candidates = [0xb8, 0xa8]
  for (let off = 0x90; off <= 0x120; off += 8) if (!candidates.includes(off)) candidates.push(off)
  for (const off of candidates) {
    const sf = Number(b.readBigUInt64LE(off))
    if (!(sf > 0x10000 && sf < 0x7fffffffffff && sf % 8 === 0)) continue
    const main = proc.readU64(sf)
    if (!(main !== null && main > 0x10000 && main < 0x7fffffffffff && main % 8 === 0)) continue
    const hdr = proc.readU64(main)
    console.log(`  [探测 +${hex(off)}] static_fields=${hex(sf)} main=${hex(main)} 头=${hdr === null ? '?' : hex(hdr)}${hdr === klass ? ' ★==klass' : ''}`)
    if (hdr === klass) {
      // dump 实例前 0x50 字节(currentHoverData/index/resources...)
      const ib = proc.readBytes(main, 0x50)
      if (ib) {
        for (let i = 0; i + 4 <= 0x50; i += 4) {
          console.log(`    实例+${hex(i)}: i32=${ib.readInt32LE(i)}  f32=${ib.readFloatLE(i).toFixed(3)}`)
        }
      }
      console.log(`[★] 命中: static_fields 偏移 ${hex(off)}`)
      proc.close()
      return
    }
  }
  console.log('[!] 无命中(单例可能为空=主界面, 或布局仍不同)')
  proc.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
