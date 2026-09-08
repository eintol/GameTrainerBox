<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, PackageOpen } from '@lucide/vue'
import type { ContainerInfo, ContainerOverride, ModConfigPatch } from '@shared'
import { playSuccess } from '../utils/sound'

// 容器扩容公共组件: 自包含配置读写、工作区(localStorage 持久化)与浏览添加对话框;
// profile 未接入 modConfigPath 的游戏整个卡片不渲染(v-if="modSupported")
const props = defineProps<{ gameId: string }>()

/** profile 是否接入容器扩容(false = 该游戏整个卡片不显示) */
const modSupported = ref(false)
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
})

async function loadModConfig(): Promise<void> {
  const s = await window.api.getModConfig(props.gameId)
  modSupported.value = s.supported
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
    modSupported.value = s.supported
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
</script>

<template>
  <!-- 容器扩容: 未接入的游戏(profile 无 modConfigPath)整个卡片不显示 -->
  <section
    v-if="modSupported"
    class="mb-4 rounded-lg border border-rose-100 bg-white/60 p-4"
  >
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
</template>
