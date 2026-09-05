# 贡献指南

感谢关注 GameTrainerBox！本项目最核心的设计是：**加一个新游戏 = 在 `src/main/games/` 加一个 profile 数据文件**，通用内存引擎零改动。

## 开发环境

- Windows 10/11（内存引擎依赖 kernel32，koffi FFI 仅在主进程使用）
- Node.js 20+、pnpm 11（镜像配置见 `.npmrc`）
- 适配 Unity IL2CPP 游戏时另需 [Il2CppDumper](https://github.com/Perfare/Il2CppDumper) 与 BepInEx 6 BE 构建（用法见 [docs/辅助工具使用说明.md](docs/辅助工具使用说明.md)）

```bash
pnpm install
pnpm dev            # 开发模式
pnpm typecheck      # 提交前必跑（tsc + vue-tsc 双侧）
pnpm lint           # 提交前必跑
```

## 添加新游戏（核心贡献路径）

1. **dump**：用 Il2CppDumper 处理目标游戏的 `GameAssembly.dll` + `global-metadata.dat`，得到 `dump.cs` / `script.json`
2. **建 profile**：在 `src/main/games/` 新建 `<game-id>.ts`，参照 `survival-log.ts` 填写：进程名、模块名、TypeInfo RVA、字段偏移、属性键映射、`attrNameValues` 合法值
3. **重定位 RVA**：`script.json` 的地址与运行时槽位可能有偏差，用 `scripts/locate-attr-class.ts` 流程定位（堆搜字符串 → klass 投票 → 模块反搜 → 自动验证）
4. **冒烟验证**：`scripts/smoke-engine.ts`（esbuild 打包后 node 运行，需在游戏局内）
5. **接 UI**：在 `src/shared/index.ts` 补 IPC 常量与类型 → preload 实现白名单 API → renderer 界面
6. **同步文档**：功能/行为变更必须同步更新对应活文档；新踩的坑按「症状/根因/解法/规则」回写 [docs/踩坑记录.md](docs/踩坑记录.md)

> IL2CPP 适配红线（完整版见 [CLAUDE.md](CLAUDE.md)「硬性规则」）：禁止对 Il2CppClass/托管对象内存布局做偏移假设；
> 禁止 Harmony/HarmonyX patch（部分 Unity 6 版本上必闪退），hook 类需求走「注入 MonoBehaviour 主线程轮询 + interop 直改数据」；
> 扫描结果必须走多候选鉴别链，禁止「取第一个最大」的朴素选择。

## 提交规范

- 提交信息：`<type>(scope): <中文摘要>`，type 用 feat/fix/refactor/docs/test/chore
- 注释中文、标识符英文；ESLint + Prettier 已配置（`pnpm exec eslint . --fix` 自动修格式）
- 提交前 `pnpm typecheck` + `pnpm lint` 全绿

## 文档约定

- **活文档**（docs/ 下不带日期前缀）随迭代持续更新；归档快照带日期前缀（如 `2026-09-04-*`），内容定格不再修改
- 踩坑记录遵循「症状/根因/解法/规则」四段式；同根因合并进原条目，被取代的过时条目直接删除

## 版权与用途

贡献代码即同意以 [MIT](LICENSE) 许可发布。本项目仅面向单机游戏的学习与研究用途（见 [README 免责声明](README.md#免责声明--disclaimer)）。
