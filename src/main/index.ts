import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { IPC } from '../shared'
import type { AppInfo, AttrRow, GameMeta, LogEntry, ModConfigPatch, ScanResultDto } from '../shared'
import { TrainerService } from './trainer'

let trainer: TrainerService | null = null

function pushLog(message: string): void {
  const entry: LogEntry = { time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), message }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.gameLog, entry)
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#fdf2f8',
    show: false,
    title: 'GameTrainerBox',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    // 开发模式: electron-vite 启动的 dev server
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  trainer = new TrainerService(pushLog)

  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    node: process.versions.node ?? '',
    chrome: process.versions.chrome ?? ''
  }))

  ipcMain.handle(IPC.gameList, (): GameMeta[] => trainer!.listGames())

  ipcMain.handle(IPC.gameScan, async (_e, gameId: string): Promise<ScanResultDto> => {
    try {
      const { info } = await trainer!.scan(gameId)
      return { ok: true, message: info, attrs: trainer!.getAttrs() }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      pushLog(`[!] ${msg}`)
      return { ok: false, message: msg, attrs: [] }
    }
  })

  ipcMain.handle(IPC.gameGetAttrs, (): AttrRow[] => trainer!.getAttrs())

  ipcMain.handle(IPC.gameSetAttr, (_e, key: number, value: number): boolean =>
    trainer!.setAttr(key, value)
  )
  ipcMain.handle(IPC.gameSetMax, (_e, key: number): boolean => trainer!.setMax500(key))
  ipcMain.handle(IPC.gameSetLock, (_e, key: number, enabled: boolean, target: number): boolean =>
    trainer!.setLock(key, enabled, target)
  )

  ipcMain.handle(IPC.modGetConfig, (_e, gameId: string) => trainer!.getModConfig(gameId))
  ipcMain.handle(IPC.modSetConfig, (_e, gameId: string, patch: ModConfigPatch) =>
    trainer!.setModConfig(gameId, patch)
  )
  ipcMain.handle(IPC.modListContainers, (_e, gameId: string) => trainer!.listContainers(gameId))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  trainer?.detach()
  trainer = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
