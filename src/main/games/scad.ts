// SCAD 适配器 profile(NAISU, Steam appid 2854620)
// 版本 1.0(Unity 6000.3.14f1, IL2CPP metadata v39)
// 规格来源: Il2CppDumper(metadata v39 fork, 见 docs/辅助工具使用说明.md) dump.cs
// 形态: 静态单例字段(非属性字典) —— 类名定位 klass, 无版本相关 RVA
//   InventoryController.main(static_fields+0x0) -> resources 5 项 int @ 0x1C..0x2C
//   Hovercraft.player(static_fields+0x0) -> Entity.currentHealth 0x2C / maxHealth 0x28,
//     currentShield 0x94 / maxShield 0x90, speed 0xA8(speedCache 0xAC 同步写)
// 本机游戏目录: local.env 的 GTB_SCAD_ROOT(当前无 Mod 配置需求, 预留)
import type { SingletonProfile } from './types'

export const scadProfile: SingletonProfile = {
  id: 'scad',
  name: 'SCAD',
  processName: 'SCAD.exe',
  moduleName: 'GameAssembly.dll',
  kind: 'singleton-fields',
  singletons: [
    { id: 'inventory', className: 'InventoryController' },
    // 悬浮艇只在远征局内存在(基地/主界面 player 静态为 null), 标记可选
    { id: 'hovercraft', className: 'Hovercraft', optional: true }
  ],
  // Il2CppClass 内 static_fields 指针偏移: Unity 6000.3 实测 0xB8
  // (新布局 Il2CppClass_1 + static_fields@0xB8 + rgctx + Il2CppClass_2; 经典布局为 0xA8)
  staticFieldsOffset: 0xb8,
  fields: [
    { key: 1, name: '废料', singleton: 'inventory', offset: 0x1c, type: 'int32' },
    { key: 2, name: '木材', singleton: 'inventory', offset: 0x20, type: 'int32' },
    { key: 3, name: '金属', singleton: 'inventory', offset: 0x24, type: 'int32' },
    { key: 4, name: '燃料', singleton: 'inventory', offset: 0x28, type: 'int32' },
    { key: 5, name: '塑料', singleton: 'inventory', offset: 0x2c, type: 'int32' },
    {
      key: 10,
      name: '生命',
      singleton: 'hovercraft',
      offset: 0x2c,
      type: 'float32',
      cap: { offset: 0x28, type: 'float32' }
    },
    {
      key: 11,
      name: '护盾',
      singleton: 'hovercraft',
      offset: 0x94,
      type: 'float32',
      cap: { offset: 0x90, type: 'float32' }
    },
    { key: 12, name: '移速', singleton: 'hovercraft', offset: 0xa8, type: 'float32', also: [0xac] }
  ],
  uiHints: [
    '资源为整数直接写入, 基地/远征均可改; 生命/护盾点"拉满"即设为当前上限; 锁定后每 0.3 秒自动写回',
    '生命/护盾/移速需在远征局内(悬浮艇已生成)扫描; 进远征后点"重新扫描"即可; 修改资源后游戏内正常存档一次即可持久化'
  ]
}
