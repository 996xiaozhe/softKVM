# SoftKVM

SoftKVM 是一个 Windows 原生显示器输入源切换工具。它通过 DDC/CI（MCCS VCP `0x60`）扫描物理显示器、读取显示器上报的输入源，并允许为 HDMI、DisplayPort 等接口设置设备别名和全局快捷键。

> 当前版本：`0.1.0-beta.1`。这是首次测试版本，建议先在目标显示器上逐个验证输入源值。

## 功能

- 扫描 Windows 物理显示器并读取 DDC/CI capabilities
- 解析 `vcp(60(...))` 上报的输入源列表
- 切换 HDMI、DisplayPort、DVI、VGA 等输入源
- 创建设备（`NS`、`Xbox`、`PC 1` 等）并绑定全局组合键
- 将一个设备分配到多台显示器的不同端口，一次快捷键完成组合切换
- 显示器管理中的端口保持真实接口名，设备名称与接口名称分离
- 未上报 capabilities 的兼容输入源默认折叠，可按显示器展开或隐藏
- 本机保存设备、显示器别名、端口分配及快捷键
- 支持配置 Windows 开机自动启动
- 关闭窗口后驻留系统托盘，托盘菜单可真正退出
- 五种可持久化主题色
- 对未完整上报 capabilities 的显示器提供常见输入源兼容列表

## 技术栈

- Rust + Tauri 2
- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui 组件结构
- Windows `Dxva2.dll` 物理显示器配置 API

## 开发运行

前置条件：Node.js、Rust MSVC 工具链、Microsoft C++ Build Tools 和 WebView2。

```powershell
npm.cmd install
npm.cmd run tauri dev
```

生产构建：

```powershell
npm.cmd run tauri build
```

## 硬件兼容性

1. 在显示器 OSD 菜单中启用 **DDC/CI**。
2. 笔记本内置屏通常不支持通过 VCP `0x60` 切换输入。
3. 一些扩展坞、KVM、HDMI 转接器或显卡驱动会阻断 DDC 通道。
4. 部分显示器支持切换却不会上报输入源列表。此时 SoftKVM 会进入兼容模式；只应测试显示器上实际存在的接口。
5. 厂商可能使用非标准输入源值。界面中的“技术信息”会显示原始 capabilities，便于后续添加机型兼容规则。

显示器输入源切换是硬件操作，最终兼容性必须在目标显示器上实测。

## 数据与安全

- 设备、别名、端口映射、快捷键和主题保存在本机 WebView 存储中。
- 应用不包含遥测，不会向外部服务器上传显示器信息。
- 全局快捷键在托盘退出时显式注销；进程异常结束时由 Windows 回收。
- 本 Beta 使用 NSIS `.exe` 安装包，尚未进行代码签名，Windows SmartScreen 可能显示警告。

## 当前范围

SoftKVM 目前只负责视频输入源切换。网络键盘和鼠标共享计划采用可选的 Deskflow 集成，而不是自行实现输入传输协议。

## 代码位置

- `src-tauri/src/monitor.rs`：Win32 DDC/CI 枚举、能力解析和输入切换
- `src-tauri/src/lib.rs`：Tauri 命令与阻塞任务调度
- `src/App.tsx`：设备组合、端口分配、配置迁移、全局快捷键与三页主界面
- `src/components/ui/`：shadcn/ui 风格基础组件
