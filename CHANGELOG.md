# 更新日志

格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-09-05

首个公开版本。

### 新增

- 通用内存引擎（koffi 调 Windows API：进程附加、模块/区域枚举、全堆签名扫描、内存读写）
- 属性修改：五维属性查看/修改/锁定、属性上限一键拉满、修改随游戏存档持久化
- 容器扩容：与 BepInEx 插件 SLContainerExpand（v0.8）协作，每容器格子数独立设置、游戏运行中热生效、只扩不缩安全保护
- 《生存日志》（Survival Log，Unity IL2CPP）适配 profile 与属性字典自动定位/鉴别链
- 诊断与定位脚本：`locate-attr-class` / `smoke-engine` / `diag-rva` / `diag-dicts` / `wait-scan`
- 活文档体系：功能说明、工具链说明、Mod 说明、踩坑记录
