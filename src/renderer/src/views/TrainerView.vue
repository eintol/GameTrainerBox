<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Check, Lock, PackageOpen, ScanLine, Zap } from '@lucide/vue'
import type { AttrRow, ContainerInfo, ContainerOverride, GameMeta, LogEntry, ModConfigPatch } from '@shared'
import { playSuccess } from '../utils/sound'

const props = defineProps<{ gameId: string }>()
const emit = defineEmits<{ (e: 'back'): void }>()

const meta = ref<GameMeta | null>(null)
const scanning = ref(false)
const scanned = ref(false)
const rows = ref<AttrRow[]>([])
/** 每行的"改为"输入 */
const edits = reactive<Record<number, string>>({})
/** 每行锁定开关 */
const locks = reactive<Record<number, boolean>>({})
const logs = ref<LogEntry[]>([])
const logBox = ref<HTMLElement | null>(null)
let unsubLog: (() => void) | null = null
let pollTimer: number | null = null

// ---- 容器扩容 Mod ----
const modAvailable = ref(false)
const modEnable = ref(false)
/** 已应用(插件 cfg)的每容器目标 */
const modOverrides = ref<ContainerOverride[]>([])
const modApplying = ref(false)

// 工作区(购物车): 已添加的容器与目标格子; localStorage 持久化, GameTrainerBox 重开不丢
interface WorkItem {
  id: number
  cols: number
  rows: number
  name: string
  localName: string
  origCols: number
  origRows: number
}
const workList = ref<WorkItem[]>([])
const workKey = `gb:container-workbench:${props.gameId}`

function saveWork(): void {
  localStorage.setItem(workKey, JSON.stringify(workList.value))
}
function loadWork(): void {
  try {
    const arr = JSON.parse(localStorage.getItem(workKey) ?? '[]') as WorkItem[]
    if (Array.isArray(arr)) workList.value = arr.filter((w) => Number.isInteger(w.id))
  } catch {
    /* 损坏则重置 */
  }
}
watch(workList, saveWork, { deep: true })

/** 工作区与已应用配置是否存在差异 */
const workDirty = computed(() => {
  const sig = (l: Array<{ id: number; cols: number; rows: number }>) =>
    [...l]
      .sort((a, b) => a.id - b.id)
      .map((o) => `${o.id}:${o.cols}:${o.rows}`)
      .join(',')
  return sig(workList.value) !== sig(modOverrides.value)
})

// 浏览对话框: 全部容器 + 筛选 + 添加按钮
const containerDlg = ref(false)
const containers = ref<ContainerInfo[]>([])
const nameFilter = ref('')
const onlyInUse = ref(true)
const inUseCount = computed(() => containers.value.filter((c) => c.inUse).length)
const visibleContainers = computed(() =>
  onlyInUse.value && inUseCount.value > 0 ? containers.value.filter((c) => c.inUse) : containers.value
)
const filteredContainers = computed(() => {
  const kw = nameFilter.value.trim().toLowerCase()
  if (!kw) return visibleContainers.value
  return visibleContainers.value.filter(
    (c) => (c.localName || c.name).toLowerCase().includes(kw) || String(c.id).includes(kw)
  )
})

onMounted(async () => {
  unsubLog = window.api.onLog((entry) => {
    logs.value.push(entry)
    if (logs.value.length > 300) logs.value.splice(0, logs.value.length - 300)
    requestAnimationFrame(() => logBox.value?.scrollTo({ top: logBox.value!.scrollHeight }))
  })
  // 展示用游戏元信息
  const games = await window.api.listGames()
  meta.value = games.find((g) => g.id === props.gameId) ?? null
  // 容器扩容配置(文件读写, 不依赖游戏附加)
  await loadModConfig()
  loadWork()
  if (workList.value.length === 0 && modOverrides.value.length > 0) {
    // 首次从插件配置种子(名称待容器清单补充)
    workList.value = modOverrides.value.map((o) => ({
      id: o.id,
      cols: o.cols,
      rows: o.rows,
      name: '',
      localName: '',
      origCols: 0,
      origRows: 0
    }))
  }
  await refreshContainers()
  // 进入即自动附加并扫描
  await onScan()
})

async function loadModConfig(): Promise<void> {
  const s = await window.api.getModConfig(props.gameId)
  modAvailable.value = s.available
  modEnable.value = s.enableResize
  modOverrides.value = s.overrides
}

/** 拉取容器清单, 并补全工作区条目的名称/原始尺寸 */
async function refreshContainers(): Promise<void> {
  try {
    containers.value = await window.api.listContainers(props.gameId)
  } catch {
    return
  }
  let changed = false
  for (const w of workList.value) {
    const c = containers.value.find((x) => x.id === w.id)
    if (c) {
      const local = c.localName || c.name
      if (w.name !== c.name || w.localName !== local || w.origCols !== c.origCols || w.origRows !== c.origRows) {
        w.name = c.name
        w.localName = local
        w.origCols = c.origCols
        w.origRows = c.origRows
        changed = true
      }
    }
  }
  if (changed) saveWork()
}

