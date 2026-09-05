import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared'
import type {
  AppInfo,
  AttrRow,
  ContainerInfo,
  GameTrainerBoxApi,
  GameMeta,
  LogEntry,
  ModConfigPatch,
  ModConfigState,
  ScanResultDto
} from '../shared'

const api: GameTrainerBoxApi = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo),
  listGames: (): Promise<GameMeta[]> => ipcRenderer.invoke(IPC.gameList),
  scanGame: (gameId: string): Promise<ScanResultDto> => ipcRenderer.invoke(IPC.gameScan, gameId),
  getAttrs: (): Promise<AttrRow[]> => ipcRenderer.invoke(IPC.gameGetAttrs),
  setAttr: (key: number, value: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC.gameSetAttr, key, value),
  setMax: (key: number): Promise<boolean> => ipcRenderer.invoke(IPC.gameSetMax, key),
  setLock: (key: number, enabled: boolean, target: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC.gameSetLock, key, enabled, target),
  getModConfig: (gameId: string): Promise<ModConfigState> =>
    ipcRenderer.invoke(IPC.modGetConfig, gameId),
  setModConfig: (gameId: string, patch: ModConfigPatch): Promise<ModConfigState> =>
    ipcRenderer.invoke(IPC.modSetConfig, gameId, patch),
  listContainers: (gameId: string): Promise<ContainerInfo[]> =>
    ipcRenderer.invoke(IPC.modListContainers, gameId),
  onLog: (cb: (entry: LogEntry) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, entry: LogEntry): void => cb(entry)
    ipcRenderer.on(IPC.gameLog, listener)
    return () => ipcRenderer.removeListener(IPC.gameLog, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
