<script setup lang="ts">
// SCAD 专属修改页: 属性表 + 日志(未接容器扩容 Mod, 无容器卡片)
import AttrTable from '../components/AttrTable.vue'
import GameHeader from '../components/GameHeader.vue'
import LogPanel from '../components/LogPanel.vue'
import { useTrainer } from '../composables/useTrainer'

const emit = defineEmits<{ (e: 'back'): void }>()

const { meta, scanning, scanned, rows, hints, onScan, refresh } = useTrainer('scad')
</script>

<template>
  <div class="flex h-full w-full flex-col overflow-y-auto p-6 pt-4">
    <!-- 游戏与扫描 -->
    <GameHeader
      :name="meta?.name ?? 'SCAD'"
      :scanning="scanning"
      hint="请先启动游戏并进入基地; 修改悬浮艇属性需在远征局内(基地/主界面时悬浮艇数据为空属正常)"
      @back="emit('back')"
      @scan="onScan"
    />

    <AttrTable
      :rows="rows"
      :scanned="scanned"
      :hints="hints"
      @refresh="refresh"
    />

    <LogPanel />
  </div>
</template>
