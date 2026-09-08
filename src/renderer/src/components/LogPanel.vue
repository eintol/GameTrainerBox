<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Lock } from '@lucide/vue'
import type { LogEntry } from '@shared'

// 日志面板: 自管理 onLog 订阅、条数上限与自动滚底, 父组件零配置
const logs = ref<LogEntry[]>([])
const logBox = ref<HTMLElement | null>(null)
let unsubLog: (() => void) | null = null

onMounted(() => {
  unsubLog = window.api.onLog((entry) => {
    logs.value.push(entry)
    if (logs.value.length > 300) logs.value.splice(0, logs.value.length - 300)
    requestAnimationFrame(() => logBox.value?.scrollTo({ top: logBox.value!.scrollHeight }))
  })
})

onUnmounted(() => {
  unsubLog?.()
})
</script>

<template>
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
</template>
