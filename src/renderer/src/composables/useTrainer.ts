// 修改器页共享状态机: 游戏元信息 + 附加扫描 + 1 秒轮询刷新
// 页面布局由各游戏专属视图决定, 本 composable 只管"怎么扫、怎么刷"
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { AttrRow, GameMeta } from '@shared'

export function useTrainer(gameId: string) {
  const meta = ref<GameMeta | null>(null)
  const scanning = ref(false)
  const scanned = ref(false)
  const rows = ref<AttrRow[]>([])
  /** 扫描成功后的提示文案(来自 profile.uiHints) */
  const hints = ref<string[]>([])
  let pollTimer: number | null = null

  onMounted(async () => {
    // 展示用游戏元信息
    const games = await window.api.listGames()
    meta.value = games.find((g) => g.id === gameId) ?? null
    // 进入即自动附加并扫描
    await onScan()
  })

  onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer)
  })

  async function onScan(): Promise<void> {
    scanning.value = true
    try {
      const r = await window.api.scanGame(gameId)
      if (r.ok) {
        scanned.value = true
        rows.value = r.attrs
        hints.value = r.hints ?? []
        if (!pollTimer) pollTimer = window.setInterval(refresh, 1000)
      } else {
        scanned.value = false
        rows.value = []
        hints.value = []
        ElMessage.error(r.message)
      }
    } finally {
      scanning.value = false
    }
  }

  /** 拉取最新属性行(轮询与写入后复用) */
  async function refresh(): Promise<void> {
    if (!scanned.value) return
    rows.value = await window.api.getAttrs()
  }

  return { meta, scanning, scanned, rows, hints, onScan, refresh }
}
