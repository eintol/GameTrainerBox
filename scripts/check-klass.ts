// 诊断: 读 TypeInfo 原始值, 区分"主界面未初始化"与"代码 bug"
import { GameProcess } from '../src/main/engine/process'
import { survivalLogProfile } from '../src/main/games/survival-log'

const proc = GameProcess.attach(survivalLogProfile.processName)
const base = proc.moduleBase(survivalLogProfile.moduleName)
console.log('GameAssembly 基址: 0x' + (base?.toString(16) ?? 'null'))
const v = proc.readU64(base! + survivalLogProfile.attrTypeInfoRva)
console.log('Attr_TypeInfo 处读到: 0x' + (v?.toString(16) ?? 'null'), '| %8 =', v ? v % 8 : '?')
// 对照: GameSaveManager_TypeInfo(主界面已初始化的类, RVA 0x53651a8)
const v2 = proc.readU64(base! + 0x53651a8)
console.log('GameSaveManager_TypeInfo 处: 0x' + (v2?.toString(16) ?? 'null'))
proc.close()
