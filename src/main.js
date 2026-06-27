const { app, BrowserWindow, ipcMain, Menu, screen } = require('electron');
const path = require('path');
const { readConfig, writeConfig } = require('./config');
const { streamChat } = require('./ai');

const WIN_W = 160;        // 宽度（容纳桌宠本体）
const WIN_H = 220;        // 高度多留 60px，给头顶的「你好呀」气泡用

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

  // 拖动：页面算好新位置后，由主进程真正移动窗口
  ipcMain.on('pet:move', (event, { x, y }) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.setPosition(Math.round(x), Math.round(y));
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
      { label: '退出 小鸡毛', click: () => app.quit() }
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
    title: '小鸡毛',
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
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
