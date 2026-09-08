<script setup lang="ts">
// Survival Log 专属修改页: 属性表 + 容器扩容 + 日志
import AttrTable from '../components/AttrTable.vue'
import ContainerCard from '../components/ContainerCard.vue'
import GameHeader from '../components/GameHeader.vue'
import LogPanel from '../components/LogPanel.vue'
import { useTrainer } from '../composables/useTrainer'

const emit = defineEmits<{ (e: 'back'): void }>()

const { meta, scanning, scanned, rows, hints, onScan, refresh } = useTrainer('survival-log')
</script>

<template>
  <div class="flex h-full w-full flex-col overflow-y-auto p-6 pt-4">
    <!-- 游戏与扫描 -->
    <GameHeader
      :name="meta?.name ?? 'Survival Log'"
      :scanning="scanning"
      hint="请先启动游戏并进入存档(局内); 修改后游戏内正常存档一次即可持久化"
      @back="emit('back')"
      @scan="onScan"
    />

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
