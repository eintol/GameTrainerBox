# 更新日志

格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 新增

- 人物移速调整：属性表新增「移速」行（AttrName.MoveSpeed=401，同字典附加键机制 `extraKeys`），
  支持查看 / 修改 / 锁定 / 一键拉满；写入值超游戏硬封顶（显示 10.0）时自动抬高封顶字段；
  新增诊断脚本 `diag-movespeed`（复验移速数值口径与写入链路）
- 本机配置文件 `local.env` 机制（gitignore，模板 `local.env.example`）：游戏安装根目录等机器相关
  配置改为 环境变量 > `local.env`（便携版 exe 同目录或项目根）> 占位符 的解析链，
  解决 setx 环境变量对已打开终端不生效导致容器扩容面板误报"未检测到"的问题

## [0.1.0] - 2026-09-05

首个公开版本。

### 新增

- 通用内存引擎（koffi 调 Windows API：进程附加、模块/区域枚举、全堆签名扫描、内存读写）
- 属性修改：五维属性查看/修改/锁定、属性上限一键拉满、修改随游戏存档持久化
- 容器扩容：与 BepInEx 插件 SLContainerExpand（v0.8）协作，每容器格子数独立设置、游戏运行中热生效、只扩不缩安全保护
- 《生存日志》（Survival Log，Unity IL2CPP）适配 profile 与属性字典自动定位/鉴别链
- 诊断与定位脚本：`locate-attr-class` / `smoke-engine` / `diag-rva` / `diag-dicts` / `wait-scan`
- 活文档体系：功能说明、工具链说明、Mod 说明、踩坑记录
