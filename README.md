<div align="center">

# 点点

一只运行在 macOS 桌面上的 Electron 桌宠：透明悬浮、可拖拽、会自己走动，也能接入 OpenRouter 进行聊天、截图翻译和划词翻译。

![Platform](https://img.shields.io/badge/platform-macOS-black)
![Electron](https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)
![AI](https://img.shields.io/badge/AI-OpenRouter-6E56CF)

</div>

## 简介

**点点** 是一个基于 Electron 的 macOS 桌面宠物应用。它以透明、无边框、始终置顶的窗口停留在桌面上，支持拖拽、悬停互动、自动走动、睡觉、翻滚和 Claude Code 状态提示。

项目使用原生 HTML / CSS / JavaScript 编写，不依赖前端框架。AI 能力通过 OpenRouter 的 Chat Completions 接口接入，API Key 只保存在本机 Electron userData 目录中，并且只在主进程中读取。

## 功能特性

- **透明桌面宠物**：无边框透明窗口、始终置顶、隐藏 Dock 图标，像桌宠一样停在桌面上。
- **自然互动动画**：待机、走路、睡觉、翻滚、悬停反应、庆祝等逐帧 PNG 动画。
- **自由拖拽**：按住宠物即可移动到桌面任意位置。
- **原生右键菜单**：支持打招呼、创建宠物、聊天、设置和退出。
- **AI 聊天**：iMessage 风格聊天窗口，支持流式响应和打字机效果。
- **截图翻译**：使用 `Control + Command + A` 框选屏幕区域，调用多模态模型识别并翻译英文。
- **划词翻译**：选中英文后自动复制、翻译，并在选区附近显示轻量气泡。
- **本地配置管理**：API Key、模型、接口地址、宠物名称和品种保存在本机配置文件。
- **Claude Code 状态联动**：监听 `~/.claude/pet-state`，展示工作中、等待操作、完成等状态。
- **单实例运行**：通过 Electron 单实例锁避免重复启动多只桌宠。

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 桌面运行时 | Electron 31 |
| 界面 | 原生 HTML / CSS / JavaScript |
| 主进程能力 | Electron BrowserWindow、IPC、Menu、globalShortcut、dialog |
| 安全隔离 | `contextIsolation` + preload bridge，关闭 `nodeIntegration` |
| 全局输入监听 | `uiohook-napi` |
| AI 接口 | OpenRouter Chat Completions API |
| 打包 | electron-builder |
| 动画资源 | PNG frame sequence |

## 安装和运行

### 环境要求

- macOS
- Node.js 18 或更高版本
- npm

### 本地开发

```bash
git clone https://github.com/viajiang8-droid/Pet-.git
cd Pet-
npm install
npm start
```

启动后，点点会出现在屏幕左下角。右键桌宠可以打开菜单，选择聊天、设置或退出。

### 打包

```bash
npm run dist
```

构建产物会输出到 `dist/`。当前 `electron-builder` 配置面向 macOS，产物名称为 `点点`。

### 本地发布到 `/Applications`

```bash
npm run release
```

该脚本会依次执行：

1. 同步 `diandian/` 源图到 `assets/pets/diandian/frames/`
2. 运行 `npm run dist`
3. 覆盖安装到 `/Applications/点点.app`
4. 重启应用

## 配置

本项目不依赖环境变量。运行时配置保存在 Electron userData 目录：

```text
~/Library/Application Support/desktop-pet/config.json
```

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| `apiKey` | OpenRouter API Key | 空 |
| `model` | Chat Completions 模型 ID | `deepseek/deepseek-chat` |
| `baseURL` | OpenRouter 兼容接口地址 | `https://openrouter.ai/api/v1/chat/completions` |
| `petName` | 创建宠物时填写的名称 | 空 |
| `petBreed` | 创建宠物时选择的品种 ID | 空 |

可以通过桌宠右键菜单中的 **设置...** 写入 API Key、模型和接口地址。API Key 不会写入仓库，也不会暴露给渲染进程。

## macOS 权限

部分能力需要 macOS 隐私权限：

| 功能 | 所需权限 | 说明 |
| --- | --- | --- |
| 划词翻译 | 辅助功能、输入监控 | 监听鼠标选择，并通过 AppleScript 模拟 `Command + C` 读取选中文本 |
| 截图翻译 | 屏幕录制 | 使用系统 `screencapture` 进行区域截图 |
| 全局快捷键 | 系统快捷键注册 | `Control + Command + A` 触发截图翻译 |

首次运行相关功能时，系统可能会弹出授权提示。授权后通常需要重启应用。

## 项目结构

```text
.
├── src/
│   ├── main.js                 # Electron 主进程：窗口、菜单、IPC、快捷键、翻译、状态监听
│   ├── config.js               # 读写 userData/config.json
│   ├── ai.js                   # OpenRouter 请求、SSE 解析、聊天/翻译封装
│   ├── index.html              # 桌宠主窗口
│   ├── renderer.js             # 桌宠动画、拖拽、气泡、Claude 状态展示
│   ├── preload.js              # 桌宠窗口 preload bridge
│   ├── chat.html               # AI 聊天窗口
│   ├── chat.css
│   ├── chat.js
│   ├── chat-preload.js
│   ├── settings.html           # API 配置窗口
│   ├── settings.css
│   ├── settings.js
│   ├── settings-preload.js
│   ├── create-pet.html         # 创建宠物窗口
│   ├── create-pet.css
│   ├── create-pet.js
│   ├── create-pet-preload.js
│   ├── tip.html                # 划词翻译气泡窗口
│   ├── tip.css
│   ├── tip.js
│   └── tip-preload.js
├── assets/
│   └── pets/
│       ├── diandian/           # 当前桌宠资源
│       │   ├── pet.json
│       │   └── frames/         # idle / walk / sleep / roll / cheer 等逐帧动画
│       └── little-mao-puppy/   # 备用宠物资源
├── diandian/                   # 点点源动画帧，用于同步到 assets
├── little-mao-puppy/           # 备用源素材
├── build/                      # 应用图标资源
├── scripts/
│   ├── sync-frames.sh          # 同步源动画帧到运行时 assets
│   ├── release.sh              # 打包并安装到 /Applications
│   └── pet-claude-hook.sh      # Claude Code hooks 状态写入脚本
├── package.json
└── README.md
```

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm start` | 启动 Electron 应用 |
| `npm run sync-frames` | 同步桌宠源图到运行时动画目录 |
| `npm run dist` | 使用 electron-builder 打包 macOS 应用 |
| `npm run release` | 同步资源、打包、覆盖安装并重启 `/Applications/点点.app` |

## Claude Code 状态联动

桌宠会监听：

```text
~/.claude/pet-state
```

`scripts/pet-claude-hook.sh` 可被 Claude Code hooks 调用，写入以下状态：

- `working`：显示工作中和累计用时
- `waiting`：显示等待用户操作
- `done`：显示完成提示并播放庆祝动画

## 安全说明

- 所有渲染窗口均开启 `contextIsolation`，并关闭 `nodeIntegration`。
- API Key 仅由主进程读取和使用，聊天窗口只能通过受限 IPC 发送消息文本。
- 本地配置文件位于项目目录之外，`config.json` 也已在 `.gitignore` 中排除。
- 截图和划词翻译只在用户触发或选择文本后执行。

## 致谢

- 桌宠素材：Hao Y.
- AI 能力：OpenRouter
