<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Gamepad2, Play, RefreshCw, Volume2, VolumeX } from '@lucide/vue'
import type { GameMeta } from '@shared'
import { playSuccess, soundEnabled } from '../utils/sound'

const emit = defineEmits<{ (e: 'enter', gameId: string): void }>()

const games = ref<GameMeta[]>([])
const loading = ref(false)

/** 开启音效时立刻播一声做反馈(确认可用); 关闭时不播 */
function onSoundChange(val: string | number | boolean): void {
  if (val === true) playSuccess()
}

async function load(): Promise<void> {
  loading.value = true
  try {
    games.value = await window.api.listGames()
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto w-full max-w-5xl p-6">
    <!-- 标题行 -->
    <div class="mb-5 flex items-center gap-3">
      <h2 class="text-lg font-semibold text-gray-800">
        选择游戏
      </h2>
      <span class="text-xs text-gray-500">点击卡片进入修改器, 自动附加进程并扫描</span>
      <div class="ml-auto flex items-center gap-3">
        <!-- 音效总开关: 控制修改成功提示音, 状态持久化 -->
        <div class="flex items-center gap-1.5 text-xs text-gray-500">
          <component
            :is="soundEnabled ? Volume2 : VolumeX"
            class="h-3.5 w-3.5"
          />
          <span>音效</span>
          <el-switch
            v-model="soundEnabled"
            size="small"
            @change="onSoundChange"
          />
        </div>
        <el-button
          size="small"
          text
          :loading="loading"
          @click="load"
        >
          <RefreshCw class="mr-1 h-3.5 w-3.5" />
          刷新状态
        </el-button>
      </div>
    </div>

    <!-- 游戏卡片 -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="g in games"
        :key="g.id"
        class="group cursor-pointer rounded-xl border border-rose-100 bg-white/60 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-pink-300 hover:bg-white hover:shadow-md"
        @click="emit('enter', g.id)"
      >
        <div class="flex items-start gap-3">
          <div class="rounded-lg bg-pink-100 p-2.5 text-pink-500 transition group-hover:bg-pink-200">
            <Gamepad2 class="h-7 w-7" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium text-gray-800">
              {{ g.name }}
            </div>
            <div class="mt-0.5 truncate font-mono text-xs text-gray-400">
              {{ g.processName }}
            </div>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between">
          <span
            class="inline-flex items-center gap-1.5 text-xs"
            :class="g.running ? 'text-pink-500' : 'text-gray-400'"
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="g.running ? 'bg-pink-500' : 'bg-gray-300'"
            />
            {{ g.running ? '运行中' : '未启动' }}
          </span>
          <span class="inline-flex items-center gap-1 text-xs text-gray-400 transition group-hover:text-pink-500">
            进入修改器
            <Play class="h-3 w-3" />
          </span>
        </div>
      </div>
    </div>

    <div
      v-if="!loading && games.length === 0"
      class="mt-10 text-center text-sm text-gray-400"
    >
      暂无已适配的游戏
    </div>
  </div>
</template>
