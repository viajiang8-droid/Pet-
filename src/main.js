const { app, BrowserWindow, ipcMain, Menu, screen, globalShortcut, clipboard, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { readConfig, writeConfig } = require('./config');
const { streamChat, translateText } = require('./ai');

const execFileP = promisify(execFile);

const WIN_W = 160;        // 宽度（容纳桌宠本体）
const WIN_H = 220;        // 高度多留 60px，给头顶的「你好呀」气泡用

let petWin = null;        // 桌宠主窗口（模块级，供快捷键/翻译使用）

function createWindow() {
  const win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWin = win;
  win.setAlwaysOnTop(true, 'screen-saver');

  // 初始让它「落地」在屏幕左下角（窗口底边贴屏幕底边，桌宠就站在地上）
  const { workArea } = screen.getPrimaryDisplay();
  win.setPosition(workArea.x + 80, workArea.y + workArea.height - WIN_H);

  // 把页面里的 console 和加载失败转发到终端，方便排查
  win.webContents.on('console-message', (e, level, message) => {
    console.log(`[renderer] ${message}`);
  });
  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.log(`[did-fail-load] ${code} ${desc} ${url}`);
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  // 页面加载完成后再做第一次 Claude 检测——确保渲染层已就绪能收到状态
  win.webContents.on('did-finish-load', () => { pollClaude(); });

  // 拖动：页面算好新位置后，由主进程真正移动窗口
  ipcMain.on('pet:move', (event, { x, y }) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.setPosition(Math.round(x), Math.round(y));
  });

  // 调整窗口大小（显示长气泡时变大、收起后还原），保持底边中点不动，桌宠不跳。
  ipcMain.on('pet:resize', (event, { w, h }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const [x, y] = win.getPosition();
    const [ow, oh] = win.getSize();
    const cx = x + ow / 2;
    const bottom = y + oh;
    const nw = Math.max(WIN_W, Math.round(w));
    const nh = Math.max(WIN_H, Math.round(h));
    win.setBounds({ x: Math.round(cx - nw / 2), y: Math.round(bottom - nh), width: nw, height: nh });
  });

  // 右键菜单（Mac 原生样式）。菜单项点击后通过 pet:action 通知页面去执行。
  // state.paused 由页面在弹菜单时带上，用来决定显示「暂停」还是「继续」。
  ipcMain.on('pet:menu', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    const send = (action) => event.sender.send('pet:action', action);
    const menu = Menu.buildFromTemplate([
      { label: '打招呼', click: () => send('hello') },
      { label: '聊天…', click: () => openChatWindow() },
      { label: '设置…', click: () => openSettingsWindow() },
      { type: 'separator' },
      { label: '退出 点点', click: () => app.quit() }
    ]);
    menu.popup({ window: w });
  });
}

// 聊天窗口：独立的普通窗口（不透明、可调整大小、带原生标题栏按钮）。
// 已经开着就直接聚焦，避免开出多个。
let chatWin = null;
let chatHistory = [];     // 当前会话上下文，开新窗口时清空
let currentAbort = null;  // 用于打断上一条未完成的请求

function openChatWindow() {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.show();
    chatWin.focus();
    return;
  }
  chatHistory = [];
  chatWin = new BrowserWindow({
    width: 380,
    height: 560,
    minWidth: 320,
    minHeight: 420,
    title: '点点',
    titleBarStyle: 'hiddenInset', // 保留左上角原生红绿灯按钮，标题栏内容自定义
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'chat-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  chatWin.loadFile(path.join(__dirname, 'chat.html'));
  chatWin.once('ready-to-show', () => {
    chatWin.show();
    chatWin.focus();
  });
  chatWin.on('closed', () => { chatWin = null; });
}

// 设置窗口：填写 API Key / 模型 / 接口地址
let settingsWin = null;
function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 440,
    height: 380,
    resizable: false,
    title: '设置',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.once('ready-to-show', () => {
    settingsWin.show();
    settingsWin.focus();
  });
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ── 聊天相关 IPC ──
ipcMain.handle('chat:config-status', () => {
  const cfg = readConfig();
  return { hasKey: !!cfg.apiKey, model: cfg.model };
});

ipcMain.on('chat:open-settings', () => openSettingsWindow());

ipcMain.on('chat:send', async (event, text) => {
  const wc = event.sender;
  chatHistory.push({ role: 'user', content: text });

  if (currentAbort) currentAbort.abort();
  currentAbort = new AbortController();

  try {
    const full = await streamChat(chatHistory, {
      signal: currentAbort.signal,
      onDelta: (chunk) => wc.send('chat:delta', chunk)
    });
    chatHistory.push({ role: 'assistant', content: full });
    wc.send('chat:done');
  } catch (err) {
    if (err.name === 'AbortError') return;
    // 这条没成功，别把它留在上下文里
    chatHistory.pop();
    wc.send('chat:error', { code: err.code || null, message: err.message || String(err) });
  }
});

// ── 设置相关 IPC ──
ipcMain.handle('settings:get', () => readConfig());

ipcMain.on('settings:save', (event, partial) => {
  writeConfig(partial);
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send('chat:config-changed');
  }
  const w = BrowserWindow.fromWebContents(event.sender);
  if (w) w.close();
});

