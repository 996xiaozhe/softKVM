# SoftKVM

[![CI](https://github.com/996xiaozhe/softKVM/actions/workflows/ci.yml/badge.svg)](https://github.com/996xiaozhe/softKVM/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/996xiaozhe/softKVM?include_prereleases&sort=semver)](https://github.com/996xiaozhe/softKVM/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-0f9fa8.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows-0078d4.svg)](#requirements)

[English](#english) · [简体中文](#简体中文)

## English

SoftKVM is a native Windows utility for switching monitor input sources through DDC/CI. Name your computers and consoles, map each device to one or more monitor inputs, and switch the whole setup with a global shortcut or the system tray.

> SoftKVM is currently beta software. Monitor vendors implement DDC/CI differently, so verify every input value on your own hardware before relying on it.

### Why SoftKVM?

A multi-monitor desk often has the same computer connected to several displays. Switching each monitor through its OSD is slow, while a physical KVM may be unnecessary if you only need to change video inputs. SoftKVM models the computer or console as a device and switches all assigned monitor inputs together.

For example:

| Device | Monitor 1 | Monitor 2 | Trigger |
| --- | --- | --- | --- |
| Work PC | DisplayPort 1 | DisplayPort 1 | `Ctrl+Alt+1` |
| Gaming PC | HDMI 1 | DisplayPort 2 | `Ctrl+Alt+2` |

### Features

- Discover physical monitors and read DDC/CI capabilities on Windows.
- Parse input sources reported through MCCS VCP code `0x60`.
- Switch HDMI, DisplayPort, DVI, VGA, and other monitor-reported inputs.
- Create named devices such as `Work PC`, `Xbox`, or `Nintendo Switch`.
- Map one device to different inputs across multiple monitors.
- Bind global keyboard shortcuts to device groups.
- Switch devices directly from the system-tray menu.
- Keep physical input names separate from user-defined device names.
- Fall back to a collapsible compatibility list when a monitor does not report its inputs.
- Persist device mappings, aliases, shortcuts, theme, and language locally.
- Optionally start with Windows and continue running in the system tray.
- Follow the Windows display language or choose from 18 interface languages.

### Installation

Download the latest NSIS installer from [GitHub Releases](https://github.com/996xiaozhe/softKVM/releases).

The current beta installer is not code-signed, so Windows SmartScreen may show a warning. Verify that the download comes from this repository's release page before running it.

### Requirements

- Windows with Microsoft Edge WebView2 Runtime.
- A monitor that supports DDC/CI and exposes input selection through VCP `0x60`.
- DDC/CI enabled in the monitor's OSD settings.
- A direct display connection or adapter/dock that preserves the DDC channel.

Laptop internal panels usually cannot switch inputs this way. Some docks, adapters, hardware KVMs, GPU drivers, and monitor firmware block DDC communication or use vendor-specific input values.

### Quick start

1. Enable DDC/CI in each monitor's OSD menu.
2. Open **Monitor Management** and scan the connected monitors.
3. Open **Device Management** and create a device for each computer or console.
4. Assign the appropriate monitor input to each device.
5. Bind a shortcut, or use **Switch device** from the system-tray menu.

If a monitor does not report its available inputs, expand **Compatibility mode** and test only ports that physically exist on that monitor.

### Privacy and safety

- SoftKVM has no telemetry and does not upload monitor information.
- Preferences are stored locally in the application's WebView storage.
- Global shortcuts are explicitly unregistered when you quit from the tray; Windows reclaims them if the process terminates unexpectedly.
- Input switching is a hardware operation. An incorrect compatibility value should not damage the display, but it can select a nonexistent input and temporarily leave the screen blank.

### Current scope

SoftKVM currently switches video inputs only. It does not transmit keyboard or mouse events over the network. A future keyboard/mouse sharing feature should integrate a mature open-source implementation rather than introduce a new input transport protocol here.

### Development

Prerequisites:

- Node.js 22 or later
- Rust stable with the MSVC toolchain
- Microsoft C++ Build Tools
- Microsoft Edge WebView2 Runtime

Run the development build:

```powershell
npm.cmd install
npm.cmd run tauri dev
```

Run the same checks used by CI:

```powershell
npm.cmd run check
npm.cmd run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Build the Windows installer:

```powershell
npm.cmd run tauri build
```

### Project structure

- `src-tauri/src/monitor.rs` — Win32 DDC/CI discovery, capability parsing, and input switching.
- `src-tauri/src/lib.rs` — Tauri commands, tray integration, and blocking-task dispatch.
- `src/App.tsx` — device groups, input assignments, global shortcuts, and application UI.
- `src/i18n/` — locale detection and translation resources.
- `src/components/ui/` — shadcn/ui-style reusable components.

### Contributing

Issues and pull requests are welcome. Before opening a pull request:

1. Search [existing issues](https://github.com/996xiaozhe/softKVM/issues) for duplicates.
2. Keep changes focused and explain the hardware or workflow being improved.
3. Include the monitor model, connection type, and sanitized capabilities string for DDC/CI compatibility fixes.
4. Run the CI commands above.
5. Do not include personal paths, device serial numbers, credentials, or generated build output.

By submitting a contribution, you agree that it may be distributed under the project's MIT License.

### Releases

Pushing a version tag beginning with `v` builds the Windows NSIS installer and publishes a matching GitHub Release. The tag must match the versions in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`. Tags containing `-alpha`, `-beta`, or `-rc` are published as pre-releases.

### License

SoftKVM is licensed under the [MIT License](LICENSE). This permissive license allows use, modification, redistribution, and commercial use while requiring preservation of the copyright and license notice. The software is provided without warranty. Third-party components remain subject to their respective licenses.

---

## 简体中文

SoftKVM 是一款通过 DDC/CI 切换显示器输入源的 Windows 原生工具。你可以给电脑和游戏机命名，将每个设备映射到一台或多台显示器的输入接口，再通过全局快捷键或系统托盘一次完成整组切换。

> SoftKVM 目前仍是 Beta 版本。不同厂商实现 DDC/CI 的方式并不完全一致，正式使用前请在自己的显示器上逐一验证输入源。

### 为什么使用 SoftKVM？

在多显示器桌面上，同一台电脑通常会连接多块屏幕。逐台操作显示器 OSD 很慢；如果需求只是切换视频输入，购买硬件 KVM 又可能没有必要。SoftKVM 将电脑或游戏机抽象为“设备”，并同时切换分配给它的所有显示器端口。

例如：

| 设备 | 显示器 1 | 显示器 2 | 触发方式 |
| --- | --- | --- | --- |
| 工作电脑 | DisplayPort 1 | DisplayPort 1 | `Ctrl+Alt+1` |
| 游戏电脑 | HDMI 1 | DisplayPort 2 | `Ctrl+Alt+2` |

### 功能

- 扫描 Windows 物理显示器并读取 DDC/CI capabilities。
- 解析 MCCS VCP `0x60` 上报的输入源。
- 切换 HDMI、DisplayPort、DVI、VGA 等显示器输入源。
- 创建 `工作电脑`、`Xbox`、`Nintendo Switch` 等具名设备。
- 将同一设备映射到多台显示器的不同输入端口。
- 为设备组合绑定全局键盘快捷键。
- 直接从系统托盘菜单切换设备。
- 保持物理接口名称和用户设备名称相互独立。
- 显示器未上报输入源时，提供默认折叠的兼容模式候选列表。
- 在本机保存设备映射、别名、快捷键、主题和语言。
- 可选开机自动启动，关闭窗口后继续驻留系统托盘。
- 跟随 Windows 系统语言，或手动选择 18 种界面语言。

### 安装

从 [GitHub Releases](https://github.com/996xiaozhe/softKVM/releases) 下载最新的 NSIS 安装包。

当前 Beta 安装包尚未进行代码签名，因此 Windows SmartScreen 可能显示警告。运行前请确认安装包来自本仓库的 Release 页面。

### 运行条件

- 安装了 Microsoft Edge WebView2 Runtime 的 Windows 系统。
- 显示器支持 DDC/CI，并通过 VCP `0x60` 提供输入源切换。
- 已在显示器 OSD 设置中启用 DDC/CI。
- 直连显示器，或使用能够保留 DDC 通道的转接器、扩展坞。

笔记本内置屏通常无法用这种方式切换输入。部分扩展坞、转接器、硬件 KVM、显卡驱动或显示器固件会阻断 DDC 通讯，或者使用厂商自定义输入值。

### 快速开始

1. 在每台显示器的 OSD 菜单中启用 DDC/CI。
2. 打开“显示器管理”，扫描已连接的显示器。
3. 打开“设备管理”，为每台电脑或游戏机创建设备。
4. 为设备分配对应的显示器输入端口。
5. 绑定快捷键，或从系统托盘的“切换设备”菜单进行切换。

如果显示器没有上报可用输入源，可以展开“兼容模式”；请只测试显示器上真实存在的接口。

### 隐私与安全

- SoftKVM 不包含遥测，也不会上传显示器信息。
- 偏好设置保存在应用的本机 WebView 存储中。
- 从托盘退出时会显式注销全局快捷键；进程异常终止时由 Windows 回收。
- 切换输入源属于硬件操作。错误的兼容值通常不会损坏显示器，但可能切到不存在的输入源，导致画面暂时消失。

### 当前范围

SoftKVM 目前只负责视频输入源切换，不会通过网络传输键盘或鼠标事件。未来如果加入键鼠共享，应集成熟悉、成熟的开源实现，而不是在本项目中重新设计输入传输协议。

### 开发

前置条件：

- Node.js 22 或更高版本
- Rust stable 与 MSVC 工具链
- Microsoft C++ Build Tools
- Microsoft Edge WebView2 Runtime

运行调试版：

```powershell
npm.cmd install
npm.cmd run tauri dev
```

执行与 CI 相同的检查：

```powershell
npm.cmd run check
npm.cmd run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

构建 Windows 安装包：

```powershell
npm.cmd run tauri build
```

### 项目结构

- `src-tauri/src/monitor.rs`：Win32 DDC/CI 枚举、能力解析和输入切换。
- `src-tauri/src/lib.rs`：Tauri 命令、系统托盘集成和阻塞任务调度。
- `src/App.tsx`：设备组合、端口分配、全局快捷键和应用界面。
- `src/i18n/`：语言检测和翻译资源。
- `src/components/ui/`：shadcn/ui 风格的可复用组件。

### 参与贡献

欢迎提交 Issue 和 Pull Request。提交 PR 前请：

1. 搜索[现有 Issue](https://github.com/996xiaozhe/softKVM/issues)，避免重复反馈。
2. 保持改动聚焦，并说明要改善的硬件兼容性或使用流程。
3. 修复 DDC/CI 兼容问题时，请提供显示器型号、连接方式和脱敏后的 capabilities 字符串。
4. 执行上方列出的 CI 检查。
5. 不要提交个人路径、设备序列号、凭据或生成的构建产物。

提交贡献即表示你同意该贡献可以按照本项目的 MIT License 分发。

### 发布

推送以 `v` 开头的版本 tag 后，GitHub Actions 会构建 Windows NSIS 安装包并发布同名 Release。Tag 必须与 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 中的版本一致；包含 `-alpha`、`-beta` 或 `-rc` 的 tag 会作为预发布版本。

### 开源协议

SoftKVM 使用 [MIT License](LICENSE)。该宽松协议允许使用、修改、再分发和商业使用，但必须保留版权及许可证声明；软件不提供任何担保。第三方组件仍遵循各自的许可证。