function isAdded(id: number): boolean {
  return workList.value.some((w) => w.id === id)
}
function addContainer(c: ContainerInfo): void {
  if (isAdded(c.id)) return
  workList.value.push({
    id: c.id,
    cols: Math.max(c.cols, c.origCols),
    rows: Math.max(c.rows, c.origRows),
    name: c.name,
    localName: c.localName || c.name,
    origCols: c.origCols,
    origRows: c.origRows
  })
}
function addAllInUse(): void {
  for (const c of visibleContainers.value) addContainer(c)
}
function removeWork(id: number): void {
  workList.value = workList.value.filter((w) => w.id !== id)
}
function restoreWork(id: number): void {
  const w = workList.value.find((x) => x.id === id)
  if (w) {
    w.cols = w.origCols
    w.rows = w.origRows
  }
}

async function onToggleMod(): Promise<void> {
  await applyMod({ enableResize: modEnable.value })
}

async function applyMod(patch: ModConfigPatch): Promise<void> {
  modApplying.value = true
  try {
    const s = await window.api.setModConfig(props.gameId, patch)
    modAvailable.value = s.available
    modEnable.value = s.enableResize
    modOverrides.value = s.overrides
    playSuccess()
    ElMessage.success(
      s.enableResize
        ? `容器扩容已写入: ${s.overrides.length} 个容器自定义格子 (游戏运行中约 3 秒内生效)`
        : '容器扩容已停用'
    )
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    modApplying.value = false
  }
}

/** 把工作区写入游戏配置 */
async function applyWork(): Promise<void> {
  for (const w of workList.value) {
    if (w.origCols > 0 && (w.cols < w.origCols || w.rows < w.origRows)) {
      ElMessage.error(
        `容器 ${w.localName || w.name} 目标 ${w.cols}x${w.rows} 小于原始 ${w.origCols}x${w.origRows}; 出于存档安全只扩不缩, 请先重启游戏还原后再缩小`
      )
      return
    }
  }
  await applyMod({
    enableResize: modEnable.value,
    overrides: workList.value.map((w) => ({ id: w.id, cols: w.cols, rows: w.rows }))
  })
}

onUnmounted(() => {
  unsubLog?.()
  if (pollTimer) clearInterval(pollTimer)
})

async function onScan(): Promise<void> {
  scanning.value = true
  try {
    const r = await window.api.scanGame(props.gameId)
    if (r.ok) {
      scanned.value = true
      rows.value = r.attrs
      if (!pollTimer) pollTimer = window.setInterval(refresh, 1000)
    } else {
      scanned.value = false
      rows.value = []
      ElMessage.error(r.message)
    }
  } finally {
    scanning.value = false
  }
}

async function refresh(): Promise<void> {
  if (!scanned.value) return
  rows.value = await window.api.getAttrs()
}

/** 应用单行: 把该行"改为"输入的显示值写入内存 */
async function onApplyRow(key: number): Promise<void> {
  const row = rows.value.find((r) => r.key === key)
  const txt = (edits[key] ?? '').trim()
  if (!row || !txt) {
    ElMessage.warning('请先在"改为"里填入数值')
    return
  }
  const v = Number(txt)
  if (Number.isNaN(v)) {
    ElMessage.warning(`${row.name} 的值不是数字: ${txt}`)
    return
  }
  const ok = await window.api.setAttr(key, v)
  if (ok) playSuccess()
  edits[key] = ''
  await refresh()
}

async function onMax500(key: number): Promise<void> {
  const ok = await window.api.setMax(key)
  if (ok) playSuccess()
  await refresh()
}

/** 附加键(无上限键, 如移速)一键拉满到自身硬封顶字段 Max */
async function onMaxSelf(key: number): Promise<void> {
  const row = rows.value.find((r) => r.key === key)
  if (!row || row.maxDisplay === null) return
  const ok = await window.api.setAttr(key, row.maxDisplay)
  if (ok) playSuccess()
  await refresh()
}

async function onLockChange(key: number, enabled: boolean): Promise<void> {
  const row = rows.value.find((r) => r.key === key)
  if (!row) return
  const txt = (edits[key] ?? '').trim()
  const target = txt !== '' && !Number.isNaN(Number(txt)) ? Number(txt) : row.curDisplay
  const ok = await window.api.setLock(key, enabled, target)
  if (ok) playSuccess()
}

function fmt(v: number | null): string {
  return v === null ? '—' : String(Math.round(v * 100) / 100)
}
</script>

