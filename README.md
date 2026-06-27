<div align="center">

# 🐶 小鸡毛 · 桌面宠物

一只能在 macOS 桌面上陪你、还能用真 AI 跟你聊天的悬浮小狗。

<!-- 徽章 -->
![Platform](https://img.shields.io/badge/platform-macOS-black)
![Electron](https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=black)
![AI](https://img.shields.io/badge/AI-OpenRouter-6E56CF)

</div>

---

## 简介

**小鸡毛** 是一个基于 [Electron](https://www.electronjs.org/) 的 macOS 桌面宠物：一只背景透明、始终悬浮在桌面最上层的小狗。平时安静地待着，鼠标滑过它身上时会动起来、跟你打招呼；你也可以把它拖到桌面任意角落，或打开一个 iMessage 风格的聊天窗口，接入 [OpenRouter](https://openrouter.ai/) 和真正的大模型对话——回复以流式打字机效果一个字一个字蹦出来。

整个项目使用原生 HTML / CSS / JavaScript 编写，**没有任何前端框架**，结构清晰，适合作为 Electron 桌面应用的入门参考。

## ✨ 功能特性

- 🪟 **透明悬浮窗** — 无边框、背景透明、始终置顶，桌宠像真的站在桌面上
- 🖐️ **悬停互动** — 默认静止不打扰；鼠标滑到身上时播放逐帧动画并弹出「你好呀」气泡
- 🖱️ **自由拖动** — 按住即可把桌宠拖到屏幕任意位置
- 📋 **原生右键菜单** — 打招呼 / 聊天 / 设置 / 退出，使用 macOS 系统级菜单样式
- 💬 **AI 聊天窗口** — iMessage 风格气泡界面，支持「正在输入」动画与逐字打字机输出
- 🌊 **流式响应** — 通过 OpenRouter 的 SSE 流式接口实时接收模型回复
- 🔒 **隐私优先** — API Key 仅存于本地、只在主进程使用，渲染层与 Git 仓库都接触不到
- 🐾 **单实例运行** — 内置单实例锁，重复启动不会叠出多只桌宠

## 🛠 技术栈

| 类别 | 选型 |
| --- | --- |
| 运行时 / 框架 | Electron 31 |
| 界面 | 原生 HTML / CSS / JavaScript（无框架） |
| 进程通信 | Electron IPC + `contextBridge` 预加载桥 |
| AI 接口 | OpenRouter（OpenAI 兼容的 Chat Completions，流式 SSE） |
| 动画 | 逐帧 PNG 序列图（spritesheet 备用） |

> 安全基线：所有窗口均开启 `contextIsolation`、关闭 `nodeIntegration`，渲染进程通过受限的 preload 桥与主进程通信。

## 🚀 快速开始

### 环境要求

- macOS
- [Node.js](https://nodejs.org/) ≥ 18（自带 npm）

### 安装与运行

```bash
# 1. 克隆仓库
git clone https://github.com/viajiang8-droid/Pet-.git
cd Pet-

# 2. 安装依赖（会下载 Electron 运行时）
npm install

# 3. 启动桌宠
npm start
```

启动后，小狗会出现在屏幕**左下角**。把鼠标滑到它身上看看它的反应，或右键唤出菜单。

> 退出：右键桌宠 →「退出 小鸡毛」。

## 🤖 配置 AI 聊天

聊天功能需要一个 [OpenRouter](https://openrouter.ai/) 的 API Key（首次使用前在聊天窗口顶部会有提示）。

1. 在 [openrouter.ai/keys](https://openrouter.ai/keys) 创建一个 API Key
2. 右键桌宠 →「设置…」，填入 **API Key**，按需修改 **模型** 与 **接口地址**，保存
3. 右键 →「聊天…」即可开始对话

### 配置项

配置不写在代码里，也不是环境变量，而是保存在 Electron 的用户数据目录中：

```
~/Library/Application Support/desktop-pet/config.json
```

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| `apiKey` | OpenRouter API Key | （空，需自行填写） |
| `model` | 模型 ID | `google/gemini-3.1-flash-lite` |
| `baseURL` | Chat Completions 接口地址 | `https://openrouter.ai/api/v1/chat/completions` |

> 🔐 该文件位于项目目录之外，且 `config.json` 已被 `.gitignore` 忽略，**API Key 不会被提交到 Git**。

## 📁 项目结构

```
.
├── src/                      # 应用源码
│   ├── main.js               # 主进程：窗口管理、右键菜单、IPC、单实例锁
│   ├── preload.js            # 桌宠窗口预加载桥（拖动 / 菜单 / 动作）
│   ├── index.html            # 桌宠窗口
│   ├── styles.css            #   └ 样式
│   ├── renderer.js           #   └ 逻辑：悬停动画、打招呼、拖动
│   ├── config.js             # 读写本地配置（userData/config.json）
│   ├── ai.js                 # OpenRouter 流式请求（主进程）
│   ├── chat.html / .css / .js        # 聊天窗口（iMessage 风格）
│   ├── chat-preload.js               #   └ 聊天窗口预加载桥
│   └── settings.html / .css / .js    # 设置窗口
│       └ settings-preload.js         #   └ 设置窗口预加载桥
├── assets/
│   └── pets/little-mao-puppy/
│       ├── pet.json          # 宠物元信息
│       ├── spritesheet.webp  # 精灵图（备用）
│       └── frames/           # 逐帧动画：walk / roll / scratch / cheer / wave / expressions
├── package.json
└── README.md
```

### 工作原理（简述）

- **主进程**（`main.js`）负责创建透明窗口、弹出原生菜单、发起网络请求；API Key 只在这里使用。
- **渲染进程**（各 `*.html` + `renderer.js` / `chat.js` / `settings.js`）只负责界面，运行在沙箱中。
- 两者通过 **预加载桥**（`*-preload.js`）暴露的白名单方法用 IPC 通信，渲染层拿不到 Node 能力，也拿不到密钥。

## 🎨 素材

桌宠形象与逐帧动画位于 `assets/pets/little-mao-puppy/`，包含 `walk`、`roll`、`scratch`、`cheer`、`wave` 等动作组与 `expressions` 表情，每组为一串按序号命名的 PNG。目录按 `assets/pets/<id>/` 组织，便于后续扩展更多宠物。

## 🙌 致谢

- 桌宠美术 / 形象：**Hao Y.**
- AI 能力由 [OpenRouter](https://openrouter.ai/) 提供
