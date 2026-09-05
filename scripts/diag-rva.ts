// 一次性诊断: dump 旧槽位 klass 指针的原始字节 + 逐字节读类名
import { GameProcess } from '../src/main/engine/process'

const proc = GameProcess.attach('SurvivalLog.exe')
const base = proc.moduleBase('GameAssembly.dll')
const klass = proc.readU64(base + 0x538bef0)
console.log('[+] klass ptr = 0x' + klass?.toString(16))
if (klass) {
  const head = proc.readBytes(klass, 0x20)
  console.log('[+] klass head:', head ? head.toString('hex') : '(fail)')
  const namePtr = proc.readU64(klass + 0x10)
  console.log('[+] name ptr = 0x' + namePtr?.toString(16))
  if (namePtr && namePtr > 0x10000) {
    let s = ''
    for (let i = 0; i < 48; i++) {
      const b = proc.readBytes(namePtr + i, 1)
      if (!b || b[0] === 0) break
      s += String.fromCharCode(b[0])
    }
    console.log('[+] name =', JSON.stringify(s))
    let ns = ''
    const nsPtr = proc.readU64(klass + 0x18)
    if (nsPtr && nsPtr > 0x10000) {
      for (let i = 0; i < 80; i++) {
        const b = proc.readBytes(nsPtr + i, 1)
        if (!b || b[0] === 0) break
        ns += String.fromCharCode(b[0])
      }
    }
    console.log('[+] namespace =', JSON.stringify(ns))
  }
}
proc.close()
