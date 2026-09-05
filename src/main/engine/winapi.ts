// koffi 绑定层: kernel32 函数定义与常量
// 设计原则: 句柄一律 'intptr'(有效句柄为正, INVALID_HANDLE_VALUE=-1, 规避指针/BigInt 转换);
// 所有 Win32 结构体用原始 Buffer + 手动偏移读取, 不用 koffi struct(对齐不确定性)
import koffi from 'koffi'

const lib = koffi.load('kernel32.dll')

// ---- 常量 ----
export const PROCESS_VM_READ = 0x0010
export const PROCESS_VM_WRITE = 0x0020
export const PROCESS_VM_OPERATION = 0x0008
export const PROCESS_QUERY_INFORMATION = 0x0400
export const PROCESS_ACCESS =
  PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_VM_OPERATION | PROCESS_QUERY_INFORMATION

export const MEM_COMMIT = 0x1000
export const MEM_PRIVATE = 0x20000
export const PAGE_READWRITE = 0x04
export const PAGE_EXECUTE_READWRITE = 0x40

export const TH32CS_SNAPPROCESS = 0x00000002
export const TH32CS_SNAPMODULE = 0x00000008 | 0x00000010

export const MAX_ADDR = 0x7fffffffffff // 用户态地址上限(48 位), Number 精度安全

// ---- kernel32 函数 ----
export const OpenProcess = lib.func('OpenProcess', 'intptr', ['uint32', 'bool', 'uint32'])
export const CloseHandle = lib.func('CloseHandle', 'bool', ['intptr'])
export const ReadProcessMemory = lib.func('ReadProcessMemory', 'bool', [
  'intptr',
  'uint64',
  'void *',
  'size_t',
  'void *'
])
export const WriteProcessMemory = lib.func('WriteProcessMemory', 'bool', [
  'intptr',
  'uint64',
  'void *',
  'size_t',
  'void *'
])
// MEMORY_BASIC_INFORMATION: 48 字节原始缓冲区(自然对齐布局, 偏移见 process.ts)
export const VirtualQueryEx = lib.func('VirtualQueryEx', 'size_t', [
  'intptr',
  'uint64',
  'void *',
  'size_t'
])
export const CreateToolhelp32Snapshot = lib.func('CreateToolhelp32Snapshot', 'intptr', [
  'uint32',
  'uint32'
])
export const Process32FirstW = lib.func('Process32FirstW', 'bool', ['intptr', 'void *'])
export const Process32NextW = lib.func('Process32NextW', 'bool', ['intptr', 'void *'])
export const Module32FirstW = lib.func('Module32FirstW', 'bool', ['intptr', 'void *'])
export const Module32NextW = lib.func('Module32NextW', 'bool', ['intptr', 'void *'])

// ---- 结构体偏移表(实测验证, 勿改) ----
// PROCESSENTRY32W: x64 下 API 要求 dwSize=568(对齐布局), 但 szExeFile 实际写在偏移 44(pack4 布局)
export const PE32W_SIZE = 568
export const PE32W_PID = 8
export const PE32W_EXEFILE = 44

// MODULEENTRY32W: 自然对齐, 总 1080; modBaseAddr@24(ptr), modBaseSize@32, szModule@48(wchar*256)
export const ME32W_SIZE = 1080
export const ME32W_BASEADDR = 24
export const ME32W_SIZEOFF = 32
export const ME32W_NAME = 48
export const ME32W_NAMEBYTES = 512

// MEMORY_BASIC_INFORMATION(x64): BaseAddress@0, RegionSize@24, State@32, Protect@36, Type@40
export const MBI_SIZE = 48
export const MBI_BASEADDR = 0
export const MBI_REGIONSIZE = 24
export const MBI_STATE = 32
export const MBI_PROTECT = 36
export const MBI_TYPE = 40
