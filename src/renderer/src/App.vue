<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import { Gamepad2 } from '@lucide/vue'
import type { AppInfo } from '@shared'
import HomeView from './views/HomeView.vue'
import SurvivalLogView from './views/SurvivalLogView.vue'
import ScadView from './views/ScadView.vue'

const info = ref<AppInfo | null>(null)
/** 当前进入的游戏 id; null = 首页 */
const currentGameId = ref<string | null>(null)

/** 游戏 id -> 专属修改页; 新增游戏适配时在此注册 */
const gameViews: Record<string, Component> = {
  'survival-log': SurvivalLogView,
  scad: ScadView
}

const activeView = computed(() => (currentGameId.value ? (gameViews[currentGameId.value] ?? null) : null))

onMounted(async () => {
  info.value = await window.api.getAppInfo()
})
</script>

<template>
  <div class="flex h-screen flex-col bg-gradient-to-br from-pink-50 via-rose-50 to-pink-100 text-gray-700">
    <!-- 顶栏(仅首页显示) -->
    <header
      v-if="!currentGameId"
      class="flex items-center gap-3 border-b border-rose-100 bg-white/50 px-6 py-4"
    >
      <Gamepad2 class="h-7 w-7 text-pink-400" />
      <h1 class="text-xl font-semibold tracking-wide text-gray-800">
        GameTrainerBox
      </h1>
      <el-tag
        v-if="info"
        size="small"
        effect="plain"
      >
        v{{ info.version }}
      </el-tag>
      <span class="ml-auto text-xs text-gray-400">游戏修改器盒子</span>
    </header>

    <main class="min-h-0 flex-1 overflow-hidden">
      <HomeView
        v-if="!currentGameId"
        @enter="currentGameId = $event"
      />
      <component
        :is="activeView"
        v-else-if="activeView"
        @back="currentGameId = null"
      />
      <!-- profile 已注册但无专属修改页(新增游戏适配时忘了在 gameViews 注册) -->
      <div
        v-else
        class="flex h-full flex-col items-center justify-center gap-3 text-sm text-gray-400"
      >
        <span>该游戏暂无专属修改页(未在 App.vue 的 gameViews 注册)</span>
        <el-button
          size="default"
          text
          @click="currentGameId = null"
        >
          返回
        </el-button>
      </div>
    </main>
  </div>
</template>
