/// <reference types="vite/client" />

import type { GameTrainerBoxApi } from '@shared'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare global {
  interface Window {
    api: GameTrainerBoxApi
  }
}

export {}
