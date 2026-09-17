// 修改器页共享状态机: 游戏元信息 + 扫描结果复用 + 1 秒轮询刷新
// 页面布局由各游戏专属视图决定, 本 composable 只管"怎么扫、怎么刷"
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { AttrRow, GameMeta, TrainerStateDto } from '@shared'

export function useTrainer(gameId: string) {
  const meta = ref<GameMeta | null>(null)
  const scanning = ref(false)
  const scanned = ref(false)
  const rows = ref<AttrRow[]>([])
  /** 扫描成功后的提示文案(来自 profile.uiHints) */
  const hints = ref<string[]>([])
  /**
   * 锁定开关状态(按属性键)。父组件持有而非表格内部: 复用上次扫描时要从主进程恢复,
   * 否则会出现"主进程还在锁、界面显示未锁"
   */
  const locks = ref<Record<number, boolean>>({})
  /** 复用结果不完整时的提示(如某些字段不在当前场景) */
  const note = ref('')
  let pollTimer: number | null = null

  onMounted(async () => {
    // 展示用游戏元信息
    const games = await window.api.listGames()
    meta.value = games.find((g) => g.id === gameId) ?? null
    // 已有可用扫描结果(游戏没关、句柄仍有效)时直接复用, 不重新扫描; 否则进入即扫描
    const st = await window.api.getTrainerState(gameId)
    if (st.scanned) applyState(st)
    else await onScan()
  })

  onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer)
  })

  /** 用一份扫描结果填充页面状态并开始轮询 */
  function applyState(st: TrainerStateDto): void {
    scanned.value = true
    rows.value = st.attrs
    hints.value = st.hints
    locks.value = Object.fromEntries(st.lockedKeys.map((k) => [k, true]))
    note.value = st.note ?? ''
    if (!pollTimer) pollTimer = window.setInterval(refresh, 1000)
  }

  async function onScan(): Promise<void> {
    scanning.value = true
    try {
      const r = await window.api.scanGame(gameId)
      if (r.ok) {
        // 重扫会重建句柄与主进程锁定表, 锁定开关一并复位
        applyState({
          scanned: true,
          message: r.message,
          attrs: r.attrs,
          hints: r.hints ?? [],
          lockedKeys: []
        })
      } else {
        scanned.value = false
        rows.value = []
        hints.value = []
        locks.value = {}
        note.value = ''
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

  return { meta, scanning, scanned, rows, hints, locks, note, onScan, refresh }
}
