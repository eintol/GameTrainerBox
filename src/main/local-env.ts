// 本机本地配置 local.env 读取器(纯 Node, 不依赖 electron —— 诊断脚本也能用)
// 背景: 游戏安装根目录等机器相关配置曾只用环境变量(setx)注入, 但 setx 对已打开的
// 终端/IDE 不生效, 导致 dev server 拿不到值(local.env 解决此类"变量在注册表里但进程没有"问题)
// 文件候选位置(取第一个存在的): 便携版 exe 同目录 -> 项目根(从 __dirname 向上找 package.json)
// 格式: KEY=VALUE 每行一对, # 开头为注释, 值两端引号自动剥除
import * as fs from 'fs'
import * as path from 'path'

/** 解析 local.env 文本为扁平 Key -> Value; 非法行忽略, 重复 Key 取第一个 */
export function parseLocalEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))))
      v = v.slice(1, -1)
    if (!(k in out)) out[k] = v
  }
  return out
}

let cache: Record<string, string> | null = null

/**
 * 项目根的 local.env: 从 __dirname 向上最多 6 级找 package.json —— 与 bundle 落点无关
 * (dev 主进程 out/main -> 项目根; 诊断脚本 bundle 在 scripts/ -> 同样到项目根;
 * 打包后在 asar 内也能命中 asar 根的 package.json, 那里自然没有 local.env)
 */
function projectLocalEnvFile(): string | null {
  let dir = __dirname
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return path.join(dir, 'local.env')
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** 读 local.env 里的 key; 文件缺失/键不存在返回 undefined, 调用方再回退其他来源 */
export function localEnv(key: string): string | undefined {
  if (!cache) {
    cache = {}
    const candidates = [path.join(path.dirname(process.execPath), 'local.env')]
    const projectFile = projectLocalEnvFile()
    if (projectFile) candidates.push(projectFile)
    for (const file of candidates) {
      try {
        if (!fs.existsSync(file)) continue
        cache = parseLocalEnvText(fs.readFileSync(file, 'utf-8'))
        break // 只取第一个存在的文件, 两处不混拼
      } catch {
        // 文件损坏/不可读按不存在处理, 不影响主流程
      }
    }
  }
  return cache[key]
}
