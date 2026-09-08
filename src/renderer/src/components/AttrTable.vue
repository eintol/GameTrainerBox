<script setup lang="ts">
import { reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Zap } from '@lucide/vue'
import type { AttrRow } from '@shared'
import { playSuccess } from '../utils/sound'

// 属性表公共组件: 行数据与扫描状态由父组件(游戏专属视图)传入;
// "改为"输入/锁定开关/一键拉满的交互与 IPC 写入自包含, 写入后 emit refresh 让父组件拉新数据
const props = defineProps<{
  rows: AttrRow[]
  /** 是否已成功扫描(未扫描时输入与按钮全部禁用) */
  scanned: boolean
  /** 表格下方提示文案(来自 profile.uiHints) */
  hints: string[]
}>()

const emit = defineEmits<{ (e: 'refresh'): void }>()

/** 每行的"改为"输入 */
const edits = reactive<Record<number, string>>({})
/** 每行锁定开关 */
const locks = reactive<Record<number, boolean>>({})

/** 应用单行: 把该行"改为"输入的显示值写入内存 */
async function onApplyRow(key: number): Promise<void> {
  const row = props.rows.find((r) => r.key === key)
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
  emit('refresh')
}

/** 一键拉满: 有独立上限键的行走 setMax(游戏硬封顶, Survival Log 口径 500), 附加键写自身硬封顶字段 */
async function onMax(key: number): Promise<void> {
  const row = props.rows.find((r) => r.key === key)
  if (!row) return
  let ok = false
  if (row.hasCap) ok = await window.api.setMax(key)
  else if (row.maxDisplay !== null) ok = await window.api.setAttr(key, row.maxDisplay)
  if (ok) playSuccess()
  emit('refresh')
}

async function onLockChange(key: number, enabled: boolean): Promise<void> {
  const row = props.rows.find((r) => r.key === key)
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
            @click="onMax(row.key)"
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
            @click="onMax(row.key)"
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
        {{ hints.join('；') }}
      </span>
    </div>
  </section>
</template>
