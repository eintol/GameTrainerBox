// UI 音效: 修改成功提示音(assets/ding.wav)
// assetsInlineLimit 已调大(electron.vite.config.ts), wav 会内联成 data URL, 规避生产模式 file:// 下 fetch 本地资源受限
import dingUrl from '../assets/ding.wav'

let ctx: AudioContext | null = null
let buf: AudioBuffer | null = null
let loading: Promise<void> | null = null

/** 首次调用时解码音频, 之后走缓存 */
function ensureLoaded(): Promise<void> {
  if (!ctx || buf || loading) return Promise.resolve()
  loading = fetch(dingUrl)
    .then((r) => r.arrayBuffer())
    .then((ab) => ctx!.decodeAudioData(ab))
    .then((b) => {
      buf = b
    })
    .catch(() => {
      // 解码失败静默跳过, 不再重试
    })
  return loading
}

/** 播放修改成功提示音 */
export function playSuccess(): void {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    void ensureLoaded().then(() => {
      if (!buf || !ctx) return
      const src = ctx.createBufferSource()
      src.buffer = buf
      const gain = ctx.createGain()
      gain.gain.value = 0.6 // 调音量改这里(0~1, 越大越响)
      src.connect(gain).connect(ctx.destination)
      src.start()
    })
  } catch {
    // 音频不可用时静默跳过, 不影响修改流程
  }
}
