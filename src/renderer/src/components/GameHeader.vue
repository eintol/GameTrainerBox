<script setup lang="ts">
// 修改页公共头部: 返回按钮 + 游戏名 + 重新扫描 + 场景提示
import { ArrowLeft, ScanLine } from '@lucide/vue'

defineProps<{
  /** 游戏显示名(取自 profile meta, 未加载时由视图兜底) */
  name: string
  /** 是否正在扫描(控制重新扫描按钮 loading) */
  scanning: boolean
  /** 场景提示文案(各游戏的进入条件说明) */
  hint: string
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'scan'): void
}>()
</script>

<template>
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
      {{ name }}
    </h2>
    <el-button
      type="primary"
      :loading="scanning"
      size="default"
      @click="emit('scan')"
    >
      <ScanLine class="mr-1 h-4 w-4" />
      重新扫描
    </el-button>
    <span class="ml-auto text-xs text-gray-500">
      {{ hint }}
    </span>
  </section>
</template>
