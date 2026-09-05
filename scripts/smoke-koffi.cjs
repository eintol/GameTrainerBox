// koffi API 形状冒烟测试: 验证句柄/缓冲区/偏移方案可用后再写正式引擎
// 用法: node scripts/smoke-koffi.cjs <pid>
const koffi = require('koffi')

const PROCESS_ACCESS = 0x0010 | 0x0020 | 0x0008 | 0x0400 // VM_READ|VM_WRITE|VM_OPERATION|QUERY_INFO
const TH32CS_SNAPMODULE = 0x8 | 0x10
const MEM_COMMIT = 0x1000
const MEM_PRIVATE = 0x20000

const lib = koffi.load('kernel32.dll')
const OpenProcess = lib.func('OpenProcess', 'intptr', ['uint32', 'bool', 'uint32'])
const CloseHandle = lib.func('CloseHandle', 'bool', ['intptr'])
const ReadProcessMemory = lib.func('ReadProcessMemory', 'bool', ['intptr', 'uint64', 'void *', 'size_t', 'void *'])
const VirtualQueryEx = lib.func('VirtualQueryEx', 'size_t', ['intptr', 'uint64', 'void *', 'size_t'])
const CreateToolhelp32Snapshot = lib.func('CreateToolhelp32Snapshot', 'intptr', ['uint32', 'uint32'])
const Module32FirstW = lib.func('Module32FirstW', 'bool', ['intptr', 'void *'])
const Module32NextW = lib.func('Module32NextW', 'bool', ['intptr', 'void *'])

const pid = Number(process.argv[2])
if (!pid) {
  console.error('用法: node smoke-koffi.cjs <pid>')
  process.exit(1)
}

// 1. OpenProcess —— 句柄用 intptr(有效句柄为正, INVALID_HANDLE_VALUE=-1)
const h = OpenProcess(PROCESS_ACCESS, true, pid)
console.log('[1] OpenProcess ->', h, typeof h)
if (!h || h === -1) {
  console.error('打开进程失败')
  process.exit(1)
}

// 2. VirtualQueryEx —— MBI 用 48 字节原始缓冲区(自然对齐布局)
const mbi = Buffer.alloc(48)
const n = VirtualQueryEx(h, 0x10000, mbi, 48)
console.log('[2] VirtualQueryEx ->', n, '字节; State=', mbi.readUInt32LE(32),
  'Type=', mbi.readUInt32LE(40), 'RegionSize=0x' + mbi.readBigUInt64LE(24).toString(16))

// 3. ReadProcessMemory —— 输出参数传 null, 读 GameAssembly 头(MZ)
//    模块基址: MODULEENTRY32W 缓冲区方案(自然对齐: modBaseAddr@24, szModule@48, 总 1080)
const snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, pid)
console.log('[3] 快照句柄 ->', snap)
if (snap > 0) {
  const me = Buffer.alloc(1080)
  me.writeUInt32LE(1080, 0) // dwSize
  let base = null
  let ok = Module32FirstW(snap, me)
  let count = 0
  while (ok) {
    const name = me.toString('utf16le', 48, 48 + 512).split('\0')[0]
    if (count < 3) console.log('    模块:', name, '@0x' + me.readBigUInt64LE(24).toString(16))
    if (name.toLowerCase() === 'gameassembly.dll') {
      base = me.readBigUInt64LE(24)
    }
    count++
    ok = Module32NextW(snap, me)
  }
  CloseHandle(snap)
  console.log('    模块总数:', count, 'GameAssembly 基址:', base ? '0x' + base.toString(16) : '未找到')

  // 4. 读模块头验证 MZ
  if (base) {
    const buf = Buffer.alloc(2)
    const ok2 = ReadProcessMemory(h, Number(base), buf, 2, null)
    console.log('[4] ReadProcessMemory ->', ok2, '内容:', buf.toString('ascii'),
      buf[0] === 0x4d && buf[1] === 0x5a ? '(MZ 头正确!)' : '(异常)')
  }
}

// 5. 区域枚举统计(前 200 个区域)
let addr = 0
let regions = 0
let privateRw = 0
let totalMb = 0
while (addr < 0x7fffffffffffn && regions < 200) {
  const r = VirtualQueryEx(h, addr, mbi, 48)
  if (r === 0) break
  const baseAddr = mbi.readBigUInt64LE(0)
  const size = mbi.readBigUInt64LE(24)
  const state = mbi.readUInt32LE(32)
  const protect = mbi.readUInt32LE(36)
  const type = mbi.readUInt32LE(40)
  if (state === MEM_COMMIT) {
    regions++
    if (type === MEM_PRIVATE && (protect === 0x04 || protect === 0x40)) {
      privateRw++
      totalMb += Number(size) / 1048576
    }
  }
  addr = baseAddr + size
}
console.log('[5] 前 200 区域: 已提交', regions, '私有RW', privateRw, '合计', totalMb.toFixed(0), 'MB')

CloseHandle(h)
console.log('冒烟测试完成')
