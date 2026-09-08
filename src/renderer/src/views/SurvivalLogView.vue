<script setup lang="ts">
// Survival Log 专属修改页: 属性表 + 容器扩容 + 日志
import { ArrowLeft, ScanLine } from '@lucide/vue'
import AttrTable from '../components/AttrTable.vue'
import ContainerCard from '../components/ContainerCard.vue'
import LogPanel from '../components/LogPanel.vue'
import { useTrainer } from '../composables/useTrainer'

const emit = defineEmits<{ (e: 'back'): void }>()

const { meta, scanning, scanned, rows, hints, onScan, refresh } = useTrainer('survival-log')
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
        {{ meta?.name ?? 'Survival Log' }}
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

    <AttrTable
      :rows="rows"
      :scanned="scanned"
      :hints="hints"
      @refresh="refresh"
    />

    <ContainerCard game-id="survival-log" />

    <LogPanel />
  </div>
</template>