// ── 划词翻译：Control+Command+A 复制选中文字 → 英译中 → 显示在桌宠头顶气泡 ──
function petBubble(text, sticky) {
  if (petWin && !petWin.isDestroyed()) {
    petWin.webContents.send('pet:bubble', { text, sticky });
  }
}

// 用 AppleScript 模拟 Cmd+C，把当前选中内容复制到剪贴板（需「辅助功能」权限）
function copySelection() {
  return execFileP('osascript', [
    '-e',
    'tell application "System Events" to keystroke "c" using command down'
  ]);
}

let translating = false;
async function translateSelection() {
  console.log('[hotkey] 触发翻译，accessibility trusted =',
    process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : 'n/a');
  if (!petWin || petWin.isDestroyed() || translating) return;

  // 没有「辅助功能」权限就没法模拟 Cmd+C。主动请求一次：
  // 这会弹出系统提示并把本应用加入 系统设置→辅助功能 的列表，方便用户打开。
  if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
    systemPreferences.isTrustedAccessibilityClient(true);
    petBubble('请在 系统设置→隐私与安全性→辅助功能 里打开「Electron」，然后重试', false);
    return;
  }

  translating = true;
  const previousClip = clipboard.readText(); // 记下原剪贴板，稍后还原
  try {
    clipboard.writeText('');                  // 先清空，便于判断是否真的复制到了东西
    await copySelection();
    await new Promise((r) => setTimeout(r, 200)); // 等剪贴板更新
    const text = clipboard.readText().trim();
    if (!text) {
      petBubble('选中文字再按快捷键哦', false);
      return;
    }
    petBubble('翻译中…', true);
    const out = await translateText(text);
    petBubble(out && out.trim() ? out.trim() : '（没有结果）', false);
  } catch (err) {
    let msg;
    if (err.code === 'NO_API_KEY') {
      msg = '请先在「设置」里填 API Key';
    } else if (/assistive|accessibility|not allowed|1002|-1719|osascript/i.test(err.message || '')) {
      msg = '需要在「辅助功能」里授权后才能读取选中文字';
    } else {
      msg = '翻译失败：' + (err.message || '请求出错');
    }
    petBubble(msg, false);
  } finally {
    clipboard.writeText(previousClip);        // 还原剪贴板，不打扰用户
    translating = false;
  }
}

// ── Claude 运行状态：靠「对话记录文件最近是否被写入」判断忙/闲 ──
// Claude Code 生成回复时会持续写 ~/.claude/projects/<项目>/*.jsonl，停下就不再写。
// 比检测进程/CPU 都准，且每轮对话都能观察到「运行中 → 运行成功」。
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const RUN_MS = 2500;   // 记录在 2.5 秒内被写过 → 判定为「正在运行」
const DONE_MS = 5000;  // 安静超过 5 秒 → 判定为「运行结束」（带迟滞，防抖动）

// 扫描所有项目的 *.jsonl，返回最近一次写入距今的毫秒数（无文件返回 Infinity）
function newestTranscriptAge() {
  let newest = 0;
  let projDirs;
  try { projDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }); } catch { return Infinity; }
  for (const pd of projDirs) {
    if (!pd.isDirectory()) continue;
    const dir = path.join(PROJECTS_DIR, pd.name);
    let files;
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      try {
        const m = fs.statSync(path.join(dir, f)).mtimeMs;
        if (m > newest) newest = m;
      } catch { /* ignore */ }
    }
  }
  return newest ? Date.now() - newest : Infinity;
}

let claudeCodeRunning = false;
function pollClaude() {
  const age = newestTranscriptAge();
  if (!claudeCodeRunning && age < RUN_MS) {
    claudeCodeRunning = true;
    if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:claude', 'running');
  } else if (claudeCodeRunning && age > DONE_MS) {
    claudeCodeRunning = false;
    if (petWin && !petWin.isDestroyed()) petWin.webContents.send('pet:claude', 'done');
  }
}

// 只允许同时存在一个桌宠：拿不到锁说明已经有一只在跑，直接退出。
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    if (process.platform === 'darwin') {
      app.dock.hide();
    }

    createWindow();
    const regOk = globalShortcut.register('Control+Command+A', translateSelection);
    console.log('[shortcut] Control+Command+A registered =', regOk,
      '| isRegistered =', globalShortcut.isRegistered('Control+Command+A'));

    // 启动 Claude 运行状态轮询（首次检测改由页面加载完成后触发，见 did-finish-load）
    setInterval(pollClaude, 1500);
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
