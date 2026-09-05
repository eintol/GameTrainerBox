// 游戏进程封装: 进程枚举 / 模块基址 / 内存区域枚举 / 读写原语 / 分块迭代
// 对应 Python 原型 memproc.py, 关键偏移与坑位见 winapi.ts 注释
import {
  OpenProcess,
  CloseHandle,
  ReadProcessMemory,
  WriteProcessMemory,
  VirtualQueryEx,
  CreateToolhelp32Snapshot,
  Process32FirstW,
  Process32NextW,
  Module32FirstW,
  Module32NextW,
  PROCESS_ACCESS,
  MEM_COMMIT,
  MEM_PRIVATE,
  PAGE_READWRITE,
  PAGE_EXECUTE_READWRITE,
  TH32CS_SNAPPROCESS,
  TH32CS_SNAPMODULE,
  MAX_ADDR,
  PE32W_SIZE,
  PE32W_PID,
  PE32W_EXEFILE,
  ME32W_SIZE,
  ME32W_BASEADDR,
  ME32W_NAME,
  ME32W_NAMEBYTES,
  MBI_SIZE
} from './winapi'

export interface MemoryRegion {
  base: number
  size: number
  protect: number
  type: number
}

export function isPrivateRw(r: MemoryRegion): boolean {
  return r.type === MEM_PRIVATE && (r.protect === PAGE_READWRITE || r.protect === PAGE_EXECUTE_READWRITE)
}

export interface MemBlock {
  base: number
  data: Buffer
}

export class GameProcess {
  readonly pid: number
  private handle: number

  private constructor(pid: number, handle: number) {
    this.pid = pid
    this.handle = handle
  }

  /** 按进程名(不区分大小写)枚举 PID */
  static findPids(exeName: string): number[] {
    const snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if (!snap || snap === -1) return []
    const out: number[] = []
    const buf = Buffer.alloc(PE32W_SIZE)
    buf.writeUInt32LE(PE32W_SIZE, 0) // dwSize: 传 568(对齐布局), 名字读偏移 44(pack4 布局)
    try {
      let ok = Process32FirstW(snap, buf)
      while (ok) {
        const exe = buf.toString('utf16le', PE32W_EXEFILE, PE32W_EXEFILE + 520).split('\0')[0]
        if (exe.toLowerCase() === exeName.toLowerCase()) out.push(buf.readUInt32LE(PE32W_PID))
        ok = Process32NextW(snap, buf)
      }
    } finally {
      CloseHandle(snap)
    }
    return out
  }

  /** 附加唯一目标进程; 不存在或多个时抛错 */
  static attach(exeName: string): GameProcess {
    const pids = GameProcess.findPids(exeName)
    if (pids.length === 0) throw new Error(`未找到进程 ${exeName}, 请先启动游戏`)
    if (pids.length > 1) throw new Error(`发现 ${pids.length} 个 ${exeName} 进程, 请只保留一个`)
    const h = OpenProcess(PROCESS_ACCESS, true, pids[0])
    if (!h || h === -1) throw new Error(`OpenProcess 失败 (pid=${pids[0]})`)
    return new GameProcess(pids[0], h)
  }

  close(): void {
    if (this.handle) {
      CloseHandle(this.handle)
      this.handle = 0
    }
  }

  get alive(): boolean {
    return this.handle !== 0
  }

  /** 模块基址, 找不到返回 null */
  moduleBase(moduleName: string): number | null {
    const snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, this.pid)
    if (!snap || snap === -1) return null
    const buf = Buffer.alloc(ME32W_SIZE)
    buf.writeUInt32LE(ME32W_SIZE, 0)
    let base: number | null = null
    try {
      let ok = Module32FirstW(snap, buf)
      while (ok) {
        const name = buf.toString('utf16le', ME32W_NAME, ME32W_NAME + ME32W_NAMEBYTES).split('\0')[0]
        if (name.toLowerCase() === moduleName.toLowerCase()) {
          base = Number(buf.readBigUInt64LE(ME32W_BASEADDR))
          break
        }
        ok = Module32NextW(snap, buf)
      }
    } finally {
      CloseHandle(snap)
    }
    return base
  }

  /** 枚举已提交内存区域; privateRwOnly=true 时只返回 GC 堆等私有读写区域 */
  regions(privateRwOnly = false): MemoryRegion[] {
    const out: MemoryRegion[] = []
    const mbi = Buffer.alloc(MBI_SIZE)
    let addr = 0
    while (addr < MAX_ADDR) {
      const n = VirtualQueryEx(this.handle, addr, mbi, MBI_SIZE)
      if (n === 0) break
      const base = Number(mbi.readBigUInt64LE(0))
      const size = Number(mbi.readBigUInt64LE(24))
      const region: MemoryRegion = {
        base,
        size,
        protect: mbi.readUInt32LE(36),
        type: mbi.readUInt32LE(40)
      }
      if (mbi.readUInt32LE(32) === MEM_COMMIT && base + size > addr) {
        if (!privateRwOnly || isPrivateRw(region)) out.push(region)
      }
      if (size <= 0) break
      addr = base + size
    }
    return out
  }

  /** 读指定长度; 部分读或失败返回 null */
  readBytes(addr: number, size: number): Buffer | null {
    const buf = Buffer.alloc(size)
    const ok = ReadProcessMemory(this.handle, addr, buf, size, null)
    return ok ? buf : null
  }

  writeBytes(addr: number, data: Buffer): boolean {
    return WriteProcessMemory(this.handle, addr, data, data.length, null)
  }

  readI32(addr: number): number | null {
    const b = this.readBytes(addr, 4)
    return b ? b.readInt32LE(0) : null
  }

  readU64(addr: number): number | null {
    const b = this.readBytes(addr, 8)
    return b ? Number(b.readBigUInt64LE(0)) : null
  }

  writeI32(addr: number, value: number): boolean {
    const buf = Buffer.alloc(4)
    buf.writeInt32LE(value, 0)
    return this.writeBytes(addr, buf)
  }

  /** 分块产出已提交内存(默认只扫私有 RW 区域); 读取失败的块跳过 */
  *iterBlocks(regions?: MemoryRegion[], blockSize = 4 * 1024 * 1024): Generator<MemBlock> {
    for (const r of regions ?? this.regions(true)) {
      let off = 0
      while (off < r.size) {
        const n = Math.min(blockSize, r.size - off)
        const data = this.readBytes(r.base + off, n)
        if (data) yield { base: r.base + off, data }
        off += n
      }
    }
  }
}