<template>
  <div class="flex h-full w-full flex-col overflow-y-auto p-6 pt-4">
    <!-- 游戏与扫描 -->
    <section class="mb-4 flex items-center gap-3">
      <el-button
        size="default"
        text
        @click="emit('back')"
      >
        <ArrowLeft class="mr-1 h-4 w-4" />
        返回
      </el-button>
      <h2 class="text-lg font-semibold">
        {{ meta?.name ?? gameId }}
      </h2>
      <el-button
        type="primary"
        :loading="scanning"
        size="default"
        @click="onScan"
      >
        <ScanLine class="mr-1 h-4 w-4" />
        重新扫描
      </el-button>
      <span class="ml-auto text-xs text-gray-500">
        请先启动游戏并进入存档(局内); 修改后游戏内正常存档一次即可持久化
      </span>
    </section>

    <!-- 属性表 -->
    <section class="mb-4">
      <el-table
        :data="rows"
        size="default"
        style="width: 100%"
      >
        <el-table-column
          label="属性"
          width="140"
        >
          <template #default="{ row }">
            <span class="font-medium">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="当前"
          width="120"
        >
          <template #default="{ row }">
            <span class="font-mono">{{ fmt(row.curDisplay) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="上限"
          width="120"
        >
          <template #default="{ row }">
            <span class="font-mono">{{ fmt(row.maxDisplay) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="改为"
          width="150"
        >
          <template #default="{ row }">
            <el-input
              v-model="edits[row.key]"
              size="small"
              placeholder="显示值"
              :disabled="!scanned || locks[row.key]"
            />
          </template>
        </el-table-column>
        <el-table-column
          label="应用"
          width="90"
        >
          <template #default="{ row }">
            <el-button
              size="small"
              type="primary"
              plain
              :disabled="!scanned"
              @click="onApplyRow(row.key)"
            >
              <Check class="mr-1 h-3.5 w-3.5" />
              应用
            </el-button>
          </template>
        </el-table-column>
        <el-table-column
          label="锁定"
          width="90"
        >
          <template #default="{ row }">
            <el-switch
              v-model="locks[row.key]"
              size="small"
              :disabled="!scanned"
              @change="(v: boolean | string | number) => onLockChange(row.key, Boolean(v))"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作">
          <template #default="{ row }">
            <el-button
              v-if="row.hasCap"
              size="small"
              type="warning"
              plain
              :disabled="!scanned"
              @click="onMax500(row.key)"
            >
              <Zap class="mr-1 h-3.5 w-3.5" />
              上限→500
            </el-button>
            <el-button
              v-else
              size="small"
              type="warning"
              plain
              :disabled="!scanned || row.maxDisplay === null"
              @click="onMaxSelf(row.key)"
            >
              <Zap class="mr-1 h-3.5 w-3.5" />
              拉满
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div
        v-if="scanned"
        class="mt-3 flex items-center gap-3"
      >
        <span class="text-xs text-gray-500">
          填写"改为"后点该行"应用"即写入; 勾选锁定后每 0.3 秒自动写回; "健康*"为内部隐藏值, 一般不用改;
          移速正常值为 3.0, 超过上限 10 时会自动抬高游戏硬封顶
        </span>
      </div>
    </section>

    <!-- 容器扩容 -->
    <section class="mb-4 rounded-lg border border-rose-100 bg-white/60 p-4">
      <div class="mb-3 flex items-center gap-2">
        <PackageOpen class="h-4 w-4 text-rose-400" />
        <h3 class="text-sm font-semibold">
          容器扩容
        </h3>
        <span class="text-xs text-gray-400">每个容器的格子数独立设置</span>
        <span
          v-if="workDirty"
          class="text-xs text-amber-500"
        >
          有未应用的修改
        </span>
      </div>
      <template v-if="modAvailable">
        <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div class="flex items-center gap-2">
            <span class="text-sm">启用</span>
            <el-switch
              v-model="modEnable"
              size="default"
              :loading="modApplying"
              @change="onToggleMod"
            />
          </div>
          <el-button
            size="small"
            @click="containerDlg = true"
          >
            浏览并添加容器...
          </el-button>
          <el-button
            type="primary"
            size="small"
            plain
            :loading="modApplying"
            :disabled="workList.length === 0"
            @click="applyWork"
          >
            <Check class="mr-1 h-3.5 w-3.5" />
            应用
          </el-button>
          <span class="text-xs text-gray-400">已添加 {{ workList.length }} 个容器</span>
        </div>
        <el-table
          v-if="workList.length > 0"
          :data="workList"
          size="small"
          max-height="260"
          class="mt-3"
        >
          <el-table-column label="容器">
            <template #default="{ row }">
              {{ row.localName || `ID ${row.id}` }}
              <span class="text-xs text-gray-400">({{ row.origCols }}x{{ row.origRows }})</span>
            </template>
          </el-table-column>
          <el-table-column
            label="原始"
            width="90"
          >
            <template #default="{ row }">
              {{ row.origCols }} x {{ row.origRows }}
            </template>
          </el-table-column>
          <el-table-column
            label="新列"
            width="130"
          >
            <template #default="{ row }">
              <el-input-number
                v-model="row.cols"
                :min="Math.max(row.origCols, 2)"
                :max="200"
                size="small"
                controls-position="right"
              />
            </template>
          </el-table-column>
          <el-table-column
            label="新行"
            width="130"
          >
            <template #default="{ row }">
              <el-input-number
                v-model="row.rows"
                :min="Math.max(row.origRows, 2)"
                :max="200"
                size="small"
                controls-position="right"
              />
            </template>
          </el-table-column>
          <el-table-column
            width="130"
          >
            <template #default="{ row }">
              <el-button
                size="small"
                text
                :disabled="row.cols === row.origCols && row.rows === row.origRows"
                @click="restoreWork(row.id)"
              >
                还原
              </el-button>
              <el-button
                size="small"
                text
                type="danger"
                @click="removeWork(row.id)"
              >
                移除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="mt-2 text-xs text-gray-400">
          设置自动保存在本机(重开修改器不丢); 点"应用"写入游戏配置后约 3 秒内热生效;
          出于存档安全只扩不缩, 缩小需重启游戏后再改; "移除"的容器保持当前大小, 重启游戏还原
        </div>
      </template>
      <div
        v-else
        class="text-xs text-gray-400"
      >
        未检测到容器扩容 Mod 配置 —— 请先安装 BepInEx 与容器扩容插件并启动一次游戏
      </div>
    </section>

    <!-- 日志: 固定高度, 页面整体滚动 -->
    <section class="flex h-64 shrink-0 flex-col">
      <h2 class="mb-2 flex items-center gap-2 text-sm text-gray-500">
        <Lock class="h-4 w-4" />
        日志
      </h2>
      <div
        ref="logBox"
        class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-rose-100 bg-white/60 p-3 font-mono text-xs leading-5 text-gray-500"
      >
        <div
          v-if="logs.length === 0"
          class="text-gray-400"
        >
          (暂无日志)
        </div>
        <div
          v-for="(l, i) in logs"
          :key="i"
        >
          <span class="text-gray-400">[{{ l.time }}]</span>
          {{ l.message }}
        </div>
      </div>
    </section>

    <!-- 浏览并添加容器对话框 -->
    <el-dialog
      v-model="containerDlg"
      title="浏览并添加容器"
      width="720"
      :close-on-click-modal="false"
    >
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <el-checkbox
          v-model="onlyInUse"
          size="small"
          :disabled="inUseCount === 0"
        >
          只看正在使用({{ inUseCount }})
        </el-checkbox>
        <el-input
          v-model="nameFilter"
          size="small"
          placeholder="按名称/ID 筛选"
          clearable
          class="!w-44"
        />
        <el-button
          size="small"
          @click="refreshContainers"
        >
          刷新
        </el-button>
        <el-button
          size="small"
          type="primary"
          plain
          :disabled="inUseCount === 0"
          @click="addAllInUse"
        >
          添加全部正在使用
        </el-button>
        <span class="ml-auto text-xs text-gray-400">已添加 {{ workList.length }}</span>
      </div>
      <el-table
        :data="filteredContainers"
        size="small"
        height="420"
      >
        <el-table-column
          label="ID"
          width="80"
        >
          <template #default="{ row }">
            <span class="font-mono">{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column label="容器">
          <template #default="{ row }">
            {{ row.localName || row.name }} ({{ row.origCols }}x{{ row.origRows }})
          </template>
        </el-table-column>
        <el-table-column
          label="原始格子"
          width="95"
        >
          <template #default="{ row }">
            {{ row.origCols }} x {{ row.origRows }}
          </template>
        </el-table-column>
        <el-table-column
          label="当前"
          width="95"
        >
          <template #default="{ row }">
            {{ row.cols }} x {{ row.rows }}
          </template>
        </el-table-column>
        <el-table-column
          width="110"
        >
          <template #default="{ row }">
            <el-button
              size="small"
              type="primary"
              plain
              :disabled="isAdded(row.id)"
              @click="addContainer(row)"
            >
              {{ isAdded(row.id) ? '已添加' : '添加' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="mt-2 text-xs text-gray-400">
        添加后在卡片里修改目标格子数并点"应用"才会写入游戏
      </div>
      <template #footer>
        <el-button @click="containerDlg = false">
          关闭
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
